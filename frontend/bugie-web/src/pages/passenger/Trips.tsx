import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import PageHeader from '../../components/PageHeader';
import { API, apiFetch } from '../../state/api';

interface EnrichedTrip {
  id: string;
  passengerId: string;
  driverId: string | null;
  originAddress: string;
  originLat: number; originLng: number;
  destAddress: string;
  destLat: number; destLng: number;
  estimatedFare: number;
  finalFare: number | null;
  paymentMethod: string;
  status: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  driverFullName:     string | null;
  driverPhotoUrl:     string | null;
  driverRating:       number | null;
  driverTotalRatings: number | null;
  vehiclePlate:    string | null;
  vehicleBrand:    string | null;
  vehicleModel:    string | null;
  vehicleColor:    string | null;
  vehicleYear:     number | null;
  vehiclePhotoUrl: string | null;
  category: 'city_ride' | 'delivery';
}

interface Incident {
  id: string;
  tripId: string;
  reportedByUserId: string;
  reportedByRole: string;
  description: string;
  createdAt: string;
  reportedByName?: string | null;
}

interface Rating {
  id: string;
  tripId: string;
  passengerId: string;
  passengerName: string;
  driverId: string;
  stars: number;
  comment: string | null;
  createdAt: string;
}

const STATUS_INFO: Record<number, { label: string; color: string }> = {
  1: { label: 'Pendiente',  color: '#f59e0b' },
  2: { label: 'Aceptado',   color: '#38bdf8' },
  3: { label: 'En curso',   color: '#818cf8' },
  4: { label: 'Completado', color: '#34d399' },
  5: { label: 'Cancelado',  color: '#94a3b8' },
  6: { label: 'SOS',        color: '#f87171' },
};

const PAY_LABEL: Record<string, string> = {
  cash: 'Efectivo', yape: 'Yape', plin: 'Plin',
};

type Filter = 'all' | 'city_ride' | 'delivery';

function groupByDay(trips: EnrichedTrip[]): { day: string; date: Date; trips: EnrichedTrip[] }[] {
  const map = new Map<string, { date: Date; trips: EnrichedTrip[] }>();
  trips.forEach(t => {
    const d = new Date(t.createdAt);
    // Dia de la fecha tal como la manda el backend (hora de Peru), no en UTC.
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!map.has(key)) map.set(key, { date: d, trips: [] });
    map.get(key)!.trips.push(t);
  });
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([, v]) => ({
      day: v.date.toLocaleDateString('es-PE', { day: 'numeric', month: 'long' }),
      date: v.date,
      trips: v.trips.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    }));
}

export default function PassengerTrips() {
  const [trips,     setTrips]     = useState<EnrichedTrip[]>([]);
  const [myReports, setMyReports] = useState<Record<string, Incident | null>>({});
  const [myRatings, setMyRatings] = useState<Record<string, Rating | null>>({});
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [filter,    setFilter]    = useState<Filter>('all');
  const [selected,  setSelected]  = useState<EnrichedTrip | null>(null);
  const [reportingTrip, setReportingTrip] = useState<EnrichedTrip | null>(null);
  const [ratingTrip,    setRatingTrip]    = useState<EnrichedTrip | null>(null);

  useEffect(() => {
    apiFetch<EnrichedTrip[]>(`${API.trips}/trips/history/enriched`)
      .then(async list => {
        setTrips(list);

        // Pedir mis incidencias por viaje en una sola llamada
        if (list.length > 0) {
          const params = list.map(t => `ids=${t.id}`).join('&');
          try {
            const map = await apiFetch<Record<string, Incident | null>>(
              `${API.trips}/trips/incidents/me/by-trips?${params}`);
            setMyReports(map ?? {});
          } catch {
            // Si falla, los botones se mostrarán como "Reportar"
          }

          // Cargar ratings en una sola llamada batch (en lugar de N requests).
          // Solo nos importan los viajes completados (status 4) — el endpoint
          // batch igual acepta cualquier id y devuelve solo los que tienen rating.
          const completedIds = list.filter(t => t.status === 4).map(t => t.id);
          if (completedIds.length > 0) {
            try {
              const qs = completedIds.map(id => `ids=${id}`).join('&');
              const map = await apiFetch<Record<string, Rating>>(
                `${API.trips}/trips/ratings/me/by-trips?${qs}`);
              // El backend solo devuelve los que tienen rating; rellenamos los
              // demás con null para que el lookup [tripId] sea uniforme.
              const ratingMap: Record<string, Rating | null> = {};
              for (const id of completedIds) ratingMap[id] = map?.[id] ?? null;
              setMyRatings(ratingMap);
            } catch {
              // Si falla, los botones se mostrarán como "Calificar"
            }
          }
        }
      })
      .catch(() => setError('No se pudo cargar el historial.'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'all')      return trips;
    if (filter === 'delivery') return [];
    return trips.filter(t => t.category === filter);
  }, [trips, filter]);

  const grouped = useMemo(() => groupByDay(filtered), [filtered]);

  function handleReported(tripId: string, incident: Incident) {
    setMyReports(prev => ({ ...prev, [tripId]: incident }));
    setReportingTrip(null);
  }

  function handleRated(tripId: string, rating: Rating) {
    setMyRatings(prev => ({ ...prev, [tripId]: rating }));
    setRatingTrip(null);
  }

  return (
    <>
      <PageHeader
        title="Mis viajes"
        subtitle="Historial de tus viajes realizados."
        icon="fa-solid fa-clock-rotate-left"
      />
      {error && <div className="alert alert-danger small mb-3">{error}</div>}

      {/* Filtros */}
      <div className="d-flex gap-2 mb-4 flex-wrap">
        <FilterPill active={filter === 'all'}       icon="fa-bars" label="Todos"
                    onClick={() => setFilter('all')} />
        <FilterPill active={filter === 'city_ride'} icon="fa-car"  label="Viajes en ciudad"
                    onClick={() => setFilter('city_ride')} />
        <FilterPill active={filter === 'delivery'}  icon="fa-box"  label="Delivery"
                    comingSoon onClick={() => setFilter('delivery')} />
      </div>

      {loading ? (
        <div className="d-flex justify-content-center py-5">
          <span className="spinner-border" />
        </div>
      ) : filter === 'delivery' ? (
        <EmptyState icon="fa-box" title="Delivery próximamente"
          subtitle="Esta funcionalidad aún no está disponible." />
      ) : grouped.length === 0 ? (
        <EmptyState icon="fa-route" title="Sin viajes aún"
          subtitle="Tus viajes aparecerán aquí una vez que los realices." />
      ) : (
        <div className="d-flex flex-column gap-4">
          {grouped.map(g => (
            <div key={g.date.toISOString()}>
              <div className="fw-bold mb-2" style={{ fontSize: '1.05rem' }}>{g.day}</div>
              <div className="d-flex flex-column gap-2">
                {g.trips.map(t => (
                  <TripRow
                    key={t.id}
                    trip={t}
                    hasMyIncident={!!myReports[t.id]}
                    onClick={() => setSelected(t)}
                    onReport={() => setReportingTrip(t)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de detalle */}
      {selected && (
        <TripDetailModal
          trip={selected}
          myIncident={myReports[selected.id] ?? null}
          myRating={myRatings[selected.id] ?? null}
          onClose={() => setSelected(null)}
          onReport={() => { setSelected(null); setReportingTrip(selected); }}
          onRate={() => { setSelected(null); setRatingTrip(selected); }}
        />
      )}

      {/* Modal de reporte */}
      {reportingTrip && (
        <ReportIncidentModal
          trip={reportingTrip}
          existing={myReports[reportingTrip.id] ?? null}
          onClose={() => setReportingTrip(null)}
          onSaved={inc => handleReported(reportingTrip.id, inc)}
        />
      )}

      {/* Modal de calificación */}
      {ratingTrip && (
        <RateTripModal
          trip={ratingTrip}
          onClose={() => setRatingTrip(null)}
          onSaved={r => handleRated(ratingTrip.id, r)}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
function FilterPill({ active, icon, label, onClick, comingSoon }: {
  active: boolean; icon: string; label: string;
  onClick: () => void; comingSoon?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="btn btn-sm d-inline-flex align-items-center gap-2 rounded-pill px-3"
      style={{
        background: active ? 'var(--bugie-text)' : 'transparent',
        color:      active ? 'var(--bugie-bg)'   : 'var(--bugie-text)',
        border:     active ? '1px solid var(--bugie-text)' : '1px solid var(--bugie-border)',
        opacity:    comingSoon ? 0.7 : 1,
      }}
    >
      <i className={`fa-solid ${icon}`} style={{ fontSize: '0.85rem' }} />
      <span className="fw-semibold small">{label}</span>
      {comingSoon && (
        <span className="badge rounded-pill" style={{
          background: '#f59e0b22', color: '#f59e0b',
          fontSize: '0.62rem', padding: '0.15rem 0.45rem',
        }}>Pronto</span>
      )}
    </button>
  );
}

function TripRow({ trip, hasMyIncident, onClick, onReport }: {
  trip: EnrichedTrip;
  hasMyIncident: boolean;
  onClick: () => void;
  onReport: () => void;
}) {
  const time = new Date(trip.createdAt).toLocaleTimeString('es-PE',
    { hour: '2-digit', minute: '2-digit' });
  const fare = trip.finalFare ?? trip.estimatedFare;

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      className="d-flex align-items-center gap-3 p-3"
      style={{
        background: 'var(--bugie-surface)',
        border: '1px solid var(--bugie-border)',
        borderRadius: 12,
        cursor: 'pointer',
      }}
    >
      {/* Icono del modo */}
      <div className="flex-shrink-0 d-flex align-items-center justify-content-center"
           style={{
             width: 48, height: 48, borderRadius: 12,
             background: 'var(--bugie-bg)', color: 'var(--bugie-text)',
           }}>
        <i className={`fa-solid ${trip.category === 'delivery' ? 'fa-box' : 'fa-car'}`} />
      </div>

      {/* Trayecto */}
      <div className="flex-grow-1 min-w-0">
        <div className="small bugie-muted text-truncate" style={{ fontSize: '0.75rem' }}>
          {trip.originAddress}
        </div>
        <div className="fw-semibold text-truncate">{trip.destAddress}</div>
        <div className="small bugie-muted" style={{ fontSize: '0.75rem' }}>{time}</div>
      </div>

      {/* Lado derecho: precio + botón */}
      <div className="d-flex flex-column align-items-end gap-2 flex-shrink-0">
        <div className="fw-bold">S/ {fare.toFixed(2)}</div>
        <button
          onClick={e => { e.stopPropagation(); onReport(); }}
          className="btn btn-sm rounded-pill d-inline-flex align-items-center gap-1"
          style={{
            background: hasMyIncident ? '#f5970022' : 'transparent',
            color:      hasMyIncident ? '#f59700'   : 'var(--bugie-muted)',
            border:     `1px solid ${hasMyIncident ? '#f5970055' : 'var(--bugie-border)'}`,
            fontSize:   '0.7rem',
            padding:    '0.2rem 0.6rem',
            whiteSpace: 'nowrap',
          }}
          title={hasMyIncident ? 'Ver mi incidencia' : 'Reportar incidencia'}
        >
          <i className={`fa-solid ${hasMyIncident ? 'fa-triangle-exclamation' : 'fa-flag'}`}
             style={{ fontSize: '0.65rem' }} />
          {hasMyIncident ? 'Ver incidencia' : 'Reportar'}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Modal de detalle (z-index 9999 para que esté sobre el header)
// ─────────────────────────────────────────────────────────────────────
function TripDetailModal({ trip, myIncident, myRating, onClose, onReport, onRate }: {
  trip: EnrichedTrip;
  myIncident: Incident | null;
  myRating: Rating | null;
  onClose: () => void;
  onReport: () => void;
  onRate: () => void;
}) {
  const status = STATUS_INFO[trip.status] ?? { label: '?', color: '#94a3b8' };
  const fare   = trip.finalFare ?? trip.estimatedFare;
  const date   = new Date(trip.createdAt);
  const startedAt   = trip.startedAt   ? new Date(trip.startedAt) : null;
  const completedAt = trip.completedAt ? new Date(trip.completedAt) : null;

  const durationMin = (startedAt && completedAt)
    ? Math.round((completedAt.getTime() - startedAt.getTime()) / 60000)
    : null;

  const distanceKm = haversineKm(trip.originLat, trip.originLng, trip.destLat, trip.destLng);

  const fullDate = date.toLocaleDateString('es-PE',
    { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  const fullTime = date.toLocaleTimeString('es-PE',
    { hour: '2-digit', minute: '2-digit' });

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 99999, padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(480px, 100%)', maxHeight: '90vh',
          background: 'var(--bugie-surface)',
          borderRadius: 16,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <div className="d-flex align-items-center justify-content-between p-3 border-bottom"
             style={{ borderColor: 'var(--bugie-border)' }}>
          <div>
            <div className="fw-bold">{fullDate}</div>
            <div className="small bugie-muted">{fullTime}</div>
          </div>
          <button onClick={onClose} className="btn btn-sm btn-bugie-outline rounded-pill">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: '1rem' }}>

          {/* Foto del vehículo */}
          <div className="mb-3" style={{
            borderRadius: 12, overflow: 'hidden',
            background: 'var(--bugie-bg-2)',
            aspectRatio: '16/9',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {trip.vehiclePhotoUrl ? (
              <img src={trip.vehiclePhotoUrl} alt="Vehículo"
                   style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div className="text-center bugie-muted">
                <i className="fa-solid fa-car fa-2x mb-2 d-block" />
                <div className="small">Sin foto del vehículo</div>
              </div>
            )}
          </div>

          <div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
            <div className="fw-bold fs-5">
              {trip.category === 'delivery' ? 'Delivery' : 'Viaje en ciudad'}
            </div>
            <span className="badge rounded-pill" style={{
              background: status.color + '22', color: status.color, fontSize: '0.72rem',
            }}>{status.label}</span>
          </div>

          <div className="mb-3 d-flex flex-column gap-2">
            <RouteRow icon="fa-location-dot" label={trip.originAddress}
              time={fullTime} color="#7C6AF7" />
            <RouteRow icon="fa-flag-checkered" label={trip.destAddress}
              time={completedAt
                ? completedAt.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
                : '—'}
              color="#C060C0" />
          </div>

          <div className="row g-2 mb-3">
            <div className="col-6">
              <div className="p-3" style={{ background: 'var(--bugie-bg-2)', borderRadius: 12 }}>
                <div className="small bugie-muted"><i className="fa-solid fa-clock me-1" />Duración</div>
                <div className="fw-bold">{durationMin !== null ? `${durationMin} min` : '—'}</div>
              </div>
            </div>
            <div className="col-6">
              <div className="p-3" style={{ background: 'var(--bugie-bg-2)', borderRadius: 12 }}>
                <div className="small bugie-muted"><i className="fa-solid fa-route me-1" />Distancia</div>
                <div className="fw-bold">{distanceKm.toFixed(1)} km</div>
              </div>
            </div>
          </div>

          {/* Conductor */}
          {trip.driverId && (
            <div className="p-3 mb-3 d-flex align-items-center gap-3"
                 style={{ background: 'var(--bugie-bg-2)', borderRadius: 12 }}>
              <div className="flex-shrink-0" style={{
                width: 48, height: 48, borderRadius: '50%', overflow: 'hidden',
                background: 'var(--bugie-surface)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {trip.driverPhotoUrl ? (
                  <img src={trip.driverPhotoUrl} alt=""
                       style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <i className="fa-solid fa-user bugie-muted" />
                )}
              </div>
              <div className="flex-grow-1 min-w-0">
                <div className="fw-semibold text-truncate">
                  {trip.driverFullName ?? 'Conductor'}
                </div>
                <div className="small bugie-muted text-truncate">
                  {[trip.vehicleColor, trip.vehicleBrand, trip.vehicleModel]
                    .filter(Boolean).join(' ')}
                  {trip.vehiclePlate && (
                    <span className="ms-2 fw-semibold">{trip.vehiclePlate}</span>
                  )}
                </div>
                {trip.driverRating !== null && (
                  <div className="small d-flex align-items-center gap-1">
                    <i className="fa-solid fa-star" style={{ color: '#f59e0b', fontSize: '0.75rem' }} />
                    <span className="fw-semibold">{trip.driverRating.toFixed(1)}</span>
                    <span className="bugie-muted">({trip.driverTotalRatings ?? 0})</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Pago */}
          <div className="p-3 mb-3" style={{ background: 'var(--bugie-bg-2)', borderRadius: 12 }}>
            <div className="d-flex justify-content-between mb-1">
              <span className="bugie-muted">Tarifa</span>
              <span className="fw-semibold">S/ {trip.estimatedFare.toFixed(2)}</span>
            </div>
            {trip.finalFare !== null && trip.finalFare !== trip.estimatedFare && (
              <div className="d-flex justify-content-between mb-1">
                <span className="bugie-muted">Tarifa final</span>
                <span className="fw-semibold">S/ {trip.finalFare.toFixed(2)}</span>
              </div>
            )}
            <div className="d-flex justify-content-between" style={{
              borderTop: '1px solid var(--bugie-border)', paddingTop: 8, marginTop: 8,
            }}>
              <span className="fw-bold">
                Total ({PAY_LABEL[trip.paymentMethod] ?? trip.paymentMethod})
              </span>
              <span className="fw-bold">S/ {fare.toFixed(2)}</span>
            </div>
          </div>

          {/* Mi incidencia (si existe) */}
          {myIncident && (
            <div className="p-3 mb-3" style={{
              background: '#f5970015',
              border: '1px solid #f5970055',
              borderRadius: 12,
            }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <i className="fa-solid fa-triangle-exclamation" style={{ color: '#f59700' }} />
                <span className="fw-bold" style={{ color: '#f59700' }}>Tu incidencia</span>
              </div>
              <div className="small">{myIncident.description}</div>
              <div className="small bugie-muted mt-2">
                Reportada {new Date(myIncident.createdAt).toLocaleString('es-PE',
                  { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          )}

          {/* Botón reportar */}
          <button
            onClick={onReport}
            className="btn rounded-pill w-100 d-inline-flex align-items-center justify-content-center gap-2"
            style={{
              background: myIncident ? 'var(--bugie-surface)' : '#f59700',
              color: myIncident ? 'var(--bugie-text)' : '#fff',
              border: myIncident ? '1px solid var(--bugie-border)' : 'none',
              padding: '0.65rem',
            }}
          >
            <i className="fa-solid fa-flag" />
            {myIncident ? 'Ver mi incidencia' : 'Reportar incidencia'}
          </button>

          {/* Sección de calificación: solo en viajes completados.
              Si ya calificó muestra estrellas + comentario.
              Si no, botón "Calificar al conductor". */}
          {trip.status === 4 && (
            <>
              {myRating ? (
                <div className="p-3 mt-3" style={{
                  background: '#fef3c7',
                  border: '1px solid #fbbf24',
                  borderRadius: 12,
                }}>
                  <div className="d-flex align-items-center gap-2 mb-2">
                    <i className="fa-solid fa-star" style={{ color: '#b45309' }} />
                    <span className="fw-bold" style={{ color: '#b45309' }}>
                      Tu calificación
                    </span>
                    <span className="ms-auto small bugie-muted">
                      {new Date(myRating.createdAt).toLocaleDateString('es-PE',
                        { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  <div className="d-flex align-items-center gap-2 mb-2">
                    {[1,2,3,4,5].map(s => (
                      <i key={s}
                         className={`fa-solid fa-star`}
                         style={{
                           color: s <= myRating.stars ? '#fbbf24' : '#d1d5db',
                           fontSize: '1.1rem',
                         }} />
                    ))}
                    <span className="fw-bold ms-1">{myRating.stars}/5</span>
                  </div>
                  {myRating.comment && (
                    <div className="small mt-2 p-2"
                         style={{ background: 'rgba(255,255,255,0.6)', borderRadius: 8 }}>
                      "{myRating.comment}"
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={onRate}
                  className="btn rounded-pill w-100 d-inline-flex align-items-center justify-content-center gap-2 mt-2"
                  style={{
                    background: '#fbbf24',
                    color: '#1f2937',
                    border: 'none',
                    padding: '0.65rem',
                    fontWeight: 600,
                  }}
                >
                  <i className="fa-solid fa-star" />
                  Calificar al conductor
                </button>
              )}
            </>
          )}

        </div>
      </div>
    </div>,
    document.body
  );
}

// ─────────────────────────────────────────────────────────────────────
// Modal de reporte (z-index aún más alto que el de detalle)
// ─────────────────────────────────────────────────────────────────────
function ReportIncidentModal({ trip, existing, onClose, onSaved }: {
  trip: EnrichedTrip;
  existing: Incident | null;
  onClose: () => void;
  onSaved: (inc: Incident) => void;
}) {
  const [text, setText]       = useState(existing?.description ?? '');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const readonly = !!existing;

  async function submit() {
    if (text.trim().length < 5) {
      setError('Escribe al menos 5 caracteres.');
      return;
    }
    setSaving(true); setError(null);
    try {
      const inc = await apiFetch<Incident>(
        `${API.trips}/trips/incidents/${trip.id}`,
        {
          method: 'POST',
          body: JSON.stringify({ description: text.trim() }),
        });
      onSaved(inc);
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo enviar la incidencia.');
    } finally { setSaving(false); }
  }

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100000, padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(460px, 100%)',
          background: 'var(--bugie-surface)',
          borderRadius: 16,
          overflow: 'hidden',
        }}
      >
        <div className="d-flex align-items-center justify-content-between p-3 border-bottom"
             style={{ borderColor: 'var(--bugie-border)' }}>
          <div className="d-flex align-items-center gap-2">
            <i className="fa-solid fa-flag" style={{ color: '#f59700' }} />
            <span className="fw-bold">
              {readonly ? 'Mi incidencia' : 'Reportar incidencia'}
            </span>
          </div>
          <button onClick={onClose} className="btn btn-sm btn-bugie-outline rounded-pill">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div className="p-3">
          <div className="small bugie-muted mb-2 text-truncate">
            <i className="fa-solid fa-route me-1" />
            {trip.originAddress} → {trip.destAddress}
          </div>

          {!readonly && (
            <div className="small bugie-muted mb-2">
              Cuéntanos qué pasó. Tu reporte llega al equipo de monitoreo.
            </div>
          )}

          <textarea
            className="form-control mb-2"
            rows={5}
            maxLength={1000}
            placeholder="Describe la incidencia…"
            value={text}
            onChange={e => setText(e.target.value)}
            disabled={readonly || saving}
            style={{ resize: 'vertical' }}
          />

          {!readonly && (
            <div className="small bugie-muted text-end" style={{ fontSize: '0.72rem' }}>
              {text.length}/1000
            </div>
          )}

          {error && <div className="alert alert-danger small mt-2 mb-0">{error}</div>}

          <div className="d-flex gap-2 mt-3 justify-content-end">
            <button onClick={onClose} className="btn btn-sm btn-bugie-outline rounded-pill">
              {readonly ? 'Cerrar' : 'Cancelar'}
            </button>
            {!readonly && (
              <button
                onClick={submit}
                disabled={saving || text.trim().length < 5}
                className="btn btn-sm rounded-pill text-white"
                style={{ background: '#f59700', border: 'none' }}
              >
                {saving
                  ? <><span className="spinner-border spinner-border-sm me-2" />Enviando…</>
                  : <><i className="fa-solid fa-paper-plane me-2" />Enviar</>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─────────────────────────────────────────────────────────────────────
function RouteRow({ icon, label, time, color }: {
  icon: string; label: string; time: string; color: string;
}) {
  return (
    <div className="d-flex align-items-center gap-3">
      <div className="flex-shrink-0 d-flex align-items-center justify-content-center"
           style={{ width: 32, height: 32, borderRadius: 8, background: color + '22', color }}>
        <i className={`fa-solid ${icon}`} style={{ fontSize: '0.8rem' }} />
      </div>
      <div className="flex-grow-1 min-w-0">
        <div className="small text-truncate">{label}</div>
      </div>
      <div className="small bugie-muted flex-shrink-0">{time}</div>
    </div>
  );
}

function EmptyState({ icon, title, subtitle }: {
  icon: string; title: string; subtitle: string;
}) {
  return (
    <div className="bugie-card p-5 text-center">
      <div className="bugie-mini-icon mx-auto mb-3"
           style={{ width: 56, height: 56, fontSize: '1.5rem' }}>
        <i className={`fa-solid ${icon}`} />
      </div>
      <div className="fw-semibold mb-2">{title}</div>
      <div className="small bugie-muted">{subtitle}</div>
    </div>
  );
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
// ─────────────────────────────────────────────────────────────────────
// Modal de calificación: 5 estrellas tappables + comentario opcional.
// Solo se invoca para viajes status === 4 (Completed) sin rating previo.
// ─────────────────────────────────────────────────────────────────────
function RateTripModal({ trip, onClose, onSaved }: {
  trip: EnrichedTrip;
  onClose: () => void;
  onSaved: (r: Rating) => void;
}) {
  const [stars, setStars]     = useState(0);     // 0 = no eligió
  const [hover, setHover]     = useState(0);     // estrella sobre la que pasa el mouse
  const [comment, setComment] = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  function label(n: number): string {
    switch (n) {
      case 1: return 'Muy mal viaje';
      case 2: return 'Regular';
      case 3: return 'Aceptable';
      case 4: return 'Bueno';
      case 5: return '¡Excelente!';
      default: return '¿Cómo fue tu viaje?';
    }
  }

  async function submit() {
    if (stars < 1) {
      setError('Selecciona al menos 1 estrella.');
      return;
    }
    setSaving(true); setError(null);
    try {
      const r = await apiFetch<Rating>(
        `${API.trips}/trips/ratings/${trip.id}`,
        {
          method: 'POST',
          body: JSON.stringify({
            stars,
            comment: comment.trim() === '' ? null : comment.trim(),
          }),
        });
      onSaved(r);
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo enviar la calificación.');
    } finally { setSaving(false); }
  }

  // La estrella se pinta llena si está dentro del rango "actual"
  // (hover > 0 ? hover : stars). Hover sobreescribe stars mientras el mouse
  // está sobre las estrellas para preview interactivo.
  const display = hover > 0 ? hover : stars;

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100000, padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(460px, 100%)',
          background: 'var(--bugie-surface)',
          borderRadius: 16,
          overflow: 'hidden',
        }}
      >
        <div className="d-flex align-items-center justify-content-between p-3 border-bottom"
             style={{ borderColor: 'var(--bugie-border)' }}>
          <div className="d-flex align-items-center gap-2">
            <i className="fa-solid fa-star" style={{ color: '#fbbf24' }} />
            <span className="fw-bold">Calificar al conductor</span>
          </div>
          <button onClick={onClose} className="btn btn-sm btn-bugie-outline rounded-pill">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div className="p-3">
          <div className="small bugie-muted mb-2 text-truncate">
            <i className="fa-solid fa-route me-1" />
            {trip.originAddress} → {trip.destAddress}
          </div>

          {/* Estrellas */}
          <div className="d-flex justify-content-center my-3"
               onMouseLeave={() => setHover(0)}>
            {[1,2,3,4,5].map(s => (
              <button key={s}
                onClick={() => setStars(s)}
                onMouseEnter={() => setHover(s)}
                disabled={saving}
                className="btn btn-link p-0 mx-1"
                style={{ textDecoration: 'none' }}
                aria-label={`${s} estrella${s > 1 ? 's' : ''}`}>
                <i
                  className={`fa-${s <= display ? 'solid' : 'regular'} fa-star`}
                  style={{
                    color: s <= display ? '#fbbf24' : '#d1d5db',
                    fontSize: '2.2rem',
                    transition: 'color 0.1s',
                  }}
                />
              </button>
            ))}
          </div>
          <div className="text-center mb-3 small bugie-muted">
            {label(display)}
          </div>

          <label className="form-label small bugie-muted">
            Comentario (opcional)
          </label>
          <textarea
            className="form-control"
            rows={3}
            maxLength={500}
            disabled={saving}
            value={comment}
            placeholder="Cuéntanos cómo fue tu experiencia..."
            onChange={e => setComment(e.target.value)}
          />
          <div className="small bugie-muted text-end mt-1">
            {comment.length}/500
          </div>

          {error && (
            <div className="alert alert-danger small mt-2 mb-2 p-2">{error}</div>
          )}

          <div className="d-flex gap-2 mt-3">
            <button
              onClick={onClose}
              className="btn btn-bugie-outline rounded-pill flex-grow-1"
              disabled={saving}>
              Cancelar
            </button>
            <button
              onClick={submit}
              className="btn rounded-pill flex-grow-1 d-inline-flex align-items-center justify-content-center gap-2"
              style={{ background: '#fbbf24', color: '#1f2937', border: 'none', fontWeight: 600 }}
              disabled={saving || stars < 1}>
              {saving
                ? <span className="spinner-border spinner-border-sm" />
                : <i className="fa-solid fa-paper-plane" />}
              Enviar
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
