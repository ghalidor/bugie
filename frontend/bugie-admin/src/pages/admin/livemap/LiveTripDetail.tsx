import { useEffect, useMemo, useRef, useState } from 'react';
import BugieMapAdmin, { MapMarker } from '../../../components/BugieMapAdmin';
import { IconButton, Modal, StatusBadge } from '../../../components/ui';
import { API, apiFetch } from '../../../state/api';
import {
  fmtDateTime, LivePassenger, liveTripStatus, MonitorAlert, monitorAlertMeta, monitorAlertText, OnlineDriver,
  PAX_AT_PICKUP_TEXT, paxLocationUnknown, SosAlert, VehicleBulk,
} from './types';
import RawGpsDownload from '../../../components/RawGpsDownload';
import { fileUrl } from '../people/PeopleShared';
import { DriverLink, PassengerLink } from '../../../components/EntityLinks';
import { PlannedRoute, fetchPlannedRoute } from '../../../components/tripRoutes';
import { LiveTrail } from './useLiveTrails';
import { buildTripScene, fmtKm, Pt, SCENE_COLORS, sceneLines, TripScene } from './tripScene';
import PersonAvatar from './PersonAvatar';

/** Largo aproximado (m) de una línea [[lat, lng], ...]. */
function lengthMeters(pts: [number, number][]): number {
  const R = 6371000, rad = (d: number) => d * Math.PI / 180;
  let m = 0;
  for (let i = 1; i < pts.length; i++) {
    const [la1, lo1] = pts[i - 1], [la2, lo2] = pts[i];
    const a = Math.sin(rad(la2 - la1) / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(rad(lo2 - lo1) / 2) ** 2;
    m += 2 * R * Math.asin(Math.sqrt(a));
  }
  return m;
}

/*
 * Detalle de un viaje EN VIVO (monitoreo). Se dibuja igual que en el mapa
 * principal según el estado del viaje (ver tripScene.ts): buscando conductor,
 * en camino al recojo o pasajero a bordo, con la bandera de destino siempre
 * visible como referencia. La ruta del sistema (guardada al crear el viaje;
 * si no hay, se calcula con GraphHopper) se usa para "lo que falta por
 * recorrer". Es distinto de components/TripDetailModal, que muestra el
 * recorrido GPS GRABADO de un viaje ya hecho.
 */

interface Props {
  trip: LivePassenger;
  driver: OnlineDriver | null;
  vehicle?: VehicleBulk;
  /** Recorrido en vivo del viaje (useLiveTrails); null si aún no tiene conductor. */
  trail: LiveTrail | null;
  deviated: boolean;
  /** SOS activo del pasajero (la tarjeta se pinta en rojo). */
  passengerSosAlert: SosAlert | null;
  /** SOS activo del conductor. */
  driverSosAlert: SosAlert | null;
  onResolveSos: (a: SosAlert) => void;
  /** Alertas de seguimiento abiertas del viaje (sin señal, detenido, demorado). */
  monitorAlerts?: MonitorAlert[];
  onClose: () => void;
}

/** Leyenda del detalle según la fase del viaje, con distancias. */
function SceneLegend({ sc, loading }: { sc: TripScene; loading: boolean }) {
  const straight = !sc.remainingByRoute && sc.remaining.length >= 2;
  return (
    <ul className="bx-route-legend is-compact" aria-label="Leyenda del mapa">
      {sc.phase === 'searching' && (
        <li><i className="fa-solid fa-person" style={{ color: SCENE_COLORS.passenger }} aria-hidden="true" /><span className="t">Pasajero esperando en el punto de recojo (aún sin conductor)</span></li>
      )}
      {sc.phase === 'pickup' && (
        <>
          <li><span className="sw dashed" style={{ color: sc.color }} aria-hidden="true" />
            <span className="t">Camino al recojo{sc.remaining.length >= 2 ? <> · <strong>{fmtKm(sc.remainingKm)}</strong>{straight && <span className="bugie-muted"> (línea recta)</span>}</> : ' · sin GPS del conductor'}</span></li>
          <li className={sc.traveled.length >= 2 ? '' : 'is-empty'}><span className="sw" style={{ color: SCENE_COLORS.traveled }} aria-hidden="true" />
            <span className="t">Ya recorrido por el conductor{sc.traveled.length >= 2 && <> · <strong>{fmtKm(sc.traveledKm)}</strong></>}</span></li>
        </>
      )}
      {sc.phase === 'onboard' && (
        <>
          <li className={sc.traveled.length >= 2 ? '' : 'is-empty'}><span className="sw solid" style={{ color: sc.color }} aria-hidden="true" />
            <span className="t">Recorrido desde el recojo{sc.traveled.length >= 2 ? <> · <strong>{fmtKm(sc.traveledKm)}</strong></> : ' · aún sin recorrido'}</span></li>
          <li className={sc.remaining.length >= 2 ? '' : 'is-empty'}><span className="sw dashed" style={{ color: sc.color }} aria-hidden="true" />
            <span className="t">
              {loading && sc.remaining.length < 2 ? 'Por recorrer · calculando…'
                : sc.remaining.length >= 2 ? <>Por recorrer · <strong>{fmtKm(sc.remainingKm)}</strong>{straight && <span className="bugie-muted"> (línea recta)</span>}</>
                : 'Por recorrer · sin GPS del conductor'}
            </span></li>
        </>
      )}
      <li><i className="fa-solid fa-flag" style={{ color: sc.phase === 'onboard' ? sc.color : SCENE_COLORS.neutral }} aria-hidden="true" /><span className="t">Destino</span></li>
    </ul>
  );
}

export default function LiveTripDetail({ trip, driver, vehicle, trail, deviated, passengerSosAlert, driverSosAlert, onResolveSos, monitorAlerts = [], onClose }: Props) {
  // Ruta del sistema (no cambia durante el viaje). El recorrido real viene
  // del padre (trail) y crece con cada GPS que llega por SignalR.
  const [planned, setPlanned] = useState<PlannedRoute | null>(null);
  const [routeLoading, setRouteLoading] = useState(true);
  const [vehiclePhotoOk, setVehiclePhotoOk] = useState(true);
  const fitRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRouteLoading(true);
    setPlanned(null);
    (async () => {
      // 1) Ruta guardada del viaje.
      try {
        const r = await fetchPlannedRoute(trip.tripId);
        if (cancelled) return;
        if (r?.trip && r.trip.points.length >= 2) { setPlanned(r); return; }
        if (r?.pickup) setPlanned(r);
      } catch { /* sin ruta guardada: se calcula abajo */ }
      if (cancelled) return;

      // 2) Respaldo: ruta por calles origen → paradas → destino.
      try {
        let waypoints: Array<{ lat: number; lng: number }> = [];
        try {
          const wpts = await apiFetch<Array<{ lat: number; lng: number; sortOrder: number }>>(
            `${API.trips}/trips/${trip.tripId}/waypoints`);
          waypoints = (wpts ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder).map(w => ({ lat: w.lat, lng: w.lng }));
        } catch { /* seguimos sin paradas */ }
        if (cancelled) return;
        const points = [
          { lat: trip.originLat, lng: trip.originLng },
          ...waypoints,
          { lat: trip.destLat, lng: trip.destLng },
        ];
        const route = await apiFetch<{ options: Array<{ coordinates: number[][] }>; isFallback: boolean }>(
          `${API.trips}/trips/route/waypoints`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ points }) });
        if (cancelled) return;
        const coords = route?.options?.[0]?.coordinates;
        if (coords && coords.length > 1) {
          const pts = coords.map(c => [c[1], c[0]] as [number, number]);
          setPlanned(prev => ({
            pickup: prev?.pickup ?? null,
            trip: { source: route.isFallback ? 'straight' : 'graphhopper', points: pts, distanceMeters: lengthMeters(pts) },
            origin: null, destination: null, stops: [],
          }));
        }
      } catch (err) {
        console.warn('No se pudo cargar la ruta del viaje:', err);
      } finally {
        if (!cancelled) setRouteLoading(false);
      }
    })().finally(() => { if (!cancelled) setRouteLoading(false); });
    return () => { cancelled = true; };
    // Solo depende del viaje: la ruta no cambia durante el viaje.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.tripId]);

  const sos = !!passengerSosAlert || !!driverSosAlert || trip.status === 6;
  const driverPos: Pt | null = driver?.currentLat && driver.currentLng ? [driver.currentLat, driver.currentLng]
    : trip.driverLat && trip.driverLng ? [trip.driverLat, trip.driverLng] : null;
  const dLat = driverPos?.[0], dLng = driverPos?.[1];

  // Escena del viaje según su estado (mismas reglas que el mapa principal).
  const scene = useMemo(
    () => buildTripScene({ trip, driverPos: dLat != null && dLng != null ? [dLat, dLng] : null, trail, planned: planned ?? trail?.planned ?? null, sos, deviated }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trip.status, trip.originLat, trip.originLng, trip.destLat, trip.destLng, trip.lat, trip.lng, trip.startedAt, dLat, dLng, trail, planned, sos, deviated],
  );
  const lines = useMemo(() => sceneLines('detail', scene, { emphasis: true }), [scene]);

  const markers = useMemo(() => {
    const list: MapMarker[] = [];
    // El destino siempre como referencia; en gris mientras el pasajero no va a bordo.
    if (scene.destPos) {
      list.push({
        id: 'dest', lat: scene.destPos[0], lng: scene.destPos[1], type: 'flag', label: 'Destino',
        color: scene.phase === 'onboard' ? scene.color : SCENE_COLORS.neutral,
      });
    }
    if (scene.paxPos) {
      list.push({
        id: 'pax', lat: scene.paxPos[0], lng: scene.paxPos[1], type: 'passenger', label: trip.passengerName || 'Pasajero',
        sosActive: !!passengerSosAlert, extra: { tripStatus: trip.status },
      });
    }
    if (scene.driverPos && scene.phase !== 'searching') {
      list.push({
        id: 'driver', lat: scene.driverPos[0], lng: scene.driverPos[1], type: 'driver',
        label: driver?.fullName || trip.driverName || 'Conductor',
        deviated,
        sosActive: !!driverSosAlert || (scene.phase === 'onboard' && sos),
        extra: {
          fullName: driver?.fullName || trip.driverName || undefined, hasActiveTrip: true, rating: driver?.rating,
          tripStatus: trip.status, vehiclePlate: vehicle?.plate,
        },
      });
    }
    return list;
  }, [scene, trip.passengerName, trip.status, trip.driverName, driver, deviated, passengerSosAlert, driverSosAlert, sos, vehicle?.plate]);

  const st = liveTripStatus(trip.status);
  const driverName = driver?.fullName || trip.driverName || '—';
  const description =
    scene.phase === 'searching' ? 'El pasajero espera en el punto de recojo a que un conductor acepte.'
    : scene.phase === 'pickup' ? 'El conductor va al punto de recojo; el pasajero lo espera allí.'
    : 'El pasajero va a bordo: recorrido desde el recojo y lo que falta hasta el destino.';

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={<span className="d-inline-flex align-items-center gap-2 flex-wrap">{trip.serviceType === 1 ? 'Envío' : 'Viaje'} · {st.text} {deviated && <StatusBadge tone="bad" icon="fa-route">Desviado</StatusBadge>}</span>}
      description={description}
      footer={<>
        {trip.driverId && scene.phase !== 'searching' && <RawGpsDownload tripId={trip.tripId} className="me-auto" />}
        <button type="button" className="btn btn-outline-secondary" onClick={onClose}><i className="fa-solid fa-arrow-left me-1" aria-hidden="true" />Volver al mapa</button>
      </>}
    >
      <div className="lm-detail">
        <div className="d-grid gap-2 align-content-start">
          {/* Conductor */}
          <section className={`lm-person ${driverSosAlert ? 'is-sos' : ''}`} aria-label="Conductor">
            <div className="label">
              <i className={`fa-solid ${driverSosAlert ? 'fa-triangle-exclamation' : 'fa-id-card'} me-1`} aria-hidden="true" />
              {driverSosAlert ? 'Conductor · SOS activo' : 'Conductor'}
            </div>
            <div className="d-flex align-items-start gap-3">
              <PersonAvatar url={fileUrl('drivers', driver?.profilePhotoUrl)} icon="fa-id-card" tone={driverSosAlert ? 'bad' : 'primary'} />
              <div className="flex-grow-1" style={{ minWidth: 0 }}>
                <div className="fw-bold text-truncate">
                  {trip.driverId ? <DriverLink userId={trip.driverId} onNavigate={onClose}>{driverName}</DriverLink> : driverName}
                </div>
                {trip.driverPhone && (
                  <a className="small d-block fw-semibold text-decoration-none" href={`tel:${trip.driverPhone}`}>
                    <i className="fa-solid fa-phone me-1" aria-hidden="true" />{trip.driverPhone}
                  </a>
                )}
                {vehicle && (
                  <div className="small bugie-muted text-truncate">
                    <i className="fa-solid fa-car-side me-1" aria-hidden="true" />
                    {[vehicle.brand, vehicle.model].filter(Boolean).join(' ')}
                    {vehicle.plate && <> · <span className="lm-plate">{vehicle.plate}</span></>}
                  </div>
                )}
              </div>
            </div>
            {vehicle?.photoUrl && vehiclePhotoOk && (
              <a href={vehicle.photoUrl} target="_blank" rel="noopener noreferrer" title="Ver foto en grande">
                <img src={fileUrl('drivers', vehicle.photoUrl) ?? undefined} alt="Foto del vehículo" className="lm-vehicle-photo" onError={() => setVehiclePhotoOk(false)} />
              </a>
            )}
            {driverSosAlert && (
              <button type="button" className="btn btn-sm btn-danger w-100 mt-2" onClick={() => onResolveSos(driverSosAlert)}>
                <i className="fa-solid fa-circle-check me-1" aria-hidden="true" />Desactivar alerta SOS
              </button>
            )}
          </section>

          {/* Pasajero */}
          <section className={`lm-person ${passengerSosAlert ? 'is-sos' : ''}`} aria-label="Pasajero">
            <div className="label">
              <i className={`fa-solid ${passengerSosAlert ? 'fa-triangle-exclamation' : 'fa-person'} me-1`} aria-hidden="true" />
              {passengerSosAlert ? 'Pasajero · SOS activo' : 'Pasajero'}
            </div>
            <div className="d-flex align-items-start gap-3">
              <PersonAvatar url={fileUrl('auth', trip.passengerPhotoUrl)} icon="fa-person" tone={passengerSosAlert ? 'bad' : 'warn'} />
              <div className="flex-grow-1" style={{ minWidth: 0 }}>
                <div className="fw-bold text-truncate">
                  <PassengerLink userId={trip.passengerId} onNavigate={onClose}>{trip.passengerName}</PassengerLink>
                </div>
                {trip.passengerPhone && (
                  <a className="small d-block fw-semibold text-decoration-none" href={`tel:${trip.passengerPhone}`}>
                    <i className="fa-solid fa-phone me-1" aria-hidden="true" />{trip.passengerPhone}
                  </a>
                )}
              </div>
            </div>
            {passengerSosAlert && (
              <button type="button" className="btn btn-sm btn-danger w-100 mt-2" onClick={() => onResolveSos(passengerSosAlert)}>
                <i className="fa-solid fa-circle-check me-1" aria-hidden="true" />Desactivar alerta SOS
              </button>
            )}
          </section>

          {/* Estado + ruta */}
          <section className="lm-person" aria-label="Estado y ruta">
            <div className="label"><i className="fa-solid fa-route me-1" aria-hidden="true" />Estado del viaje</div>
            <div className="d-flex gap-2 flex-wrap mb-2">
              <StatusBadge tone={st.tone}>{st.text}</StatusBadge>
              {deviated && <StatusBadge tone="bad" icon="fa-route">Desviado</StatusBadge>}
              {monitorAlerts.map(a => (
                <StatusBadge key={a.id} tone={monitorAlertMeta(a.type).tone} icon={monitorAlertMeta(a.type).icon}>{monitorAlertText(a)}</StatusBadge>
              ))}
            </div>
            <div className="ops-route">
              <div className="stop"><span className="dot" aria-hidden="true" /><span>Recojo: {trip.originLat.toFixed(5)}, {trip.originLng.toFixed(5)}</span></div>
              <div className="stop"><span className="dot end" aria-hidden="true" /><span>Destino: {trip.destLat.toFixed(5)}, {trip.destLng.toFixed(5)}</span></div>
            </div>
            {paxLocationUnknown(trip) ? (
              <div className="ops-muted mt-2"><i className="fa-solid fa-location-dot me-1" aria-hidden="true" />{PAX_AT_PICKUP_TEXT}</div>
            ) : trip.updatedAt && (
              <div className="ops-muted mt-2"><i className="fa-regular fa-clock me-1" aria-hidden="true" />Última ubicación del pasajero: {fmtDateTime(trip.updatedAt)}</div>
            )}
          </section>
        </div>

        {/* Mapa */}
        <div>
          {routeLoading && scene.phase === 'onboard' && (
            <div className="ops-muted mb-2" role="status"><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Calculando la ruta del viaje…</div>
          )}
          <div className="lm-detail-map">
            <BugieMapAdmin height="100%" markers={markers} lines={lines} onFitBoundsRef={fitRef} />
            <div className="lm-map-fab">
              <IconButton icon="fa-crosshairs" label="Centrar en el viaje" tooltipPlacement="left" onClick={() => fitRef.current?.()} />
            </div>
          </div>
          <div className="mt-2">
            <SceneLegend sc={scene} loading={routeLoading} />
          </div>
        </div>
      </div>
    </Modal>
  );
}
