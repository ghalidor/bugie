import { useEffect, useRef, useState } from 'react';
import ApplyCouponModal, { CouponApplied } from './ApplyCouponModal';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import BugieMap from '../../components/BugieMap';
import { API, apiFetch, ApiError } from '../../state/api';

interface Waypoint {
  id: string; address: string;
  lat: number; lng: number; sortOrder: number;
}

interface Proposal {
  id: string; tripId: string; driverId: string;
  fare: number; status: string; createdAt: string;
  // Datos enriquecidos del conductor (vía Trips → Auth + Drivers)
  driverName: string;
  vehiclePlate?: string | null;
  vehicleBrand?: string | null;
  vehicleModel?: string | null;
  vehicleColor?: string | null;
  // Tendencia respecto a la propuesta anterior del mismo conductor
  trend: 'up' | 'down' | 'new';
  previousFare?: number | null;
  // Quién hizo esta propuesta: 'driver' (normal) o 'passenger' (contrapropuesta mía)
  proposedByRole?: 'driver' | 'passenger';
  // Quién la rechazó (si Status == 'rejected'): 'driver' = el conductor declinó
  rejectedBy?: 'passenger' | 'driver' | null;
}

interface ProposalHistoryEntry {
  id: string; fare: number;
  status: 'pending' | 'superseded' | 'accepted' | 'rejected';
  createdAt: string;
}

interface Trip {
  id: string;
  driverId: string | null;
  originAddress: string; destAddress: string;
  originLat: number;    originLng: number;
  destLat: number;      destLng: number;
  estimatedFare: number;
  proposedFare: number | null;
  status: number;

  // Cupon aplicado a este viaje.
  couponCode?: string | null;
  discountAmount?: number | null;
  fareBeforeDiscount?: number | null;
  waypoints?: Waypoint[];
  // Cuando el conductor aviso que ya esta en el punto de recojo
  driverArrivedAt?: string | null;
  // Si se cancelo: quien y por que
  cancelledBy?: string | null;
  cancelReason?: string | null;
}

const STATUS_MSG: Record<number, string> = {
  1: 'Buscando conductor…',
  2: 'Conductor en camino',
  3: 'Viaje en curso',
  4: 'Completado',
  5: 'Cancelado',
  6: 'SOS activo',
  7: 'Conductores proponen tarifa',
};

const STATUS_COLOR: Record<number, string> = {
  1: 'warning', 2: 'info', 3: 'success',
  4: 'success', 5: 'secondary', 6: 'danger', 7: 'primary',
};

/** Devuelve un texto relativo amigable: "hace 30s", "hace 2 min", etc. */
function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 5)   return 'ahora mismo';
  if (seconds < 60)  return `hace ${seconds}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60)     return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24)    return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

export default function PassengerTracking() {
  const navigate   = useNavigate();
  const [trip,      setTrip]      = useState<Trip | null>(null);
  // Aviso "tu conductor llego": se muestra una vez por viaje al detectarlo
  const [arrivedOpen, setArrivedOpen] = useState(false);
  const arrivedShownFor = useRef<string | null>(null);
  // El conductor (o Bugie) cancelo el viaje: aviso con el motivo
  const [cancelledInfo, setCancelledInfo] = useState<{ by: string; reason: string | null } | null>(null);
  const lastTripId = useRef<string | null>(null);
  const [cuponAbierto, setCuponAbierto] = useState(false);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  // Estado del modal de histórico
  const [historyOpen,    setHistoryOpen]    = useState(false);
  const [historyDriver,  setHistoryDriver]  = useState<{ id: string; name: string } | null>(null);
  const [historyEntries, setHistoryEntries] = useState<ProposalHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Tick para refrescar etiquetas timeAgo cada 15s sin recargar propuestas
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(v => v + 1), 15000);
    return () => clearInterval(t);
  }, []);

  // Estado del input de contrapropuesta por cada propuesta (key = proposalId)
  const [counterFare,    setCounterFare]    = useState<Record<string, string>>({});
  const [counteringId,   setCounteringId]   = useState<string | null>(null);  // proposalId al que le estoy contraproponiendo
  const [counterSending, setCounterSending] = useState(false);

  // IDs de propuestas que el usuario ocultó manualmente (con la X).
  // No se persiste — al recargar la pantalla, vuelven a aparecer si siguen rejected.
  // Si llega una propuesta NUEVA (pending) del mismo conductor, no se ve afectado.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const load = () =>
      apiFetch<Trip | null>(`${API.trips}/trips/active`)
        .then(async d => {
          // El viaje ya no esta activo: si lo cancelo el conductor, avisar con el motivo.
          if (!d && lastTripId.current) {
            const gone = lastTripId.current;
            lastTripId.current = null;
            const t = await apiFetch<Trip>(`${API.trips}/trips/${gone}`).catch(() => null);
            if (t?.status === 5 && t.cancelledBy && t.cancelledBy !== 'passenger')
              setCancelledInfo({ by: t.cancelledBy, reason: t.cancelReason ?? null });
          }
          if (d) lastTripId.current = d.id;
          setTrip(d);
          if (d && d.status === 2 && d.driverArrivedAt && arrivedShownFor.current !== d.id) {
            arrivedShownFor.current = d.id;
            setArrivedOpen(true);
          }
          if (d && (d.status === 1 || d.status === 7)) {
            try {
              const props = await apiFetch<Proposal[]>(`${API.trips}/trips/${d.id}/proposals`);
              setProposals(props ?? []);
            } catch (_) { setProposals([]); }
          } else {
            setProposals([]);
          }
        })
        .catch(() => setError('No se pudo cargar el seguimiento.'))
        .finally(() => setLoading(false));
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);

  async function acceptProposal(proposalId: string, fare: number) {
    if (!trip) return;
    try {
      await apiFetch(`${API.trips}/trips/${trip.id}/accept-proposal/${proposalId}`, { method: 'PUT' });
      // FLUJO NUEVO: aceptar una propuesta ya NO asigna conductor automáticamente.
      // Solo marca la propuesta como 'accepted_by_passenger' en BD; el viaje
      // sigue en Pending/Negotiating hasta que el conductor confirme.
      // No tocamos el estado local: el próximo poll (3s) traerá el nuevo
      // estado de la propuesta y el banner amarillo aparecerá solo.
      setError(null);
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Error al aceptar propuesta.'); }
  }

  /**
   * Deshace la aceptación. La propuesta vuelve a 'pending' y se guarda
   * un registro inmutable en BD. El pasajero queda libre para aceptar otra.
   * Pide confirmación antes (es un cambio auditado).
   */
  async function cancelAcceptance(proposalId: string) {
    if (!trip) return;
    const ok = window.confirm(
      '¿Cambiar de opinión?\n\n' +
      'La propuesta volverá a estar pendiente y podrás aceptar otra. ' +
      'El conductor todavía podría confirmar si lo hace antes que aceptes a otro.');
    if (!ok) return;
    try {
      await apiFetch(`${API.trips}/trips/${trip.id}/cancel-acceptance/${proposalId}`, { method: 'PUT' });
      setError(null);
    } catch (err) { setError(err instanceof ApiError ? err.message : 'No se pudo cambiar de opinión.'); }
  }

  /**
   * Rechaza UNA propuesta específica (no todas).
   * La marca como 'rejected' en BD. El conductor ya no la verá activa.
   */
  async function rejectOne(proposalId: string) {
    if (!trip) return;
    try {
      await apiFetch(
        `${API.trips}/trips/${trip.id}/proposals/${proposalId}/reject`,
        { method: 'PUT' });
      setProposals(prev => prev.filter(p => p.id !== proposalId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al rechazar.');
    }
  }

  /**
   * Rechaza TODAS las propuestas pending del viaje en una sola llamada.
   * Cada conductor verá "el pasajero rechazó tu propuesta".
   */
  async function rejectAllProposals() {
    if (!trip) return;
    if (!confirm('¿Rechazar todas las propuestas? Los conductores recibirán el aviso.')) return;
    try {
      await apiFetch(
        `${API.trips}/trips/${trip.id}/proposals/reject-all`,
        { method: 'PUT' });
      setProposals(prev => prev.map(p =>
        p.status === 'pending'
          ? { ...p, status: 'rejected', rejectedBy: 'passenger' }
          : p));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al rechazar todas.');
    }
  }

  /**
   * Envía una contrapropuesta al conductor con un monto distinto.
   * El conductor la verá en su pantalla y podrá aceptar/rechazar/contraproponer.
   */
  async function counterPropose(driverId: string, fare: number) {
    if (!trip) return;
    if (fare <= 0) {
      setError('El monto debe ser mayor a 0.');
      return;
    }
    try {
      await apiFetch(`${API.trips}/trips/${trip.id}/counter`, {
        method: 'POST',
        body: JSON.stringify({ driverId, fare }),
      });
      // La nueva propuesta llegará en el próximo poll (intervalo 3s)
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al enviar contrapropuesta.');
    }
  }

  async function cancel() {
    if (!trip) return;
    try {
      lastTripId.current = null; // lo cancela el propio pasajero: sin aviso
      await apiFetch(`${API.trips}/trips/${trip.id}/cancel`, { method: 'PUT' });
      navigate('/app/pasajero/inicio');
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Error al cancelar.'); }
  }

  async function openHistory(driverId: string, driverName: string) {
    if (!trip) return;
    setHistoryDriver({ id: driverId, name: driverName });
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const list = await apiFetch<ProposalHistoryEntry[]>(
        `${API.trips}/trips/${trip.id}/proposals/history?driverId=${driverId}`);
      setHistoryEntries(list ?? []);
    } catch {
      setHistoryEntries([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  function closeHistory() {
    setHistoryOpen(false);
    setHistoryDriver(null);
    setHistoryEntries([]);
  }

  if (loading) return (
    <div className="d-flex justify-content-center py-5">
      <span className="spinner-border" />
    </div>
  );

  if (!trip) return (
    <>
      <PageHeader title="Seguimiento" subtitle="Estado de tu viaje en curso." icon="fa-solid fa-location-dot" />
      {cancelledInfo && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1060,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div className="bugie-card text-center" role="alertdialog" aria-labelledby="cancel-title" style={{ maxWidth: 380, width: '100%' }}>
            <div className="bugie-card-body p-4">
              <i className="fa-solid fa-circle-xmark fa-3x text-danger mb-3 d-block" />
              <h2 id="cancel-title" className="h5 fw-bold mb-2">
                {cancelledInfo.by === 'driver' ? 'Tu conductor canceló el viaje' : 'Bugie canceló tu viaje'}
              </h2>
              {cancelledInfo.reason && <p className="bugie-muted mb-2">Motivo: {cancelledInfo.reason}</p>}
              <p className="bugie-muted mb-3">Puedes solicitar otro viaje cuando quieras.</p>
              <div className="d-grid gap-2">
                <button className="btn btn-bugie text-white rounded-pill"
                        onClick={() => { setCancelledInfo(null); navigate('/app/pasajero/solicitar'); }}>
                  Solicitar otro viaje
                </button>
                <button className="btn btn-bugie-outline rounded-pill" onClick={() => setCancelledInfo(null)}>
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="bugie-card p-5 text-center">
        <div className="bugie-mini-icon mx-auto mb-3" style={{ width: 56, height: 56, fontSize: '1.5rem' }}>
          <i className="fa-solid fa-car-side" />
        </div>
        <div className="fw-semibold mb-2">No tienes viajes activos</div>
        <div className="small bugie-muted mb-4">Cuando solicites un viaje podrás ver el seguimiento aquí.</div>
        <button className="btn btn-bugie text-white rounded-pill px-4"
          onClick={() => navigate('/app/pasajero/solicitar')}>
          <i className="fa-solid fa-map-pin me-2" />Solicitar viaje
        </button>
      </div>
    </>
  );

  const msg        = STATUS_MSG[trip.status]   ?? 'Procesando…';
  const badgeColor = STATUS_COLOR[trip.status] ?? 'info';
  const hasCoords  = trip.originLat && trip.originLng && trip.destLat && trip.destLng;
  const sortedWp   = [...(trip.waypoints ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const wpCoords   = sortedWp.map(w => ({ lat: w.lat, lng: w.lng }));

  return (
    <>
      <PageHeader title="Seguimiento" subtitle={msg} icon="fa-solid fa-location-dot" />
      {error && <div className="alert alert-danger small mb-3">{error}</div>}

      {trip.status === 2 && trip.driverArrivedAt && (
        <div className="alert alert-success small d-flex align-items-center gap-2 mb-3">
          <i className="fa-solid fa-location-dot" />
          Tu conductor ya está en el punto de recojo (avisó a las{' '}
          {new Date(trip.driverArrivedAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}).
        </div>
      )}

      {/* Info del viaje */}
      <div className="bugie-card mb-3">
        <div className="bugie-card-header d-flex justify-content-between">
          <span>Estado</span>
          <span className={`badge rounded-pill text-bg-${badgeColor}`}>{msg}</span>
        </div>
        <div className="bugie-card-body">
          <div className="small mb-3">
            <div className="d-flex align-items-start gap-2 mb-1">
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#7C6AF7', display: 'inline-block', marginTop: 4, flexShrink: 0 }} />
              <span><span className="bugie-muted">Origen: </span><strong>{trip.originAddress}</strong></span>
            </div>
            {sortedWp.map((wp, i) => (
              <div key={wp.id} className="d-flex align-items-start gap-2 mb-1">
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b', display: 'inline-block', marginTop: 4, flexShrink: 0 }} />
                <span><span className="bugie-muted">Parada {i + 1}: </span><strong>{wp.address}</strong></span>
              </div>
            ))}
            <div className="d-flex align-items-start gap-2">
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#C060C0', display: 'inline-block', marginTop: 4, flexShrink: 0 }} />
              <span><span className="bugie-muted">Destino: </span><strong>{trip.destAddress}</strong></span>
            </div>
          </div>

          <div className="d-flex gap-3">
            <div className="bugie-kpi flex-grow-1" style={{ minHeight: 'auto', padding: '0.8rem' }}>
              <div className="label small">
                {trip.discountAmount ? 'Pagas' : 'Tarifa'}
              </div>
              <div className="value" style={{ fontSize: '1.3rem' }}>
                S/ {(trip.discountAmount
                      ? (trip.fareBeforeDiscount ?? trip.estimatedFare) - trip.discountAmount
                      : trip.estimatedFare).toFixed(2)}
              </div>
              {trip.discountAmount ? (
                <div className="small bugie-muted" style={{ textDecoration: 'line-through' }}>
                  S/ {(trip.fareBeforeDiscount ?? trip.estimatedFare).toFixed(2)}
                </div>
              ) : null}

              {/* Cupon: solo con el viaje aceptado o en curso. Antes no hay
                  precio que descontar; despues ya se cobro. */}
              {(trip.status === 2 || trip.status === 3) ? (
                trip.discountAmount ? (
                  <div className="small mt-2" style={{ color: '#0d6e4a' }}>
                    <i className="fa-solid fa-tag me-1" />
                    Cupón {trip.couponCode} · −S/ {trip.discountAmount.toFixed(2)}
                  </div>
                ) : (
                  <button type="button"
                          className="btn btn-sm btn-bugie-outline rounded-pill mt-2"
                          onClick={() => setCuponAbierto(true)}>
                    <i className="fa-solid fa-tag me-1" />Usar un cupón
                  </button>
                )
              ) : null}
            </div>
            <div className="bugie-kpi flex-grow-1" style={{ minHeight: 'auto', padding: '0.8rem' }}>
              <div className="label small">Conductor</div>
              <div className="fw-bold">
                {trip.driverId
                  ? <><i className="fa-solid fa-check text-success me-1" />Asignado</>
                  : 'Buscando…'}
              </div>
            </div>
            {sortedWp.length > 0 && (
              <div className="bugie-kpi flex-grow-1" style={{ minHeight: 'auto', padding: '0.8rem' }}>
                <div className="label small">Paradas</div>
                <div className="fw-bold">{sortedWp.length}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Propuestas de conductores */}
      {(() => {
        // Filtramos las ocultadas manualmente. Las pending nunca se ocultan
        // (porque "Rechazar" del pasajero ya las marca rejected y muestra feedback,
        // y la X solo aparece en cards rejected/declinadas).
        const visible = proposals.filter(p => !hiddenIds.has(p.id));
        if (visible.length === 0) return null;

        // ¿Hay alguna propuesta en estado 'accepted_by_passenger'?
        // Si sí: bloqueamos el botón "Aceptar" de TODAS las demás cards (ya
        // aceptó una, no puede aceptar otra) y mostramos un banner amarillo.
        const waiting = visible.find(p => p.status === 'accepted_by_passenger');
        const hasWaiting = !!waiting;

        return (
        <>
          {hasWaiting && (
            <div className="bugie-card mb-3" style={{
              border: '2px solid #f59e0b',
              background: 'rgba(245,158,11,0.08)',
            }}>
              <div className="bugie-card-body">
                <div className="d-flex gap-3 align-items-start">
                  <i className="fa-solid fa-hourglass-half"
                     style={{ color: '#f59e0b', fontSize: '1.4rem', marginTop: 2 }} />
                  <div className="flex-grow-1">
                    <div className="fw-bold mb-1" style={{ color: '#f59e0b' }}>
                      Esperando confirmación del conductor
                    </div>
                    <div className="small bugie-muted">
                      Aceptaste a <strong>{waiting!.driverName}</strong>.
                      En cuanto confirme, empieza el viaje.
                      Si tarda demasiado, puedes cambiar de opinión.
                    </div>
                  </div>
                </div>
                {/* Botón cambiar de opinión: vuelve la propuesta a pending
                    y queda registrado en BD. */}
                <button
                  type="button"
                  className="btn btn-outline-warning rounded-pill mt-3 w-100"
                  onClick={() => cancelAcceptance(waiting!.id)}>
                  <i className="fa-solid fa-rotate-left me-2" />
                  Cambiar de opinión
                </button>
              </div>
            </div>
          )}

        <div className="bugie-card mb-3">
          <div className="bugie-card-header">
            <i className="fa-solid fa-tag me-2 text-bugie-accent" />
            {visible.length} conductor{visible.length > 1 ? 'es proponen' : ' propone'} una tarifa
          </div>
          <div className="bugie-card-body d-flex flex-column gap-2">
            {visible.map(p => {
              const trendIcon = p.trend === 'down' ? 'fa-arrow-down'
                              : p.trend === 'up'   ? 'fa-arrow-up'
                                                   : null;
              const trendColor = p.trend === 'down' ? '#16a34a'
                               : p.trend === 'up'   ? '#dc2626'
                                                    : '#94a3b8';
              const trendLabel = p.trend === 'down' ? 'Bajó'
                               : p.trend === 'up'   ? 'Subió'
                                                    : null;
              const isMine     = p.proposedByRole === 'passenger';
              const isOpen     = counteringId === p.id;
              // Declinada por el conductor (lo que el pasajero ve después de que jacinto declina)
              const isDeclined = p.status === 'rejected' && p.rejectedBy === 'driver';
              // Esta propuesta es la que el pasajero ya aceptó (esperando confirm).
              // Se ve con borde amarillo y SIN botones (ya decidió).
              const isAcceptedByMe = p.status === 'accepted_by_passenger';
              return (
                <div key={p.id}
                  className={`p-3 rounded-3 position-relative ${isAcceptedByMe ? 'border border-warning' : isMine ? 'border border-warning border-opacity-50' : isDeclined ? 'border border-danger border-opacity-50' : ''}`}
                  style={{
                    background: isAcceptedByMe ? 'rgba(245,158,11,0.12)' : 'var(--bugie-bg-2)',
                    opacity: isDeclined ? 0.85 : 1,
                  }}>

                  {/* Chip "Aceptaste a este" cuando esta es la propuesta elegida */}
                  {isAcceptedByMe && (
                    <span className="badge mb-2" style={{
                      background: '#f59e0b', color: 'white', fontWeight: 600,
                    }}>
                      <i className="fa-solid fa-hourglass-half me-1" />
                      Esperando confirmación del conductor
                    </span>
                  )}

                  {/* Botón X para ocultar (solo si está declinada por el conductor) */}
                  {isDeclined && (
                    <button type="button"
                      className="btn-close position-absolute"
                      aria-label="Ocultar"
                      title="Ocultar esta propuesta"
                      style={{ top: 8, right: 8, fontSize: '0.7rem', filter: 'invert(0.7)' }}
                      onClick={() => setHiddenIds(prev => new Set(prev).add(p.id))}
                    />
                  )}

                  <div className="d-flex align-items-center gap-3 flex-wrap">

                    {/* Avatar */}
                    <div className={`d-flex align-items-center justify-content-center rounded-circle flex-shrink-0 ${isDeclined ? 'bg-danger bg-opacity-25' : isMine ? 'bg-warning bg-opacity-25' : 'bg-primary bg-opacity-25'}`}
                         style={{ width: 44, height: 44 }}>
                      <i className={`fa-solid fa-car-side ${isDeclined ? 'text-danger' : isMine ? 'text-warning' : 'text-primary'}`} />
                    </div>

                    {/* Info conductor */}
                    <div className="flex-grow-1" style={{ minWidth: 180 }}>
                      <div className="fw-semibold text-truncate">
                        {p.driverName}
                        {p.vehiclePlate && (
                          <span className="bugie-muted ms-2 small">· {p.vehiclePlate}</span>
                        )}
                      </div>
                      {(p.vehicleBrand || p.vehicleModel || p.vehicleColor) && (
                        <div className="small bugie-muted text-truncate">
                          {[p.vehicleBrand, p.vehicleModel, p.vehicleColor]
                            .filter(Boolean).join(' · ')}
                        </div>
                      )}
                      <div className="small bugie-muted">
                        {timeAgo(p.createdAt)}
                        {isMine && !isDeclined && (
                          <span className="ms-2 text-warning">· Esperando respuesta</span>
                        )}
                        {isDeclined && (
                          <span className="ms-2 text-danger fw-semibold">
                            <i className="fa-solid fa-ban me-1" />
                            El conductor declinó
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Precio + tendencia */}
                    <div className="text-end flex-shrink-0">
                      <div className={`fw-bold fs-4 lh-1 ${isDeclined ? 'text-danger text-decoration-line-through' : isMine ? 'text-warning' : 'text-primary'}`}>
                        S/ {p.fare.toFixed(2)}
                      </div>
                      {trendIcon && !isDeclined && (
                        <div className={`small mt-1 ${p.trend === 'down' ? 'text-success' : p.trend === 'up' ? 'text-danger' : 'text-secondary'}`}>
                          <i className={`fa-solid ${trendIcon} me-1`} />
                          {trendLabel}
                          {p.previousFare != null && (
                            <span className="ms-1 bugie-muted">
                              (antes S/ {p.previousFare.toFixed(2)})
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Acciones (solo si NO está declinada, NO es mi contrapropuesta vigente,
                      NO está abierto input, NO es la propuesta que YA acepté). */}
                  {!isMine && !isOpen && !isDeclined && !isAcceptedByMe && (
                    <div className="d-flex align-items-center justify-content-end gap-2 mt-3 flex-wrap">
                      <button type="button"
                        className="btn btn-sm btn-outline-secondary rounded-pill"
                        title="Ver propuestas anteriores"
                        onClick={() => openHistory(p.driverId, p.driverName)}>
                        <i className="fa-solid fa-clock-rotate-left" />
                      </button>

                      <button type="button"
                        className="btn btn-sm btn-outline-danger rounded-pill"
                        title="Rechazar"
                        disabled={hasWaiting}
                        onClick={() => rejectOne(p.id)}>
                        <i className="fa-solid fa-xmark" />
                      </button>

                      <button type="button"
                        className="btn btn-sm btn-bugie-outline rounded-pill"
                        disabled={hasWaiting}
                        onClick={() => {
                          setCounteringId(p.id);
                          setCounterFare(prev => ({ ...prev, [p.id]: p.fare.toFixed(2) }));
                        }}>
                        <i className="fa-solid fa-arrow-right-arrow-left me-1" />
                        Contraproponer
                      </button>

                      <button type="button"
                        className="btn btn-sm btn-success rounded-pill px-3"
                        disabled={hasWaiting}
                        title={hasWaiting ? 'Ya aceptaste otra propuesta. Espera la confirmación del conductor.' : ''}
                        onClick={() => acceptProposal(p.id, p.fare)}>
                        <i className="fa-solid fa-check me-2" />
                        {hasWaiting ? 'Esperando otro conductor' : `Aceptar S/ ${p.fare.toFixed(2)}`}
                      </button>
                    </div>
                  )}

                  {/* Input de contrapropuesta abierto */}
                  {isOpen && (
                    <div className="mt-3 p-3 rounded-3"
                         style={{ background: 'var(--bugie-surface)' }}>
                      <label className="form-label small bugie-muted mb-1">
                        Tu monto propuesto (S/)
                      </label>
                      <div className="input-group input-group-sm">
                        <span className="input-group-text">S/</span>
                        <input
                          type="number" min={1} step={0.5}
                          className="form-control"
                          value={counterFare[p.id] ?? ''}
                          onChange={e => setCounterFare(prev =>
                            ({ ...prev, [p.id]: e.target.value }))}
                          disabled={counterSending}
                        />
                        <button type="button"
                          className="btn btn-outline-secondary"
                          disabled={counterSending}
                          onClick={() => setCounteringId(null)}>
                          Cancelar
                        </button>
                        <button type="button"
                          className="btn btn-bugie text-white"
                          disabled={counterSending}
                          onClick={async () => {
                            const fare = parseFloat(counterFare[p.id] ?? '0');
                            if (isNaN(fare) || fare <= 0) {
                              setError('Ingresa un monto válido.');
                              return;
                            }
                            setCounterSending(true);
                            await counterPropose(p.driverId, fare);
                            setCounterSending(false);
                            setCounteringId(null);
                          }}>
                          {counterSending
                            ? <span className="spinner-border spinner-border-sm" />
                            : <><i className="fa-solid fa-paper-plane me-1" />Enviar</>}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Botón "Rechazar todas" — solo si hay 2+ propuestas pending */}
            {visible.filter(p => p.status === 'pending' && p.proposedByRole !== 'passenger').length > 1 && (
              <div className="text-center mt-2">
                <button type="button"
                  className="btn btn-sm btn-link text-danger"
                  onClick={rejectAllProposals}>
                  <i className="fa-solid fa-xmark me-1" />
                  Rechazar todas las propuestas
                </button>
              </div>
            )}
          </div>
        </div>
        </>
        );
      })()}

      {/* Mapa */}
      {hasCoords ? (
        <div className="bugie-card mb-3 p-2">
          <BugieMap
            height={340}
            showRoute
            origin={{ lat: trip.originLat, lng: trip.originLng }}
            destination={{ lat: trip.destLat, lng: trip.destLng }}
            waypoints={wpCoords}
          />
        </div>
      ) : (
        <div className="bugie-card mb-3 p-3 text-center bugie-muted small">
          <i className="fa-solid fa-map fa-2x mb-2 d-block" />Mapa no disponible.
        </div>
      )}

      {/* Cancelar */}
      {trip.status === 1 && (
        <button className="btn btn-outline-secondary rounded-pill w-100 mb-3" onClick={cancel}>
          <i className="fa-solid fa-xmark me-2" />Cancelar viaje
        </button>
      )}

      {/* SOS */}
      {[1, 2, 3].includes(trip.status) && (
        <div className="mt-2">
          <div className="small bugie-muted text-center mb-2">Solo en caso de emergencia real</div>
          <a className="btn btn-danger rounded-pill fw-bold w-100" href="/app/pasajero/sos">
            <i className="fa-solid fa-triangle-exclamation me-2" />SOS — Emergencia
          </a>
        </div>
      )}

      {/* Aviso: el conductor llego al punto de recojo */}
      {arrivedOpen && (
        <div
          className="modal-backdrop-bugie"
          onClick={() => setArrivedOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1060, padding: 16,
          }}>
          <div className="bugie-card text-center" onClick={e => e.stopPropagation()}
               role="alertdialog" aria-labelledby="arrived-title"
               style={{ maxWidth: 380, width: '100%' }}>
            <div className="bugie-card-body p-4">
              <i className="fa-solid fa-location-dot fa-3x text-success mb-3 d-block" />
              <h2 id="arrived-title" className="h5 fw-bold mb-2">Tu conductor llegó</h2>
              <p className="bugie-muted mb-3">Tu conductor ya está en el punto de recojo. Sal a su encuentro.</p>
              <button className="btn btn-bugie text-white rounded-pill w-100" onClick={() => setArrivedOpen(false)}>
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de histórico de propuestas (solo visual) */}
      {historyOpen && historyDriver && (
        <div
          className="modal-backdrop-bugie"
          onClick={closeHistory}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1050, padding: 16,
          }}>
          <div
            className="bugie-card"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 420, width: '100%', maxHeight: '80vh', overflowY: 'auto' }}>
            <div className="bugie-card-header d-flex justify-content-between align-items-center">
              <span>
                <i className="fa-solid fa-clock-rotate-left me-2" />
                Historial — {historyDriver.name}
              </span>
              <button className="btn btn-sm btn-link p-0" onClick={closeHistory}>
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <div className="bugie-card-body">
              <div className="small bugie-muted mb-2">
                Propuestas anteriores de este conductor para tu viaje. Solo visual.
              </div>
              {historyLoading ? (
                <div className="text-center py-3">
                  <span className="spinner-border spinner-border-sm" />
                </div>
              ) : historyEntries.length === 0 ? (
                <div className="text-center py-3 small bugie-muted">
                  No hay registros.
                </div>
              ) : (
                <div className="d-flex flex-column gap-2">
                  {historyEntries.map((h, idx) => {
                    const isCurrent = h.status === 'pending';
                    const labelMap: Record<string, string> = {
                      pending:    'Actual',
                      superseded: 'Modificada',
                      accepted:   'Aceptada',
                      rejected:   'Rechazada',
                    };
                    const colorMap: Record<string, string> = {
                      pending:    '#818cf8',
                      superseded: '#94a3b8',
                      accepted:   '#16a34a',
                      rejected:   '#dc2626',
                    };
                    return (
                      <div key={h.id}
                        className="d-flex justify-content-between align-items-center p-2"
                        style={{
                          background: 'var(--bugie-bg-2)',
                          borderRadius: 10,
                          opacity: isCurrent ? 1 : 0.75,
                        }}>
                        <div>
                          <div className="fw-bold" style={{ color: colorMap[h.status] }}>
                            S/ {h.fare.toFixed(2)}
                          </div>
                          <div className="small bugie-muted">{timeAgo(h.createdAt)}</div>
                        </div>
                        <span className="badge rounded-pill"
                          style={{ background: colorMap[h.status], color: '#fff' }}>
                          {labelMap[h.status] ?? h.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="small bugie-muted mt-3">
                <i className="fa-solid fa-circle-info me-1" />
                Solo puedes aceptar la propuesta vigente. Para volver a un precio anterior,
                pide al conductor que la envíe de nuevo.
              </div>
            </div>
          </div>
        </div>
      )}
      {cuponAbierto && trip ? (
        <ApplyCouponModal
          tripId={trip.id}
          fare={trip.fareBeforeDiscount ?? trip.proposedFare ?? trip.estimatedFare}
          onClose={() => setCuponAbierto(false)}
          onApplied={(r: CouponApplied) => {
            setCuponAbierto(false);
            // Se refleja de inmediato sin esperar al siguiente sondeo.
            setTrip(t => t ? {
              ...t,
              couponCode: r.code,
              discountAmount: r.discountAmount,
              fareBeforeDiscount: r.fareBeforeDiscount,
            } : t);
          }}
        />
      ) : null}

    </>
  );
}