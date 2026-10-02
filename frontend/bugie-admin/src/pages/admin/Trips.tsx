import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PageHeader from '../../components/PageHeader';
import { apiFetch, API, ApiError } from '../../state/api';
import TripDetailModal, { TripDetail, CANCELLED_BY } from '../../components/TripDetailModal';

interface Trip extends TripDetail {
  passengerId: string;
}

interface Incident {
  id: string; tripId: string; reportedByUserId: string;
  reportedByRole: string; description: string; createdAt: string;
  reportedByName?: string | null;
}

interface TripsPagedResponse {
  items: Trip[];
  page: number;
  pageSize: number;
  total: number;
}

interface TripsStatsResponse {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  totalFare: number;
}

const STATUS: Record<number, { label: string; color: string; icon: string }> = {
  1: { label: 'Pendiente',  color: '#f59e0b', icon: 'fa-clock'                },
  2: { label: 'Aceptado',   color: '#38bdf8', icon: 'fa-car'                  },
  3: { label: 'En curso',   color: '#818cf8', icon: 'fa-location-dot'         },
  4: { label: 'Completado', color: '#34d399', icon: 'fa-circle-check'         },
  5: { label: 'Cancelado',  color: '#94a3b8', icon: 'fa-circle-xmark'         },
  6: { label: 'SOS',        color: '#f87171', icon: 'fa-triangle-exclamation' },
  7: { label: 'Negociando', color: '#c084fc', icon: 'fa-tag'                  },
};

const PAY: Record<string, { label: string; icon: string }> = {
  cash: { label: 'Efectivo', icon: 'fa-money-bill-wave' },
  yape: { label: 'Yape',     icon: 'fa-mobile-screen'   },
  plin: { label: 'Plin',     icon: 'fa-mobile-screen'   },
};

const PAGE_SIZE = 25;

/// El tab "Pendientes" muestra viajes que esperan acción: status 1 (pending)
/// y 7 (negotiating). El tab "Todos" no filtra por status.
function tabToStatuses(tab: 'pending' | 'history'): number[] | undefined {
  return tab === 'pending' ? [1, 7] : undefined;
}

export default function AdminTrips() {
  const [trips,    setTrips]    = useState<Trip[]>([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [counts,   setCounts]   = useState<Record<string, number>>({});
  const [stats,    setStats]    = useState<TripsStatsResponse>({
    total: 0, pending: 0, inProgress: 0, completed: 0, totalFare: 0,
  });
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState<'pending' | 'history'>('pending');
  const [search,   setSearch]   = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [error,    setError]    = useState<string | null>(null);
  const [viewing,  setViewing]  = useState<Trip | null>(null);
  const [detail,   setDetail]   = useState<Trip | null>(null);

  // Debounce search
  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setSearchDebounced(search);
      setPage(1);
    }, 300);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [search]);

  useEffect(() => { setPage(1); }, [tab]);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab, page, searchDebounced]);
  // KPIs globales (independientes del tab/paginación): solo cambian con search.
  useEffect(() => { loadStats(); /* eslint-disable-next-line */ }, [searchDebounced]);

  async function load() {
    setLoading(true); setError(null);
    try {
      const statuses = tabToStatuses(tab);
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      // Status va como múltiples query params: ?status=1&status=7
      if (statuses) statuses.forEach(s => params.append('status', String(s)));
      if (searchDebounced.trim()) params.append('search', searchDebounced.trim());

      const data = await apiFetch<TripsPagedResponse>(
        `${API.trips}/trips/admin/paged?${params.toString()}`);
      setTrips(data.items ?? []);
      setTotal(data.total ?? 0);

      // Conteo de incidencias por viaje (solo de los visibles)
      if ((data.items?.length ?? 0) > 0) {
        try {
          const map = await apiFetch<Record<string, number>>(
            `${API.trips}/trips/incidents/counts`,
            { method: 'POST', body: JSON.stringify(data.items.map(t => t.id)) });
          setCounts(map ?? {});
        } catch {}
      } else {
        setCounts({});
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar los viajes.');
    } finally { setLoading(false); }
  }

  async function loadStats() {
    try {
      // KPIs sin filtro de tab — total global, respeta solo búsqueda.
      const params = new URLSearchParams();
      if (searchDebounced.trim()) params.append('search', searchDebounced.trim());
      const data = await apiFetch<TripsStatsResponse>(
        `${API.trips}/trips/admin/stats?${params.toString()}`);
      setStats(data ?? { total: 0, pending: 0, inProgress: 0, completed: 0, totalFare: 0 });
    } catch {}
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const fromIdx = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const toIdx   = Math.min(page * PAGE_SIZE, total);

  // Conteo de viajes con incidencias en la página visible (no global)
  const conIncidenciasVisible = Object.values(counts).filter(c => c > 0).length;

  return (
    <>
      <PageHeader
        title="Viajes"
        subtitle="Monitoreo y auditoría de viajes en la plataforma."
        icon="fa-solid fa-route"
      />

      {/* KPIs en BD (siempre rápidos con cualquier cantidad de viajes).
          NOTA: "Incidencias" se queda en cliente porque depende solo de
          los viajes visibles en la página actual. */}
      <div className="row g-3 mb-4">
        {[
          { label: 'Pendientes',   value: stats.pending.toString(),       color: '#f59e0b', icon: 'fa-clock'                },
          { label: 'En curso',     value: stats.inProgress.toString(),    color: '#818cf8', icon: 'fa-location-dot'         },
          { label: 'Completados',  value: stats.completed.toString(),     color: '#34d399', icon: 'fa-circle-check'         },
          { label: 'Incidencias',  value: conIncidenciasVisible.toString(), color: '#f59700', icon: 'fa-triangle-exclamation' },
          { label: 'Facturado',    value: `S/ ${stats.totalFare.toFixed(2)}`, color: '#38bdf8', icon: 'fa-wallet'           },
        ].map(k => (
          <div className="col-6 col-xl" key={k.label}>
            <div className="bugie-card p-3">
              <div className="d-flex align-items-center gap-3">
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: k.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className={`fa-solid ${k.icon}`} style={{ color: k.color }} />
                </div>
                <div>
                  <div className="small bugie-muted">{k.label}</div>
                  <div className="fw-bold fs-4" style={{ color: k.color, lineHeight: 1 }}>
                    {loading ? '…' : k.value}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
        <div className="position-relative" style={{ width: 280 }}>
          <i className="fa-solid fa-magnifying-glass position-absolute" style={{ left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--bugie-muted)', fontSize: '0.8rem' }} />
          <input className="form-control ps-4" placeholder="Buscar por dirección…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="d-flex gap-2">
          {[
            { key: 'pending', label: 'Pendientes' },
            { key: 'history', label: 'Todos los viajes'  },
          ].map(f => (
            <button key={f.key}
              className={`btn btn-sm rounded-pill ${tab === f.key ? 'btn-bugie text-white' : 'btn-bugie-outline'}`}
              onClick={() => setTab(f.key as any)}>
              {f.label}
            </button>
          ))}
        </div>
        <button className="btn btn-sm btn-bugie-outline rounded-pill ms-auto"
                onClick={() => { load(); loadStats(); }}>
          <i className="fa-solid fa-rotate-right me-1" />Actualizar
        </button>
      </div>

      {error && <div className="alert alert-danger small mb-3">{error}</div>}

      {loading ? (
        <div className="d-flex justify-content-center py-5"><span className="spinner-border" /></div>
      ) : trips.length === 0 ? (
        <div className="bugie-card p-5 text-center">
          <div className="bugie-mini-icon mx-auto mb-3" style={{ width: 56, height: 56, fontSize: '1.5rem' }}>
            <i className="fa-solid fa-route" />
          </div>
          <div className="fw-semibold mb-1">Sin viajes</div>
          <div className="small bugie-muted">No hay viajes en esta categoría.</div>
        </div>
      ) : (
        <>
          <div className="d-flex flex-column gap-2">
            {trips.map(t => {
              const s   = STATUS[t.status] ?? { label: '?', color: '#94a3b8', icon: 'fa-circle' };
              const pay = PAY[t.paymentMethod] ?? { label: t.paymentMethod, icon: 'fa-credit-card' };
              const fare = t.finalFare ?? t.estimatedFare;
              const date = new Date(t.createdAt);
              const incidentCount = counts[t.id] ?? 0;

              return (
                <div key={t.id} className="bugie-card" style={{
                  overflow: 'hidden',
                  border: incidentCount > 0 ? '2px solid #f59700' : undefined,
                }}>
                  <div style={{ height: 3, background: incidentCount > 0 ? '#f59700' : s.color }} />
                  <div className="p-3">
                    <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">

                      <div className="flex-grow-1 min-w-0">
                        <div className="d-flex align-items-center gap-2 mb-2 flex-wrap">
                          <span className="badge rounded-pill" style={{ background: s.color + '22', color: s.color, fontSize: '0.72rem' }}>
                            <i className={`fa-solid ${s.icon} me-1`} style={{ fontSize: '0.65rem' }} />
                            {s.label}
                          </span>
                          {incidentCount > 0 && (
                            <span className="badge rounded-pill" style={{
                              background: '#f59700', color: '#fff', fontSize: '0.72rem',
                              animation: 'pulse 2s infinite',
                            }}>
                              <i className="fa-solid fa-triangle-exclamation me-1" style={{ fontSize: '0.65rem' }} />
                              {incidentCount} incidencia{incidentCount > 1 ? 's' : ''}
                            </span>
                          )}
                          <span className="small bugie-muted">
                            {date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}
                            {' · '}
                            {date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        <div className="d-flex flex-column gap-1" style={{ borderLeft: '2px solid var(--bugie-border)', paddingLeft: 12, marginLeft: 4 }}>
                          <div className="d-flex align-items-center gap-2">
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#7C6AF7', marginLeft: -17, flexShrink: 0 }} />
                            <div className="small text-truncate" style={{ maxWidth: 320 }}>{t.originAddress}</div>
                          </div>
                          <div className="d-flex align-items-center gap-2">
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#C060C0', marginLeft: -17, flexShrink: 0 }} />
                            <div className="small text-truncate" style={{ maxWidth: 320 }}>{t.destAddress}</div>
                          </div>
                        </div>

                        <div className="small bugie-muted mt-2">
                          <i className="fa-solid fa-car me-1" />
                          {t.driverId ? 'Conductor asignado' : 'Sin conductor'}
                        </div>
                        {t.status === 5 && t.cancelledBy && (
                          <div className="small bugie-muted">
                            <i className="fa-solid fa-circle-xmark me-1" />
                            Cancelado por {CANCELLED_BY[t.cancelledBy] ?? t.cancelledBy}
                            {t.cancelReason && <> · {t.cancelReason}</>}
                          </div>
                        )}
                      </div>

                      <div className="d-flex flex-column align-items-end gap-2 flex-shrink-0">
                        <div className="text-end">
                          <div className="fw-bold fs-5">S/ {fare.toFixed(2)}</div>
                          <div className="small bugie-muted d-flex align-items-center gap-1 justify-content-end">
                            <i className={`fa-solid ${pay.icon}`} style={{ fontSize: '0.7rem' }} />
                            {pay.label}
                          </div>
                        </div>

                        <button onClick={() => setDetail(t)}
                                className="btn btn-sm btn-bugie-outline rounded-pill" style={{ fontSize: '0.75rem' }}>
                          <i className="fa-solid fa-route me-1" />Ver detalle y recorrido
                        </button>
                        {incidentCount > 0 && (
                          <button
                            onClick={() => setViewing(t)}
                            className="btn btn-sm rounded-pill d-inline-flex align-items-center gap-2"
                            style={{ background: '#f59700', color: '#fff', border: 'none', fontSize: '0.75rem' }}
                          >
                            <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: '0.7rem' }} />
                            Ver incidencias
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Paginación */}
          <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mt-3">
            <div className="small bugie-muted">
              Mostrando <strong>{fromIdx}–{toIdx}</strong> de <strong>{total.toLocaleString('es-PE')}</strong>
            </div>
            <div className="d-flex align-items-center gap-2">
              <button className="btn btn-sm btn-bugie-outline rounded-pill"
                onClick={() => setPage(1)} disabled={page === 1}>
                <i className="fa-solid fa-angles-left" />
              </button>
              <button className="btn btn-sm btn-bugie-outline rounded-pill"
                onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                <i className="fa-solid fa-chevron-left" />
              </button>
              <span className="small fw-semibold mx-2">
                Página {page} de {totalPages}
              </span>
              <button className="btn btn-sm btn-bugie-outline rounded-pill"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                <i className="fa-solid fa-chevron-right" />
              </button>
              <button className="btn btn-sm btn-bugie-outline rounded-pill"
                onClick={() => setPage(totalPages)} disabled={page >= totalPages}>
                <i className="fa-solid fa-angles-right" />
              </button>
            </div>
          </div>
        </>
      )}

      {viewing && (
        <IncidentsModal trip={viewing} onClose={() => setViewing(null)} />
      )}

      {detail && <TripDetailModal trip={detail} onClose={() => setDetail(null)} />}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.6; }
        }
      `}</style>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
function IncidentsModal({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error,   setError]       = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Incident[]>(`${API.trips}/trips/incidents/${trip.id}`)
      .then(setIncidents)
      .catch(() => setError('No se pudo cargar las incidencias.'))
      .finally(() => setLoading(false));
  }, [trip.id]);

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 99999, padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(560px, 100%)', maxHeight: '85vh',
          background: 'var(--bugie-surface)',
          borderRadius: 16,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <div className="d-flex align-items-center justify-content-between p-3 border-bottom"
             style={{ borderColor: 'var(--bugie-border)' }}>
          <div className="d-flex align-items-center gap-2">
            <i className="fa-solid fa-triangle-exclamation" style={{ color: '#f59700' }} />
            <div>
              <div className="fw-bold">Incidencias del viaje</div>
              <div className="small bugie-muted text-truncate" style={{ maxWidth: 400 }}>
                {trip.originAddress} → {trip.destAddress}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-sm btn-bugie-outline rounded-pill">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: '1rem' }}>
          {loading ? (
            <div className="d-flex justify-content-center py-3"><span className="spinner-border" /></div>
          ) : error ? (
            <div className="alert alert-danger small">{error}</div>
          ) : incidents.length === 0 ? (
            <div className="text-center bugie-muted py-3">Sin incidencias en este viaje.</div>
          ) : (
            <div className="d-flex flex-column gap-2">
              {incidents.map(i => (
                <div key={i.id} className="p-3" style={{
                  background: '#f5970015',
                  border: '1px solid #f5970055',
                  borderRadius: 12,
                }}>
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <span className="badge rounded-pill" style={{
                      background: i.reportedByRole === 'passenger' ? '#7C6AF722' : '#34d39922',
                      color:      i.reportedByRole === 'passenger' ? '#7C6AF7'   : '#34d399',
                      fontSize: '0.72rem',
                    }}>
                      <i className={`fa-solid ${i.reportedByRole === 'passenger' ? 'fa-user' : 'fa-car'} me-1`}
                         style={{ fontSize: '0.65rem' }} />
                      {i.reportedByRole === 'passenger' ? 'Pasajero' : 'Conductor'}
                      {i.reportedByName && (
                        <span className="ms-1">· {i.reportedByName}</span>
                      )}
                    </span>
                    <div className="small bugie-muted" style={{ fontSize: '0.72rem' }}>
                      {new Date(i.createdAt).toLocaleString('es-PE',
                        { day: '2-digit', month: 'short', year: 'numeric',
                          hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <div className="small">{i.description}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
