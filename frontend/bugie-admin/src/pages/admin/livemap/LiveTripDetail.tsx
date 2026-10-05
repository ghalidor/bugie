import { useEffect, useMemo, useRef, useState } from 'react';
import BugieMapAdmin, { MapMarker } from '../../../components/BugieMapAdmin';
import { IconButton, Modal, StatusBadge, Tone } from '../../../components/ui';
import { API, apiFetch } from '../../../state/api';
import { fmtDateTime, LivePassenger, liveTripStatus, OnlineDriver, SosAlert, VehicleBulk } from './types';
import { fileUrl } from '../people/PeopleShared';
import { DriverLink, PassengerLink } from '../../../components/EntityLinks';
import { PlannedRoute, RouteLegend, TripPath, buildRouteLines, fetchPlannedRoute, fetchTripPath } from '../../../components/tripRoutes';

/** Cada cuánto se vuelve a pedir el recorrido real mientras el detalle está abierto. */
const PATH_REFRESH_MS = 20_000;

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
 * Detalle de un viaje EN CURSO (monitoreo): ruta del sistema (guardada al
 * crear el viaje; si no hay, se calcula con GraphHopper), recorrido real
 * hasta ahora, posiciones en vivo de pasajero y conductor, teléfonos y botón para
 * desactivar un SOS. Es distinto de components/TripDetailModal, que muestra
 * el recorrido GPS GRABADO de un viaje ya hecho (tarifa, línea de tiempo,
 * fotos de envío) y no tiene datos en vivo ni SOS.
 */

/** Foto de perfil circular con icono de respaldo si no hay URL o falla la carga. */
function Avatar({ url, icon, tone }: { url: string | null; icon: string; tone: Tone }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [url]);
  const showImg = !!url && !broken;
  return (
    <span className={`lm-avatar lg ring bx-tone-${tone}`} aria-hidden="true">
      {showImg ? <img src={url!} alt="" onError={() => setBroken(true)} /> : <i className={`fa-solid ${icon}`} />}
    </span>
  );
}

interface Props {
  trip: LivePassenger;
  driver: OnlineDriver | null;
  vehicle?: VehicleBulk;
  deviated: boolean;
  /** SOS activo del pasajero (la tarjeta se pinta en rojo). */
  passengerSosAlert: SosAlert | null;
  /** SOS activo del conductor. */
  driverSosAlert: SosAlert | null;
  onResolveSos: (a: SosAlert) => void;
  onClose: () => void;
}

export default function LiveTripDetail({ trip, driver, vehicle, deviated, passengerSosAlert, driverSosAlert, onResolveSos, onClose }: Props) {
  // Ruta del sistema (no cambia durante el viaje) y recorrido real (crece).
  const [planned, setPlanned] = useState<PlannedRoute | null>(null);
  const [routeLoading, setRouteLoading] = useState(true);
  const [path, setPath] = useState<TripPath | null>(null);
  const [pathLoading, setPathLoading] = useState(true);
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

  // Recorrido real hasta ahora: al abrir y cada PATH_REFRESH_MS.
  useEffect(() => {
    let cancelled = false;
    setPathLoading(true);
    const load = () => fetchTripPath(trip.tripId)
      .then(p => { if (!cancelled) setPath(p); })
      .catch(() => { /* se mantiene el último recorrido */ })
      .finally(() => { if (!cancelled) setPathLoading(false); });
    load();
    const t = setInterval(load, PATH_REFRESH_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, [trip.tripId]);

  const lines = useMemo(() => buildRouteLines(planned, path), [planned, path]);

  // Origen, destino, pasajero y conductor (se mueven con cada GPS).
  const markers = useMemo(() => {
    const list: MapMarker[] = [
      { lat: trip.originLat, lng: trip.originLng, type: 'origin',      label: 'Origen' },
      { lat: trip.destLat,   lng: trip.destLng,   type: 'destination', label: 'Destino' },
    ];
    // Al inicio del viaje el pasajero puede venir en 0/0 (aún sin GPS).
    if (trip.lat && trip.lng && (trip.lat !== 0 || trip.lng !== 0)) {
      list.push({ lat: trip.lat, lng: trip.lng, type: 'passenger', label: trip.passengerName || 'Pasajero', extra: { tripStatus: trip.status } });
    }
    if (trip.driverLat && trip.driverLng) {
      list.push({
        lat: trip.driverLat, lng: trip.driverLng, type: 'driver',
        label: driver?.fullName || trip.driverName || 'Conductor',
        deviated,
        extra: { fullName: driver?.fullName || trip.driverName || undefined, hasActiveTrip: true, rating: driver?.rating },
      });
    }
    return list;
  }, [trip, driver, deviated]);

  const st = liveTripStatus(trip.status);
  const driverName = driver?.fullName || trip.driverName || '—';

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={<span className="d-inline-flex align-items-center gap-2 flex-wrap">Viaje en curso {deviated && <StatusBadge tone="bad" icon="fa-route">Desviado</StatusBadge>}</span>}
      description="Ruta del sistema, recorrido hasta ahora y posición en vivo del pasajero y del conductor."
      footer={<button type="button" className="btn btn-outline-secondary" onClick={onClose}><i className="fa-solid fa-arrow-left me-1" aria-hidden="true" />Volver al mapa</button>}
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
              <Avatar url={fileUrl('drivers', driver?.profilePhotoUrl)} icon="fa-id-card" tone={driverSosAlert ? 'bad' : 'primary'} />
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
              <Avatar url={fileUrl('auth', trip.passengerPhotoUrl)} icon="fa-person" tone={passengerSosAlert ? 'bad' : 'warn'} />
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
            </div>
            <div className="ops-route">
              <div className="stop"><span className="dot" aria-hidden="true" /><span>Origen: {trip.originLat.toFixed(5)}, {trip.originLng.toFixed(5)}</span></div>
              <div className="stop"><span className="dot end" aria-hidden="true" /><span>Destino: {trip.destLat.toFixed(5)}, {trip.destLng.toFixed(5)}</span></div>
            </div>
            {trip.updatedAt && (
              <div className="ops-muted mt-2"><i className="fa-regular fa-clock me-1" aria-hidden="true" />Última ubicación: {fmtDateTime(trip.updatedAt)}</div>
            )}
          </section>
        </div>

        {/* Mapa */}
        <div>
          {routeLoading && (
            <div className="ops-muted mb-2" role="status"><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Calculando la ruta del viaje…</div>
          )}
          <div className="lm-detail-map">
            <BugieMapAdmin height="100%" markers={markers} lines={lines} onFitBoundsRef={fitRef} />
            <div className="lm-map-fab">
              <IconButton icon="fa-crosshairs" label="Centrar en el viaje" tooltipPlacement="left" onClick={() => fitRef.current?.()} />
            </div>
          </div>
          <div className="mt-2">
            <RouteLegend compact planned={planned} path={path} loadingPlanned={routeLoading && !planned}
                         loadingPath={pathLoading && !path} realLabel="Recorrido hasta ahora" />
          </div>
        </div>
      </div>
    </Modal>
  );
}
