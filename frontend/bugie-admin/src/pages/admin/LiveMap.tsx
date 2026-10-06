import { useEffect, useMemo, useRef, useState } from 'react';
import BugieMapAdmin, { MapLine, MapMarker } from '../../components/BugieMapAdmin';
import { Drawer, IconButton, Page, SectionCard, StatCard, StatGrid, Tone, useMediaQuery, useToast } from '../../components/ui';
import { useLiveMonitor } from './livemap/useLiveMonitor';
import { useResolveSos, useReviewDeviation } from './livemap/sosActions';
import { LivePassenger, OnlineDriver, RouteDeviation, SosAlert, roleLabel } from './livemap/types';
import MonitorPanel, { PanelTab } from './livemap/MonitorPanel';
import DriversList from './livemap/DriversList';
import TripsList from './livemap/TripsList';
import AlertsList from './livemap/AlertsList';
import LiveTripDetail from './livemap/LiveTripDetail';
import { useTripDetail } from '../../components/useTripDetail';
import { LiveTrail } from './livemap/useLiveTrails';
import './ops.scss';

/// Color del trazo recorrido según el estado del viaje/conductor (mismos
/// colores que el pin del conductor).
const TRAIL_COLORS = {
  sos:      '#f87171', // conductor o pasajero con SOS activo
  deviated: '#dc2626', // fuera de la ruta planificada
  inTrip:   '#818cf8', // viaje en curso
  enRoute:  '#0ea5e9', // conductor en camino al recojo
} as const;
const TRAIL_LEGEND: Array<{ color: string; label: string }> = [
  { color: TRAIL_COLORS.enRoute,  label: 'En camino al recojo' },
  { color: TRAIL_COLORS.inTrip,   label: 'Viaje en curso' },
  { color: TRAIL_COLORS.deviated, label: 'Desviado' },
  { color: TRAIL_COLORS.sos,      label: 'SOS' },
];
const NO_LINES: MapLine[] = [];

/// Botón de capa del mapa (mostrar/ocultar conductores, pasajeros, SOS o recorridos).
function LayerToggle({ active, onClick, tone, label }: { active: boolean; onClick: () => void; tone: Tone; label: string }) {
  return (
    <button type="button" className={`lm-layer bx-tone-${tone}`} aria-pressed={active} onClick={onClick}
            title={active ? `Ocultar ${label.toLowerCase()} del mapa` : `Mostrar ${label.toLowerCase()} en el mapa`}>
      <i className={`fa-solid ${active ? 'fa-eye' : 'fa-eye-slash'}`} aria-hidden="true" />{label}
    </button>
  );
}

/// Centro de comando: mapa en vivo + conductores, viajes y alertas (SOS y desvíos).
export default function LiveMap() {
  const toast = useToast();
  const isXl = useMediaQuery('(min-width: 1200px)');

  const m = useLiveMonitor({
    onNewSos: e => toast.show({ tone: 'error', title: 'Nueva alerta SOS', message: `${roleLabel(e.userRole)} pidió ayuda. Revísala en «Alertas».`, duration: 8000 }),
    onNewDeviation: () => toast.warning('Un conductor se salió de la ruta planificada. Revísalo en «Alertas».', 'Desvío de ruta'),
  });
  const { drivers, alerts, passengers, vehicleByUser, deviations, trails, deviatedByUserId, sosUserIds, sosDriverUserIds } = m;

  const resolveSos = useResolveSos();
  const reviewDeviation = useReviewDeviation();
  // Detalle completo (recorrido, ruta, desvíos) de un viaje que ya no está en curso.
  const pastTrip = useTripDetail();

  // ── Estado de la vista ───────────────────────────────────────────────
  const [search,            setSearch]            = useState('');
  const [tab,               setTab]               = useState<PanelTab>('drivers');
  const [panelOpen,         setPanelOpen]         = useState(false);   // Drawer en < xl
  const [selectedId,        setSelectedId]        = useState<string | null>(null);
  const [selectedPaxTripId, setSelectedPaxTripId] = useState<string | null>(null);
  const [tripDetailId,      setTripDetailId]      = useState<string | null>(null);
  const [showDrivers,       setShowDrivers]       = useState(true);
  const [showPassengers,    setShowPassengers]    = useState(true);
  const [showSos,           setShowSos]           = useState(true);
  const [showTrails,        setShowTrails]        = useState(true);

  // Al pasar a escritorio el Drawer ya no hace falta.
  useEffect(() => { if (isXl) setPanelOpen(false); }, [isXl]);

  const tripDetail = useMemo(
    () => (tripDetailId ? passengers.find(p => p.tripId === tripDetailId) ?? null : null),
    [tripDetailId, passengers],
  );

  // Refs para enfocar un punto / encuadrar todo desde la lista
  const focusMarkerRef   = useRef<((lat: number, lng: number) => void) | null>(null);
  const mainFitBoundsRef = useRef<(() => void) | null>(null);

  /** Enfoca un punto del mapa; en pantallas chicas cierra el Drawer para que se vea. */
  function focusOnMap(lat: number, lng: number) {
    focusMarkerRef.current?.(lat, lng);
    if (!isXl) setPanelOpen(false);
  }

  function openTrip(tripId: string) {
    setTripDetailId(tripId);
    if (!isXl) setPanelOpen(false);
  }

  // ── Selección ────────────────────────────────────────────────────────
  /// Selecciona un conductor (toggle) y enfoca su pin.
  function handleSelectDriver(d: OnlineDriver) {
    if (selectedId === d.id) { setSelectedId(null); return; }
    setSelectedId(d.id);
    if (d.currentLat && d.currentLng) focusOnMap(d.currentLat, d.currentLng);
  }

  /// Conductor con viaje → abre el detalle del viaje; si no, lo ubica.
  function handleOpenDriver(d: OnlineDriver) {
    if (!d.hasActiveTrip) { handleSelectDriver(d); return; }
    const trip = passengers.find(p => p.driverId === d.userId);
    if (trip) openTrip(trip.tripId);
    else handleSelectDriver(d);
  }

  /// Selecciona un pasajero (toggle) y enfoca su pin.
  function handleLocatePassenger(p: LivePassenger) {
    if (selectedPaxTripId === p.tripId) { setSelectedPaxTripId(null); return; }
    setSelectedPaxTripId(p.tripId);
    if (p.lat !== 0 || p.lng !== 0) focusOnMap(p.lat, p.lng);
  }

  /// Detalle del viaje de una alerta SOS. Si el viaje ya no está activo,
  /// abre su detalle completo (el mismo de la sección Viajes).
  function handleOpenSos(a: SosAlert) {
    const trip = passengers.find(p => p.tripId === a.tripId);
    if (trip) { openTrip(trip.tripId); return; }
    if (a.tripId) { pastTrip.open(a.tripId); if (!isXl) setPanelOpen(false); }
    else focusOnMap(a.lat, a.lng);
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
    return drivers.find(d => d.userId === dv.driverId)?.fullName
        || passengers.find(p => p.tripId === dv.tripId)?.driverName
        || 'Conductor';
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
  const alertCount     = alerts.length + deviations.length;

  // ── Marcadores (con filtros de capa) ─────────────────────────────────
  const markers = useMemo(() => {
    const list: MapMarker[] = [];
    drivers.filter(d => d.currentLat && d.currentLng).forEach(d => {
      const inSos = sosUserIds.has(d.userId);
      // Visible si la capa "Conductores" está activa, o si está en SOS y la capa "SOS" está activa.
      if (!showDrivers && !(inSos && showSos)) return;
      const v = vehicleByUser[d.userId];
      list.push({
        id: `driver:${d.id}`,
        lat: d.currentLat!, lng: d.currentLng!,
        type: 'driver',
        label: d.fullName || 'Conductor',
        deviated: deviatedByUserId[d.userId] === true,
        sosActive: inSos,
        highlighted: selectedId === d.id,
        extra: {
          rating: d.rating, hasActiveTrip: d.hasActiveTrip, fullName: d.fullName,
          vehiclePlate: v?.plate, vehicleBrand: v?.brand, vehicleModel: v?.model, vehicleColor: v?.color,
        },
      });
    });
    passengers.forEach(p => {
      const inSos = sosUserIds.has(p.passengerId);
      if (!showPassengers && !(inSos && showSos)) return;
      list.push({
        id: `pax:${p.tripId}`,
        lat: p.lat, lng: p.lng,
        type: 'passenger',
        label: p.passengerName || 'Pasajero',
        sosActive: inSos,
        highlighted: selectedPaxTripId === p.tripId,
        extra: { tripStatus: p.status },
      });
    });
    return list;
  }, [drivers, passengers, vehicleByUser, deviatedByUserId, sosUserIds, selectedId, selectedPaxTripId, showDrivers, showPassengers, showSos]);

  // ── Recorridos en vivo (una polilínea por viaje con conductor) ───────
  // Solo cambia la referencia de los puntos del viaje que recibió GPS; el
  // mapa actualiza esa línea y deja las demás tal cual.
  const trailLines = useMemo(() => {
    const list: MapLine[] = [];
    const selectedDriver = selectedId ? drivers.find(d => d.id === selectedId) : null;
    const byTrip: Record<string, LivePassenger> = {};
    passengers.forEach(p => { byTrip[p.tripId] = p; });

    const colorFor = (t: LiveTrail, trip: LivePassenger | undefined) => {
      if (trip && (sosUserIds.has(trip.passengerId) || (t.driverId && sosUserIds.has(t.driverId)))) return TRAIL_COLORS.sos;
      if (t.driverId && deviatedByUserId[t.driverId]) return TRAIL_COLORS.deviated;
      return trip?.status === 2 ? TRAIL_COLORS.enRoute : TRAIL_COLORS.inTrip;
    };
    const isSelected = (t: LiveTrail) =>
      t.tripId === selectedPaxTripId || (!!selectedDriver && t.driverId === selectedDriver.userId);

    // Primero las rutas planificadas (tenues), luego los recorridos encima.
    Object.values(trails).forEach(t => {
      const leg = t.planned?.trip;
      if (leg && leg.points.length >= 2) {
        list.push({ id: `planned:${t.tripId}`, points: leg.points, color: colorFor(t, byTrip[t.tripId]), weight: 3, opacity: isSelected(t) ? 0.6 : 0.3, dashArray: '6 10' });
      }
    });
    Object.values(trails).forEach(t => {
      if (t.points.length < 2) return;
      const selected = isSelected(t);
      list.push({ id: `trail:${t.tripId}`, points: t.points, color: colorFor(t, byTrip[t.tripId]), weight: selected ? 7 : 5, opacity: selected ? 1 : 0.85 });
    });
    return list;
  }, [trails, passengers, drivers, selectedId, selectedPaxTripId, sosUserIds, deviatedByUserId]);
  const mapLines = showTrails ? trailLines : NO_LINES;

  // Con el detalle abierto, el mapa principal queda congelado (no se redibuja debajo).
  const frozenRef = useRef<{ markers: MapMarker[]; lines: MapLine[] } | null>(null);
  useEffect(() => {
    if (tripDetailId) { if (frozenRef.current === null) frozenRef.current = { markers, lines: mapLines }; }
    else frozenRef.current = null;
  }, [tripDetailId, markers, mapLines]);
  const mainMapMarkers = tripDetailId ? (frozenRef.current?.markers ?? markers) : markers;
  const mainMapLines   = tripDetailId ? (frozenRef.current?.lines ?? mapLines) : mapLines;

  // ── Conductores ordenados: SOS → desviado → en viaje → disponible ────
  const filteredDrivers = useMemo(() => {
    const priority = (d: OnlineDriver) =>
      sosDriverUserIds.has(d.userId) ? 0 : deviatedByUserId[d.userId] ? 1 : d.hasActiveTrip ? 2 : 3;
    const q = search.trim().toLowerCase();
    return drivers
      .filter(d => !q || (d.fullName || '').toLowerCase().includes(q))
      .sort((a, b) => priority(a) - priority(b) || (a.fullName || '').localeCompare(b.fullName || ''));
  }, [drivers, search, deviatedByUserId, sosDriverUserIds]);

  // ── Render ───────────────────────────────────────────────────────────
  const panel = (
    <MonitorPanel
      tab={tab}
      onTabChange={setTab}
      counts={{ drivers: drivers.length, trips: passengers.length, alerts: alertCount }}
      search={search}
      onSearchChange={setSearch}
      drivers={
        <DriversList drivers={filteredDrivers} search={search} vehicleByUser={vehicleByUser}
          deviatedByUserId={deviatedByUserId} sosDriverUserIds={sosDriverUserIds}
          selectedId={selectedId} onClick={handleOpenDriver} />
      }
      trips={
        <TripsList passengers={passengers} sosUserIds={sosUserIds} selectedTripId={selectedPaxTripId}
          onLocate={handleLocatePassenger} onOpen={p => openTrip(p.tripId)} />
      }
      alerts={
        <AlertsList alerts={alerts} deviations={deviations} passengers={passengers}
          driverName={deviationDriverName} onOpenSos={handleOpenSos} onResolveSos={handleResolveSos}
          onOpenDeviation={handleOpenDeviation} onReviewDeviation={handleReviewDeviation} />
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
      </StatGrid>

      {alertCount > 0 && (
        <div className="lm-alert-strip" role="alert">
          <i className="fa-solid fa-bell" aria-hidden="true" />
          <span className="text">
            {alerts.length > 0 && <>{alerts.length} alerta{alerts.length !== 1 ? 's' : ''} SOS activa{alerts.length !== 1 ? 's' : ''}</>}
            {alerts.length > 0 && deviations.length > 0 && ' · '}
            {deviations.length > 0 && <>{deviations.length} desvío{deviations.length !== 1 ? 's' : ''} de ruta por revisar</>}
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
          <div className="lm-map">
            <BugieMapAdmin
              height="100%"
              markers={mainMapMarkers}
              lines={mainMapLines}
              onFocusRef={focusMarkerRef}
              onFitBoundsRef={mainFitBoundsRef}
              onMarkerClick={mk => {
                if (mk.type === 'driver' && mk.id?.startsWith('driver:')) {
                  const d = drivers.find(x => x.id === mk.id!.replace('driver:', ''));
                  if (d) handleOpenDriver(d);
                }
              }}
            />
            <div className="lm-map-fab">
              <IconButton icon="fa-crosshairs" label="Centrar en todos los pines" tooltipPlacement="left" onClick={() => mainFitBoundsRef.current?.()} />
            </div>
            {showTrails && trailLines.length > 0 && (
              <ul className="lm-trail-legend" aria-label="Colores de los recorridos">
                {TRAIL_LEGEND.map(l => (
                  <li key={l.label}><span className="sw" style={{ background: l.color }} aria-hidden="true" />{l.label}</li>
                ))}
              </ul>
            )}
            {!isXl && (
              <button type="button" className="btn btn-bugie lm-map-open" onClick={() => setPanelOpen(true)} data-tour="monitor-lists">
                <i className="fa-solid fa-list" aria-hidden="true" />
                Ver listas
                {alertCount > 0 && <span className="badge rounded-pill text-bg-danger">{alertCount}</span>}
              </button>
            )}
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
          driver={drivers.find(d => d.userId === tripDetail.driverId) || null}
          vehicle={tripDetail.driverId ? vehicleByUser[tripDetail.driverId] : undefined}
          trail={trails[tripDetail.tripId] ?? null}
          deviated={tripDetail.driverId ? deviatedByUserId[tripDetail.driverId] === true : false}
          passengerSosAlert={alerts.find(a => a.userId === tripDetail.passengerId) ?? null}
          driverSosAlert={tripDetail.driverId ? (alerts.find(a => a.userId === tripDetail.driverId) ?? null) : null}
          onResolveSos={handleResolveSos}
          onClose={() => setTripDetailId(null)}
        />
      )}
      {pastTrip.modal}
    </Page>
  );
}
