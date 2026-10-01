import { apiFetch, API } from '../../state/api';
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import PageHeader from '../../components/PageHeader';
import BugieMapAdmin, { MapMarker } from '../../components/BugieMapAdmin';
import { useMonitorHub } from '../../hooks/useMonitorHub';

interface OnlineDriver {
  id: string; userId: string; fullName: string;
  isOnline: boolean; hasActiveTrip: boolean;
  currentLat: number | null; currentLng: number | null;
  rating: number;
  profilePhotoUrl: string | null;
}

interface SosAlert {
  id: string;
  tripId: string;
  userId: string;
  lat: number; lng: number;
  userRole: string; createdAt: string;
}

interface VehicleBulk {
  driverUserId: string;
  plate: string; brand: string; model: string; color: string;
  photoUrl: string | null;
}

/// Pasajeros con viaje activo. Ahora trae nombres + origen/destino + posición
/// conductor para soportar detección de desvío y modal de detalle.
interface LivePassenger {
  tripId: string;
  passengerId: string;
  driverId: string | null;
  status: number;
  lat: number;
  lng: number;
  updatedAt: string | null;
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  driverLat: number | null;
  driverLng: number | null;
  passengerName: string;
  passengerPhone: string | null;
  passengerPhotoUrl: string | null;
  driverName: string | null;
  driverPhone: string | null;
}

interface SystemSetting {
  settingKey: string;
  value: string;
}

function PulseDot({ color }: { color: string }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: 10, height: 10 }}>
      <span style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        background: color, opacity: 0.5,
        animation: 'bugieMonitorPulse 1.8s ease-out infinite',
      }} />
      <span style={{ borderRadius: '50%', width: 10, height: 10, background: color, display: 'inline-block' }} />
      <style>{`@keyframes bugieMonitorPulse{0%{transform:scale(1);opacity:.5}100%{transform:scale(2.5);opacity:0}}`}</style>
    </span>
  );
}

/// Distancia haversine en metros entre dos puntos.
function distMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => d * Math.PI / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/// Calcula la distancia mínima del conductor a la línea recta origen→destino.
/// Esto es una APROXIMACIÓN: no usamos la ruta real con curvas; en su lugar
/// proyectamos la posición del conductor sobre el segmento origen-destino.
/// Para distancias urbanas cortas la diferencia es pequeña y no necesitamos
/// pegarle a GraphHopper desde aquí.
function distanceToRoute(
  driverLat: number, driverLng: number,
  o: { lat: number; lng: number }, d: { lat: number; lng: number },
): number {
  // Convertimos a coords planas locales (m) usando proyección equirectangular
  // simple. Suficiente para una ciudad.
  const toRad = (deg: number) => deg * Math.PI / 180;
  const R = 6371000;
  const lat0 = toRad(o.lat);
  const x = (lng: number) => R * toRad(lng) * Math.cos(lat0);
  const y = (lat: number) => R * toRad(lat);

  const ax = x(o.lng), ay = y(o.lat);
  const bx = x(d.lng), by = y(d.lat);
  const px = x(driverLng), py = y(driverLat);

  // Proyección del punto P sobre el segmento AB
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return distMeters(driverLat, driverLng, o.lat, o.lng);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t)); // clamp dentro del segmento
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/// Umbral de desvío: más de 200m de la ruta → "está desviado".
/// Es un balance: más bajo da muchos falsos positivos (calles paralelas),
/// más alto puede no detectar desvíos reales. 200m funciona para ciudades.
const DEVIATION_THRESHOLD_METERS = 200;

export default function LiveMap() {
  // ── Estado ─────────────────────────────────────────────────────────────
  const [drivers,        setDrivers]        = useState<OnlineDriver[]>([]);
  const [alerts,         setAlerts]         = useState<SosAlert[]>([]);
  const [passengers,     setPassengers]     = useState<LivePassenger[]>([]);
  const [vehicleByUser,  setVehicleByUser]  = useState<Record<string, VehicleBulk>>({});
  const [loading,        setLoading]        = useState(true);
  const [lastUpdate,     setLastUpdate]     = useState<Date | null>(null);
  const [autoRefresh,    setAutoRefresh]    = useState(true);
  const [search,         setSearch]         = useState('');

  // Selección desde lista lateral (resalta el pin en el mapa con anillo dorado)
  const [selectedId,        setSelectedId]        = useState<string | null>(null);
  const [selectedPaxTripId, setSelectedPaxTripId] = useState<string | null>(null);

  // Modal de detalle de viaje activo (click en conductor con viaje)
  const [tripDetailId, setTripDetailId] = useState<string | null>(null);
  const tripDetail = useMemo(() => {
    if (!tripDetailId) return null;
    return passengers.find(p => p.tripId === tripDetailId) ?? null;
  }, [tripDetailId, passengers]);

  // Flag global de detección de desvío (configurable desde admin/settings)
  const [deviationEnabled, setDeviationEnabled] = useState(false);

  // Modal de "desactivar SOS" con motivo obligatorio
  const [sosToResolve,   setSosToResolve]   = useState<SosAlert | null>(null);
  const [resolveReason,  setResolveReason]  = useState('');
  const [resolving,      setResolving]      = useState(false);

  // Tab activa en el sidebar
  type SidebarTab = 'drivers' | 'passengers' | 'sos';
  const [activeTab, setActiveTab] = useState<SidebarTab>('drivers');

  // Filtros de pines en el mapa (ocultar capas)
  const [showDrivers,    setShowDrivers]    = useState(true);
  const [showPassengers, setShowPassengers] = useState(true);
  const [showSos,        setShowSos]        = useState(true);

  // Refs para invocar foco / fit del mapa principal desde la lista
  const focusMarkerRef    = useRef<((lat: number, lng: number) => void) | null>(null);
  const mainFitBoundsRef  = useRef<(() => void) | null>(null);

  // ── Setting de desvío (1 llamada al montar) ────────────────────────────
  useEffect(() => {
    apiFetch<SystemSetting[]>(`${API.landing}/landing/settings`)
      .then(list => {
        const found = (list ?? []).find(s => s.settingKey === 'deviation_detection_enabled');
        setDeviationEnabled(found?.value?.toLowerCase() === 'true');
      })
      .catch(() => setDeviationEnabled(false));
  }, []);

  // ── Carga del monitor (poll 10s) ───────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const [dRes, sRes, pRes] = await Promise.allSettled([
        apiFetch<OnlineDriver[]>(`${API.drivers}/drivers/online`),
        apiFetch<SosAlert[]>(`${API.trips}/sos`),
        apiFetch<LivePassenger[]>(`${API.trips}/trips/live-passengers`),
      ]);
      const onlineDrivers = dRes.status === 'fulfilled' ? (dRes.value ?? []) : [];
      setDrivers(onlineDrivers);
      if (sRes.status === 'fulfilled') setAlerts(sRes.value ?? []);
      if (pRes.status === 'fulfilled') setPassengers(pRes.value ?? []);

      if (onlineDrivers.length > 0) {
        const params = onlineDrivers.map(d => `ids=${encodeURIComponent(d.userId)}`).join('&');
        try {
          const vehicles = await apiFetch<VehicleBulk[]>(
            `${API.drivers}/drivers/bulk-vehicles?${params}`);
          const map: Record<string, VehicleBulk> = {};
          (vehicles ?? []).forEach(v => { map[v.driverUserId] = v; });
          setVehicleByUser(map);
        } catch { setVehicleByUser({}); }
      } else {
        setVehicleByUser({});
      }
      setLastUpdate(new Date());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    if (!autoRefresh) return;
    // Polling de RESPALDO cada 30s — los eventos SignalR son la fuente
    // principal de actualización en tiempo real. Este poll garantiza que
    // si SignalR se cae o pierde mensajes, eventualmente nos recuperamos.
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load, autoRefresh]);

  // SignalR: SOS instantáneo + updates de GPS push (sin esperar al poll).
  // Cuando llega un GPS de un conductor o pasajero, actualizamos SOLO ese pin
  // en el state local. No recargamos toda la lista. Esto reduce drásticamente
  // la carga del backend cuando hay muchos conductores moviéndose.
  useMonitorHub({
    onSos: () => { load(); },

    onDriverLocation: (e) => {
      // Si el conductor ya está en la lista, actualizamos su lat/lng.
      // Si NO está, hacemos un load() para que aparezca (puede ser que
      // se acaba de conectar y el primer GPS lo trajo aquí antes que el
      // polling de respaldo).
      setDrivers(prev => {
        const idx = prev.findIndex(d => d.userId === e.userId);
        if (idx === -1) {
          // Conductor nuevo — disparamos refresh para traer datos completos
          // (nombre, rating, etc.). Lo hacemos fire-and-forget para no
          // bloquear este callback.
          load();
          return prev;
        }
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          currentLat: e.lat,
          currentLng: e.lng,
          hasActiveTrip: e.hasActiveTrip,
        };
        return next;
      });
    },

    onPassengerLocation: (e) => {
      // Pasajero: el tripId nos llega directo del evento, lo usamos para
      // ubicar la fila correcta.
      setPassengers(prev => {
        const idx = prev.findIndex(p => p.tripId === e.tripId);
        if (idx === -1) {
          // Trip nuevo — hacemos load para traerlo con todos los datos.
          load();
          return prev;
        }
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          lat: e.lat,
          lng: e.lng,
          updatedAt: e.at,
        };
        return next;
      });
    },

    onDriverOffline: (e) => {
      // Conductor se desconectó: lo quitamos de la lista. Si tenía viaje
      // activo, el viaje y el pasajero siguen en su lista (no los tocamos).
      setDrivers(prev => prev.filter(d => d.userId !== e.userId));
    },
  });

  // ── Resolver SOS ───────────────────────────────────────────────────────
  async function handleResolveSos() {
    if (!sosToResolve) return;
    const reason = resolveReason.trim();
    if (reason.length < 3) {
      alert('Por favor escribe un motivo de al menos 3 caracteres.');
      return;
    }
    setResolving(true);
    try {
      await apiFetch(`${API.trips}/sos/${sosToResolve.id}/resolve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      await load();
      setSosToResolve(null);
      setResolveReason('');
    } catch (err: any) {
      alert(`No se pudo desactivar la alerta: ${err?.message ?? 'error'}`);
    } finally {
      setResolving(false);
    }
  }

  // ── Detección de desvío (client-side) ──────────────────────────────────
  const deviatedByUserId = useMemo(() => {
    const result: Record<string, boolean> = {};
    if (!deviationEnabled) return result;
    for (const d of drivers) {
      if (!d.hasActiveTrip || !d.currentLat || !d.currentLng) continue;
      const trip = passengers.find(p => p.driverId === d.userId);
      if (!trip || trip.status !== 3) continue;
      const dist = distanceToRoute(
        d.currentLat, d.currentLng,
        { lat: trip.originLat, lng: trip.originLng },
        { lat: trip.destLat,   lng: trip.destLng },
      );
      if (dist > DEVIATION_THRESHOLD_METERS) result[d.userId] = true;
    }
    return result;
  }, [drivers, passengers, deviationEnabled]);

  // ── SOS user IDs (para resaltar el pin) ────────────────────────────────
  const sosUserIds = useMemo(() => {
    const ids = new Set<string>();
    alerts.forEach(a => ids.add(a.userId));
    return ids;
  }, [alerts]);

  // ── KPIs ───────────────────────────────────────────────────────────────
  const enLinea         = drivers.length;
  const enViaje         = drivers.filter(d => d.hasActiveTrip).length;
  const disponibles     = drivers.filter(d => !d.hasActiveTrip).length;
  const desviadosCount  = Object.values(deviatedByUserId).filter(Boolean).length;

  // ── Markers del mapa (con filtros de capa) ─────────────────────────────
  const markers = useMemo(() => {
    const list: any[] = [];
    drivers.filter(d => d.currentLat && d.currentLng).forEach(d => {
      const inSos = sosUserIds.has(d.userId);
      // Mostrar si: visible la capa "conductores", o (visible "SOS" y este conductor está en SOS)
      if (!showDrivers && !(inSos && showSos)) return;
      const v = vehicleByUser[d.userId];
      list.push({
        id: `driver:${d.id}`,
        lat: d.currentLat!, lng: d.currentLng!,
        type: 'driver' as const,
        label: d.fullName || 'Conductor',
        deviated: deviatedByUserId[d.userId] === true,
        sosActive: inSos,
        highlighted: selectedId === d.id,
        extra: {
          rating:        d.rating,
          hasActiveTrip: d.hasActiveTrip,
          fullName:      d.fullName,
          vehiclePlate:  v?.plate,
          vehicleBrand:  v?.brand,
          vehicleModel:  v?.model,
          vehicleColor:  v?.color,
        },
      });
    });
    passengers.forEach(p => {
      const inSos = sosUserIds.has(p.passengerId);
      if (!showPassengers && !(inSos && showSos)) return;
      list.push({
        id: `pax:${p.tripId}`,
        lat: p.lat, lng: p.lng,
        type: 'passenger' as const,
        label: p.passengerName || 'Pasajero',
        sosActive: inSos,
        highlighted: selectedPaxTripId === p.tripId,
        extra: { tripStatus: p.status },
      });
    });
    return list;
  }, [
    drivers, passengers, vehicleByUser, deviatedByUserId,
    sosUserIds, selectedId, selectedPaxTripId,
    showDrivers, showPassengers, showSos,
  ]);

  // Congelar markers del mapa principal cuando hay modal abierto
  const frozenMarkersRef = useRef<typeof markers | null>(null);
  useEffect(() => {
    if (tripDetailId) {
      if (frozenMarkersRef.current === null) frozenMarkersRef.current = markers;
    } else {
      frozenMarkersRef.current = null;
    }
  }, [tripDetailId, markers]);
  const mainMapMarkers = tripDetailId
    ? (frozenMarkersRef.current ?? markers)
    : markers;

  // ── Lista de conductores ordenada (SOS → desviado → en viaje → disponible) ──
  const sosDriverUserIds = useMemo(() => {
    const ids = new Set<string>();
    alerts.forEach(a => { if (a.userRole === 'driver') ids.add(a.userId); });
    return ids;
  }, [alerts]);

  function driverPriority(d: OnlineDriver): number {
    if (sosDriverUserIds.has(d.userId)) return 0;
    if (deviatedByUserId[d.userId])     return 1;
    if (d.hasActiveTrip)                return 2;
    return 3;
  }

  const filteredDrivers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return drivers
      .filter(d => !q || (d.fullName || '').toLowerCase().includes(q))
      .sort((a, b) => {
        const dp = driverPriority(a) - driverPriority(b);
        if (dp !== 0) return dp;
        return (a.fullName || '').localeCompare(b.fullName || '');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drivers, search, deviatedByUserId, sosDriverUserIds]);

  // ── Handlers ───────────────────────────────────────────────────────────
  /// Selecciona un conductor en la lista. Si ya estaba seleccionado, lo
  /// deselecciona (toggle). Cuando se selecciona, también enfoca su pin
  /// en el mapa.
  function handleSelectDriver(d: OnlineDriver) {
    if (selectedId === d.id) {
      // Toggle: ya estaba seleccionado → deseleccionar
      setSelectedId(null);
      return;
    }
    setSelectedId(d.id);
    if (d.currentLat && d.currentLng) {
      focusMarkerRef.current?.(d.currentLat, d.currentLng);
    }
  }

  function handleOpenDriverDetail(d: OnlineDriver) {
    if (!d.hasActiveTrip) { handleSelectDriver(d); return; }
    const trip = passengers.find(p => p.driverId === d.userId);
    if (trip) setTripDetailId(trip.tripId);
    else handleSelectDriver(d);
  }

  /// Selecciona un pasajero. Si ya estaba seleccionado, deselecciona (toggle).
  function handleSelectPassenger(p: LivePassenger) {
    if (selectedPaxTripId === p.tripId) {
      setSelectedPaxTripId(null);
      return;
    }
    setSelectedPaxTripId(p.tripId);
    if (p.lat !== 0 || p.lng !== 0) {
      focusMarkerRef.current?.(p.lat, p.lng);
    }
  }

  /// Abre el modal de detalle del viaje asociado a una alerta SOS.
  /// Busca el viaje en la lista de viajes activos (passengers). Si no está,
  /// significa que el viaje fue cerrado o ya no se está monitoreando: en
  /// ese caso solo hacemos foco en el mapa con la coordenada de la alerta.
  function handleOpenSosDetail(a: SosAlert) {
    const trip = passengers.find(p => p.tripId === a.tripId);
    if (trip) {
      setTripDetailId(trip.tripId);
    } else {
      // Viaje no encontrado en la lista de activos. Solo enfocamos el mapa
      // en la coordenada del SOS sin abrir modal.
      focusMarkerRef.current?.(a.lat, a.lng);
      alert('El viaje de esta alerta ya no está activo. Se enfocó la última ubicación conocida en el mapa.');
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <>
      <PageHeader
        title="Monitoreo en vivo"
        subtitle="Centro de comando — conductores, viajes y alertas en tiempo real."
        icon="fa-solid fa-map"
        actions={
          <div className="d-flex align-items-center gap-3">
            {lastUpdate && (
              <div className="d-flex align-items-center gap-2">
                <PulseDot color="#34d399" />
                <span className="small bugie-muted">{lastUpdate.toLocaleTimeString('es-PE')}</span>
              </div>
            )}
            <button
              className={`btn btn-sm rounded-pill ${autoRefresh ? 'btn-bugie text-white' : 'btn-bugie-outline'}`}
              onClick={() => setAutoRefresh(v => !v)}>
              <i className={`fa-solid ${autoRefresh ? 'fa-pause' : 'fa-play'} me-1`} />
              {autoRefresh ? 'En vivo' : 'Pausado'}
            </button>
            <button className="btn btn-sm btn-bugie-outline rounded-pill" onClick={load}>
              <i className="fa-solid fa-rotate-right" />
            </button>
          </div>
        }
      />

      {/* KPIs */}
      <div className="row g-3 mb-3">
        {[
          { label: 'En línea',          value: enLinea,           color: '#34d399', icon: 'fa-circle-dot',           pulse: true },
          { label: 'En viaje',          value: enViaje,           color: '#818cf8', icon: 'fa-car',                  pulse: false },
          { label: 'Disponibles',       value: disponibles,       color: '#38bdf8', icon: 'fa-circle-check',         pulse: false },
          { label: 'Pasajeros activos', value: passengers.length, color: '#f97316', icon: 'fa-person',               pulse: false },
          { label: 'Alertas SOS',       value: alerts.length,     color: '#f87171', icon: 'fa-triangle-exclamation', pulse: alerts.length > 0 },
          ...(deviationEnabled ? [{
            label: 'Desviados', value: desviadosCount,
            color: '#dc2626', icon: 'fa-route',
            pulse: desviadosCount > 0,
          }] : []),
        ].map(k => (
          <div className="col-6 col-md-4 col-xl" key={k.label}>
            <div className="bugie-card p-3" style={{ border: k.pulse && k.value > 0 ? `1px solid ${k.color}44` : undefined }}>
              <div className="d-flex align-items-center gap-3">
                <div style={{ width: 44, height: 44, borderRadius: 12, background: k.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' }}>
                  <i className={`fa-solid ${k.icon}`} style={{ color: k.color, fontSize: '1.1rem' }} />
                  {k.pulse && k.value > 0 && (
                    <span style={{ position: 'absolute', top: 4, right: 4 }}>
                      <PulseDot color={k.color} />
                    </span>
                  )}
                </div>
                <div>
                  <div className="small bugie-muted">{k.label}</div>
                  {loading
                    ? <div className="spinner-border spinner-border-sm mt-1" style={{ borderColor: k.color, borderRightColor: 'transparent' }} />
                    : <div className="fw-bold" style={{ color: k.color, fontSize: '1.8rem', lineHeight: 1 }}>{k.value}</div>
                  }
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Mapa + Sidebar con tabs */}
      <div className="row g-3">

        {/* ─── Mapa (8 cols) ───────────────────────────────── */}
        <div className="col-xl-8">
          <div className="bugie-card" style={{ height: '75vh', display: 'flex', flexDirection: 'column' }}>

            {/* Header del card: título + toggles de capas */}
            <div className="bugie-card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
              <span><i className="fa-solid fa-map me-2" />Mapa en vivo</span>
              <div className="d-flex gap-2 align-items-center flex-wrap" style={{ fontSize: '0.78rem' }}>
                <LayerToggle active={showDrivers}    onClick={() => setShowDrivers(v => !v)}    color="#34d399" label="Conductores" />
                <LayerToggle active={showPassengers} onClick={() => setShowPassengers(v => !v)} color="#f97316" label="Pasajeros" />
                <LayerToggle active={showSos}        onClick={() => setShowSos(v => !v)}        color="#f87171" label="SOS" />
              </div>
            </div>

            {/* Mapa: rellena el resto del card. position relative para el botón flotante */}
            <div className="bugie-card-body p-0" style={{ flex: 1, position: 'relative', minHeight: 0 }}>
              <BugieMapAdmin
                height="100%"
                markers={mainMapMarkers}
                onFocusRef={focusMarkerRef}
                onFitBoundsRef={mainFitBoundsRef}
                onMarkerClick={(m) => {
                  if (m.type === 'driver' && m.id?.startsWith('driver:')) {
                    const driverId = m.id.replace('driver:', '');
                    const d = drivers.find(x => x.id === driverId);
                    if (d) handleOpenDriverDetail(d);
                  }
                }}
              />
              {/* Botón flotante de autofoco */}
              <button
                type="button"
                onClick={() => mainFitBoundsRef.current?.()}
                title="Centrar en todos los pines"
                style={{
                  position: 'absolute',
                  top: 12, right: 12,
                  width: 42, height: 42,
                  padding: 0,
                  border: 'none',
                  borderRadius: 10,
                  background: 'white',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
                  zIndex: 500,
                  cursor: 'pointer',
                }}
              >
                <i className="fa-solid fa-crosshairs" style={{ color: '#1a1730', fontSize: '1rem' }} />
              </button>
            </div>
          </div>
        </div>

        {/* ─── Sidebar con tabs (4 cols) ─────────────────────── */}
        <div className="col-xl-4">
          <div className="bugie-card" style={{ height: '75vh', display: 'flex', flexDirection: 'column' }}>

            {/* Tabs header */}
            <div style={{ borderBottom: '1px solid var(--bugie-border)', display: 'flex' }}>
              <TabButton
                active={activeTab === 'drivers'}
                onClick={() => setActiveTab('drivers')}
                color="#34d399"
                icon="fa-car"
                label="Conductores"
                count={drivers.length}
              />
              <TabButton
                active={activeTab === 'passengers'}
                onClick={() => setActiveTab('passengers')}
                color="#f97316"
                icon="fa-person"
                label="Pasajeros"
                count={passengers.length}
              />
              <TabButton
                active={activeTab === 'sos'}
                onClick={() => setActiveTab('sos')}
                color="#f87171"
                icon="fa-triangle-exclamation"
                label="SOS"
                count={alerts.length}
                pulse={alerts.length > 0}
              />
            </div>

            {/* Contenido scrollable de la tab activa */}
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>

              {/* ===== TAB: SOS ===== */}
              {activeTab === 'sos' && (
                <>
                  {alerts.length === 0 ? (
                    <div className="text-center py-5 px-3 bugie-muted small">
                      <i className="fa-solid fa-shield-halved d-block mb-3" style={{ fontSize: '2.5rem', color: '#34d399', opacity: 0.7 }} />
                      <div className="fw-semibold mb-1">Todo tranquilo</div>
                      <div>No hay emergencias activas en este momento.</div>
                    </div>
                  ) : (
                    <>
                      <style>{`
                        @keyframes sosRowFlash {
                          0%, 100% { background: rgba(248,113,113,0.06); }
                          50%      { background: rgba(248,113,113,0.18); }
                        }
                        .sos-row-flash { animation: sosRowFlash 1.6s ease-in-out infinite; }
                      `}</style>
                      {alerts.map(a => (
                        <div key={a.id} className="sos-row-flash p-3"
                          style={{
                            borderBottom: '1px solid var(--bugie-border)',
                            cursor: 'pointer',
                          }}
                          onClick={() => handleOpenSosDetail(a)}
                          title="Ver detalle del viaje"
                        >
                          <div className="d-flex align-items-center gap-2 mb-2">
                            <span className="badge" style={{
                              background: '#f87171', color: 'white',
                              fontSize: '0.78rem', padding: '4px 10px', fontWeight: 700,
                            }}>🚨 SOS</span>
                            <span className="fw-bold" style={{ color: 'var(--bugie-text)' }}>
                              {a.userRole === 'passenger' ? 'Pasajero' : 'Conductor'} en emergencia
                            </span>
                          </div>
                          <div className="small bugie-muted mb-2">
                            <i className="fa-regular fa-clock me-1" />
                            {new Date(a.createdAt).toLocaleString('es-PE')}
                          </div>
                          <button
                            className="btn btn-sm btn-light w-100"
                            style={{ fontWeight: 600 }}
                            onClick={(e) => {
                              // No queremos que el click en el botón
                              // dispare también la apertura del modal.
                              e.stopPropagation();
                              setSosToResolve(a);
                              setResolveReason('');
                            }}
                          >
                            <i className="fa-solid fa-circle-check me-1" />
                            Desactivar alerta
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}

              {/* ===== TAB: PASAJEROS ===== */}
              {activeTab === 'passengers' && (
                <>
                  {passengers.length === 0 ? (
                    <div className="text-center py-5 px-3 bugie-muted small">
                      <i className="fa-solid fa-person d-block mb-3" style={{ fontSize: '2.5rem', color: '#f97316', opacity: 0.5 }} />
                      <div className="fw-semibold mb-1">Sin pasajeros activos</div>
                      <div>Nadie tiene un viaje en curso ahora.</div>
                    </div>
                  ) : (
                    passengers.map(p => {
                      const statusLabel: Record<number, { text: string; color: string }> = {
                        1: { text: 'Buscando conductor',  color: '#fbbf24' },
                        2: { text: 'Conductor en camino', color: '#38bdf8' },
                        3: { text: 'Viaje en curso',      color: '#818cf8' },
                        6: { text: 'SOS activo',          color: '#f87171' },
                        7: { text: 'Negociando tarifa',   color: '#f97316' },
                      };
                      const st = statusLabel[p.status] ?? { text: 'En viaje', color: '#94a3b8' };
                      const hasPos = p.lat !== 0 && p.lng !== 0;
                      const isSelected = selectedPaxTripId === p.tripId;

                      return (
                        <div key={p.tripId}
                          className="d-flex align-items-center gap-3 p-3"
                          style={{
                            borderBottom: '1px solid var(--bugie-border)',
                            cursor: hasPos ? 'pointer' : 'default',
                            background: isSelected ? '#f9731612' : 'transparent',
                            transition: 'background .2s',
                          }}
                          onClick={() => hasPos && handleSelectPassenger(p)}
                        >
                          <div style={{
                            width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                            background: '#f9731622',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: isSelected ? '2px solid #f97316' : '2px solid transparent',
                          }}>
                            <i className="fa-solid fa-person" style={{ color: '#f97316', fontSize: '0.95rem' }} />
                          </div>
                          <div className="flex-grow-1 min-w-0">
                            <div className="fw-semibold small text-truncate">{p.passengerName}</div>
                            <div className="d-flex align-items-center gap-2 mt-1">
                              <span className="badge rounded-pill" style={{
                                background: st.color + '22', color: st.color, fontSize: '0.68rem',
                              }}>
                                {st.text}
                              </span>
                              {p.updatedAt && (
                                <span className="small bugie-muted" style={{ fontSize: '0.7rem' }}>
                                  {new Date(p.updatedAt).toLocaleTimeString('es-PE', {
                                    hour: '2-digit', minute: '2-digit',
                                  })}
                                </span>
                              )}
                            </div>
                          </div>
                          {hasPos
                            ? <i className="fa-solid fa-crosshairs bugie-muted" style={{ fontSize: '0.8rem' }} />
                            : <i className="fa-solid fa-location-slash bugie-muted" style={{ fontSize: '0.75rem' }} />}
                        </div>
                      );
                    })
                  )}
                </>
              )}

              {/* ===== TAB: CONDUCTORES ===== */}
              {activeTab === 'drivers' && (
                <>
                  {/* Buscador (sticky arriba de la lista) */}
                  <div className="px-3 py-2"
                    style={{
                      position: 'sticky', top: 0,
                      background: 'var(--bugie-surface)',
                      borderBottom: '1px solid var(--bugie-border)',
                      zIndex: 1,
                    }}>
                    <div className="input-group input-group-sm">
                      <span className="input-group-text">
                        <i className="fa-solid fa-magnifying-glass" />
                      </span>
                      <input
                        className="form-control"
                        placeholder="Buscar conductor..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                      />
                      {search && (
                        <button className="btn btn-outline-secondary" type="button" onClick={() => setSearch('')}>
                          <i className="fa-solid fa-xmark" />
                        </button>
                      )}
                    </div>
                  </div>

                  {filteredDrivers.length === 0 ? (
                    <div className="text-center py-5 px-3 bugie-muted small">
                      <i className="fa-solid fa-car d-block mb-3" style={{ fontSize: '2.5rem', color: '#34d399', opacity: 0.5 }} />
                      <div className="fw-semibold mb-1">
                        {search ? 'Sin coincidencias' : 'Sin conductores en línea'}
                      </div>
                    </div>
                  ) : (
                    filteredDrivers.map(d => {
                      const deviated = deviatedByUserId[d.userId] === true;
                      const inSos    = sosDriverUserIds.has(d.userId);
                      const color    = inSos    ? '#f87171'
                                      : deviated ? '#dc2626'
                                      : d.hasActiveTrip ? '#818cf8'
                                                        : '#34d399';
                      const selected = selectedId === d.id;
                      const hasPos   = !!(d.currentLat && d.currentLng);
                      const v        = vehicleByUser[d.userId];

                      return (
                        <div key={d.id}
                          className="d-flex align-items-center gap-3 p-3"
                          style={{
                            borderBottom: '1px solid var(--bugie-border)',
                            cursor: hasPos ? 'pointer' : 'default',
                            background: inSos ? '#f8717112'
                                      : selected ? color + '12'
                                                 : 'transparent',
                            transition: 'background .2s',
                          }}
                          onClick={() => hasPos && handleOpenDriverDetail(d)}
                        >
                          <div style={{
                            width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                            background: color + '22',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: selected ? `2px solid ${color}` : '2px solid transparent',
                          }}>
                            <i className="fa-solid fa-car-side" style={{ color, fontSize: '0.85rem' }} />
                          </div>
                          <div className="flex-grow-1 min-w-0">
                            <div className="fw-semibold small text-truncate" style={{ color: inSos ? '#f87171' : undefined }}>
                              {d.fullName || 'Sin nombre'}
                              {inSos && <span className="ms-1" title="SOS activo">🚨</span>}
                              {!inSos && deviated && <span className="ms-1" title="Desviado">⚠️</span>}
                            </div>
                            {v ? (
                              <div className="small text-truncate" style={{ fontSize: '0.72rem', color: '#a8a8c8', marginTop: 2 }}>
                                <i className="fa-solid fa-car-side me-1" style={{ fontSize: '0.6rem' }} />
                                {[v.brand, v.model].filter(Boolean).join(' ')}
                                {v.plate && <span style={{ fontFamily: 'monospace', marginLeft: 6, fontWeight: 600 }}>· {v.plate}</span>}
                              </div>
                            ) : (
                              <div className="small bugie-muted" style={{ fontSize: '0.7rem', marginTop: 2 }}>Sin vehículo</div>
                            )}
                            <div className="d-flex align-items-center gap-2 mt-1">
                              <span className="badge rounded-pill" style={{ background: color + '22', color, fontSize: '0.68rem' }}>
                                {inSos ? '🚨 SOS' : deviated ? '⚠️ Desviado' : d.hasActiveTrip ? '🚗 En viaje' : '✅ Disponible'}
                              </span>
                              <span className="small bugie-muted" style={{ fontSize: '0.7rem' }}>
                                <i className="fa-solid fa-star me-1" style={{ color: '#f59e0b', fontSize: '0.6rem' }} />
                                {(d.rating ?? 0).toFixed(1)}
                              </span>
                            </div>
                          </div>
                          {hasPos
                            ? <i className="fa-solid fa-crosshairs" style={{ fontSize: '0.8rem', color: selected ? color : '#94a3b8' }} />
                            : <i className="fa-solid fa-location-slash bugie-muted" style={{ fontSize: '0.75rem' }} />}
                        </div>
                      );
                    })
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal detalle viaje */}
      {tripDetail && (
        <TripDetailModal
          trip={tripDetail}
          driver={drivers.find(d => d.userId === tripDetail.driverId) || null}
          vehicle={tripDetail.driverId ? vehicleByUser[tripDetail.driverId] : undefined}
          deviated={tripDetail.driverId ? deviatedByUserId[tripDetail.driverId] === true : false}
          // SOS del pasajero (busca por passengerId, no resuelto)
          passengerSosAlert={
            alerts.find(a => a.userId === tripDetail.passengerId) ?? null
          }
          // SOS del conductor de este viaje (si hay conductor asignado)
          driverSosAlert={
            tripDetail.driverId
              ? (alerts.find(a => a.userId === tripDetail.driverId) ?? null)
              : null
          }
          onResolveSos={(a) => {
            setSosToResolve(a);
            setResolveReason('');
          }}
          onClose={() => setTripDetailId(null)}
        />
      )}

      {/* Modal motivo SOS */}
      {sosToResolve && (
        <div
          className="modal show d-block"
          tabIndex={-1}
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={e => {
            if (e.target === e.currentTarget && !resolving) {
              setSosToResolve(null);
              setResolveReason('');
            }
          }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content" style={{
              background: 'var(--bugie-bg-2)',
              border: '2px solid #f87171',
            }}>
              <div className="modal-header" style={{
                borderBottom: '1px solid var(--bugie-border)',
                background: 'rgba(248,113,113,0.1)',
              }}>
                <h5 className="modal-title" style={{ color: '#f87171', fontWeight: 700 }}>
                  <i className="fa-solid fa-circle-exclamation me-2" />
                  Desactivar alerta SOS
                </h5>
                <button type="button" className="btn-close btn-close-white"
                  onClick={() => { if (!resolving) { setSosToResolve(null); setResolveReason(''); } }} />
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <div className="small bugie-muted mb-1">Emergencia de</div>
                  <div className="fw-bold" style={{ color: 'var(--bugie-text)' }}>
                    {sosToResolve.userRole === 'passenger' ? 'Pasajero' : 'Conductor'}
                  </div>
                </div>
                <div className="mb-3">
                  <div className="small bugie-muted mb-1">Reportado el</div>
                  <div style={{ color: 'var(--bugie-text)' }}>
                    {new Date(sosToResolve.createdAt).toLocaleString('es-PE')}
                  </div>
                </div>
                <div className="mb-2">
                  <label className="form-label small fw-semibold" style={{ color: 'var(--bugie-text)' }}>
                    Motivo de desactivación <span style={{ color: '#f87171' }}>*</span>
                  </label>
                  <textarea
                    className="form-control"
                    rows={3}
                    placeholder="Ej: Falsa alarma confirmada por teléfono."
                    value={resolveReason}
                    onChange={e => setResolveReason(e.target.value)}
                    maxLength={500}
                    disabled={resolving}
                    autoFocus
                  />
                  <div className="small bugie-muted mt-1">
                    Mínimo 3 caracteres. {resolveReason.length}/500
                  </div>
                </div>
              </div>
              <div className="modal-footer" style={{ borderTop: '1px solid var(--bugie-border)' }}>
                <button className="btn btn-bugie-outline"
                  onClick={() => { setSosToResolve(null); setResolveReason(''); }}
                  disabled={resolving}>
                  Cancelar
                </button>
                <button className="btn"
                  style={{ background: '#f87171', color: 'white', fontWeight: 600 }}
                  onClick={handleResolveSos}
                  disabled={resolving || resolveReason.trim().length < 3}>
                  {resolving
                    ? (<><i className="fa-solid fa-spinner fa-spin me-1" />Desactivando...</>)
                    : (<><i className="fa-solid fa-circle-check me-1" />Desactivar alerta</>)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Toggle de capa del mapa (botón con ícono ojo). Click → muestra/oculta esa
// categoría de pines (conductores, pasajeros, SOS).
// ──────────────────────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────────────────
// Avatar: foto de perfil circular. Si no hay URL o falla la carga, muestra
// un ícono fallback en círculo del color especificado. Usado en el modal
// de detalle (conductor + pasajero).
// ──────────────────────────────────────────────────────────────────────────
interface AvatarProps {
  url:          string | null;
  fallbackIcon: string;   // fa-icon class sin el "fa-solid"
  color:        string;
  size?:        number;
}
function Avatar({ url, fallbackIcon, color, size = 48 }: AvatarProps) {
  /// Si la imagen tirando un onError, marcamos broken para mostrar fallback.
  /// useState con el url como dep para que si cambia (poll del backend) se
  /// reintente cargar la nueva foto.
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [url]);

  const showImg = !!url && !broken;

  return (
    <div
      style={{
        width: size, height: size,
        borderRadius: '50%',
        flexShrink: 0,
        background: showImg ? '#222' : color + '22',
        border: `2px solid ${color}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {showImg ? (
        <img
          src={url!}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setBroken(true)}
        />
      ) : (
        <i
          className={`fa-solid ${fallbackIcon}`}
          style={{ color, fontSize: size * 0.45 }}
        />
      )}
    </div>
  );
}

interface LayerToggleProps { active: boolean; onClick: () => void; color: string; label: string; }
function LayerToggle({ active, onClick, color, label }: LayerToggleProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={active ? `Ocultar ${label}` : `Mostrar ${label}`}
      style={{
        background: active ? `${color}1f` : 'transparent',
        color:      active ? color        : '#94a3b8',
        border:     `1px solid ${active ? color : 'var(--bugie-border)'}`,
        fontWeight: 600,
        fontSize:   '0.78rem',
        padding:    '4px 12px',
        borderRadius: 999,
        cursor:     'pointer',
        transition: 'all .15s',
      }}
    >
      <i className={`fa-solid ${active ? 'fa-eye' : 'fa-eye-slash'} me-1`} />
      {label}
    </button>
  );
}

interface TripDetailProps {
  trip: LivePassenger;
  driver: OnlineDriver | null;
  vehicle?: VehicleBulk;
  deviated: boolean;
  /// Alerta SOS del PASAJERO si está activa, sino null.
  /// Si está presente, la card del pasajero se pinta roja con animación.
  passengerSosAlert: SosAlert | null;
  /// Alerta SOS del CONDUCTOR si está activa, sino null.
  driverSosAlert:    SosAlert | null;
  /// Callback al hacer click en "Desactivar alerta" desde dentro del modal.
  /// El padre se encarga de abrir el modal de motivo SOS.
  onResolveSos:      (a: SosAlert) => void;
  onClose:           () => void;
}

function TripDetailModal({
  trip, driver, vehicle, deviated,
  passengerSosAlert, driverSosAlert, onResolveSos,
  onClose,
}: TripDetailProps) {
  /// Coordenadas de la ruta real (calles) calculada por GraphHopper.
  /// Formato: [[lng, lat], ...]. Se carga UNA SOLA VEZ al abrir el modal
  /// porque la ruta planificada no cambia durante el viaje (es la misma
  /// origen → waypoints → destino). El que se mueve es el conductor, eso
  /// sí se actualiza con cada poll.
  const [routeCoords, setRouteCoords] = useState<number[][] | null>(null);
  /// Si la ruta falla por timeout/red, lo registramos pero no mostramos
  /// error al usuario: simplemente el mapa queda sin polyline.
  const [routeLoading, setRouteLoading] = useState(true);

  /// Ref para llamar al fitBounds del mapa del modal (botón autofoco).
  /// Distinto de modalFocusRef: fitBounds reencaja TODOS los markers con
  /// padding, mientras focus solo centra en un punto sin tocar zoom.
  const modalFitBoundsRef = useRef<(() => void) | null>(null);

  /// Autofoco: reencaja el mapa para que se vean origen + destino + pasajero
  /// + conductor con un padding razonable. Esto sí ajusta zoom dinámicamente
  /// — a diferencia de un setView que solo recentra.
  function refocusOnTrip() {
    modalFitBoundsRef.current?.();
  }

  // Cargar paradas + ruta real al abrir el modal (1 sola vez).
  useEffect(() => {
    let cancelled = false;
    setRouteLoading(true);

    (async () => {
      try {
        // 1) Obtener paradas intermedias persistidas del viaje
        let waypoints: Array<{ lat: number; lng: number }> = [];
        try {
          const wpts = await apiFetch<Array<{ lat: number; lng: number; sortOrder: number }>>(
            `${API.trips}/trips/${trip.tripId}/waypoints`
          );
          waypoints = (wpts ?? [])
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map(w => ({ lat: w.lat, lng: w.lng }));
        } catch {
          // Si falla, seguimos sin paradas (la mayoría de viajes no tienen)
        }
        if (cancelled) return;

        // 2) Construir lista origen + waypoints + destino
        const points = [
          { lat: trip.originLat, lng: trip.originLng },
          ...waypoints,
          { lat: trip.destLat, lng: trip.destLng },
        ];

        // 3) Pedir ruta real a GraphHopper vía nuestro backend
        const route = await apiFetch<{
          options: Array<{ coordinates: number[][] }>;
          isFallback: boolean;
        }>(`${API.trips}/trips/route/waypoints`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ points }),
        });

        if (cancelled) return;
        // Tomamos la primera opción (la más rápida según GraphHopper)
        const coords = route?.options?.[0]?.coordinates;
        if (coords && coords.length > 0) {
          setRouteCoords(coords);
        }
      } catch (err) {
        console.warn('No se pudo cargar la ruta del viaje:', err);
      } finally {
        if (!cancelled) setRouteLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // Solo depende del tripId (no de trip completo, sino se rerunearía cada
    // poll). La ruta del viaje no cambia durante el viaje.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.tripId]);

  // Mini-mapa con los 4 puntos del viaje: origen, destino, pasajero y conductor.
  // Memoizado para que solo se reconstruya cuando cambian las posiciones del
  // trip (cosa que pasa cada poll, perfecto para mover los pines en vivo).
  const miniMarkers = useMemo(() => {
    const list: MapMarker[] = [
      {
        lat: trip.originLat, lng: trip.originLng,
        type: 'origin' as const, label: 'Origen',
      },
      {
        lat: trip.destLat, lng: trip.destLng,
        type: 'destination' as const, label: 'Destino',
      },
    ];
    // Pin del pasajero (posición reportada por su app).
    // Solo lo agregamos si tenemos coordenadas válidas — al inicio del viaje
    // suelen ser 0/0 si el pasajero no ha enviado GPS todavía.
    if (trip.lat && trip.lng && (trip.lat !== 0 || trip.lng !== 0)) {
      list.push({
        lat: trip.lat, lng: trip.lng,
        type: 'passenger' as const,
        label: trip.passengerName || 'Pasajero',
        extra: { tripStatus: trip.status },
      });
    }
    // Pin del conductor (auto). Solo si reportó posición.
    if (trip.driverLat && trip.driverLng) {
      list.push({
        lat: trip.driverLat, lng: trip.driverLng,
        type: 'driver' as const,
        label: driver?.fullName || trip.driverName || 'Conductor',
        deviated,
        extra: {
          fullName: driver?.fullName || trip.driverName || undefined,
          hasActiveTrip: true,
          rating: driver?.rating,
        },
      });
    }
    return list;
  }, [trip, driver, deviated]);

  const statusLabel: Record<number, string> = {
    1: 'Buscando conductor',
    2: 'Conductor en camino',
    3: 'Viaje en curso',
    6: 'SOS activo',
    7: 'Negociando tarifa',
  };

  return (
    <div
      className="modal show d-block"
      tabIndex={-1}
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="modal-dialog modal-xl modal-dialog-centered"
        style={{ maxWidth: '94vw' }}
      >
        <div className="modal-content" style={{ background: 'var(--bugie-bg-2)', border: '1px solid var(--bugie-border)' }}>
          <div className="modal-header" style={{ borderBottom: '1px solid var(--bugie-border)' }}>
            <h5 className="modal-title">
              <i className="fa-solid fa-circle-info me-2" />
              Detalle del viaje en curso
              {deviated && <span className="badge ms-2" style={{ background: '#dc2626', color: 'white' }}>⚠️ Desviado</span>}
            </h5>
            <button type="button" className="btn-close btn-close-white" onClick={onClose} />
          </div>

          <div className="modal-body">
            <div className="row g-3">
              {/* ── Info: columna estrecha con tarjetas (33%) ── */}
              <div className="col-md-4 d-flex flex-column gap-2">
                {/* Animaciones de SOS para cards. Definidas una sola vez aquí
                    porque solo se usan en este modal. */}
                <style>{`
                  @keyframes sosCardPulse {
                    0%, 100% { box-shadow: 0 0 0 0 rgba(248,113,113,0.55); }
                    50%      { box-shadow: 0 0 0 14px rgba(248,113,113,0); }
                  }
                  .sos-card-pulse {
                    animation: sosCardPulse 1.4s ease-in-out infinite;
                  }
                `}</style>

                {/* ── Conductor ── */}
                <div
                  className={driverSosAlert ? 'sos-card-pulse' : ''}
                  style={{
                    background: driverSosAlert
                      ? 'rgba(248,113,113,0.12)'
                      : 'rgba(129,140,248,0.08)',
                    border: driverSosAlert
                      ? '2px solid #f87171'
                      : '1px solid rgba(129,140,248,0.2)',
                    borderRadius: 10,
                    padding: '12px 14px',
                  }}
                >
                  <div style={{
                    color: driverSosAlert ? '#f87171' : '#818cf8',
                    fontSize: '0.72rem', fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
                  }}>
                    {driverSosAlert
                      ? <><i className="fa-solid fa-triangle-exclamation me-1" /> Conductor — SOS ACTIVO</>
                      : <><i className="fa-solid fa-id-card me-1" /> Conductor</>
                    }
                  </div>

                  {/* Avatar + datos */}
                  <div className="d-flex align-items-start gap-3">
                    <Avatar
                      url={driver?.profilePhotoUrl || null}
                      fallbackIcon="fa-id-card"
                      color="#818cf8"
                      size={56}
                    />
                    <div className="flex-grow-1 min-w-0">
                      <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--bugie-text, #e6e8f0)' }}>
                        {driver?.fullName || trip.driverName || '—'}
                      </div>
                      {trip.driverPhone && (
                        <div style={{ fontSize: '0.82rem', color: '#a8a8c8', marginTop: 4 }}>
                          <i className="fa-solid fa-phone me-1" style={{ fontSize: '0.7rem' }} />
                          <a
                            href={`tel:${trip.driverPhone}`}
                            style={{ color: '#818cf8', textDecoration: 'none', fontWeight: 600 }}
                          >
                            {trip.driverPhone}
                          </a>
                        </div>
                      )}
                      {vehicle && (
                        <div style={{ fontSize: '0.82rem', color: '#a8a8c8', marginTop: 4 }}>
                          <i className="fa-solid fa-car-side me-1" style={{ fontSize: '0.7rem' }} />
                          {[vehicle.brand, vehicle.model].filter(Boolean).join(' ')}
                          {vehicle.plate && (
                            <span style={{ fontFamily: 'monospace', marginLeft: 6, fontWeight: 600 }}>
                              · {vehicle.plate}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Foto del vehículo (si existe) */}
                  {vehicle?.photoUrl && (
                    <div style={{ marginTop: 10 }}>
                      <a
                        href={vehicle.photoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Ver foto en grande"
                        style={{ display: 'block' }}
                      >
                        <img
                          src={vehicle.photoUrl}
                          alt="Vehículo"
                          style={{
                            width: '100%',
                            maxHeight: 110,
                            objectFit: 'cover',
                            borderRadius: 8,
                            border: '1px solid var(--bugie-border)',
                            cursor: 'zoom-in',
                          }}
                          onError={e => {
                            // Si la imagen no carga, ocultamos el contenedor.
                            (e.currentTarget.parentElement!).style.display = 'none';
                          }}
                        />
                      </a>
                    </div>
                  )}

                  {/* Botón desactivar SOS — solo si hay alerta del conductor */}
                  {driverSosAlert && (
                    <button
                      className="btn btn-sm w-100 mt-2"
                      style={{
                        background: '#f87171',
                        color: 'white',
                        fontWeight: 700,
                      }}
                      onClick={() => onResolveSos(driverSosAlert)}
                    >
                      <i className="fa-solid fa-circle-check me-1" />
                      Desactivar alerta SOS
                    </button>
                  )}
                </div>

                {/* ── Pasajero ── */}
                <div
                  className={passengerSosAlert ? 'sos-card-pulse' : ''}
                  style={{
                    background: passengerSosAlert
                      ? 'rgba(248,113,113,0.12)'
                      : 'rgba(249,115,22,0.08)',
                    border: passengerSosAlert
                      ? '2px solid #f87171'
                      : '1px solid rgba(249,115,22,0.2)',
                    borderRadius: 10,
                    padding: '12px 14px',
                  }}
                >
                  <div style={{
                    color: passengerSosAlert ? '#f87171' : '#f97316',
                    fontSize: '0.72rem', fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
                  }}>
                    {passengerSosAlert
                      ? <><i className="fa-solid fa-triangle-exclamation me-1" /> Pasajero — SOS ACTIVO</>
                      : <><i className="fa-solid fa-person me-1" /> Pasajero</>
                    }
                  </div>

                  <div className="d-flex align-items-start gap-3">
                    <Avatar
                      url={trip.passengerPhotoUrl}
                      fallbackIcon="fa-person"
                      color="#f97316"
                      size={56}
                    />
                    <div className="flex-grow-1 min-w-0">
                      <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--bugie-text, #e6e8f0)' }}>
                        {trip.passengerName}
                      </div>
                      {trip.passengerPhone && (
                        <div style={{ fontSize: '0.82rem', color: '#a8a8c8', marginTop: 4 }}>
                          <i className="fa-solid fa-phone me-1" style={{ fontSize: '0.7rem' }} />
                          <a
                            href={`tel:${trip.passengerPhone}`}
                            style={{ color: '#f97316', textDecoration: 'none', fontWeight: 600 }}
                          >
                            {trip.passengerPhone}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Botón desactivar SOS — solo si hay alerta del pasajero */}
                  {passengerSosAlert && (
                    <button
                      className="btn btn-sm w-100 mt-2"
                      style={{
                        background: '#f87171',
                        color: 'white',
                        fontWeight: 700,
                      }}
                      onClick={() => onResolveSos(passengerSosAlert)}
                    >
                      <i className="fa-solid fa-circle-check me-1" />
                      Desactivar alerta SOS
                    </button>
                  )}
                </div>

                {/* Estado */}
                <div style={{
                  background: 'rgba(52,211,153,0.08)',
                  border: '1px solid rgba(52,211,153,0.2)',
                  borderRadius: 8,
                  padding: '12px 14px',
                }}>
                  <div style={{ color: '#34d399', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                    <i className="fa-solid fa-route me-1" /> Estado del viaje
                  </div>
                  <span className="badge" style={{
                    background: '#818cf822',
                    color: '#818cf8',
                    fontSize: '0.82rem',
                    padding: '6px 10px',
                  }}>
                    {statusLabel[trip.status] ?? 'En viaje'}
                  </span>
                  {deviated && (
                    <span className="badge ms-2" style={{
                      background: '#dc2626',
                      color: 'white',
                      fontSize: '0.78rem',
                      padding: '6px 10px',
                    }}>
                      ⚠️ Desviado
                    </span>
                  )}
                </div>

                {/* Direcciones */}
                <div style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8,
                  padding: '12px 14px',
                }}>
                  <div style={{ color: '#94a3b8', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                    <i className="fa-solid fa-map-pin me-1" /> Ruta
                  </div>
                  <div style={{ display: 'flex', alignItems: 'start', gap: 8, fontSize: '0.85rem', color: 'var(--bugie-text, #e6e8f0)' }}>
                    <span style={{
                      width: 18, height: 18, borderRadius: '50%',
                      background: '#10b981', color: 'white',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.7rem', fontWeight: 700, flexShrink: 0, marginTop: 2,
                    }}>A</span>
                    <span>{trip.originLat.toFixed(5)}, {trip.originLng.toFixed(5)}</span>
                  </div>
                  <div style={{ height: 12, borderLeft: '2px dashed #475569', marginLeft: 8 }} />
                  <div style={{ display: 'flex', alignItems: 'start', gap: 8, fontSize: '0.85rem', color: 'var(--bugie-text, #e6e8f0)' }}>
                    <span style={{
                      width: 18, height: 18, borderRadius: '50%',
                      background: '#1e293b', color: 'white', border: '2px solid #94a3b8',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.7rem', fontWeight: 700, flexShrink: 0, marginTop: 2,
                    }}>B</span>
                    <span>{trip.destLat.toFixed(5)}, {trip.destLng.toFixed(5)}</span>
                  </div>
                </div>

                {/* Última actualización */}
                {trip.updatedAt && (
                  <div style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 8,
                    padding: '10px 14px',
                  }}>
                    <div style={{ color: '#94a3b8', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                      <i className="fa-regular fa-clock me-1" /> Última actualización
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--bugie-text, #e6e8f0)' }}>
                      {new Date(trip.updatedAt).toLocaleString('es-PE')}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Mapa: columna amplia (66%) ── */}
              <div className="col-md-8">
                {routeLoading && (
                  <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: 8 }}>
                    <i className="fa-solid fa-spinner fa-spin me-1" />
                    Calculando ruta del viaje...
                  </div>
                )}
                <div style={{ position: 'relative' }}>
                  <BugieMapAdmin
                    height={620}
                    markers={miniMarkers}
                    routeCoordinates={routeCoords ?? undefined}
                    onFitBoundsRef={modalFitBoundsRef}
                  />
                  {/* Botón flotante para recentrar en el viaje completo. */}
                  <button
                    type="button"
                    className="btn btn-light"
                    onClick={refocusOnTrip}
                    title="Centrar en el viaje"
                    style={{
                      position: 'absolute',
                      top: 10, right: 10,
                      width: 40, height: 40,
                      padding: 0,
                      borderRadius: 8,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                      zIndex: 500,
                    }}
                  >
                    <i className="fa-solid fa-crosshairs" style={{ color: '#1a1730' }} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="modal-footer" style={{ borderTop: '1px solid var(--bugie-border)' }}>
            <button className="btn btn-bugie-outline" onClick={onClose}>
              <i className="fa-solid fa-arrow-left me-1" />
              Volver al mapa principal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// TabButton: botón de tab para el sidebar del monitoreo.
// Diseño: ícono + label + contador (badge). Cuando está activo, fondo del
// color del tema y línea inferior gruesa. Sin animación de pulse a menos
// que pulse=true (para SOS cuando hay alertas).
// ─────────────────────────────────────────────────────────────────────────
interface TabButtonProps {
  active:   boolean;
  onClick:  () => void;
  color:    string;
  icon:     string;
  label:    string;
  count:    number;
  pulse?:   boolean;
}

function TabButton({ active, onClick, color, icon, label, count, pulse }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        background: active ? `${color}15` : 'transparent',
        border: 'none',
        borderBottom: `3px solid ${active ? color : 'transparent'}`,
        padding: '0.75rem 0.5rem',
        cursor: 'pointer',
        transition: 'all .15s ease',
        fontWeight: 600,
        fontSize: '0.82rem',
        color: active ? color : 'var(--bugie-text)',
        opacity: active ? 1 : 0.7,
        position: 'relative',
      }}
    >
      <div className="d-flex align-items-center justify-content-center gap-2">
        <i className={`fa-solid ${icon}`} style={{ fontSize: '0.95rem' }} />
        <span className="d-none d-md-inline">{label}</span>
        <span
          className="badge rounded-pill"
          style={{
            background: active ? color : 'var(--bugie-border)',
            color: active ? 'white' : 'var(--bugie-text)',
            fontSize: '0.7rem',
            minWidth: 22,
          }}
        >
          {count}
        </span>
        {pulse && count > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 8, right: 8,
              width: 8, height: 8,
              borderRadius: '50%',
              background: color,
              animation: 'bugieTabPulse 1.4s ease-in-out infinite',
            }}
          />
        )}
      </div>
      <style>{`
        @keyframes bugieTabPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.4; transform: scale(1.4); }
        }
      `}</style>
    </button>
  );
}
