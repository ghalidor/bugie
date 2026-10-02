import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import BugieMapAdmin, { MapMarker } from './BugieMapAdmin';
import { API, ApiError, apiFetch } from '../state/api';

/** Lo que el modal necesita del viaje (TripDto del backend). */
export interface TripDetail {
  id: string;
  originAddress: string; destAddress: string;
  originLat?: number; originLng?: number; destLat?: number; destLng?: number;
  estimatedFare: number; finalFare: number | null;
  paymentMethod: string; status: number; createdAt: string;
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
  pickupObservation?: string | null;
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

// Las fotos vienen con ruta relativa (/uploads/...) del servidor de Trips
const photoUrl = (u: string) => u.startsWith('http') ? u : `${API.trips.replace(/\/api\/?$/, '')}${u}`;

interface PathPoint { lat: number; lng: number; speedKmh: number | null; heading: number | null; recordedAt: string; }
interface TripPath  { tripId: string; points: number; distanceKm: number; firstAt: string | null; lastAt: string | null; path: PathPoint[]; }

export const CANCELLED_BY: Record<string, string> = {
  passenger: 'el pasajero',
  driver:    'el conductor',
  admin:     'un administrador',
};

const fmt = (iso?: string | null) => iso
  ? new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  : null;

/// Detalle de un viaje para el admin: datos, linea de tiempo y el recorrido
/// REAL del conductor en el mapa (puntos GPS guardados durante el viaje).
export default function TripDetailModal({ trip, onClose }: { trip: TripDetail; onClose: () => void }) {
  const [path,    setPath]    = useState<TripPath | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [photos,  setPhotos]  = useState<TripPhoto[]>([]);
  const isDelivery = trip.serviceType === 1;

  useEffect(() => {
    apiFetch<TripPath>(`${API.drivers}/drivers/admin/trips/${trip.id}/path`)
      .then(setPath)
      .catch(err => setError(err instanceof ApiError ? err.message : 'No se pudo cargar el recorrido.'))
      .finally(() => setLoading(false));
    // Envio: fotos del paquete, del recojo y de la entrega (auditoria)
    if (isDelivery)
      apiFetch<TripPhoto[]>(`${API.trips}/trips/${trip.id}/photos`)
        .then(p => setPhotos(p ?? []))
        .catch(() => setPhotos([]));
  }, [trip.id, isDelivery]);

  const markers = useMemo<MapMarker[]>(() => {
    const m: MapMarker[] = [];
    if (trip.originLat && trip.originLng) m.push({ id: 'o', lat: trip.originLat, lng: trip.originLng, type: 'origin', label: 'Origen' });
    if (trip.destLat && trip.destLng)     m.push({ id: 'd', lat: trip.destLat, lng: trip.destLng, type: 'destination', label: 'Destino' });
    // Ultima posicion registrada (donde termino el recorrido grabado)
    const last = path?.path[path.path.length - 1];
    if (last) m.push({ id: 'last', lat: last.lat, lng: last.lng, type: 'driver', label: 'Último punto GPS' });
    return m;
  }, [trip, path]);

  // BugieMapAdmin espera [lng, lat]
  const route = useMemo(() => path?.path.map(p => [p.lng, p.lat]) ?? [], [path]);

  const timeline: { label: string; at: string | null | undefined; icon: string }[] = [
    { label: 'Solicitado',               at: trip.createdAt,       icon: 'fa-hand' },
    { label: 'Aceptado por el conductor', at: trip.acceptedAt,      icon: 'fa-car' },
    { label: 'Conductor llegó',          at: trip.driverArrivedAt, icon: 'fa-location-dot' },
    { label: 'Inicio del viaje',         at: trip.startedAt,       icon: 'fa-play' },
    ...(isDelivery ? [{ label: 'Entrega confirmada', at: trip.deliveryConfirmedAt, icon: 'fa-box-open' }] : []),
    { label: 'Fin del viaje',            at: trip.completedAt,     icon: 'fa-flag-checkered' },
    ...(trip.status === 5 ? [{ label: 'Cancelado', at: trip.cancelledAt, icon: 'fa-circle-xmark' }] : []),
  ];

  const fare = trip.finalFare ?? trip.estimatedFare;

  return createPortal(
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label="Detalle del viaje" style={{
        width: 'min(900px, 100%)', maxHeight: '90vh', background: 'var(--bugie-surface)',
        borderRadius: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div className="d-flex align-items-center justify-content-between p-3 border-bottom" style={{ borderColor: 'var(--bugie-border)' }}>
          <div className="min-w-0">
            <div className="fw-bold">Detalle del viaje</div>
            <div className="small bugie-muted text-truncate" style={{ maxWidth: 640 }}>
              {trip.originAddress} → {trip.destAddress}
            </div>
          </div>
          <button onClick={onClose} className="btn btn-sm btn-bugie-outline rounded-pill" aria-label="Cerrar">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: '1rem' }}>
          <div className="row g-3">
            <div className="col-lg-8">
              {loading ? (
                <div className="d-flex justify-content-center align-items-center" style={{ height: 380 }}>
                  <span className="spinner-border" />
                </div>
              ) : (
                <BugieMapAdmin height={380} markers={markers} routeCoordinates={route.length > 1 ? route : undefined} />
              )}
              <div className="small bugie-muted mt-2">
                {error ? <span className="text-danger">{error}</span>
                  : path && path.points > 0
                    ? <>Recorrido real del conductor: <strong>{path.points}</strong> puntos GPS · <strong>{path.distanceKm.toFixed(2)} km</strong>
                        {path.firstAt && path.lastAt && <> · de {fmt(path.firstAt)} a {fmt(path.lastAt)}</>}</>
                    : 'Este viaje no tiene recorrido GPS registrado (el conductor no envió su ubicación).'}
              </div>
            </div>

            <div className="col-lg-4">
              <div className="mb-3 small">
                <div><i className="fa-solid fa-user me-2 bugie-muted" />{trip.passengerName ?? 'Pasajero'}</div>
                <div><i className="fa-solid fa-car me-2 bugie-muted" />{trip.driverId ? (trip.driverName ?? 'Conductor asignado') : 'Sin conductor'}</div>
              </div>
              <div className="mb-3">
                <div className="small bugie-muted">Tarifa</div>
                <div className="fw-bold fs-5">S/ {fare.toFixed(2)}</div>
                {trip.couponCode && (
                  <div className="small">
                    Cupón <strong>{trip.couponCode}</strong>: −S/ {(trip.discountAmount ?? 0).toFixed(2)}
                    {trip.fareBeforeDiscount != null && <> (antes S/ {trip.fareBeforeDiscount.toFixed(2)})</>}
                  </div>
                )}
                <div className="small bugie-muted text-capitalize">{trip.paymentMethod}</div>
              </div>

              {trip.status === 5 && (
                <div className="alert alert-secondary small py-2">
                  <i className="fa-solid fa-circle-xmark me-1" />
                  Cancelado por <strong>{CANCELLED_BY[trip.cancelledBy ?? ''] ?? 'desconocido'}</strong>
                  {trip.cancelReason && <div className="mt-1">Motivo: {trip.cancelReason}</div>}
                </div>
              )}

              {isDelivery && (
                <div className="mb-3 small p-2" style={{ border: '1px solid var(--bugie-border)', borderRadius: 10 }}>
                  <div className="fw-semibold mb-1"><i className="fa-solid fa-box me-1" />Envío</div>
                  {trip.packageDescription && <div>{trip.packageDescription}</div>}
                  <div className="bugie-muted">
                    {trip.packageWeightKg != null && <>{trip.packageWeightKg} kg</>}
                    {trip.packageIsFragile && <> · <span className="text-warning">Frágil</span></>}
                  </div>
                  {trip.packageDetails && <div className="bugie-muted">{trip.packageDetails}</div>}
                  <div className="mt-1">
                    Destinatario: <strong>{trip.recipientName ?? '—'}</strong>
                    {trip.recipientPhone && <> · {trip.recipientPhone}</>}
                  </div>
                  {trip.pickupObservation && <div className="bugie-muted">Recojo: {trip.pickupObservation}</div>}
                  {trip.deliveryReceivedBy
                    ? <div className="text-success"><i className="fa-solid fa-circle-check me-1" />Recibió: {trip.deliveryReceivedBy}</div>
                    : <div className="bugie-muted">Entrega aún no confirmada</div>}
                </div>
              )}

              <div className="small fw-semibold mb-2">Línea de tiempo</div>
              <ul className="list-unstyled small mb-0">
                {timeline.map(s => (
                  <li key={s.label} className="d-flex align-items-center gap-2 mb-2"
                      style={{ opacity: s.at ? 1 : 0.4 }}>
                    <i className={`fa-solid ${s.icon}`} style={{ width: 16 }} />
                    <span className="flex-grow-1">{s.label}</span>
                    <span className="bugie-muted">{fmt(s.at) ?? '—'}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Fotos del envio: paquete, recojo y entrega */}
          {isDelivery && (
            <div className="mt-3">
              <div className="small fw-semibold mb-2">Fotos del envío ({photos.length})</div>
              {photos.length === 0 ? (
                <div className="small bugie-muted">No hay fotos registradas.</div>
              ) : (
                <div className="d-flex flex-wrap gap-2">
                  {photos.map(p => (
                    <a key={p.id} href={photoUrl(p.url)} target="_blank" rel="noreferrer"
                       className="text-decoration-none" style={{ width: 140 }}>
                      <img src={photoUrl(p.url)} alt={PHOTO_KIND[p.kind] ?? 'Foto'}
                           style={{ width: 140, height: 100, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--bugie-border)' }} />
                      <div className="small bugie-muted text-truncate">{PHOTO_KIND[p.kind] ?? 'Foto'}</div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
