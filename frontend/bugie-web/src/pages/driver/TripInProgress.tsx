import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import BugieMap from '../../components/BugieMap';
import { API, apiFetch, ApiError } from '../../state/api';

interface Waypoint {
  id: string; address: string;
  lat: number; lng: number; sortOrder: number;
}

interface Trip {
  id: string;
  originAddress: string; destAddress: string;
  originLat: number;    originLng: number;
  destLat: number;      destLng: number;
  estimatedFare: number; paymentMethod: string;
  // Cupon que el pasajero aplico a este viaje.
  couponCode?: string | null;
  discountAmount?: number | null;
  fareBeforeDiscount?: number | null;
  status: number;
  waypoints?: Waypoint[];
  // Cuando el conductor aviso que ya esta en el punto de recojo
  driverArrivedAt?: string | null;
  // Cancelacion (para avisar si la cancelo el pasajero)
  cancelledBy?: string | null;
  cancelReason?: string | null;
  // Envio
  serviceType?: number;
  packageDescription?: string | null;
  packageWeightKg?: number | null;
  packageIsFragile?: boolean;
  packageDetails?: string | null;
  recipientName?: string | null;
  recipientPhone?: string | null;
  pickupVerified?: boolean;
  deliveryReceivedBy?: string | null;
  deliveryConfirmedAt?: string | null;
}

const PAY: Record<string, string> = { cash: 'Efectivo', yape: 'Yape', plin: 'Plin' };

const CANCEL_REASONS = [
  'El pasajero no se presenta',
  'No puedo llegar al punto de recojo',
  'Problema con el vehículo',
  'El pasajero pidió cancelar',
  'Otro motivo',
];

/// Subida multipart (fotos). apiFetch fuerza JSON, por eso se usa fetch directo.
async function postForm<T>(url: string, fd: FormData): Promise<T> {
  const token = localStorage.getItem('bugie_token') ?? '';
  const res = await fetch(url, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: fd,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (body as any).error ?? `Error ${res.status}`);
  return body as T;
}

export default function DriverTripInProgress() {
  const navigate = useNavigate();
  const [trip,    setTrip]    = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting,  setActing]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  // El pasajero (o el admin) cancelo el viaje: se muestra el aviso
  const [cancelledInfo, setCancelledInfo] = useState<{ by: string; reason: string | null } | null>(null);
  const lastTripId = useRef<string | null>(null);

  // Carga + refresco cada 10 s: si el viaje desaparece, se averigua por que.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const d = await apiFetch<Trip | null>(`${API.trips}/trips/active`);
        if (!alive) return;
        if (d) {
          lastTripId.current = d.id;
          setTrip(prev => prev ? { ...d, waypoints: d.waypoints ?? prev.waypoints } : d);
        } else if (lastTripId.current) {
          const gone = lastTripId.current;
          lastTripId.current = null;
          const t = await apiFetch<Trip>(`${API.trips}/trips/${gone}`).catch(() => null);
          if (alive && t?.status === 5 && t.cancelledBy !== 'driver')
            setCancelledInfo({ by: t.cancelledBy ?? 'passenger', reason: t.cancelReason ?? null });
          setTrip(null);
        }
      } catch {
        if (alive) setError('No se pudo cargar el viaje activo.');
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    const t = setInterval(load, 10_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // GPS del conductor mientras hay viaje (aceptado o en curso): se manda cada
  // ~10 s con el tripId, asi queda el recorrido real para revisarlo en el admin.
  const lastSent = useRef(0);
  const tripId = trip?.id;
  const tripActive = trip?.status === 2 || trip?.status === 3;
  useEffect(() => {
    if (!tripId || !tripActive || !('geolocation' in navigator)) return;
    const watch = navigator.geolocation.watchPosition(pos => {
      const now = Date.now();
      if (now - lastSent.current < 10_000) return;
      lastSent.current = now;
      apiFetch(`${API.drivers}/drivers/location`, {
        method: 'PUT',
        body: JSON.stringify({
          driverId: '00000000-0000-0000-0000-000000000000', // el backend usa el usuario del token
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          tripId,
          speedKmh: pos.coords.speed != null ? pos.coords.speed * 3.6 : null,
          heading: pos.coords.heading,
        }),
      }).catch(() => { /* sin red: se reintenta en el proximo punto */ });
    }, () => { /* sin permiso de ubicacion: no se envia */ }, { enableHighAccuracy: true, maximumAge: 5000 });
    return () => navigator.geolocation.clearWatch(watch);
  }, [tripId, tripActive]);

  async function startTrip() {
    if (!trip) return;
    setActing(true); setError(null);
    try {
      const d = await apiFetch<Trip>(`${API.trips}/trips/${trip.id}/start`, { method: 'PUT' });
      // Preservar waypoints — el endpoint /start no los devuelve
      setTrip({ ...d, waypoints: trip.waypoints });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al iniciar.');
    } finally { setActing(false); }
  }

  // "Ya llegue": avisa al pasajero (push a su celular) que ya esta en el
  // punto de recojo. Se puede repetir si el pasajero no sale.
  async function markArrived() {
    if (!trip) return;
    setActing(true); setError(null);
    try {
      const d = await apiFetch<Trip>(`${API.trips}/trips/${trip.id}/arrived`, { method: 'PUT' });
      setTrip({ ...trip, driverArrivedAt: d.driverArrivedAt });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo avisar al pasajero.');
    } finally { setActing(false); }
  }

  // ── Envio: verificar el paquete al recoger (foto principal + extras) ──
  const [pkMain,  setPkMain]  = useState<File | null>(null);
  const [pkExtra, setPkExtra] = useState<File[]>([]);
  const [pkObs,   setPkObs]   = useState('');

  async function verifyPickup() {
    if (!trip || !pkMain) { setError('Toma la foto principal del paquete.'); return; }
    setActing(true); setError(null);
    try {
      const fd = new FormData();
      fd.append('main', pkMain);
      pkExtra.forEach(f => fd.append('secondary', f));
      if (pkObs.trim()) fd.append('observation', pkObs.trim());
      await postForm(`${API.trips}/trips/${trip.id}/pickup-verification`, fd);
      setTrip({ ...trip, pickupVerified: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo verificar el paquete.');
    } finally { setActing(false); }
  }

  // ── Envio: confirmar la entrega en destino (foto + quien recibio) ──
  const [dlPhoto, setDlPhoto] = useState<File | null>(null);
  const [dlBy,    setDlBy]    = useState('');

  async function confirmDelivery() {
    if (!trip) return;
    if (!dlPhoto) { setError('Toma la foto de la entrega.'); return; }
    const by = (dlBy || trip.recipientName || '').trim();
    if (!by) { setError('Escribe quién recibió el envío.'); return; }
    setActing(true); setError(null);
    try {
      const fd = new FormData();
      fd.append('photo', dlPhoto);
      fd.append('receivedBy', by);
      const r = await postForm<{ deliveryReceivedBy: string; deliveryConfirmedAt: string }>(
        `${API.trips}/trips/${trip.id}/delivery-confirmation`, fd);
      setTrip({ ...trip, deliveryReceivedBy: r.deliveryReceivedBy, deliveryConfirmedAt: r.deliveryConfirmedAt });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo confirmar la entrega.');
    } finally { setActing(false); }
  }

  // Cancelar (solo aceptado y sin iniciar). El motivo queda en el reporte.
  const [cancelOpen,   setCancelOpen]   = useState(false);
  const [cancelReason, setCancelReason] = useState(CANCEL_REASONS[0]);
  const [cancelOther,  setCancelOther]  = useState('');

  async function cancelTrip() {
    if (!trip) return;
    const reason = cancelReason === 'Otro motivo' ? (cancelOther.trim() || 'Otro motivo') : cancelReason;
    setActing(true); setError(null);
    try {
      lastTripId.current = null; // lo cancela el conductor: no mostrar el aviso de cancelacion
      await apiFetch(`${API.trips}/trips/${trip.id}/cancel`, {
        method: 'PUT',
        body: JSON.stringify({ reason }),
      });
      navigate('/app/conductor/inicio');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cancelar el viaje.');
      setActing(false);
    }
  }

  async function completeTrip() {
    if (!trip) return;
    setActing(true); setError(null);
    try {
      lastTripId.current = null;
      await apiFetch(`${API.trips}/trips/${trip.id}/complete`, {
        method: 'PUT',
        // Se manda la tarifa SIN descuento: el backend resta el cupon al
        // completar. Si se restara aqui, el descuento se aplicaria dos veces.
        body: JSON.stringify({
          finalFare: trip.estimatedFare,
        }),
      });
      navigate('/app/conductor/inicio');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al completar.');
      setActing(false);
    }
  }

  if (loading) return (
    <div className="d-flex justify-content-center py-5">
      <span className="spinner-border" />
    </div>
  );

  // Aviso: el pasajero cancelo
  const cancelledModal = cancelledInfo && (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1060,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div className="bugie-card text-center" role="alertdialog" aria-labelledby="cancel-title" style={{ maxWidth: 380, width: '100%' }}>
        <div className="bugie-card-body p-4">
          <i className="fa-solid fa-circle-xmark fa-3x text-danger mb-3 d-block" />
          <h2 id="cancel-title" className="h5 fw-bold mb-2">
            {cancelledInfo.by === 'admin' ? 'Bugie canceló el viaje' : 'El pasajero canceló el viaje'}
          </h2>
          {cancelledInfo.reason && <p className="bugie-muted mb-2">Motivo: {cancelledInfo.reason}</p>}
          <p className="bugie-muted mb-3">Ya puedes recibir otras solicitudes.</p>
          <button className="btn btn-bugie text-white rounded-pill w-100"
                  onClick={() => { setCancelledInfo(null); navigate('/app/conductor/inicio'); }}>
            Entendido
          </button>
        </div>
      </div>
    </div>
  );

  if (!trip) return (
    <>
      <PageHeader title="Viaje en curso" subtitle="Estado del viaje activo." icon="fa-solid fa-car-side" />
      {cancelledModal}
      <div className="bugie-card p-5 text-center">
        <div className="bugie-mini-icon mx-auto mb-3" style={{ width: 56, height: 56, fontSize: '1.5rem' }}>
          <i className="fa-solid fa-car-side" />
        </div>
        <div className="fw-semibold mb-2">No tienes viajes en curso</div>
        <div className="small bugie-muted mb-4">Cuando aceptes un viaje podrás verlo aquí.</div>
        <button className="btn btn-bugie text-white rounded-pill px-4"
          onClick={() => navigate('/app/conductor/solicitudes')}>
          <i className="fa-solid fa-bell me-2" />Ver solicitudes
        </button>
      </div>
    </>
  );

  const isDelivery = trip.serviceType === 1;
  const needsPickup = isDelivery && trip.status === 2 && !trip.pickupVerified;
  const needsDelivery = isDelivery && trip.status === 3 && !trip.deliveryConfirmedAt;
  const sortedWp = [...(trip.waypoints ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const wpCoords = sortedWp.map(w => ({ lat: w.lat, lng: w.lng }));
  const subtitle = isDelivery
    ? (trip.status === 3 ? 'Lleva el paquete y confirma la entrega.' : 'Recoge y verifica el paquete.')
    : (trip.status === 3 ? 'Lleva al pasajero a su destino.' : 'Confirma que el pasajero está a bordo.');

  return (
    <>
      <PageHeader title={isDelivery ? 'Envío en curso' : 'Viaje en curso'} subtitle={subtitle} icon="fa-solid fa-car-side" />
      {cancelledModal}
      {error && <div className="alert alert-danger small mb-3">{error}</div>}

      <div className="row g-3 mb-3">
        <div className="col-6">
          <div className="bugie-kpi">
            <div className="label">{trip.discountAmount ? 'Cobras' : 'Tarifa'}</div>
            <div className="value">
              S/ {((trip.fareBeforeDiscount ?? trip.estimatedFare) - (trip.discountAmount ?? 0)).toFixed(2)}
            </div>

            {/* Desglose cuando el pasajero aplico un cupon.
                Sin esto, el conductor ve un monto menor al acordado y no sabe
                por que: ahi es donde empiezan los reclamos. */}
            {trip.discountAmount ? (
              <div className="small mt-2 pt-2"
                   style={{ borderTop: '1px solid var(--bugie-border)' }}>
                <div className="d-flex justify-content-between bugie-muted">
                  <span>Tarifa del viaje</span>
                  <span>S/ {(trip.fareBeforeDiscount ?? trip.estimatedFare).toFixed(2)}</span>
                </div>
                <div className="d-flex justify-content-between">
                  <span>Cupón del pasajero</span>
                  <span style={{ color: '#0d6e4a', fontWeight: 600 }}>
                    − S/ {trip.discountAmount.toFixed(2)}
                  </span>
                </div>
                <div className="bugie-muted mt-2" style={{ fontSize: '.78rem' }}>
                  El pasajero usó un cupón de Bugie. Cobra el monto de arriba:
                  el descuento no sale de tu ganancia.
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <div className="col-6">
          <div className="bugie-kpi">
            <div className="label">Pago</div>
            <div className="value" style={{ fontSize: '1.4rem' }}>{PAY[trip.paymentMethod]}</div>
          </div>
        </div>
      </div>

      {/* Datos del envio: paquete y a quien se entrega */}
      {isDelivery && (
        <div className="bugie-card mb-3">
          <div className="bugie-card-header"><i className="fa-solid fa-box me-2" />Envío</div>
          <div className="bugie-card-body small">
            {trip.packageDescription && <div className="fw-semibold">{trip.packageDescription}</div>}
            <div className="bugie-muted">
              {trip.packageWeightKg != null && <>{trip.packageWeightKg} kg</>}
              {trip.packageIsFragile && <> · <span className="text-warning fw-semibold">Frágil</span></>}
            </div>
            {trip.packageDetails && <div className="bugie-muted">{trip.packageDetails}</div>}
            <div className="mt-2">
              Entregar a <strong>{trip.recipientName ?? '—'}</strong>
              {trip.recipientPhone && (
                <> · <a href={`tel:${trip.recipientPhone}`}><i className="fa-solid fa-phone me-1" />{trip.recipientPhone}</a></>
              )}
            </div>
            {trip.pickupVerified && <div className="text-success mt-1"><i className="fa-solid fa-circle-check me-1" />Paquete verificado al recoger</div>}
            {trip.deliveryConfirmedAt && <div className="text-success"><i className="fa-solid fa-circle-check me-1" />Entregado a {trip.deliveryReceivedBy}</div>}
          </div>
        </div>
      )}

      <div className="bugie-card mb-3">
        <div className="bugie-card-header">Ruta</div>
        <div className="bugie-card-body">

          {/* Paradas */}
          <div className="small mb-3">
            <div className="d-flex align-items-start gap-2 mb-1">
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#7C6AF7', display: 'inline-block', marginTop: 3, flexShrink: 0 }} />
              <span><span className="bugie-muted">Origen: </span><strong>{trip.originAddress}</strong></span>
            </div>
            {sortedWp.map((wp, i) => (
              <div key={wp.id} className="d-flex align-items-start gap-2 mb-1">
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#f59e0b', display: 'inline-block', marginTop: 3, flexShrink: 0 }} />
                <span><span className="bugie-muted">Parada {i + 1}: </span><strong>{wp.address}</strong></span>
              </div>
            ))}
            <div className="d-flex align-items-start gap-2">
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#C060C0', display: 'inline-block', marginTop: 3, flexShrink: 0 }} />
              <span><span className="bugie-muted">Destino: </span><strong>{trip.destAddress}</strong></span>
            </div>
          </div>

          {/* Mapa con waypoints */}
          <BugieMap
            height={420}
            showRoute
            origin={{ lat: trip.originLat, lng: trip.originLng }}
            destination={{ lat: trip.destLat, lng: trip.destLng }}
            waypoints={wpCoords}
          />
        </div>
      </div>

      <div className="d-grid gap-2">
        {trip.status === 2 && (
          <>
            <button className="btn btn-bugie-outline rounded-pill" onClick={markArrived} disabled={acting}>
              <i className={`fa-solid ${trip.driverArrivedAt ? 'fa-bell' : 'fa-location-dot'} me-2`} />
              {trip.driverArrivedAt ? 'Avisar de nuevo al pasajero' : 'Ya llegué al punto de recojo'}
            </button>
            {trip.driverArrivedAt && (
              <div className="small text-center" style={{ color: 'var(--bugie-ok, #16a34a)' }}>
                <i className="fa-solid fa-circle-check me-1" />
                Pasajero avisado a las {new Date(trip.driverArrivedAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </>
        )}

        {/* Envio: antes de iniciar hay que verificar el paquete con fotos */}
        {needsPickup && (
          <div className="bugie-card p-3">
            <div className="small fw-semibold mb-2"><i className="fa-solid fa-camera me-1" />Verifica el paquete antes de salir</div>
            <label className="form-label small mb-1">Foto principal del paquete (obligatoria)</label>
            <input type="file" accept="image/*" capture="environment" className="form-control form-control-sm mb-2"
                   onChange={e => setPkMain(e.target.files?.[0] ?? null)} />
            <label className="form-label small mb-1">Fotos adicionales (opcional)</label>
            <input type="file" accept="image/*" multiple className="form-control form-control-sm mb-2"
                   onChange={e => setPkExtra(Array.from(e.target.files ?? []))} />
            <input className="form-control form-control-sm mb-2" maxLength={300} placeholder="Observación (ej. caja sellada)"
                   value={pkObs} onChange={e => setPkObs(e.target.value)} />
            <button className="btn btn-sm btn-bugie text-white rounded-pill" onClick={verifyPickup} disabled={acting || !pkMain}>
              {acting ? <span className="spinner-border spinner-border-sm" /> : 'Guardar verificación'}
            </button>
          </div>
        )}

        {trip.status === 2 && (
          <button className="btn btn-bugie text-white rounded-pill" onClick={startTrip} disabled={acting || needsPickup}>
            {acting
              ? <span className="spinner-border spinner-border-sm" />
              : <><i className="fa-solid fa-play me-2" />{isDelivery ? 'Paquete a bordo — Iniciar envío' : 'Pasajero a bordo — Iniciar viaje'}</>}
          </button>
        )}

        {/* Envio: en destino, foto de la entrega y quien recibio */}
        {needsDelivery && (
          <div className="bugie-card p-3">
            <div className="small fw-semibold mb-2"><i className="fa-solid fa-box-open me-1" />Confirma la entrega</div>
            <label className="form-label small mb-1">Foto de la entrega (obligatoria)</label>
            <input type="file" accept="image/*" capture="environment" className="form-control form-control-sm mb-2"
                   onChange={e => setDlPhoto(e.target.files?.[0] ?? null)} />
            <label className="form-label small mb-1">¿Quién lo recibió?</label>
            <input className="form-control form-control-sm mb-2" maxLength={120}
                   placeholder={trip.recipientName ?? 'Nombre de quien recibe'}
                   value={dlBy} onChange={e => setDlBy(e.target.value)} />
            <button className="btn btn-sm btn-bugie text-white rounded-pill" onClick={confirmDelivery} disabled={acting || !dlPhoto}>
              {acting ? <span className="spinner-border spinner-border-sm" /> : 'Confirmar entrega'}
            </button>
          </div>
        )}

        {trip.status === 3 && (
          <button className="btn btn-success rounded-pill" onClick={completeTrip} disabled={acting || needsDelivery}>
            {acting
              ? <span className="spinner-border spinner-border-sm" />
              : <><i className="fa-solid fa-flag-checkered me-2" />{isDelivery ? 'Completar envío' : 'Completar viaje'}</>}
          </button>
        )}
        {trip.status === 2 && !cancelOpen && (
          <button className="btn btn-link text-danger small" onClick={() => setCancelOpen(true)} disabled={acting}>
            <i className="fa-solid fa-ban me-1" />Cancelar viaje
          </button>
        )}
        {trip.status === 2 && cancelOpen && (
          <div className="bugie-card p-3">
            <div className="small fw-semibold mb-2">¿Por qué cancelas? Se le avisará al pasajero.</div>
            <select className="form-select form-select-sm mb-2" value={cancelReason}
                    onChange={e => setCancelReason(e.target.value)} aria-label="Motivo de cancelación">
              {CANCEL_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            {cancelReason === 'Otro motivo' && (
              <input className="form-control form-control-sm mb-2" maxLength={200} placeholder="Escribe el motivo"
                     value={cancelOther} onChange={e => setCancelOther(e.target.value)} />
            )}
            <div className="d-flex gap-2">
              <button className="btn btn-sm btn-danger rounded-pill" onClick={cancelTrip} disabled={acting}>
                {acting ? <span className="spinner-border spinner-border-sm" /> : 'Cancelar viaje'}
              </button>
              <button className="btn btn-sm btn-bugie-outline rounded-pill" onClick={() => setCancelOpen(false)} disabled={acting}>
                Volver
              </button>
            </div>
          </div>
        )}
        <div className="mt-2">
          <div className="small bugie-muted text-center mb-2">Solo en caso de emergencia real</div>
          <a className="btn btn-danger rounded-pill w-100" href="/app/conductor/sos">
            <i className="fa-solid fa-triangle-exclamation me-2" />SOS — Emergencia
          </a>
        </div>
      </div>
    </>
  );
}
