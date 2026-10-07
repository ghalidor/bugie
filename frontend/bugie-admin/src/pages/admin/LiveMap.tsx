import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BugieMapAdmin, { MapClusterOptions, MapLine, MapMarker } from '../../components/BugieMapAdmin';
import { Drawer, IconButton, Page, SectionCard, StatCard, StatGrid, Tone, useMediaQuery, useToast } from '../../components/ui';
import { useLiveMonitor } from './livemap/useLiveMonitor';
import { useResolveSos, useReviewDeviation, useReviewMonitorAlert } from './livemap/sosActions';
import { LivePassenger, liveTripStatus, MonitorAlert, monitorAlertMeta, OnlineDriver, RouteDeviation, SosAlert, roleLabel } from './livemap/types';
import MonitorPanel, { PanelTab } from './livemap/MonitorPanel';
import DriversList, { driverState } from './livemap/DriversList';
import TripsList from './livemap/TripsList';
import AlertsList from './livemap/AlertsList';
import LiveTripDetail from './livemap/LiveTripDetail';
import MonitorSearch, { FollowTarget } from './livemap/MonitorSearch';
import FollowPanel, { FollowPanelProps } from './livemap/FollowPanel';
import FilterChips from './livemap/FilterChips';
import MapLegend from './livemap/MapLegend';
import { buildTripScene, Pt, sceneLines, tripPhase, TripScene } from './livemap/tripScene';
import { isStale, lastSeenMs, loadFilters, MONITOR_FILTERS, MonitorFilter, saveFilters } from './livemap/monitorFilters';
import { useTripDetail } from '../../components/useTripDetail';
import './ops.scss';

/// Agrupación de pines al alejar: conductores disponibles y pasajeros buscando
/// conductor. Los viajes activos y los SOS nunca se agrupan.
const CLUSTER: MapClusterOptions = {
  gridPx: 64,
  maxZoom: 14,
  labels: { drivers: 'conductores disponibles', pax: 'pasajeros buscando conductor' },
};

/// Cada cuánto se reevalúa "Sin señal" (no depende de que llegue un GPS).
const STALE_TICK_MS = 15_000;

/// Botón de capa del mapa (mostrar/ocultar conductores, pasajeros, SOS o recorridos).
function LayerToggle({ active, onClick, tone, label }: { active: boolean; onClick: () => void; tone: Tone; label: string }) {
  return (
    <button type="button" className={`lm-layer bx-tone-${tone}`} aria-pressed={active} onClick={onClick}
            title={active ? `Ocultar ${label.toLowerCase()} del mapa` : `Mostrar ${label.toLowerCase()} en el mapa`}>
      <i className={`fa-solid ${active ? 'fa-eye' : 'fa-eye-slash'}`} aria-hidden="true" />{label}
    </button>
  );
}

/// Reloj que avanza cada `ms` (para estados que dependen del tiempo).
function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/// Posición del auto: la del conductor en línea o, si no, la que trae el viaje.
const driverPosOf = (p: LivePassenger | null, d: OnlineDriver | null | undefined): Pt | null =>
  d?.currentLat && d.currentLng ? [d.currentLat, d.currentLng]
  : p?.driverLat && p.driverLng ? [p.driverLat, p.driverLng] : null;

/// Centro de comando: mapa en vivo + conductores, viajes y alertas (SOS y desvíos).
export default function LiveMap() {
  const toast = useToast();
  const isXl = useMediaQuery('(min-width: 1200px)');
  const isSm = useMediaQuery('(min-width: 576px)');
  const isLg = useMediaQuery('(min-width: 992px)');
  const now = useNow(STALE_TICK_MS);

  const m = useLiveMonitor({
    onNewSos: e => toast.show({ tone: 'error', title: 'Nueva alerta SOS', message: `${roleLabel(e.userRole)} pidió ayuda. Revísala en «Alertas».`, duration: 8000 }),
    onNewDeviation: () => toast.warning('Un conductor se salió de la ruta planificada. Revísalo en «Alertas».', 'Desvío de ruta'),
    onNewMonitorAlert: e => toast.warning(
      `${e.message || 'Hay un viaje que necesita seguimiento.'} Revísalo en «Alertas».`,
      e.title || monitorAlertMeta(e.type).label),
  });
  const { drivers, alerts, passengers, vehicleByUser, deviations, trails, deviatedByUserId, sosUserIds, sosDriverUserIds,
    monitorAlerts, monitorAlertsByTrip, pendingMonitorAlerts } = m;

  const resolveSos = useResolveSos();
  const reviewDeviation = useReviewDeviation();
  const reviewMonitorAlert = useReviewMonitorAlert();
  // Detalle completo (recorrido, ruta, desvíos) de un viaje que ya no está en curso.
  const pastTrip = useTripDetail();

  // ── Estado de la vista ───────────────────────────────────────────────
  const [tab,            setTab]            = useState<PanelTab>('drivers');
  const [panelOpen,      setPanelOpen]      = useState(false);   // Drawer en < xl
  const [tripDetailId,   setTripDetailId]   = useState<string | null>(null);
  const [showDrivers,    setShowDrivers]    = useState(true);
  const [showPassengers, setShowPassengers] = useState(true);
  const [showSos,        setShowSos]        = useState(true);
  const [showTrails,     setShowTrails]     = useState(true);
  const [filters,        setFilters]        = useState<MonitorFilter[]>(() => loadFilters());
  // Seguimiento de una unidad
  const [follow,         setFollow]         = useState<FollowTarget | null>(null);
  const [followPaused,   setFollowPaused]   = useState(false);
  const [hideOthers,     setHideOthers]     = useState(false);

  useEffect(() => { saveFilters(filters); }, [filters]);

  // Al pasar a escritorio el Drawer ya no hace falta.
  useEffect(() => { if (isXl) setPanelOpen(false); }, [isXl]);

  const tripDetail = useMemo(
    () => (tripDetailId ? passengers.find(p => p.tripId === tripDetailId) ?? null : null),
    [tripDetailId, passengers],
  );

  // Refs del mapa principal: enfocar, encuadrar todo y desplazar (seguir).
  const focusMarkerRef   = useRef<((lat: number, lng: number) => void) | null>(null);
  const mainFitBoundsRef = useRef<(() => void) | null>(null);
  const panToRef         = useRef<((lat: number, lng: number) => void) | null>(null);
  const pendingFitRef    = useRef(false);

  // ── Índices ──────────────────────────────────────────────────────────
  const driverByUser = useMemo(() => {
    const r: Record<string, OnlineDriver> = {};
    drivers.forEach(d => { r[d.userId] = d; });
    return r;
  }, [drivers]);

  /** Viaje con conductor asignado (en camino, en curso o SOS) por userId del conductor. */
  const tripByDriver = useMemo(() => {
    const r: Record<string, LivePassenger> = {};
    passengers.forEach(p => {
      const ph = tripPhase(p.status);
      if (p.driverId && (ph === 'pickup' || ph === 'onboard')) r[p.driverId] = p;
    });
    return r;
  }, [passengers]);

  const tripStatusByUser = useMemo(() => {
    const r: Record<string, number> = {};
    Object.entries(tripByDriver).forEach(([uid, p]) => { r[uid] = p.status; });
    return r;
  }, [tripByDriver]);

  /** Conductores con alguna alerta de seguimiento abierta y los que la tienen de "sin señal". */
  const { watchedDrivers, noSignalDrivers } = useMemo(() => {
    const watched = new Set<string>();
    const noSignal = new Set<string>();
    monitorAlerts.forEach(a => {
      if (!a.driverId) return;
      watched.add(a.driverId);
      if (a.type === 'no_signal') noSignal.add(a.driverId);
    });
    return { watchedDrivers: watched, noSignalDrivers: noSignal };
  }, [monitorAlerts]);
  const tripHasNoSignalAlert = useCallback(
    (tripId: string) => (monitorAlertsByTrip[tripId] ?? []).some(a => a.type === 'no_signal'),
    [monitorAlertsByTrip],
  );

  /** SOS del viaje: status SOS o alerta del pasajero o del conductor. */
  const isTripSos = useCallback(
    (p: LivePassenger) => p.status === 6 || sosUserIds.has(p.passengerId) || (!!p.driverId && sosUserIds.has(p.driverId)),
    [sosUserIds],
  );

  // ── Escena por viaje (qué se dibuja según su estado) ─────────────────
  // Se recalcula solo el viaje cuyo auto, recorrido o estado cambió: con
  // cientos de unidades, un GPS no rehace las líneas de todos los viajes.
  const sceneCache = useRef(new Map<string, { deps: unknown[]; scene: TripScene }>());
  const scenes = useMemo(() => {
    const out: Record<string, TripScene> = {};
    const cache = sceneCache.current;
    const alive = new Set<string>();
    passengers.forEach(p => {
      alive.add(p.tripId);
      const pos = driverPosOf(p, p.driverId ? driverByUser[p.driverId] : undefined);
      const trail = trails[p.tripId] ?? null;
      const sos = isTripSos(p);
      const dev = !!(p.driverId && deviatedByUserId[p.driverId]);
      const deps: unknown[] = [p.status, p.originLat, p.originLng, p.destLat, p.destLng, p.lat, p.lng, p.startedAt,
        pos?.[0], pos?.[1], trail?.points, trail?.planned, sos, dev];
      const hit = cache.get(p.tripId);
      if (hit && hit.deps.every((v, i) => v === deps[i])) { out[p.tripId] = hit.scene; return; }
      const scene = buildTripScene({ trip: p, driverPos: pos, trail, planned: trail?.planned ?? null, sos, deviated: dev });
      cache.set(p.tripId, { deps, scene });
      out[p.tripId] = scene;
    });
    cache.forEach((_, id) => { if (!alive.has(id)) cache.delete(id); });
    return out;
  }, [passengers, driverByUser, trails, isTripSos, deviatedByUserId]);

  // ── Filtros (chips) ──────────────────────────────────────────────────
  // "Envíos" solo aparece si el servidor indica el tipo de servicio del viaje.
  const hasDeliveryData = passengers.some(p => p.serviceType !== undefined && p.serviceType !== null);
  const availableFilters = useMemo(
    () => new Set(MONITOR_FILTERS.map(f => f.key).filter(k => k !== 'delivery' || hasDeliveryData)),
    [hasDeliveryData],
  );
  const activeFilters = useMemo(() => filters.filter(k => availableFilters.has(k)), [filters, availableFilters]);

  /** Categorías de cada unidad (viaje o conductor sin viaje) y contadores de los chips. */
  const cats = useMemo(() => {
    const trip: Record<string, Set<MonitorFilter>> = {};
    const driver: Record<string, Set<MonitorFilter>> = {};
    const counts = Object.fromEntries(MONITOR_FILTERS.map(f => [f.key, 0])) as Record<MonitorFilter, number>;
    const add = (s: Set<MonitorFilter>, k: MonitorFilter) => { s.add(k); counts[k]++; };

    passengers.forEach(p => {
      const s = new Set<MonitorFilter>();
      const ph = tripPhase(p.status);
      if (ph === 'searching') add(s, 'searching');
      else if (ph === 'pickup') add(s, 'enRoute');
      else if (ph === 'onboard') add(s, 'inTrip');
      if (p.serviceType === 1) add(s, 'delivery');
      if (p.driverId && deviatedByUserId[p.driverId]) add(s, 'deviated');
      if (isTripSos(p)) add(s, 'sos');
      const staleGps = (ph === 'pickup' || ph === 'onboard') && isStale(lastSeenMs(p.driverId ? driverByUser[p.driverId] : null, trails[p.tripId]), now);
      if (staleGps || tripHasNoSignalAlert(p.tripId)) add(s, 'noSignal');
      trip[p.tripId] = s;
    });
    drivers.forEach(d => {
      if (tripByDriver[d.userId]) return; // cuenta como parte de su viaje
      const s = new Set<MonitorFilter>();
      add(s, d.hasActiveTrip ? 'inTrip' : 'available');
      if (deviatedByUserId[d.userId]) add(s, 'deviated');
      if (sosUserIds.has(d.userId)) add(s, 'sos');
      // "Sin señal" solo aplica con viaje (no a los disponibles).
      if (d.hasActiveTrip && (isStale(lastSeenMs(d, null), now) || noSignalDrivers.has(d.userId))) add(s, 'noSignal');
      driver[d.userId] = s;
    });
    return { trip, driver, counts };
  }, [passengers, drivers, tripByDriver, driverByUser, trails, deviatedByUserId, sosUserIds, isTripSos, now, tripHasNoSignalAlert, noSignalDrivers]);

  const matches = useCallback(
    (s: Set<MonitorFilter> | undefined) => activeFilters.length === 0 || (!!s && activeFilters.some(k => s.has(k))),
    [activeFilters],
  );
  const tripVisible = useCallback((p: LivePassenger) => matches(cats.trip[p.tripId]), [matches, cats]);
  const driverVisible = useCallback((d: OnlineDriver) => {
    const t = tripByDriver[d.userId];
    return t ? matches(cats.trip[t.tripId]) : matches(cats.driver[d.userId]);
  }, [matches, cats, tripByDriver]);

  // ── Seguimiento ──────────────────────────────────────────────────────
  const followed = useMemo(() => {
    if (!follow) return null;
    let trip: LivePassenger | null = null;
    let driver: OnlineDriver | null = null;
    if (follow.kind === 'driver') {
      driver = driverByUser[follow.userId] ?? null;
      trip = tripByDriver[follow.userId] ?? null;
    } else {
      trip = passengers.find(p => p.tripId === follow.tripId) ?? null;
      driver = trip?.driverId ? driverByUser[trip.driverId] ?? null : null;
    }
    if (!trip && !driver) return null;
    const scene = trip ? scenes[trip.tripId] ?? null : null;
    const pos = (scene?.phase === 'searching' ? null : driverPosOf(trip, driver)) ?? scene?.paxPos ?? null;
    return { trip, driver, scene, pos, tripId: trip?.tripId ?? null, driverUserId: driver?.userId ?? trip?.driverId ?? null };
  }, [follow, driverByUser, tripByDriver, passengers, scenes]);

  // Si la unidad seguida desaparece: si era un viaje que terminó y su
  // conductor sigue en línea, se sigue al conductor; si no, se avisa.
  const lastFollowedDriver = useRef<string | null>(null);
  useEffect(() => {
    if (!follow) return;
    if (followed) { lastFollowedDriver.current = followed.driverUserId; return; }
    const uid = lastFollowedDriver.current;
    if (follow.kind === 'trip' && uid && driverByUser[uid]) { setFollow({ kind: 'driver', userId: uid }); return; }
    toast.info('La unidad que seguías ya no está en el mapa.', 'Seguimiento terminado');
    setFollow(null);
    setFollowPaused(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follow, followed, driverByUser]);

  // Sigue a la unidad en cada GPS (salvo que el usuario haya movido el mapa).
  const fLat = followed?.pos?.[0];
  const fLng = followed?.pos?.[1];
  useEffect(() => {
    if (!follow || followPaused || tripDetailId || fLat == null || fLng == null) return;
    panToRef.current?.(fLat, fLng);
  }, [follow, followPaused, tripDetailId, fLat, fLng]);

  const followRef = useRef(follow);
  followRef.current = follow;
  /** El usuario arrastró el mapa: se pausa el seguimiento (no se pelea con él). */
  const handleUserDrag = useCallback(() => { if (followRef.current) setFollowPaused(true); }, []);

  function startFollow(t: FollowTarget, pos: Pt | null) {
    setFollow(t);
    setFollowPaused(false);
    if (pos) focusMarkerRef.current?.(pos[0], pos[1]);
    if (!isXl) setPanelOpen(false);
  }
  function followDriver(d: OnlineDriver) {
    startFollow({ kind: 'driver', userId: d.userId }, driverPosOf(tripByDriver[d.userId] ?? null, d));
  }
  function followTrip(p: LivePassenger) {
    const sc = scenes[p.tripId];
    const pos = (sc?.phase === 'searching' ? null : driverPosOf(p, p.driverId ? driverByUser[p.driverId] : undefined)) ?? sc?.paxPos ?? null;
    startFollow({ kind: 'trip', tripId: p.tripId }, pos);
  }
  function followFromSearch(t: FollowTarget) {
    if (t.kind === 'driver') {
      const d = driverByUser[t.userId];
      if (d) followDriver(d);
    } else {
      const p = passengers.find(x => x.tripId === t.tripId);
      if (p) followTrip(p);
    }
  }
  function resumeFollow() {
    setFollowPaused(false);
    if (fLat != null && fLng != null) panToRef.current?.(fLat, fLng);
  }
  /** "Ver todos": deja de seguir y encuadra todo el mapa. */
  function showAll() {
    if (follow) {
      setFollow(null);
      setFollowPaused(false);
      pendingFitRef.current = true;
    } else {
      mainFitBoundsRef.current?.();
    }
  }

  function openTrip(tripId: string) {
    setTripDetailId(tripId);
    if (!isXl) setPanelOpen(false);
  }

  // ── Selección desde las listas ───────────────────────────────────────
  /// Conductor con viaje → abre el detalle del viaje; si no, lo sigue en el mapa.
  function handleOpenDriver(d: OnlineDriver) {
    const trip = tripByDriver[d.userId] ?? (d.hasActiveTrip ? passengers.find(p => p.driverId === d.userId) : undefined);
    if (trip) openTrip(trip.tripId);
    else if (d.currentLat && d.currentLng) followDriver(d);
  }

  /// Detalle del viaje de una alerta SOS. Si el viaje ya no está activo,
  /// abre su detalle completo (el mismo de la sección Viajes).
  function handleOpenSos(a: SosAlert) {
    const trip = passengers.find(p => p.tripId === a.tripId);
    if (trip) { openTrip(trip.tripId); return; }
    if (a.tripId) { pastTrip.open(a.tripId); if (!isXl) setPanelOpen(false); }
    else { focusMarkerRef.current?.(a.lat, a.lng); if (!isXl) setPanelOpen(false); }
  }

  /// Detalle del viaje de un desvío: en vivo si sigue en curso; si ya
  /// terminó, su detalle completo con el recorrido y los desvíos.
  function handleOpenDeviation(dv: RouteDeviation) {
    const trip = passengers.find(p => p.tripId === dv.tripId);
    if (trip) openTrip(trip.tripId);
    else { pastTrip.open(dv.tripId); if (!isXl) setPanelOpen(false); }
  }

  /// Nombre del conductor de una alerta (lista de conductores o del viaje).
  function deviationDriverName(dv: RouteDeviation): string {
    return driverByUser[dv.driverId]?.fullName
        || passengers.find(p => p.tripId === dv.tripId)?.driverName
        || 'Conductor';
  }

  // ── Alertas de seguimiento ───────────────────────────────────────────
  function monitorDriverName(a: MonitorAlert): string {
    return a.driverName
        || driverByUser[a.driverId]?.fullName
        || passengers.find(p => p.tripId === a.tripId)?.driverName
        || 'Conductor';
  }
  /** Se puede seguir si el viaje sigue en curso o el conductor está en línea con posición. */
  function canFollowMonitor(a: MonitorAlert): boolean {
    if (passengers.some(p => p.tripId === a.tripId)) return true;
    const d = driverByUser[a.driverId];
    return !!(d?.currentLat && d.currentLng);
  }
  function handleFollowMonitor(a: MonitorAlert) {
    const p = passengers.find(x => x.tripId === a.tripId);
    if (p) { followTrip(p); return; }
    const d = driverByUser[a.driverId];
    if (d?.currentLat && d.currentLng) { followDriver(d); return; }
    toast.info('La unidad de esta alerta ya no está en el mapa.', 'No se puede seguir');
  }
  function handleOpenMonitor(a: MonitorAlert) {
    if (passengers.some(p => p.tripId === a.tripId)) openTrip(a.tripId);
    else { pastTrip.open(a.tripId); if (!isXl) setPanelOpen(false); }
  }
  async function handleReviewMonitor(a: MonitorAlert) {
    if (await reviewMonitorAlert(a, monitorDriverName(a))) m.markMonitorAlertReviewed(a.id);
  }

  async function handleResolveSos(a: SosAlert) {
    if (await resolveSos(a)) await m.load();
  }

  async function handleReviewDeviation(dv: RouteDeviation) {
    if (await reviewDeviation(dv, deviationDriverName(dv))) m.removeDeviation(dv.id);
  }

  function showAlerts() {
    setTab('alerts');
    if (!isXl) setPanelOpen(true);
  }

  // ── KPIs ─────────────────────────────────────────────────────────────
  const enViaje        = drivers.filter(d => d.hasActiveTrip).length;
  const desviadosCount = Object.values(deviatedByUserId).filter(Boolean).length;
  const alertCount     = alerts.length + deviations.length + pendingMonitorAlerts.length;

  // ── Pines y líneas (filtros + capas + seguimiento) ───────────────────
  // Los pines sin cambios se reutilizan dentro del mapa (BugieMapAdmin compara
  // su aspecto y posición); las líneas conservan la referencia de su escena.
  const { markers, lines } = useMemo(() => {
    const markers: MapMarker[] = [];
    const lines: MapLine[] = [];
    const following = !!followed;
    const fTrip = followed?.tripId ?? null;
    const fDriver = followed?.driverUserId ?? null;

    drivers.forEach(d => {
      if (!d.currentLat || !d.currentLng) return;
      const trip = tripByDriver[d.userId];
      const sc = trip ? scenes[trip.tripId] : undefined;
      // Con el pasajero a bordo, un SOS del viaje se muestra en el auto.
      const inSos = sosUserIds.has(d.userId) || (!!trip && sc?.phase === 'onboard' && isTripSos(trip));
      const sosShown = inSos && showSos; // las emergencias siempre a la vista
      const related = following && d.userId === fDriver; // la unidad seguida también
      if (!sosShown && !related && (!showDrivers || !driverVisible(d))) return;
      if (following && hideOthers && !related) return;
      const v = vehicleByUser[d.userId];
      markers.push({
        id: `driver:${d.id}`,
        lat: d.currentLat, lng: d.currentLng,
        type: 'driver',
        label: d.fullName || 'Conductor',
        deviated: deviatedByUserId[d.userId] === true,
        sosActive: inSos,
        warned: watchedDrivers.has(d.userId) || (!!trip && !!monitorAlertsByTrip[trip.tripId]),
        highlighted: related,
        dimmed: following && !related,
        clusterGroup: !trip && !d.hasActiveTrip && !inSos && !related ? 'drivers' : undefined,
        extra: {
          rating: d.rating, hasActiveTrip: d.hasActiveTrip || !!trip, tripStatus: trip?.status, fullName: d.fullName,
          vehiclePlate: v?.plate, vehicleBrand: v?.brand, vehicleModel: v?.model, vehicleColor: v?.color,
        },
      });
    });

    passengers.forEach(p => {
      const sc = scenes[p.tripId];
      if (!sc?.phase) return;
      const sos = isTripSos(p);
      const sosShown = sos && showSos;
      const related = following && p.tripId === fTrip;
      if (!sosShown && !related && !tripVisible(p)) return;
      if (following && hideOthers && !related) return;
      const dim = following && !related;

      // Auto del viaje que no figura "en línea" (p. ej. se desconectó un momento).
      const d = p.driverId ? driverByUser[p.driverId] : undefined;
      if (sc.phase !== 'searching' && sc.driverPos && !(d?.currentLat && d.currentLng) && (showDrivers || sosShown || related)) {
        markers.push({
          id: `tripdriver:${p.tripId}`, lat: sc.driverPos[0], lng: sc.driverPos[1], type: 'driver',
          label: p.driverName || 'Conductor',
          deviated: !!(p.driverId && deviatedByUserId[p.driverId]),
          sosActive: sc.phase === 'onboard' ? sos : !!(p.driverId && sosUserIds.has(p.driverId)),
          warned: !!monitorAlertsByTrip[p.tripId],
          highlighted: related, dimmed: dim,
          extra: { fullName: p.driverName ?? undefined, hasActiveTrip: true, tripStatus: p.status },
        });
      }
      // Pasajero: solo mientras espera (buscando conductor o conductor en camino).
      if (sc.paxPos) {
        const paxSos = sosUserIds.has(p.passengerId);
        if (showPassengers || related || (paxSos && showSos)) {
          markers.push({
            id: `pax:${p.tripId}`, lat: sc.paxPos[0], lng: sc.paxPos[1], type: 'passenger',
            label: p.passengerName || 'Pasajero',
            sosActive: paxSos,
            highlighted: related && sc.phase === 'searching',
            dimmed: dim,
            clusterGroup: sc.phase === 'searching' && !paxSos && !related ? 'pax' : undefined,
            extra: { tripStatus: p.status },
          });
        }
      }
      if (showTrails || related) {
        if (sc.destPos) {
          markers.push({
            id: `dest:${p.tripId}`, lat: sc.destPos[0], lng: sc.destPos[1], type: 'flag', color: sc.color,
            label: `Destino de ${p.passengerName || 'pasajero'}`, dimmed: dim,
          });
        }
        sceneLines(`trip:${p.tripId}`, sc, { emphasis: related, dimmed: dim, warned: !!monitorAlertsByTrip[p.tripId] }).forEach(l => lines.push(l));
      }
    });
    return { markers, lines };
  }, [drivers, passengers, scenes, tripByDriver, driverByUser, vehicleByUser, deviatedByUserId, sosUserIds, isTripSos,
      driverVisible, tripVisible, showDrivers, showPassengers, showSos, showTrails, followed, hideOthers, watchedDrivers, monitorAlertsByTrip]);

  // Con el detalle abierto, el mapa principal queda congelado (no se redibuja debajo).
  const frozenRef = useRef<{ markers: MapMarker[]; lines: MapLine[] } | null>(null);
  useEffect(() => {
    if (tripDetailId) { if (frozenRef.current === null) frozenRef.current = { markers, lines }; }
    else frozenRef.current = null;
  }, [tripDetailId, markers, lines]);
  const mainMapMarkers = tripDetailId ? (frozenRef.current?.markers ?? markers) : markers;
  const mainMapLines   = tripDetailId ? (frozenRef.current?.lines ?? lines) : lines;

  // "Ver todos": encuadra cuando el mapa ya tiene otra vez todas las unidades.
  useEffect(() => {
    if (!pendingFitRef.current) return;
    pendingFitRef.current = false;
    const id = requestAnimationFrame(() => mainFitBoundsRef.current?.());
    return () => cancelAnimationFrame(id);
  }, [mainMapMarkers]);

  // ── Listas (con los mismos filtros) ──────────────────────────────────
  // Conductores ordenados: SOS → desviado → en viaje → disponible.
  const listDrivers = useMemo(() => {
    const priority = (d: OnlineDriver) =>
      sosDriverUserIds.has(d.userId) ? 0 : deviatedByUserId[d.userId] ? 1 : (d.hasActiveTrip || tripByDriver[d.userId]) ? 2 : 3;
    return drivers
      .filter(driverVisible)
      .sort((a, b) => priority(a) - priority(b) || (a.fullName || '').localeCompare(b.fullName || ''));
  }, [drivers, driverVisible, deviatedByUserId, sosDriverUserIds, tripByDriver]);
  const listTrips = useMemo(() => passengers.filter(tripVisible), [passengers, tripVisible]);

  // ── Panel "Siguiendo a X" ────────────────────────────────────────────
  let followProps: FollowPanelProps | null = null;
  if (followed) {
    const { trip, driver, scene } = followed;
    const dUser = followed.driverUserId;
    const deviated = !!(dUser && deviatedByUserId[dUser]);
    const sos = trip ? isTripSos(trip) : !!(dUser && sosUserIds.has(dUser));
    const tripSt = trip ? liveTripStatus(trip.status) : null;
    const state = tripSt
      ? { label: tripSt.text, tone: sos ? 'bad' as Tone : tripSt.tone }
      : driverState(driver!, sos, deviated);
    const lastSeen = dUser
      ? lastSeenMs(driver, trip ? trails[trip.tripId] : null)
      : (trip?.updatedAt ? new Date(trip.updatedAt).getTime() : null);
    const distance = scene?.straightKm != null && (scene.phase === 'pickup' || scene.phase === 'onboard')
      ? { km: scene.straightKm, to: scene.phase === 'pickup' ? 'pickup' as const : 'destination' as const }
      : null;
    followProps = {
      driver, trip,
      vehicle: dUser ? vehicleByUser[dUser] : undefined,
      state, deviated, sos,
      lastSeenMs: lastSeen,
      speedKmh: driver?.speedKmh ?? null,
      distance,
      paused: followPaused,
      hideOthers,
      onHideOthersChange: setHideOthers,
      onResume: resumeFollow,
      onExit: showAll,
      onOpenTrip: trip ? () => openTrip(trip.tripId) : null,
      monitorAlerts: trip
        ? monitorAlertsByTrip[trip.tripId] ?? []
        : monitorAlerts.filter(a => !!dUser && a.driverId === dUser),
    };
  }

  // ── Render ───────────────────────────────────────────────────────────
  const filtered = activeFilters.length > 0;
  const panel = (
    <MonitorPanel
      tab={tab}
      onTabChange={setTab}
      counts={{ drivers: listDrivers.length, trips: listTrips.length, alerts: alertCount }}
      drivers={
        <DriversList drivers={listDrivers} filtered={filtered} vehicleByUser={vehicleByUser}
          deviatedByUserId={deviatedByUserId} sosDriverUserIds={sosDriverUserIds} tripStatusByUser={tripStatusByUser}
          followedUserId={followed?.driverUserId ?? null} onClick={handleOpenDriver} onFollow={followDriver} />
      }
      trips={
        <TripsList passengers={listTrips} filtered={filtered} isSos={isTripSos} followedTripId={followed?.tripId ?? null}
          onFollow={followTrip} onOpen={p => openTrip(p.tripId)} />
      }
      alerts={
        <AlertsList alerts={alerts} deviations={deviations} passengers={passengers}
          driverName={deviationDriverName} onOpenSos={handleOpenSos} onResolveSos={handleResolveSos}
          onOpenDeviation={handleOpenDeviation} onReviewDeviation={handleReviewDeviation}
          monitorAlerts={pendingMonitorAlerts} monitorDriverName={monitorDriverName}
          onFollowMonitor={handleFollowMonitor} canFollowMonitor={canFollowMonitor}
          onOpenMonitor={handleOpenMonitor} onReviewMonitor={handleReviewMonitor} />
      }
    />
  );

  const showDeviationKpi = m.deviationEnabled || deviations.length > 0;

  return (
    <Page
      title="Monitoreo en vivo"
      subtitle="Conductores, viajes y alertas en tiempo real."
      helpKey="monitor"
      extra={
        <>
          <span className={`lm-live ${m.autoRefresh ? '' : 'paused'}`} aria-hidden="true" />
          <span aria-live="polite">
            {m.autoRefresh ? 'En vivo' : 'Pausado'}
            {m.lastUpdate && <> · {m.lastUpdate.toLocaleTimeString('es-PE')}</>}
          </span>
        </>
      }
      actions={[
        { label: m.autoRefresh ? 'Pausar actualización' : 'Reanudar actualización', icon: m.autoRefresh ? 'fa-pause' : 'fa-play', onClick: () => m.setAutoRefresh(v => !v) },
        { label: 'Actualizar', icon: 'fa-rotate-right', onClick: m.load, loading: m.refreshing && !m.loading },
      ]}
    >
      <StatGrid min={130} tourId="monitor-stats">
        <StatCard label="En línea"          value={drivers.length}                  icon="fa-circle-dot"           tone="ok"      loading={m.loading} pulse={drivers.length > 0} />
        <StatCard label="En viaje"          value={enViaje}                         icon="fa-car"                  tone="primary" loading={m.loading} />
        <StatCard label="Disponibles"       value={drivers.length - enViaje}        icon="fa-circle-check"         tone="info"    loading={m.loading} />
        <StatCard label="Pasajeros activos" value={passengers.length}               icon="fa-person"               tone="warn"    loading={m.loading} onClick={() => { setTab('trips'); if (!isXl) setPanelOpen(true); }} />
        <StatCard label="Alertas SOS"       value={alerts.length}                   icon="fa-triangle-exclamation" tone={alerts.length > 0 ? 'bad' : 'neutral'} loading={m.loading} pulse={alerts.length > 0} onClick={showAlerts} />
        {showDeviationKpi && (
          <StatCard label="Desviados"       value={desviadosCount}                  icon="fa-route"                tone={desviadosCount > 0 ? 'bad' : 'neutral'} loading={m.loading} pulse={desviadosCount > 0} onClick={showAlerts}
                    hint={deviations.length > desviadosCount ? `${deviations.length} por revisar` : undefined} />
        )}
        {monitorAlerts.length > 0 && (
          <StatCard label="Seguimiento"     value={monitorAlerts.length}            icon="fa-satellite-dish"       tone="warn"    loading={m.loading} pulse={pendingMonitorAlerts.length > 0} onClick={showAlerts}
                    hint={pendingMonitorAlerts.length > 0 ? `${pendingMonitorAlerts.length} por revisar` : 'Sin señal, detenidos o demorados'} />
        )}
      </StatGrid>

      {alertCount > 0 && (
        <div className="lm-alert-strip" role="alert">
          <i className="fa-solid fa-bell" aria-hidden="true" />
          <span className="text">
            {alerts.length > 0 && <>{alerts.length} alerta{alerts.length !== 1 ? 's' : ''} SOS activa{alerts.length !== 1 ? 's' : ''}</>}
            {alerts.length > 0 && deviations.length > 0 && ' · '}
            {deviations.length > 0 && <>{deviations.length} desvío{deviations.length !== 1 ? 's' : ''} de ruta por revisar</>}
            {(alerts.length > 0 || deviations.length > 0) && pendingMonitorAlerts.length > 0 && ' · '}
            {pendingMonitorAlerts.length > 0 && <>{pendingMonitorAlerts.length} alerta{pendingMonitorAlerts.length !== 1 ? 's' : ''} de seguimiento por revisar</>}
          </span>
          <button type="button" className="btn btn-sm btn-danger" onClick={showAlerts}>
            Ver alertas
          </button>
        </div>
      )}

      <div className="lm-layout">
        <SectionCard
          title="Mapa en vivo"
          icon="fa-map"
          flush
          className="lm-map-card"
          tourId="monitor-map"
          actions={
            <div className="lm-layers" data-tour="monitor-layers" role="group" aria-label="Capas del mapa">
              <LayerToggle active={showDrivers}    onClick={() => setShowDrivers(v => !v)}    tone="ok"   label="Conductores" />
              <LayerToggle active={showPassengers} onClick={() => setShowPassengers(v => !v)} tone="warn" label="Pasajeros" />
              <LayerToggle active={showSos}        onClick={() => setShowSos(v => !v)}        tone="bad"  label="SOS" />
              <LayerToggle active={showTrails}     onClick={() => setShowTrails(v => !v)}     tone="info" label="Recorridos" />
            </div>
          }
        >
          <div className="lm-map-wrap">
            <div className="lm-toolbar">
              <MonitorSearch drivers={drivers} passengers={passengers} vehicleByUser={vehicleByUser}
                             tripByDriver={tripByDriver} onPick={followFromSearch} />
              <FilterChips selected={activeFilters} counts={cats.counts} available={availableFilters} onChange={setFilters} />
            </div>
            <div className="lm-map">
              <BugieMapAdmin
                height="100%"
                markers={mainMapMarkers}
                lines={mainMapLines}
                cluster={CLUSTER}
                onFocusRef={focusMarkerRef}
                onFitBoundsRef={mainFitBoundsRef}
                onPanToRef={panToRef}
                onUserDrag={handleUserDrag}
                onMarkerClick={mk => {
                  const id = mk.id ?? '';
                  if (id.startsWith('driver:')) {
                    const d = drivers.find(x => x.id === id.slice('driver:'.length));
                    if (d) followDriver(d);
                    return;
                  }
                  const tripId = id.startsWith('pax:') ? id.slice(4) : id.startsWith('dest:') ? id.slice(5) : id.startsWith('tripdriver:') ? id.slice(11) : null;
                  const p = tripId ? passengers.find(x => x.tripId === tripId) : undefined;
                  if (p) followTrip(p);
                }}
              />
              <div className="lm-map-fab">
                {followed && followPaused && (
                  <IconButton icon="fa-location-crosshairs" label="Volver a seguir" tooltipPlacement="left" onClick={resumeFollow} />
                )}
                <IconButton icon={followed ? 'fa-expand' : 'fa-crosshairs'} label={followed ? 'Ver todos (dejar de seguir)' : 'Centrar en todos los pines'}
                            tooltipPlacement="left" onClick={showAll} />
              </div>
              {followProps && <FollowPanel {...followProps} />}
              {!(followProps && !isSm) && <MapLegend defaultOpen={isLg} />}
              {!isXl && (
                <button type="button" className={`btn btn-bugie lm-map-open ${followProps ? 'is-following' : ''}`} onClick={() => setPanelOpen(true)} data-tour="monitor-lists">
                  <i className="fa-solid fa-list" aria-hidden="true" />
                  Ver listas
                  {alertCount > 0 && <span className="badge rounded-pill text-bg-danger">{alertCount}</span>}
                </button>
              )}
            </div>
          </div>
        </SectionCard>

        {isXl && (
          <section className="bx-card lm-panel-card" data-tour="monitor-lists" aria-label="Conductores, viajes y alertas">
            <div className="bx-card-body flush">{panel}</div>
          </section>
        )}
      </div>

      {!isXl && (
        <Drawer open={panelOpen} onClose={() => setPanelOpen(false)} title="Conductores, viajes y alertas" size="md" className="lm-drawer">
          {panel}
        </Drawer>
      )}

      {tripDetail && (
        <LiveTripDetail
          trip={tripDetail}
          driver={tripDetail.driverId ? driverByUser[tripDetail.driverId] ?? null : null}
          vehicle={tripDetail.driverId ? vehicleByUser[tripDetail.driverId] : undefined}
          trail={trails[tripDetail.tripId] ?? null}
          deviated={tripDetail.driverId ? deviatedByUserId[tripDetail.driverId] === true : false}
          passengerSosAlert={alerts.find(a => a.userId === tripDetail.passengerId) ?? null}
          driverSosAlert={tripDetail.driverId ? (alerts.find(a => a.userId === tripDetail.driverId) ?? null) : null}
          onResolveSos={handleResolveSos}
          monitorAlerts={monitorAlertsByTrip[tripDetail.tripId] ?? []}
          onClose={() => setTripDetailId(null)}
        />
      )}
      {pastTrip.modal}
    </Page>
  );
}
