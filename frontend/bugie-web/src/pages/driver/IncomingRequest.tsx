import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import BugieMap from '../../components/BugieMap';
import { API, apiFetch, ApiError } from '../../state/api';
import { getUser } from '../../state/session';

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
  createdAt: string;
  waypoints?: Waypoint[];
}

interface ProposalHistoryEntry {
  id: string;
  fare: number;
  status: 'pending' | 'superseded' | 'accepted' | 'rejected';
  createdAt: string;
  proposedByRole?: 'driver' | 'passenger';
}

type SortKey = 'newest' | 'oldest' | 'fareDesc' | 'fareAsc';

const PAY: Record<string, string> = { cash: 'Efectivo', yape: 'Yape', plin: 'Plin' };

const SORT_LABEL: Record<SortKey, string> = {
  newest:   'Más reciente',
  oldest:   'Más antigua',
  fareDesc: 'Mayor tarifa',
  fareAsc:  'Menor tarifa',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  return `hace ${hrs} h`;
}

export default function DriverIncomingRequest() {
  const navigate = useNavigate();
  const [trips,        setTrips]        = useState<Trip[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [acting,       setActing]       = useState<string | null>(null);
  const [error,        setError]        = useState<string | null>(null);
  const [proposing,    setProposing]    = useState<string | null>(null);
  const [proposedFare, setProposedFare] = useState<Record<string, string>>({});
  const [proposed,     setProposed]     = useState<Set<string>>(new Set());
  const [sortBy,       setSortBy]       = useState<SortKey>('newest');
  const [selectedId,   setSelectedId]   = useState<string | null>(null);

  // UserId del conductor logueado (para filtrar SUS propuestas en el historial)
  const myUserId = getUser()?.userId ?? '';

  // Estado del modal de historial de propuestas
  const [historyOpen,    setHistoryOpen]    = useState(false);
  const [historyTripId,  setHistoryTripId]  = useState<string | null>(null);
  const [historyEntries, setHistoryEntries] = useState<ProposalHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Mapa con info por viaje de lo que el conductor debe ver sobre propuestas:
  // - pending  + passenger              : contrapropuesta del pasajero esperando respuesta (banner naranja).
  // - pending  + driver                 : mi propia propuesta vigente esperando respuesta del pasajero (banner azul).
  // - accepted_by_passenger + driver    : el pasajero aceptó mi propuesta, espero MI confirmación (banner verde).
  // - rejected + driver                 : el pasajero rechazó mi última propuesta (banner rojo feedback).
  type CounterInfo = {
    id: string;
    fare: number;
    createdAt: string;
    status: 'pending' | 'rejected' | 'accepted_by_passenger';
    proposedByRole: 'driver' | 'passenger';
  };
  const [counters, setCounters] = useState<Record<string, CounterInfo>>({});

  // IDs de feedback rechazado que el conductor ocultó con la X (solo visual, no persiste).
  const [hiddenRejects, setHiddenRejects] = useState<Set<string>>(new Set());

  useEffect(() => {
    const load = () =>
      apiFetch<Trip[]>(`${API.trips}/trips/pending`)
        .then(async list => {
          setTrips(list ?? []);
          if ((list?.length ?? 0) > 0) {
            try {
              const params = list!.map(t => `tripIds=${t.id}`).join('&');
              const map = await apiFetch<Record<string, CounterInfo>>(
                `${API.trips}/trips/my-counter-proposals?${params}`);
              setCounters(map ?? {});
            } catch { setCounters({}); }
          } else {
            setCounters({});
          }
        })
        .catch(() => setError('No se pudieron cargar las solicitudes.'))
        .finally(() => setLoading(false));
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  // Lista ordenada según el criterio elegido
  const sorted = useMemo(() => {
    const arr = [...trips];
    switch (sortBy) {
      case 'newest':   arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt)); break;
      case 'oldest':   arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt)); break;
      case 'fareDesc': arr.sort((a, b) => b.estimatedFare - a.estimatedFare); break;
      case 'fareAsc':  arr.sort((a, b) => a.estimatedFare - b.estimatedFare); break;
    }
    return arr;
  }, [trips, sortBy]);

  // Solicitud principal: la seleccionada manualmente o la primera del orden
  const main = useMemo(() => {
    if (selectedId) {
      const found = sorted.find(t => t.id === selectedId);
      if (found) return found;
    }
    return sorted[0] ?? null;
  }, [sorted, selectedId]);

  const others = sorted.filter(t => t.id !== main?.id);

  // ¿Tengo alguna propuesta de algún viaje esperando MI confirmación?
  // Si sí, todos los demás botones (proponer, declinar) quedan bloqueados
  // en las OTRAS tarjetas. La tarjeta con la propuesta esperando muestra
  // el banner verde con botón "Confirmar y empezar viaje".
  const waitingTripId = useMemo(() => {
    const entry = Object.entries(counters).find(
      ([, c]) => c.status === 'accepted_by_passenger',
    );
    return entry?.[0] ?? null;
  }, [counters]);

  /**
   * El conductor declina el viaje completo. Marca en BD todas sus propuestas
   * pending (y las contrapropuestas del pasajero hacia él) como 'rejected'
   * con RejectedBy='driver'. El pasajero verá el feedback "Conductor declinó".
   * Luego oculta el viaje de la pantalla del conductor.
   */
  async function decline(id: string) {
    setActing(id); setError(null);
    try {
      await apiFetch(`${API.trips}/trips/${id}/decline-by-driver`, { method: 'PUT' });
      setTrips(prev => prev.filter(t => t.id !== id));
      if (selectedId === id) setSelectedId(null);
      // También limpiamos la contrapropuesta vigente (si la había)
      setCounters(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al declinar.');
    } finally {
      setActing(null);
    }
  }

  async function propose(id: string) {
    const fare = parseFloat(proposedFare[id] ?? '0');
    if (!fare || fare <= 0) { setError('Ingresa una tarifa válida.'); return; }
    setActing(id); setError(null);
    try {
      await apiFetch(`${API.trips}/trips/${id}/propose`, {
        method: 'PUT',
        body: JSON.stringify({ proposedFare: fare }),
      });
      setProposing(null);
      setProposed(prev => new Set(prev).add(id));
      setTimeout(async () => {
        const updated = await apiFetch<Trip[]>(`${API.trips}/trips/pending`).catch(() => []);
        setTrips(updated);
        setProposed(prev => { const s = new Set(prev); s.delete(id); return s; });
      }, 3000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al proponer tarifa.');
    } finally { setActing(null); }
  }

  /**
   * Confirma que el conductor acepta la propuesta que el pasajero ya aceptó.
   * Backend: PUT /api/trips/{tripId}/confirm-acceptance/{proposalId}
   * Al confirmar:
   *   - El viaje pasa a Accepted y queda asignado el conductor.
   *   - Mis OTRAS propuestas pending en OTROS viajes se rechazan automáticamente
   *     (driver_busy).
   *   - Navego a /app/conductor/viaje para empezar.
   */
  async function confirmAcceptance(tripId: string, proposalId: string) {
    setActing(tripId);
    setError(null);
    try {
      await apiFetch(`${API.trips}/trips/${tripId}/confirm-acceptance/${proposalId}`, {
        method: 'PUT',
      });
      navigate('/app/conductor/viaje');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo confirmar.');
    } finally { setActing(null); }
  }

  /**
   * Abre el modal con MIS propuestas (las que envié al pasajero) para este viaje.
   * Reutiliza el endpoint /proposals/history?driverId=X que ya existe.
   * Filtramos por mi propio userId para ver solo lo que YO mandé.
   */
  async function openHistory(tripId: string) {
    setHistoryTripId(tripId);
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const list = await apiFetch<ProposalHistoryEntry[]>(
        `${API.trips}/trips/${tripId}/proposals/history?driverId=${myUserId}`);
      setHistoryEntries(list ?? []);
    } catch {
      setHistoryEntries([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  function closeHistory() {
    setHistoryOpen(false);
    setHistoryTripId(null);
    setHistoryEntries([]);
  }

  if (loading) return (
    <div className="d-flex justify-content-center py-5">
      <span className="spinner-border" />
    </div>
  );

  return (
    <>
      <PageHeader title="Solicitudes" subtitle="Viajes pendientes. Se actualiza cada 10 segundos." icon="fa-solid fa-bell" />
      {error && <div className="alert alert-danger small mb-3">{error}</div>}

      {trips.length === 0 ? (
        <div className="bugie-card p-4 text-center bugie-muted">
          <div className="bugie-mini-icon mx-auto mb-3"><i className="fa-solid fa-magnifying-glass" /></div>
          <div className="fw-semibold mb-1">Sin solicitudes por ahora</div>
          <div className="small">Las nuevas solicitudes aparecen aquí automáticamente.</div>
        </div>
      ) : (
        <>
          {/* Barra de orden + contador */}
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
            <div className="small bugie-muted">
              <i className="fa-solid fa-bell me-1 text-bugie-accent" />
              {trips.length} solicitud{trips.length === 1 ? '' : 'es'} pendiente{trips.length === 1 ? '' : 's'}
            </div>
            <div className="d-flex align-items-center gap-2">
              <span className="small bugie-muted"><i className="fa-solid fa-arrow-down-wide-short me-1" />Ordenar:</span>
              <select
                className="form-select form-select-sm"
                style={{ width: 'auto' }}
                value={sortBy}
                onChange={e => setSortBy(e.target.value as SortKey)}
              >
                {(Object.keys(SORT_LABEL) as SortKey[]).map(k =>
                  <option key={k} value={k}>{SORT_LABEL[k]}</option>
                )}
              </select>
            </div>
          </div>

          {/* Solicitud principal */}
          {main && (() => {
            const t = main;
            const sortedWp = [...(t.waypoints ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
            const wpCoords = sortedWp.map(w => ({ lat: w.lat, lng: w.lng }));
            return (
              <div className="bugie-card mb-3">
                <div className="bugie-card-header d-flex justify-content-between align-items-center">
                  <span><i className="fa-solid fa-route me-2 text-bugie-accent" />Solicitud principal</span>
                  <div className="d-flex gap-2 align-items-center">
                    {proposed.has(t.id) && (
                      <span className="badge rounded-pill text-bg-success">
                        <i className="fa-solid fa-check me-1" />Propuesta enviada
                      </span>
                    )}
                    <span className="small bugie-muted">{timeAgo(t.createdAt)}</span>
                    <span className="bugie-chip">{PAY[t.paymentMethod] ?? t.paymentMethod}</span>
                  </div>
                </div>
                <div className="bugie-card-body">

                  {/* Ruta */}
                  <div className="small mb-3">
                    <div className="d-flex align-items-start gap-2 mb-1">
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#7C6AF7', display: 'inline-block', marginTop: 3, flexShrink: 0 }} />
                      <span><span className="bugie-muted">Origen: </span><strong>{t.originAddress}</strong></span>
                    </div>
                    {sortedWp.map((wp, i) => (
                      <div key={wp.id} className="d-flex align-items-start gap-2 mb-1">
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#f59e0b', display: 'inline-block', marginTop: 3, flexShrink: 0 }} />
                        <span><span className="bugie-muted">Parada {i + 1}: </span><strong>{wp.address}</strong></span>
                      </div>
                    ))}
                    <div className="d-flex align-items-start gap-2">
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#C060C0', display: 'inline-block', marginTop: 3, flexShrink: 0 }} />
                      <span><span className="bugie-muted">Destino: </span><strong>{t.destAddress}</strong></span>
                    </div>
                  </div>

                  {/* Mapa grande */}
                  {t.originLat && t.destLat && (
                    <div className="mb-3">
                      <BugieMap
                        height={420}
                        showRoute
                        origin={{ lat: t.originLat, lng: t.originLng }}
                        destination={{ lat: t.destLat, lng: t.destLng }}
                        waypoints={wpCoords}
                      />
                    </div>
                  )}

                  {/* Tarifa y acciones */}
                  <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
                    <div>
                      <div className="small bugie-muted">Tarifa del sistema</div>
                      <div className="fw-bold fs-5">S/ {t.estimatedFare.toFixed(2)}</div>
                      {sortedWp.length > 0 && (
                        <div className="small bugie-muted">{sortedWp.length} parada{sortedWp.length > 1 ? 's' : ''}</div>
                      )}
                    </div>
                    <div className="d-flex gap-2 flex-wrap">
                      {/* Si tengo otra propuesta esperando mi confirmación, no
                          puedo proponer ni declinar este viaje hasta confirmar.
                          La tarjeta con la propuesta waiting tiene su propio
                          botón verde (no se ve afectada por este bloqueo). */}
                      <button className="btn btn-bugie text-white rounded-pill px-3"
                        onClick={() => setProposing(proposing === t.id ? null : t.id)}
                        disabled={acting === t.id || (waitingTripId !== null && waitingTripId !== t.id)}
                        title={waitingTripId !== null && waitingTripId !== t.id
                          ? 'Bloqueado: tienes otra propuesta esperando tu confirmación.'
                          : ''}>
                        <i className="fa-solid fa-tag me-1" />Proponer precio
                      </button>
                      <button type="button"
                        className="btn btn-outline-secondary rounded-pill"
                        onClick={() => openHistory(t.id)}
                        disabled={acting === t.id}>
                        <i className="fa-solid fa-clock-rotate-left me-1" />Mi historial
                      </button>
                      <button className="btn btn-outline-secondary rounded-pill"
                        onClick={() => decline(t.id)}
                        disabled={acting === t.id || (waitingTripId !== null && waitingTripId !== t.id)}>
                        <i className="fa-solid fa-xmark me-1" />Declinar
                      </button>
                    </div>
                  </div>

                  {/* Panel propuesta */}
                  {proposing === t.id && (
                    <div className="bugie-card p-3 mt-2" style={{ background: 'var(--bugie-bg-2)' }}>
                      <div className="small fw-semibold mb-2">
                        <i className="fa-solid fa-tag me-1 text-bugie-accent" />
                        Proponer tarifa al pasajero
                      </div>
                      <div className="d-flex gap-2 align-items-center">
                        <div className="input-group">
                          <span className="input-group-text">S/</span>
                          <input type="number" className="form-control"
                            placeholder={t.estimatedFare.toFixed(2)}
                            min="1" step="0.50"
                            value={proposedFare[t.id] ?? ''}
                            onChange={e => setProposedFare(p => ({ ...p, [t.id]: e.target.value }))} />
                        </div>
                        <button className="btn btn-bugie text-white rounded-pill px-3"
                          onClick={() => propose(t.id)} disabled={acting === t.id}>
                          Enviar
                        </button>
                        <button className="btn btn-outline-secondary rounded-pill"
                          onClick={() => setProposing(null)}>
                          Cancelar
                        </button>
                      </div>
                      <div className="small bugie-muted mt-2">
                        El pasajero verá tu propuesta y podrá aceptarla o rechazarla.
                      </div>
                    </div>
                  )}

                  {/* Banner según estado de la negociación con el pasajero.
                      3 casos posibles, mutuamente exclusivos (el backend ya garantiza prioridad):
                        a) Naranja: contrapropuesta del pasajero esperando MI respuesta.
                        b) Azul:    MI propuesta vigente, esperando respuesta del pasajero.
                        c) Rojo:    feedback "el pasajero rechazó mi propuesta" (oculto si toqué X).
                  */}
                  {counters[t.id] && (() => {
                    const c = counters[t.id];
                    const isCounterFromPassenger = c.status === 'pending' && c.proposedByRole === 'passenger';
                    const isMyPending            = c.status === 'pending' && c.proposedByRole === 'driver';
                    const isRejected             = c.status === 'rejected';
                    // Nuevo: el pasajero ya aceptó mi propuesta y espera mi
                    // confirmación. Banner verde con botón grande.
                    const isWaitingMyConfirm     = c.status === 'accepted_by_passenger';

                    // Si es rejected y el conductor ya lo ocultó, no mostrar.
                    if (isRejected && hiddenRejects.has(c.id)) return null;

                    // Estilos por estado
                    const borderClass =
                      isWaitingMyConfirm       ? 'border-success'
                      : isCounterFromPassenger ? 'border-warning border-opacity-50'
                      : isMyPending            ? 'border-primary border-opacity-50'
                                               : 'border-danger border-opacity-50';
                    const bgColor =
                      isWaitingMyConfirm       ? 'rgba(40,167,69,0.10)'
                      : isCounterFromPassenger ? 'rgba(245,158,11,0.08)'
                      : isMyPending            ? 'rgba(124,106,247,0.08)'
                                               : 'rgba(220,53,69,0.08)';

                    return (
                      <div className={`mt-3 p-3 rounded-3 position-relative border ${borderClass}`}
                           style={{
                             background: bgColor,
                             borderWidth: isWaitingMyConfirm ? 2 : 1,
                           }}>

                        {/* X para ocultar (solo en rejected) */}
                        {isRejected && (
                          <button type="button"
                            className="btn-close position-absolute"
                            aria-label="Ocultar"
                            title="Ocultar este aviso"
                            style={{ top: 8, right: 8, fontSize: '0.7rem', filter: 'invert(0.7)' }}
                            onClick={() => setHiddenRejects(prev => new Set(prev).add(c.id))}
                          />
                        )}

                        {/* Badge título + tiempo */}
                        <div className="d-flex align-items-center justify-content-between gap-2 mb-2 flex-wrap">
                          {isWaitingMyConfirm && (
                            <span className="badge rounded-pill text-bg-success">
                              <i className="fa-solid fa-circle-check me-1" />
                              ¡El pasajero aceptó tu propuesta!
                            </span>
                          )}
                          {isCounterFromPassenger && (
                            <span className="badge rounded-pill text-bg-warning">
                              <i className="fa-solid fa-arrow-right-arrow-left me-1" />
                              Contrapropuesta del pasajero
                            </span>
                          )}
                          {isMyPending && (
                            <span className="badge rounded-pill text-bg-primary">
                              <i className="fa-solid fa-hourglass-half me-1" />
                              Esperando respuesta del pasajero
                            </span>
                          )}
                          {isRejected && (
                            <span className="badge rounded-pill text-bg-danger">
                              <i className="fa-solid fa-ban me-1" />
                              El pasajero rechazó tu propuesta
                            </span>
                          )}
                          <span className="small bugie-muted">
                            {timeAgo(c.createdAt)}
                          </span>
                        </div>

                        {/* Monto */}
                        <div className="d-flex align-items-baseline gap-2 mb-2">
                          <span className="small bugie-muted">
                            {isWaitingMyConfirm       && 'Tarifa pactada:'}
                            {isCounterFromPassenger   && 'El pasajero propone:'}
                            {isMyPending              && 'Tu propuesta vigente:'}
                            {isRejected               && 'Tu propuesta rechazada:'}
                          </span>
                          <span className={`fw-bold fs-3 lh-1 ${
                            isWaitingMyConfirm       ? 'text-success'
                            : isCounterFromPassenger ? 'text-warning'
                            : isMyPending            ? 'text-primary'
                                                     : 'text-danger text-decoration-line-through'
                          }`}>
                            S/ {c.fare.toFixed(2)}
                          </span>
                        </div>

                        {/* Texto de ayuda + botón confirmar (solo para isWaitingMyConfirm) */}
                        {isWaitingMyConfirm && (
                          <>
                            <div className="small bugie-muted mb-3">
                              Confirma para empezar el viaje. Al confirmar, tus
                              demás propuestas pendientes en otros viajes se
                              rechazarán automáticamente.
                            </div>
                            <button type="button"
                              className="btn btn-success w-100 fw-bold"
                              disabled={acting === t.id}
                              onClick={() => confirmAcceptance(t.id, c.id)}>
                              {acting === t.id
                                ? <span className="spinner-border spinner-border-sm me-2" />
                                : <i className="fa-solid fa-play me-2" />}
                              Confirmar y empezar viaje
                            </button>
                          </>
                        )}

                        {isCounterFromPassenger && (
                          <div className="small bugie-muted">
                            Si te conviene, usa <strong>"Proponer precio"</strong> arriba
                            con el mismo monto S/ {c.fare.toFixed(2)} para
                            responder al pasajero. Si no, propón otro monto o declina.
                          </div>
                        )}

                        {isMyPending && (
                          <div className="small bugie-muted">
                            El pasajero está revisando tu propuesta. Puedes modificarla
                            enviando otra con <strong>"Proponer precio"</strong>.
                          </div>
                        )}

                        {isRejected && (
                          <div className="small bugie-muted">
                            Puedes enviar otra propuesta usando <strong>"Proponer precio"</strong>
                            o esperar. También puedes cerrar este aviso con la X.
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })()}

          {/* Lista compacta de las demás */}
          {others.length > 0 && (
            <div className="bugie-card">
              <div className="bugie-card-header d-flex justify-content-between align-items-center">
                <span><i className="fa-solid fa-list me-2 text-bugie-accent" />Otras solicitudes ({others.length})</span>
                <span className="small bugie-muted">Toca para ver el detalle</span>
              </div>
              <div className="bugie-card-body p-0">
                <div className="d-flex flex-column">
                  {others.map((t, idx) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      className="d-flex justify-content-between align-items-center w-100 text-start p-3"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        borderTop: idx === 0 ? 'none' : '1px solid var(--bugie-border, rgba(255,255,255,0.08))',
                        cursor: 'pointer',
                      }}
                    >
                      <div className="d-flex flex-column" style={{ minWidth: 0, flex: 1 }}>
                        <div className="d-flex align-items-center gap-2 mb-1">
                          {counters[t.id] && counters[t.id].status === 'accepted_by_passenger' && (
                            <span className="badge rounded-pill text-bg-success" style={{
                              fontSize: '0.62rem', padding: '0.18rem 0.5rem',
                            }}>
                              <i className="fa-solid fa-circle-check me-1" style={{ fontSize: '0.6rem' }} />
                              Pasajero aceptó — confirma
                            </span>
                          )}
                          {counters[t.id] && counters[t.id].status === 'pending'
                                          && counters[t.id].proposedByRole === 'passenger' && (
                            <span className="badge rounded-pill text-bg-warning" style={{
                              fontSize: '0.62rem', padding: '0.18rem 0.5rem',
                            }}>
                              <i className="fa-solid fa-arrow-right-arrow-left me-1" style={{ fontSize: '0.6rem' }} />
                              Contrapropuesta S/ {counters[t.id].fare.toFixed(2)}
                            </span>
                          )}
                          {counters[t.id] && counters[t.id].status === 'pending'
                                          && counters[t.id].proposedByRole === 'driver' && (
                            <span className="badge rounded-pill text-bg-primary" style={{
                              fontSize: '0.62rem', padding: '0.18rem 0.5rem',
                            }}>
                              <i className="fa-solid fa-hourglass-half me-1" style={{ fontSize: '0.6rem' }} />
                              Tu propuesta S/ {counters[t.id].fare.toFixed(2)}
                            </span>
                          )}
                          {counters[t.id] && counters[t.id].status === 'rejected' &&
                           !hiddenRejects.has(counters[t.id].id) && (
                            <span className="badge rounded-pill text-bg-danger" style={{
                              fontSize: '0.62rem', padding: '0.18rem 0.5rem',
                            }}>
                              <i className="fa-solid fa-ban me-1" style={{ fontSize: '0.6rem' }} />
                              Pasajero rechazó
                            </span>
                          )}
                        </div>
                        <div className="small d-flex align-items-center gap-2 mb-1" style={{ minWidth: 0 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#7C6AF7', flexShrink: 0 }} />
                          <span className="text-truncate" style={{ minWidth: 0 }}>{t.originAddress}</span>
                        </div>
                        <div className="small d-flex align-items-center gap-2" style={{ minWidth: 0 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#C060C0', flexShrink: 0 }} />
                          <span className="text-truncate" style={{ minWidth: 0 }}>{t.destAddress}</span>
                        </div>
                      </div>
                      <div className="text-end ms-3" style={{ flexShrink: 0 }}>
                        <div className="fw-bold">S/ {t.estimatedFare.toFixed(2)}</div>
                        <div className="small bugie-muted">{timeAgo(t.createdAt)}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal: historial de mis propuestas para este viaje */}
      {historyOpen && historyTripId && (
        <div
          onClick={closeHistory}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1050, padding: 16,
          }}>
          <div
            className="bugie-card"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 440, width: '100%', maxHeight: '80vh', overflowY: 'auto' }}>

            <div className="bugie-card-header d-flex justify-content-between align-items-center">
              <span>
                <i className="fa-solid fa-clock-rotate-left me-2" />
                Mi historial de propuestas
              </span>
              <button type="button" className="btn btn-sm btn-link p-0" onClick={closeHistory}>
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <div className="bugie-card-body">
              <div className="small bugie-muted mb-3">
                Todas las propuestas enviadas en esta negociación. Solo visual.
              </div>

              {historyLoading ? (
                <div className="text-center py-3">
                  <span className="spinner-border spinner-border-sm" />
                </div>
              ) : historyEntries.length === 0 ? (
                <div className="text-center py-3 small bugie-muted">
                  Aún no has enviado propuestas.
                </div>
              ) : (
                <div className="d-flex flex-column gap-2">
                  {historyEntries.map(h => {
                    const labelMap: Record<string, string> = {
                      pending:    'Vigente',
                      superseded: 'Modificada',
                      accepted:   'Aceptada',
                      rejected:   'Rechazada',
                    };
                    const badgeClass: Record<string, string> = {
                      pending:    'text-bg-primary',
                      superseded: 'text-bg-secondary',
                      accepted:   'text-bg-success',
                      rejected:   'text-bg-danger',
                    };
                    const isCounter = h.proposedByRole === 'passenger';
                    return (
                      <div key={h.id}
                        className="d-flex justify-content-between align-items-center p-2 rounded-3"
                        style={{
                          background: 'var(--bugie-bg-2)',
                          opacity: h.status === 'pending' ? 1 : 0.75,
                        }}>
                        <div>
                          <div className="fw-bold fs-5">
                            S/ {h.fare.toFixed(2)}
                          </div>
                          <div className="small bugie-muted">
                            {isCounter && (
                              <span className="text-warning me-2">
                                <i className="fa-solid fa-arrow-right-arrow-left me-1" />
                                Contrapropuesta del pasajero
                              </span>
                            )}
                            {timeAgo(h.createdAt)}
                          </div>
                        </div>
                        <span className={`badge rounded-pill ${badgeClass[h.status] ?? 'text-bg-secondary'}`}>
                          {labelMap[h.status] ?? h.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="small bugie-muted mt-3">
                <i className="fa-solid fa-circle-info me-1" />
                "Modificada" significa que enviaste una nueva propuesta después de ella.
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}