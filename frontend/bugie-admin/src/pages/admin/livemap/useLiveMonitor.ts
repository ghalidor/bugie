import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API, apiFetch } from '../../../state/api';
import { useMonitorHub, MonitorAlertEvent, SosEvent } from '../../../hooks/useMonitorHub';
import { LivePassenger, MonitorAlert, OnlineDriver, RouteDeviation, SosAlert, VehicleBulk } from './types';
import { isTrailStatus, useLiveTrails } from './useLiveTrails';

/** Mínimo entre recargas disparadas por un GPS de un viaje que aún no está en la lista. */
const UNKNOWN_TRIP_RELOAD_MS = 5000;

interface SystemSetting { settingKey: string; value: string; }

/** Alertas de seguimiento abiertas (se piden todas de una vez). */
const MONITOR_ALERTS_URL = () => `${API.trips}/trips/admin/monitor-alerts?status=open&page=1&pageSize=200`;

interface Options {
  /** Llega un SOS nuevo por SignalR. */
  onNewSos?: (e: SosEvent) => void;
  /** Se abre una alerta de desvío nueva por SignalR. */
  onNewDeviation?: (e: RouteDeviation) => void;
  /** Llega una alerta de seguimiento nueva (sin señal, detenido, demorado) por SignalR. */
  onNewMonitorAlert?: (e: MonitorAlertEvent) => void;
}

/**
 * Datos del monitoreo en vivo: conductores en línea, SOS, viajes activos,
 * vehículos, alertas de desvío y recorridos en vivo por viaje (useLiveTrails).
 * Carga por API + polling de respaldo (30 s) y actualiza en tiempo real con
 * SignalR (useMonitorHub).
 */
export function useLiveMonitor({ onNewSos, onNewDeviation, onNewMonitorAlert }: Options = {}) {
  const [drivers,       setDrivers]       = useState<OnlineDriver[]>([]);
  const [alerts,        setAlerts]        = useState<SosAlert[]>([]);
  const [passengers,    setPassengers]    = useState<LivePassenger[]>([]);
  const [vehicleByUser, setVehicleByUser] = useState<Record<string, VehicleBulk>>({});
  const [deviations,    setDeviations]    = useState<RouteDeviation[]>([]);
  const [monitorAlerts, setMonitorAlerts] = useState<MonitorAlert[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [lastUpdate,    setLastUpdate]    = useState<Date | null>(null);
  const [autoRefresh,   setAutoRefresh]   = useState(true);
  // Flag global de detección de desvío (configurable desde Configuración)
  const [deviationEnabled, setDeviationEnabled] = useState(false);

  // Copias actuales para los callbacks de SignalR (evita efectos dentro de setState).
  const driversRef    = useRef(drivers);
  const passengersRef = useRef(passengers);
  driversRef.current    = drivers;
  passengersRef.current = passengers;
  const lastUnknownTripReload = useRef(0);

  // Trazo recorrido por cada viaje con conductor (grabado + puntos del hub).
  const trails = useLiveTrails(passengers);

  // ── Setting de desvío (1 llamada al montar) ────────────────────────
  useEffect(() => {
    apiFetch<SystemSetting[]>(`${API.landing}/landing/settings`)
      .then(list => {
        const found = (list ?? []).find(s => s.settingKey === 'deviation_detection_enabled');
        setDeviationEnabled(found?.value?.toLowerCase() === 'true');
      })
      .catch(() => setDeviationEnabled(false));
  }, []);

  // ── Carga completa ─────────────────────────────────────────────────
  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [dRes, sRes, pRes, devRes, maRes] = await Promise.allSettled([
        apiFetch<OnlineDriver[]>(`${API.drivers}/drivers/online`),
        apiFetch<SosAlert[]>(`${API.trips}/sos`),
        apiFetch<LivePassenger[]>(`${API.trips}/trips/live-passengers`),
        apiFetch<RouteDeviation[]>(`${API.trips}/trips/admin/deviations/active`),
        apiFetch<{ items: MonitorAlert[]; total: number }>(MONITOR_ALERTS_URL()),
      ]);
      // Se conserva lo que solo llega por SignalR (hora y velocidad del último GPS).
      const prevByUser = new Map(driversRef.current.map(d => [d.userId, d]));
      const onlineDrivers = (dRes.status === 'fulfilled' ? (dRes.value ?? []) : []).map(d => {
        const prev = prevByUser.get(d.userId);
        return prev?.lastGpsAt ? { ...d, lastGpsAt: prev.lastGpsAt, speedKmh: prev.speedKmh } : d;
      });
      setDrivers(onlineDrivers);
      if (sRes.status === 'fulfilled') setAlerts(sRes.value ?? []);
      if (pRes.status === 'fulfilled') setPassengers(pRes.value ?? []);
      if (devRes.status === 'fulfilled') setDeviations(devRes.value ?? []);
      // Abiertas = sin resolver (incluye las ya revisadas). Si el servicio aún no
      // tiene alertas de seguimiento, la sección queda vacía.
      if (maRes.status === 'fulfilled') setMonitorAlerts((maRes.value?.items ?? []).filter(a => !a.resolvedAt));

      if (onlineDrivers.length > 0) {
        const params = onlineDrivers.map(d => `ids=${encodeURIComponent(d.userId)}`).join('&');
        try {
          const vehicles = await apiFetch<VehicleBulk[]>(`${API.drivers}/drivers/bulk-vehicles?${params}`);
          const map: Record<string, VehicleBulk> = {};
          (vehicles ?? []).forEach(v => { map[v.driverUserId] = v; });
          setVehicleByUser(map);
        } catch { setVehicleByUser({}); }
      } else {
        setVehicleByUser({});
      }
      setLastUpdate(new Date());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  /** Solo las alertas de seguimiento (al llegar una nueva: trae nombres y detalle). */
  const loadMonitorAlerts = useCallback(async () => {
    try {
      const r = await apiFetch<{ items: MonitorAlert[]; total: number }>(MONITOR_ALERTS_URL());
      setMonitorAlerts((r?.items ?? []).filter(a => !a.resolvedAt));
    } catch { /* se queda con lo que llegó por SignalR */ }
  }, []);

  // Polling de RESPALDO cada 30 s: SignalR es la fuente principal; esto
  // recupera el estado si SignalR se cae o pierde mensajes.
  useEffect(() => {
    load();
    if (!autoRefresh) return;
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load, autoRefresh]);

  // ── SignalR: SOS instantáneo + GPS push (solo se mueve ese pin) ────
  useMonitorHub({
    onSos: e => { onNewSos?.(e); load(); },

    onDriverLocation: e => {
      // Conductor nuevo (aún no está en la lista): recargar para traer
      // nombre, rating, vehículo. Si ya está, solo movemos su pin.
      if (!driversRef.current.some(d => d.userId === e.userId)) { load(); return; }
      setDrivers(prev => prev.map(d => d.userId === e.userId
        ? { ...d, currentLat: e.lat, currentLng: e.lng, hasActiveTrip: e.hasActiveTrip, lastGpsAt: e.at || new Date().toISOString(), speedKmh: e.speedKmh }
        : d));

      // Viaje del conductor: el que manda el hub (tripId) o, si no viene,
      // el viaje activo de la lista con ese conductor.
      const trip = passengersRef.current.find(p => e.tripId ? p.tripId === e.tripId : (p.driverId === e.userId && isTrailStatus(p.status)));
      if (trip) {
        // Posición del conductor dentro del viaje (la usa el detalle en vivo).
        setPassengers(prev => prev.map(p => p.tripId === trip.tripId ? { ...p, driverLat: e.lat, driverLng: e.lng } : p));
        if (isTrailStatus(trip.status)) trails.appendPoint(trip.tripId, e.lat, e.lng, e.at);
      } else if (e.tripId && Date.now() - lastUnknownTripReload.current > UNKNOWN_TRIP_RELOAD_MS) {
        // Viaje recién aceptado que la lista aún no tiene: traerlo ya.
        lastUnknownTripReload.current = Date.now();
        load();
      }
    },

    onPassengerLocation: e => {
      if (!passengersRef.current.some(p => p.tripId === e.tripId)) { load(); return; }
      setPassengers(prev => prev.map(p => p.tripId === e.tripId
        ? { ...p, lat: e.lat, lng: e.lng, updatedAt: e.at }
        : p));
    },

    // Conductor desconectado: sale de la lista (su viaje sigue en "Viajes").
    onDriverOffline: e => setDrivers(prev => prev.filter(d => d.userId !== e.userId)),

    onDeviation: (kind, e) => {
      // new → arriba; closed → se actualiza (sigue visible hasta revisarla);
      // reviewed → se quita.
      if (kind === 'new') onNewDeviation?.(e);
      setDeviations(prev => {
        if (kind === 'reviewed') return prev.filter(d => d.id !== e.id);
        const idx = prev.findIndex(d => d.id === e.id);
        if (idx === -1) return kind === 'new' ? [e, ...prev] : prev;
        const next = [...prev];
        next[idx] = { ...next[idx], ...e };
        return next;
      });
    },

    onMonitorAlert: e => {
      onNewMonitorAlert?.(e);
      // Se muestra al instante con lo que trae el evento; luego se completa
      // (nombres, detalle) con la lista del servidor.
      setMonitorAlerts(prev => {
        const atMs = new Date(e.at).getTime();
        const item: MonitorAlert = {
          id: e.id, tripId: e.tripId, driverId: e.driverId, type: e.type,
          startedAt: e.at, minutes: e.minutes,
          lastSeenAt: e.type === 'no_signal' && Number.isFinite(atMs) ? new Date(atMs - e.minutes * 60000).toISOString() : null,
        };
        const idx = prev.findIndex(a => a.id === e.id);
        if (idx === -1) return [item, ...prev];
        const next = [...prev];
        next[idx] = { ...next[idx], minutes: e.minutes };
        return next;
      });
      loadMonitorAlerts();
    },

    onMonitorAlertResolved: e => setMonitorAlerts(prev => prev.filter(a => a.id !== e.id)),
  });

  // ── Derivados ──────────────────────────────────────────────────────
  /** Conductores con alerta de desvío ABIERTA. */
  const deviatedByUserId = useMemo(() => {
    const r: Record<string, boolean> = {};
    deviations.forEach(dv => { if (dv.status === 'open') r[dv.driverId] = true; });
    return r;
  }, [deviations]);

  /** Usuarios (pasajero o conductor) con SOS activo. */
  const sosUserIds = useMemo(() => new Set(alerts.map(a => a.userId)), [alerts]);

  /** Conductores con SOS activo. */
  const sosDriverUserIds = useMemo(
    () => new Set(alerts.filter(a => a.userRole === 'driver').map(a => a.userId)),
    [alerts],
  );

  const removeDeviation = useCallback((id: string) => setDeviations(prev => prev.filter(d => d.id !== id)), []);
  /** Revisada por un admin: sale de la lista "por revisar" pero sigue marcando el viaje mientras no se resuelva. */
  const markMonitorAlertReviewed = useCallback((id: string) => setMonitorAlerts(prev => prev.map(a =>
    a.id === id ? { ...a, reviewedAt: a.reviewedAt ?? new Date().toISOString() } : a)), []);

  /** Alertas de seguimiento sin revisar (lista "Alertas", contadores y KPI). */
  const pendingMonitorAlerts = useMemo(() => monitorAlerts.filter(a => !a.reviewedAt), [monitorAlerts]);

  /** Alertas de seguimiento abiertas (revisadas o no) por viaje: borde ámbar, filtro "Sin señal". */
  const monitorAlertsByTrip = useMemo(() => {
    const r: Record<string, MonitorAlert[]> = {};
    monitorAlerts.forEach(a => { (r[a.tripId] ??= []).push(a); });
    return r;
  }, [monitorAlerts]);

  return {
    drivers, alerts, passengers, vehicleByUser, deviations,
    /** Alertas de seguimiento abiertas (sin señal, detenido, demorado), revisadas o no. */
    monitorAlerts, monitorAlertsByTrip, pendingMonitorAlerts,
    /** Recorridos en vivo por tripId (viajes con conductor asignado). */
    trails: trails.byTrip,
    loading, refreshing, lastUpdate, autoRefresh, setAutoRefresh, deviationEnabled,
    deviatedByUserId, sosUserIds, sosDriverUserIds,
    load, removeDeviation, markMonitorAlertReviewed,
  };
}
