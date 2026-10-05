import { useEffect, useMemo, useRef, useState } from 'react';
import BugieMapAdmin, { MapMarker } from './BugieMapAdmin';
import { API, ApiError, apiFetch } from '../state/api';
import { PlannedRoute, RouteLegend, TripPath, buildRouteLines, fetchPlannedRoute, fetchTripPath } from './tripRoutes';
import { IconButton, Modal, Skeleton, StatusBadge } from './ui';
import { DriverLink, PassengerLink } from './EntityLinks';

/** Lo que el modal necesita del viaje (TripDto del backend). */
export interface TripDetail {
  id: string;
  originAddress: string; destAddress: string;
  originLat?: number; originLng?: number; destLat?: number; destLng?: number;
  estimatedFare: number; finalFare: number | null;
  paymentMethod: string; status: number; createdAt: string;
  /** UserId del pasajero y del conductor (enlazan a sus fichas). */
  passengerId?: string | null;
  driverId: string | null;
  serviceType?: number;
  couponCode?: string | null; discountAmount?: number | null; fareBeforeDiscount?: number | null;
  acceptedAt?: string | null; driverArrivedAt?: string | null;
  startedAt?: string | null; completedAt?: string | null;
  cancelledBy?: string | null; cancelReason?: string | null; cancelledAt?: string | null;
  passengerName?: string | null; driverName?: string | null;
  // Envio
  packageDescription?: string | null; packageWeightKg?: number | null;
  packageIsFragile?: boolean; packageDetails?: string | null;
  pickupVerified?: boolean; pickupObservation?: string | null;
  recipientName?: string | null; recipientPhone?: string | null;
  deliveryReceivedBy?: string | null; deliveryConfirmedAt?: string | null;
}

interface TripPhoto { id: string; url: string; kind: number; createdAt: string; }

const PHOTO_KIND: Record<number, string> = {
  0: 'Paquete (pasajero)',
  1: 'Recojo: foto principal',
  2: 'Recojo: foto extra',
  3: 'Entrega en destino',
};

// Las fotos vienen con ruta relativa (/uploads/trips/...) y las sirve la API
// de Trips. VITE_API_TRIPS termina en /api: le quitamos ese sufijo para
// quedarnos con el origen (ej: http://localhost:5002) y le pegamos la ruta.
const photoUrl = (u: string) => u.startsWith('http')
  ? u
  : `${API.trips.replace(/\/api\/?$/, '')}${u.startsWith('/') ? '' : '/'}${u}`;


/// Icono del tipo de servicio (igual que en la web y la app):
/// viaje = fa-car, envío = fa-box. Con withLabel muestra un badge con texto.
export function ServiceIcon({ serviceType, withLabel }: { serviceType?: number; withLabel?: boolean }) {
  const isDelivery = serviceType === 1;
  const icon  = isDelivery ? 'fa-box' : 'fa-car';
  const label = isDelivery ? 'Envío' : 'Viaje';
  if (!withLabel) {
    return (
      <i className={`fa-solid ${icon}`} title={label} aria-label={label}
         style={{ color: isDelivery ? 'var(--bugie-warn)' : 'var(--bugie-primary-soft)' }} />
    );
  }
  return <StatusBadge tone={isDelivery ? 'warn' : 'primary'} icon={icon} size="sm">{label}</StatusBadge>;
}

/// Quién hizo algo (canceló, etc.) con su icono: pasajero, conductor o Bugie (admin).
const FROM: Record<string, { label: string; icon: string }> = {
  passenger: { label: 'Pasajero',  icon: 'fa-user' },
  driver:    { label: 'Conductor', icon: 'fa-id-badge' },
  admin:     { label: 'Bugie',     icon: 'fa-shield-halved' },
};

export function FromBadge({ from }: { from?: string | null }) {
  const f = FROM[from ?? ''] ?? { label: 'Desconocido', icon: 'fa-circle-question' };
  return <StatusBadge tone="neutral" icon={f.icon} size="sm">{f.label}</StatusBadge>;
}

const fmt = (iso?: string | null) => iso
  ? new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  : null;

const PAY: Record<string, string> = { cash: 'Efectivo', yape: 'Yape', plin: 'Plin' };

/// Detalle de un viaje para el admin: datos, linea de tiempo y, en el mapa,
/// la RUTA DEL SISTEMA (azul punteado) y el RECORRIDO REAL del conductor
/// (verde, puntos GPS guardados durante el viaje), con su leyenda.
export default function TripDetailModal({ trip, onClose }: { trip: TripDetail; onClose: () => void }) {
  const [path,    setPath]    = useState<TripPath | null>(null);
  const [planned, setPlanned] = useState<PlannedRoute | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [photos,  setPhotos]  = useState<TripPhoto[]>([]);
  const isDelivery = trip.serviceType === 1;

  useEffect(() => {
    // Ruta del sistema y recorrido real en paralelo; si la ruta falla
    // (viaje sin ruta guardada) se muestra igual el recorrido.
    Promise.all([
      fetchTripPath(trip.id)
        .then(setPath)
        .catch(err => setError(err instanceof ApiError ? err.message : 'No se pudo cargar el recorrido.')),
      fetchPlannedRoute(trip.id).then(setPlanned).catch(() => setPlanned(null)),
    ]).finally(() => setLoading(false));
    // Envio: fotos del paquete, del recojo y de la entrega (auditoria)
    if (isDelivery)
      apiFetch<TripPhoto[]>(`${API.trips}/trips/${trip.id}/photos`)
        .then(p => setPhotos(p ?? []))
        .catch(() => setPhotos([]));
  }, [trip.id, isDelivery]);

  // Botón "Centrar en el viaje": vuelve a encuadrar pines y líneas.
  const fitRef = useRef<(() => void) | null>(null);

  const markers = useMemo<MapMarker[]>(() => {
    const m: MapMarker[] = [];
    if (trip.originLat && trip.originLng) m.push({ id: 'o', lat: trip.originLat, lng: trip.originLng, type: 'origin', label: 'Origen' });
    if (trip.destLat && trip.destLng)     m.push({ id: 'd', lat: trip.destLat, lng: trip.destLng, type: 'destination', label: 'Destino' });
    // Ultima posicion registrada (donde termino el recorrido grabado)
    const last = path?.path[path.path.length - 1];
    if (last) m.push({ id: 'last', lat: last.lat, lng: last.lng, type: 'driver', label: 'Último punto GPS' });
    return m;
  }, [trip, path]);

  const lines = useMemo(() => buildRouteLines(planned, path), [planned, path]);

  const timeline: { label: string; at: string | null | undefined; icon: string }[] = [
    { label: 'Solicitado',                at: trip.createdAt,       icon: 'fa-hand' },
    { label: 'Aceptado por el conductor', at: trip.acceptedAt,      icon: 'fa-id-badge' },
    { label: 'Conductor llegó',           at: trip.driverArrivedAt, icon: 'fa-location-dot' },
    { label: 'Inicio del viaje',          at: trip.startedAt,       icon: 'fa-play' },
    ...(isDelivery ? [{ label: 'Entrega confirmada', at: trip.deliveryConfirmedAt, icon: 'fa-box-open' }] : []),
    { label: 'Fin del viaje',             at: trip.completedAt,     icon: 'fa-flag-checkered' },
    ...(trip.status === 5 ? [{ label: 'Cancelado', at: trip.cancelledAt, icon: 'fa-circle-xmark' }] : []),
  ];

  const fare = trip.finalFare ?? trip.estimatedFare;
  const hasCancel = trip.status === 5;

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={<span className="d-inline-flex align-items-center gap-2"><ServiceIcon serviceType={trip.serviceType} />{isDelivery ? 'Detalle del envío' : 'Detalle del viaje'}</span>}
      description={`${trip.originAddress} → ${trip.destAddress}`}
    >
      <div className="bx-trip">
        {/* Resumen rápido */}
        <div className="bx-trip-summary">
          <div className="bx-trip-kpi">
            <span className="k">Tarifa</span>
            <span className="v">S/ {fare.toFixed(2)}</span>
          </div>
          <div className="bx-trip-kpi">
            <span className="k">Pago</span>
            <span className="v sm">{PAY[trip.paymentMethod] ?? trip.paymentMethod}</span>
          </div>
          <div className="bx-trip-kpi">
            <span className="k">Recorrido GPS</span>
            <span className="v sm">{path && path.points > 0 ? `${path.distanceKm.toFixed(2)} km` : '—'}</span>
          </div>
          <div className="bx-trip-kpi">
            <span className="k">Solicitado</span>
            <span className="v sm">{fmt(trip.createdAt) ?? '—'}</span>
          </div>
        </div>

        {/* Mapa + personas y línea de tiempo */}
        <div className="bx-trip-main">
          <section className="bx-trip-card bx-trip-map" aria-label="Recorrido en el mapa">
            <div className="bx-trip-map-box">
              {loading
                ? <Skeleton height="100%" radius={12} />
                : <>
                    <BugieMapAdmin height="100%" markers={markers} lines={lines} onFitBoundsRef={fitRef} />
                    <div className="bx-trip-map-fab">
                      <IconButton icon="fa-crosshairs" label="Centrar en el viaje" tooltipPlacement="left" onClick={() => fitRef.current?.()} />
                    </div>
                  </>}
            </div>
            <RouteLegend planned={planned} path={path} loadingPlanned={loading} loadingPath={loading} />
            {(error || (path && path.points > 0)) && (
              <div className="small bugie-muted">
                {error ? <span style={{ color: 'var(--bugie-bad)' }}>{error}</span>
                  : <><strong>{path!.points}</strong> puntos GPS
                      {path!.firstAt && path!.lastAt && <> · de {fmt(path!.firstAt)} a {fmt(path!.lastAt)}</>}</>}
              </div>
            )}
          </section>

          <div className="bx-trip-side">
            <section className="bx-trip-card">
              <h3 className="bx-trip-card-title"><i className="fa-solid fa-users" aria-hidden="true" />Personas</h3>
              <div className="bx-trip-people">
                <div><i className="fa-solid fa-user" aria-hidden="true" /><span className="k">Pasajero</span><span className="v"><PassengerLink userId={trip.passengerId} onNavigate={onClose}>{trip.passengerName ?? 'Pasajero'}</PassengerLink></span></div>
                <div><i className="fa-solid fa-id-badge" aria-hidden="true" /><span className="k">Conductor</span><span className="v">{trip.driverId
                  ? <DriverLink userId={trip.driverId} onNavigate={onClose}>{trip.driverName ?? 'Conductor asignado'}</DriverLink>
                  : 'Sin conductor'}</span></div>
              </div>
            </section>

            <section className="bx-trip-card">
              <h3 className="bx-trip-card-title"><i className="fa-solid fa-timeline" aria-hidden="true" />Línea de tiempo</h3>
              <ol className="bx-trip-timeline">
                {timeline.map(s => (
                  <li key={s.label} className={s.at ? 'done' : ''}>
                    <span className="dot" aria-hidden="true"><i className={`fa-solid ${s.icon}`} /></span>
                    <span className="flex-grow-1">{s.label}</span>
                    <span className="bugie-muted text-nowrap">{fmt(s.at) ?? '—'}</span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </div>

        {/* Tarifa, cancelación y envío */}
        <div className="bx-trip-cards">
          <section className="bx-trip-card">
            <h3 className="bx-trip-card-title"><i className="fa-solid fa-receipt" aria-hidden="true" />Tarifa</h3>
            <div className="fw-bold fs-5">S/ {fare.toFixed(2)}</div>
            {trip.finalFare == null && <div className="small bugie-muted">Tarifa estimada</div>}
            {trip.couponCode && (
              <div className="small">
                Cupón <strong>{trip.couponCode}</strong>: −S/ {(trip.discountAmount ?? 0).toFixed(2)}
                {trip.fareBeforeDiscount != null && <> (antes S/ {trip.fareBeforeDiscount.toFixed(2)})</>}
              </div>
            )}
            <div className="small bugie-muted">Pago: {PAY[trip.paymentMethod] ?? trip.paymentMethod}</div>
          </section>

          {hasCancel && (
            <section className="bx-trip-card is-cancel">
              <h3 className="bx-trip-card-title"><i className="fa-solid fa-circle-xmark" aria-hidden="true" />Cancelación</h3>
              <div className="small d-flex align-items-center gap-2 flex-wrap">Cancelado por <FromBadge from={trip.cancelledBy} /></div>
              {trip.cancelledAt && <div className="small bugie-muted">{fmt(trip.cancelledAt)}</div>}
              <div className="small">Motivo: {trip.cancelReason || 'Sin motivo indicado'}</div>
            </section>
          )}

          {isDelivery && (
            <section className="bx-trip-card bx-trip-delivery">
              <h3 className="bx-trip-card-title"><i className="fa-solid fa-box" aria-hidden="true" />Envío</h3>
              <div className="small">
                {trip.packageDescription && <div>{trip.packageDescription}</div>}
                <div className="bugie-muted">
                  {trip.packageWeightKg != null && <>{trip.packageWeightKg} kg</>}
                  {trip.packageIsFragile && <> · <StatusBadge tone="warn" size="sm">Frágil</StatusBadge></>}
                </div>
                {trip.packageDetails && <div className="bugie-muted">{trip.packageDetails}</div>}
                <div className="mt-1">
                  Destinatario: <strong>{trip.recipientName ?? '—'}</strong>
                  {trip.recipientPhone && <> · {trip.recipientPhone}</>}
                </div>
                {/* Recojo: el conductor verifica el paquete al recogerlo */}
                <div className="mt-1">
                  {trip.pickupVerified
                    ? <StatusBadge tone="ok" icon="fa-circle-check" size="sm">Paquete verificado</StatusBadge>
                    : <StatusBadge tone="neutral" icon="fa-circle-question" size="sm">Sin verificar</StatusBadge>}
                </div>
                {trip.pickupObservation && <div className="bugie-muted">Observación del recojo: {trip.pickupObservation}</div>}
                {/* Entrega: quién recibió y a qué hora */}
                {trip.deliveryReceivedBy
                  ? <div className="mt-1" style={{ color: 'var(--bugie-ok)' }}>
                      <i className="fa-solid fa-box-open me-1" aria-hidden="true" />Recibió: <strong>{trip.deliveryReceivedBy}</strong>
                      {trip.deliveryConfirmedAt && <> · {fmt(trip.deliveryConfirmedAt)}</>}
                    </div>
                  : <div className="bugie-muted mt-1">Entrega aún no confirmada</div>}
              </div>
            </section>
          )}
        </div>

        {/* Fotos del envío: paquete, recojo y entrega */}
        {isDelivery && (
          <section className="bx-trip-card">
            <h3 className="bx-trip-card-title"><i className="fa-solid fa-images" aria-hidden="true" />Fotos del envío ({photos.length})</h3>
            {photos.length === 0 ? (
              <div className="small bugie-muted">No hay fotos registradas.</div>
            ) : (
              <div className="bx-trip-photos">
                {photos.map(p => (
                  <a key={p.id} href={photoUrl(p.url)} target="_blank" rel="noreferrer" className="bx-trip-photo">
                    <img src={photoUrl(p.url)} alt={PHOTO_KIND[p.kind] ?? 'Foto'} loading="lazy" />
                    <span className="small bugie-muted text-truncate">{PHOTO_KIND[p.kind] ?? 'Foto'}</span>
                  </a>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </Modal>
  );
}
