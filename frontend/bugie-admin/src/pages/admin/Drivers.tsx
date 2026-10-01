import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import { apiFetch, API, ApiError } from '../../state/api';

interface Driver {
  id: string; userId: string; fullName?: string;
  status: number; isOnline: boolean;
  rating: number; totalRatings: number;
  createdAt: string; approvedAt: string | null;
}

interface ExpiringDriver {
  driverId: string;
  userId:   string;
  fullName: string;
  email:    string;
  phone:    string;
  documents: Array<{
    documentId: string;
    docType:    string;
    expiresAt:  string;
    daysUntilExpiry: number;
  }>;
}

interface ExpiringResponse {
  thresholdDays: number;
  drivers: ExpiringDriver[];
}

interface DriversPagedResponse {
  items: Driver[];
  page: number;
  pageSize: number;
  total: number;
}

interface DriversStatsResponse {
  total: number;
  online: number;
  pendingDocs: number;
  underReview: number;
  approved: number;
  expired: number;
}

const STATUS: Record<number, { label: string; color: string; icon: string }> = {
  1: { label: 'Pendiente docs', color: '#f59e0b', icon: 'fa-clock'            },
  2: { label: 'En revisión',    color: '#38bdf8', icon: 'fa-magnifying-glass' },
  3: { label: 'Aprobado',       color: '#34d399', icon: 'fa-circle-check'     },
  4: { label: 'Suspendido',     color: '#f87171', icon: 'fa-ban'              },
  5: { label: 'Rechazado',      color: '#94a3b8', icon: 'fa-circle-xmark'     },
  6: { label: 'Docs vencidos',  color: '#ef4444', icon: 'fa-calendar-xmark'   },
};

const DOC_LABEL: Record<string, string> = {
  license:          'Licencia',
  soat:             'SOAT',
  revision_tecnica: 'Rev. técnica',
};

type TabKey = 'pending_docs' | 'under_review' | 'expired' | 'expiring_soon' | 'online' | 'all';

const PAGE_SIZE = 25;

/// Mapea cada tab a los parámetros del backend.
/// expiring_soon NO usa paginación (lista corta, endpoint separado).
function tabToParams(tab: TabKey): { status?: number; online?: boolean } {
  switch (tab) {
    case 'pending_docs': return { status: 1 };
    case 'under_review': return { status: 2 };
    case 'expired':      return { status: 6 };
    case 'online':       return { online: true };
    case 'all':          return {};
    default:             return {};
  }
}

function StarRating({ rating, total }: { rating: number; total: number }) {
  // Si el conductor no tiene reseñas reales, no tiene sentido mostrar
  // "5.0 (0)" — el 5.0 es el valor por defecto al crearse el conductor,
  // no una calificación real. Mostramos "Sin calificación" para que el
  // admin no se confunda.
  const hasRatings = total > 0;
  return (
    <div className="d-flex align-items-center gap-1">
      {[1,2,3,4,5].map(i => (
        <i key={i} className="fa-solid fa-star"
          style={{
            fontSize: '0.7rem',
            color: hasRatings && i <= Math.round(rating) ? '#f59e0b' : '#334155',
          }} />
      ))}
      <span className="small bugie-muted ms-1">
        {hasRatings ? `${rating.toFixed(1)} (${total})` : 'Sin calificación'}
      </span>
    </div>
  );
}

export default function Drivers() {
  const [drivers,         setDrivers]         = useState<Driver[]>([]);
  const [total,           setTotal]           = useState(0);
  const [page,            setPage]            = useState(1);
  const [expiringSoon,    setExpiringSoon]    = useState<ExpiringDriver[]>([]);
  const [thresholdDays,   setThresholdDays]   = useState(15);
  const [tab,             setTab]             = useState<TabKey>('pending_docs');
  const [search,          setSearch]          = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [stats, setStats] = useState<DriversStatsResponse>({
    total: 0, online: 0, pendingDocs: 0, underReview: 0, approved: 0, expired: 0,
  });
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState<string | null>(null);
  // (Antes había aquí un state `acting` para el botón Aprobar de la lista.
  // Se removió: la aprobación ahora pasa obligatoriamente por el detalle.)

  // Debounce 300ms en el search
  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setSearchDebounced(search);
      setPage(1);
    }, 300);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [search]);

  // Al cambiar de tab, volver a página 1
  useEffect(() => { setPage(1); }, [tab]);

  // Cargar al cambiar tab / página / búsqueda
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab, page, searchDebounced]);

  // Cargar KPIs (independientes del tab y de paginación). Una vez al inicio
  // y cuando el search cambia (para que reflejen filtro). NO depende del tab
  // para que los KPIs siempre muestren el total global, no solo "lo del tab".
  useEffect(() => { loadStats(); /* eslint-disable-next-line */ }, [searchDebounced]);

  async function load() {
    setLoading(true); setError(null);
    try {
      // Tab "expiring_soon" usa endpoint distinto, sin paginación (lista corta).
      if (tab === 'expiring_soon') {
        const data = await apiFetch<ExpiringResponse>(`${API.drivers}/drivers/expiring-soon`);
        const items = data.drivers ?? [];
        // Filtrado en cliente (lista típicamente pequeña, <100).
        const filtered = !searchDebounced.trim() ? items :
          items.filter(d =>
            d.fullName.toLowerCase().includes(searchDebounced.toLowerCase()) ||
            d.email.toLowerCase().includes(searchDebounced.toLowerCase())
          );
        setExpiringSoon(filtered);
        setThresholdDays(data.thresholdDays ?? 15);
        setDrivers([]); setTotal(0);
      } else {
        const tabParams = tabToParams(tab);
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(PAGE_SIZE),
        });
        if (tabParams.status !== undefined) params.append('status', String(tabParams.status));
        if (tabParams.online !== undefined) params.append('online', String(tabParams.online));
        if (searchDebounced.trim())         params.append('search', searchDebounced.trim());

        const data = await apiFetch<DriversPagedResponse>(
          `${API.drivers}/drivers/paged?${params.toString()}`);
        setDrivers(data.items ?? []);
        setTotal(data.total ?? 0);
        setExpiringSoon([]);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar los conductores.');
    } finally { setLoading(false); }
  }

  async function loadStats() {
    try {
      // KPIs globales: respetan solo el search (no el tab, así siempre vemos
      // el panorama completo de todos los estados).
      const params = new URLSearchParams();
      if (searchDebounced.trim()) params.append('search', searchDebounced.trim());
      const data = await apiFetch<DriversStatsResponse>(
        `${API.drivers}/drivers/stats?${params.toString()}`);
      setStats(data ?? { total: 0, online: 0, pendingDocs: 0, underReview: 0, approved: 0, expired: 0 });
    } catch {}
  }

  // (Función `approve(id)` removida: la aprobación ahora se hace solo
  // desde la pantalla de detalle, donde el admin revisa los documentos.)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const fromIdx = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const toIdx   = Math.min(page * PAGE_SIZE, total);

  return (
    <>
      <PageHeader
        title="Conductores"
        subtitle="Gestión de conductores registrados en la plataforma."
        icon="fa-solid fa-car"
      />

      {/* KPIs (calculados en BD, no varían con el tab) */}
      <div className="row g-3 mb-4">
        {[
          { label: 'Total',       value: stats.total,       color: '#818cf8', icon: 'fa-car-side'        },
          { label: 'Aprobados',   value: stats.approved,    color: '#34d399', icon: 'fa-circle-check'     },
          { label: 'Sin docs',    value: stats.pendingDocs, color: '#f59e0b', icon: 'fa-clock'            },
          { label: 'En revisión', value: stats.underReview, color: '#38bdf8', icon: 'fa-magnifying-glass' },
          { label: 'Vencidos',    value: stats.expired,     color: '#ef4444', icon: 'fa-calendar-xmark'   },
          { label: 'En línea',    value: stats.online,      color: '#38bdf8', icon: 'fa-circle-dot'       },
        ].map(k => (
          <div className="col-6 col-md-4 col-xl-2" key={k.label}>
            <div className="bugie-card p-3">
              <div className="d-flex align-items-center gap-3">
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: k.color + '22',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className={`fa-solid ${k.icon}`} style={{ color: k.color }} />
                </div>
                <div>
                  <div className="small bugie-muted">{k.label}</div>
                  <div className="fw-bold fs-4" style={{ color: k.color, lineHeight: 1 }}>
                    {loading ? '…' : k.value.toLocaleString('es-PE')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
        <div className="position-relative" style={{ width: 260 }}>
          <i className="fa-solid fa-magnifying-glass position-absolute"
            style={{ left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--bugie-muted)', fontSize: '0.8rem' }} />
          <input className="form-control ps-4" placeholder="Buscar conductor…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="d-flex gap-2 flex-wrap">
          {([
            { key: 'pending_docs',   label: 'Sin docs'       },
            { key: 'under_review',   label: 'En revisión'    },
            { key: 'expired',        label: 'Docs vencidos'  },
            { key: 'expiring_soon',  label: 'Por vencer'     },
            { key: 'online',         label: 'En línea'       },
            { key: 'all',            label: 'Todos'           },
          ] as Array<{ key: TabKey; label: string }>).map(f => (
            <button key={f.key}
              className={`btn btn-sm rounded-pill ${tab === f.key ? 'btn-bugie text-white' : 'btn-bugie-outline'}`}
              onClick={() => setTab(f.key)}>
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

      {/* ── Vista: Conductores con docs por vencer (sin paginación) ─── */}
      {tab === 'expiring_soon' ? (
        <ExpiringView
          drivers={expiringSoon}
          loading={loading}
          thresholdDays={thresholdDays}
        />
      ) : (
        /* ── Vista: Lista paginada ─────────────────────────────────── */
        loading ? (
          <div className="d-flex justify-content-center py-5"><span className="spinner-border" /></div>
        ) : drivers.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div className="d-flex flex-column gap-2">
              {drivers.map(d => (
                <DriverRow key={d.id} d={d} />
              ))}
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
        )
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Subcomponentes
// ─────────────────────────────────────────────────────────────────────

function DriverRow({ d }: {
  d: Driver;
}) {
  const s = STATUS[d.status] ?? { label: '?', color: '#94a3b8', icon: 'fa-circle' };

  return (
    <div className="bugie-card px-3 py-3" style={{ overflow: 'hidden', position: 'relative' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
                    background: s.color, borderRadius: '12px 0 0 12px' }} />
      <div className="d-flex align-items-center gap-3 ps-1">

        <div style={{
          width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
          background: s.color + '22',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <i className="fa-solid fa-car-side" style={{ color: s.color }} />
        </div>

        <div className="flex-grow-1 min-w-0">
          <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
            <Link to={`/admin/conductores/${d.id}`} className="fw-semibold text-decoration-none" style={{ color: 'inherit' }}>
              {d.fullName || `Conductor ${d.userId.slice(0, 8)}…`}
            </Link>
            <span className="badge rounded-pill" style={{ background: s.color + '22', color: s.color, fontSize: '0.72rem' }}>
              <i className={`fa-solid ${s.icon} me-1`} style={{ fontSize: '0.65rem' }} />
              {s.label}
            </span>
            {d.isOnline && (
              <span className="badge rounded-pill" style={{ background: '#34d39922', color: '#34d399', fontSize: '0.72rem' }}>
                ● En línea
              </span>
            )}
          </div>
          <StarRating rating={d.rating ?? 0} total={d.totalRatings ?? 0} />
        </div>

        <div className="text-end flex-shrink-0">
          <div className="small bugie-muted mb-2">
            {new Date(d.createdAt).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}
          </div>
          <div className="d-flex gap-2 justify-content-end">
            <Link to={`/admin/conductores/${d.id}`}
              className="btn btn-sm btn-bugie-outline rounded-pill"
              style={{ fontSize: '0.75rem' }}>
              <i className="fa-solid fa-eye me-1" />Ver detalle
            </Link>
            {/* Antes había aquí un botón "Aprobar" que aprobaba directo sin
                validar documentos. Lo quitamos: ahora la aprobación pasa
                obligatoriamente por el detalle, donde se revisan los docs
                uno por uno. */}
          </div>
        </div>
      </div>
    </div>
  );
}

function ExpiringView({ drivers, loading, thresholdDays }: {
  drivers: ExpiringDriver[]; loading: boolean; thresholdDays: number;
}) {
  if (loading) return <div className="d-flex justify-content-center py-5"><span className="spinner-border" /></div>;

  if (drivers.length === 0) return (
    <div className="bugie-card p-5 text-center">
      <div className="bugie-mini-icon mx-auto mb-3" style={{ width: 56, height: 56, fontSize: '1.5rem' }}>
        <i className="fa-solid fa-calendar-check" />
      </div>
      <div className="fw-semibold mb-1">Sin conductores con documentos por vencer</div>
      <div className="small bugie-muted">No hay documentos próximos a caducar en los próximos {thresholdDays} días.</div>
    </div>
  );

  return (
    <>
      <div className="alert alert-warning small mb-3 d-flex align-items-center gap-2">
        <i className="fa-solid fa-triangle-exclamation" />
        <span>Mostrando conductores con documentos que caducan en los próximos <strong>{thresholdDays} días</strong> (o ya vencidos).</span>
      </div>

      <div className="d-flex flex-column gap-2">
        {drivers.map(d => (
          <div key={d.driverId} className="bugie-card p-3">
            <div className="d-flex align-items-start gap-3 flex-wrap">
              <div style={{
                width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                background: '#f59e0b22',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <i className="fa-solid fa-car-side" style={{ color: '#f59e0b' }} />
              </div>

              <div className="flex-grow-1 min-w-0">
                <div className="fw-semibold mb-1">{d.fullName}</div>
                <div className="small bugie-muted mb-2">
                  <i className="fa-solid fa-envelope me-1" />{d.email}
                  <span className="ms-3"><i className="fa-solid fa-phone me-1" />{d.phone}</span>
                </div>

                <div className="d-flex flex-wrap gap-2">
                  {d.documents.map(doc => {
                    const isExpired = doc.daysUntilExpiry < 0;
                    const isToday   = doc.daysUntilExpiry === 0;
                    const color     = isExpired || isToday ? '#ef4444'
                                    : doc.daysUntilExpiry <= 6 ? '#f59e0b'
                                    : '#38bdf8';
                    const label     = DOC_LABEL[doc.docType] ?? doc.docType;
                    const dayText   = isExpired ? `vencido hace ${Math.abs(doc.daysUntilExpiry)} días`
                                    : isToday   ? 'caduca hoy'
                                    : `${doc.daysUntilExpiry} días`;
                    return (
                      <span key={doc.documentId} className="badge rounded-pill"
                        style={{ background: color + '22', color, fontSize: '0.72rem' }}>
                        <i className="fa-solid fa-calendar-day me-1" style={{ fontSize: '0.65rem' }} />
                        {label}: {dayText}
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className="flex-shrink-0">
                <Link to={`/admin/conductores/${d.driverId}`}
                  className="btn btn-sm btn-bugie-outline rounded-pill"
                  style={{ fontSize: '0.75rem' }}>
                  <i className="fa-solid fa-eye me-1" />Ver detalle
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function EmptyState() {
  return (
    <div className="bugie-card p-5 text-center">
      <div className="bugie-mini-icon mx-auto mb-3" style={{ width: 56, height: 56, fontSize: '1.5rem' }}>
        <i className="fa-solid fa-car-side" />
      </div>
      <div className="fw-semibold mb-1">Sin conductores</div>
      <div className="small bugie-muted">No hay conductores en esta categoría.</div>
    </div>
  );
}