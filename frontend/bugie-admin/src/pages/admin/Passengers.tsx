import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import { API, apiFetch, ApiError } from '../../state/api';

interface User {
  id:         string;
  email:      string;
  fullName:   string;
  phone:      string;
  role:       string;
  isActive:   boolean;
  isVerified: boolean;
  createdAt:  string;
}

interface UsersPagedResponse {
  items: User[];
  page: number;
  pageSize: number;
  total: number;
}

interface UsersStatsResponse {
  total: number;
  activos: number;
  pasajeros: number;
  conductores: number;
  verificados: number;
  noVerificados: number;
}

const PAGE_SIZE = 25;

export default function Passengers() {
  const navigate = useNavigate();
  // Tab: 'pending' (no verificados) o 'all' (todos los pasajeros).
  const [tab,    setTab]     = useState<'pending' | 'all'>('pending');
  const [users,  setUsers]   = useState<User[]>([]);
  const [total,  setTotal]   = useState(0);
  const [page,   setPage]    = useState(1);
  const [search, setSearch]  = useState('');
  // Search con debounce 300ms — no manda request por cada tecla.
  const [searchDebounced, setSearchDebounced] = useState('');
  const [stats, setStats] = useState<UsersStatsResponse>({
    total: 0, activos: 0, pasajeros: 0, conductores: 0,
    verificados: 0, noVerificados: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error,  setError]   = useState<string | null>(null);

  // Debounce
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

  // Cargar al cambiar página/tab/búsqueda
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, tab, searchDebounced]);

  async function load() {
    setLoading(true); setError(null);
    try {
      // Tab 'pending' = no verificados. Tab 'all' = sin filtro de verificación.
      const verifiedParam = tab === 'pending' ? 'false' : null;

      const pagedParams = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      const statsParams = new URLSearchParams();
      if (verifiedParam !== null) {
        pagedParams.append('verified', verifiedParam);
        statsParams.append('verified', verifiedParam);
      }
      if (searchDebounced.trim()) {
        pagedParams.append('search', searchDebounced.trim());
        statsParams.append('search', searchDebounced.trim());
      }

      const [pagedRes, statsRes] = await Promise.all([
        apiFetch<UsersPagedResponse>(
          `${API.auth}/auth/admin/passengers/paged?${pagedParams.toString()}`),
        apiFetch<UsersStatsResponse>(
          `${API.auth}/auth/admin/passengers/stats?${statsParams.toString()}`),
      ]);

      setUsers(pagedRes.items ?? []);
      setTotal(pagedRes.total ?? 0);
      setStats(statsRes ?? {
        total: 0, activos: 0, pasajeros: 0, conductores: 0,
        verificados: 0, noVerificados: 0,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar los pasajeros.');
    } finally { setLoading(false); }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const fromIdx = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const toIdx   = Math.min(page * PAGE_SIZE, total);

  return (
    <>
      <PageHeader
        title="Pasajeros"
        subtitle="Gestión de pasajeros registrados en la plataforma."
        icon="fa-solid fa-users"
      />

      {/* KPIs calculados en BD (siempre rápidos). Total = total filtrado por tab. */}
      <div className="row g-3 mb-4">
        {[
          { label: 'Total',       value: stats.total,         color: '#818cf8', icon: 'fa-users'        },
          { label: 'Verificados', value: stats.verificados,   color: '#34d399', icon: 'fa-circle-check'  },
          { label: 'Pendientes',  value: stats.noVerificados, color: '#f59e0b', icon: 'fa-clock'         },
        ].map(k => (
          <div className="col-md-4" key={k.label}>
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
          <input className="form-control ps-4" placeholder="Buscar pasajero…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="d-flex gap-2">
          {[
            { key: 'pending', label: 'Pendientes' },
            { key: 'all',     label: 'Todos'      },
          ].map(f => (
            <button key={f.key}
              className={`btn btn-sm rounded-pill ${tab === f.key ? 'btn-bugie text-white' : 'btn-bugie-outline'}`}
              onClick={() => setTab(f.key as any)}>
              {f.label}
            </button>
          ))}
        </div>
        <button className="btn btn-sm btn-bugie-outline rounded-pill ms-auto" onClick={load}>
          <i className="fa-solid fa-rotate-right me-1" />Actualizar
        </button>
      </div>

      {error && <div className="alert alert-danger small mb-3">{error}</div>}

      {loading ? (
        <div className="d-flex justify-content-center py-5"><span className="spinner-border" /></div>
      ) : users.length === 0 ? (
        <div className="bugie-card p-5 text-center">
          <i className="fa-solid fa-users fa-2x mb-3 d-block bugie-muted" />
          <div className="fw-semibold mb-1">Sin pasajeros</div>
          <div className="small bugie-muted">No hay pasajeros en esta categoría.</div>
        </div>
      ) : (
        <>
          <div className="d-flex flex-column gap-2">
            {users.map(u => (
              <div key={u.id} className="bugie-card px-3 py-3" style={{ overflow: 'hidden', position: 'relative' }}>
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
                  background: u.isVerified ? '#34d399' : '#f59e0b', borderRadius: '12px 0 0 12px',
                }} />
                <div className="d-flex align-items-center gap-3 ps-1 flex-wrap">
                  <div style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                                background: 'rgba(129,140,248,0.2)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="fa-solid fa-user" style={{ color: '#818cf8' }} />
                  </div>
                  <div className="flex-grow-1" style={{ minWidth: 0 }}>
                    <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
                      <span className="fw-semibold">{u.fullName}</span>
                      <span className="badge rounded-pill"
                            style={{ background: u.isVerified ? 'rgba(52,211,153,0.2)' : 'rgba(245,158,11,0.2)',
                                     color: u.isVerified ? '#34d399' : '#f59e0b', fontSize: '0.72rem' }}>
                        <i className={`fa-solid ${u.isVerified ? 'fa-circle-check' : 'fa-clock'} me-1`}
                           style={{ fontSize: '0.65rem' }} />
                        {u.isVerified ? 'Verificado' : 'Pendiente'}
                      </span>
                    </div>
                    <div className="small bugie-muted">{u.email} · {u.phone}</div>
                  </div>
                  <div className="text-end flex-shrink-0">
                    <div className="small bugie-muted mb-2">
                      {new Date(u.createdAt).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </div>
                    <button className="btn btn-sm btn-bugie-outline rounded-pill"
                            style={{ fontSize: '0.75rem' }}
                            onClick={() => navigate(`/admin/pasajeros/${u.id}`)}>
                      <i className="fa-solid fa-eye me-1" />Ver detalle
                    </button>
                  </div>
                </div>
              </div>
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
      )}
    </>
  );
}
