import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API, apiFetch } from '../../../state/api';
import { useMonitorHub, SosEvent } from '../../../hooks/useMonitorHub';
import { LivePassenger, OnlineDriver, RouteDeviation, SosAlert, VehicleBulk } from './types';

interface SystemSetting { settingKey: string; value: string; }

interface Options {
  /** Llega un SOS nuevo por SignalR. */
  onNewSos?: (e: SosEvent) => void;
  /** Se abre una alerta de desvío nueva por SignalR. */
  onNewDeviation?: (e: RouteDeviation) => void;
}

/**
 * Datos del monitoreo en vivo: conductores en línea, SOS, viajes activos,
 * vehículos y alertas de desvío. Carga por API + polling de respaldo (30 s)
 * y actualiza en tiempo real con SignalR (useMonitorHub).
 */
export function useLiveMonitor({ onNewSos, onNewDeviation }: Options = {}) {
  const [drivers,       setDrivers]       = useState<OnlineDriver[]>([]);
  const [alerts,        setAlerts]        = useState<SosAlert[]>([]);
  const [passengers,    setPassengers]    = useState<LivePassenger[]>([]);
  const [vehicleByUser, setVehicleByUser] = useState<Record<string, VehicleBulk>>({});
  const [deviations,    setDeviations]    = useState<RouteDeviation[]>([]);
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
      const [dRes, sRes, pRes, devRes] = await Promise.allSettled([
        apiFetch<OnlineDriver[]>(`${API.drivers}/drivers/online`),
        apiFetch<SosAlert[]>(`${API.trips}/sos`),
        apiFetch<LivePassenger[]>(`${API.trips}/trips/live-passengers`),
        apiFetch<RouteDeviation[]>(`${API.trips}/trips/admin/deviations/active`),
      ]);
      const onlineDrivers = dRes.status === 'fulfilled' ? (dRes.value ?? []) : [];
      setDrivers(onlineDrivers);
      if (sRes.status === 'fulfilled') setAlerts(sRes.value ?? []);
      if (pRes.status === 'fulfilled') setPassengers(pRes.value ?? []);
      if (devRes.status === 'fulfilled') setDeviations(devRes.value ?? []);

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
        ? { ...d, currentLat: e.lat, currentLng: e.lng, hasActiveTrip: e.hasActiveTrip }
        : d));
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

  return {
    drivers, alerts, passengers, vehicleByUser, deviations,
    loading, refreshing, lastUpdate, autoRefresh, setAutoRefresh, deviationEnabled,
    deviatedByUserId, sosUserIds, sosDriverUserIds,
    load, removeDeviation,
  };
}
