import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import { apiFetch, API, ApiError } from '../../state/api';

/// Pantalla "Verificación de conductores": shortcut que lista conductores
/// PENDIENTES de revisión (status 1, 2 ó 6 — PendingDocs, UnderReview,
/// ExpiredDocs). La aprobación real se hace en /admin/conductores/{id}.
///
/// Paginación SERVER-SIDE (mismo patrón que Passengers.tsx y Drivers.tsx):
///   - Endpoint: GET /api/drivers/pending/paged?page=&pageSize=&search=
///   - Devuelve { items, page, pageSize, total }
///   - Debounce 300ms en búsqueda para no spamear el servidor.

interface PendingDriver {
  id: string;
  userId: string;
  fullName: string;
  status: number;       // 1=PendingDocs, 2=UnderReview, 6=ExpiredDocs
  rating: number;
  totalRatings: number;
  createdAt: string;
  profilePhotoUrl: string | null;
}

interface PendingPagedResponse {
  items: PendingDriver[];
  page: number;
  pageSize: number;
  total: number;
}

const STATUS_INFO: Record<number, { label: string; color: string; icon: string }> = {
  1: { label: 'Pendiente de documentos', color: '#f59e0b', icon: 'fa-file-circle-exclamation' },
  2: { label: 'En revisión',              color: '#818cf8', icon: 'fa-magnifying-glass'        },
  6: { label: 'Documentos vencidos',      color: '#ef4444', icon: 'fa-triangle-exclamation'    },
};

const PAGE_SIZE = 10;

export default function DriverVerification() {
  const [drivers, setDrivers] = useState<PendingDriver[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [search,  setSearch]  = useState('');
  // Search con debounce 300ms (igual que Passengers.tsx).
  const [searchDebounced, setSearchDebounced] = useState('');
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

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

  // Cargar al cambiar página o búsqueda
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, searchDebounced]);

  async function load() {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (searchDebounced.trim()) params.append('search', searchDebounced.trim());

      const data = await apiFetch<PendingPagedResponse>(
        `${API.drivers}/drivers/pending/paged?${params.toString()}`);

      setDrivers(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar los conductores.');
      setDrivers([]); setTotal(0);
    } finally { setLoading(false); }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const fromIdx    = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const toIdx      = Math.min(page * PAGE_SIZE, total);

  return (
    <>
      <PageHeader
        title="Verificación de conductores"
        subtitle={`${total} conductor${total !== 1 ? 'es' : ''} esperando revisión.`}
        icon="fa-solid fa-id-card"
        actions={
          <button className="btn btn-bugie-outline rounded-pill" onClick={load} disabled={loading}>
            <i className="fa-solid fa-rotate me-2" />Actualizar
          </button>
        }
      />

      {/* Buscador */}
      <div className="bugie-card p-3 mb-3">
        <div className="input-group">
          <span className="input-group-text bg-transparent border-end-0">
            <i className="fa-solid fa-magnifying-glass bugie-muted" />
          </span>
          <input
            type="search"
            className="form-control border-start-0"
            placeholder="Buscar por nombre o correo..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {error && <div className="alert alert-danger small py-2 mb-3"><i className="fa-solid fa-circle-exclamation me-2" />{error}</div>}

      {loading ? (
        <div className="d-flex justify-content-center py-5">
          <span className="spinner-border" />
        </div>
      ) : drivers.length === 0 ? (
        // Estado vacío — depende si buscó o no
        <div className="bugie-card p-5 text-center">
          {searchDebounced ? (
            <>
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: 'var(--bugie-muted)22', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
              }}>
                <i className="fa-solid fa-magnifying-glass fa-2x bugie-muted" />
              </div>
              <div className="h5 fw-bold mb-1">Sin resultados</div>
              <div className="bugie-muted">
                No se encontraron conductores pendientes con "{searchDebounced}".
              </div>
            </>
          ) : (
            <>
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: '#10b98122', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
              }}>
                <i className="fa-solid fa-check fa-2x" style={{ color: '#10b981' }} />
              </div>
              <div className="h5 fw-bold mb-1">Todo al día</div>
              <div className="bugie-muted">No hay conductores pendientes de revisión.</div>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Lista vertical de conductores (patrón Passengers.tsx) */}
          <div className="d-flex flex-column gap-2">
            {drivers.map(d => {
              const meta = STATUS_INFO[d.status] ?? STATUS_INFO[1];
              const photoUrl = d.profilePhotoUrl
                ? (d.profilePhotoUrl.startsWith('http')
                    ? d.profilePhotoUrl
                    : `${API.drivers.replace(/\/api\/?$/, '')}${d.profilePhotoUrl}`)
                : null;

              return (
                <div key={d.id} className="bugie-card"
                     style={{
                       padding: '14px 18px',
                       borderLeft: `3px solid ${meta.color}`,
                     }}>
                  <div className="d-flex align-items-center gap-3 flex-wrap">

                    {/* Avatar */}
                    {photoUrl ? (
                      <img src={photoUrl} alt={d.fullName}
                           style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover',
                                    border: `2px solid ${meta.color}` }} />
                    ) : (
                      <div style={{
                        width: 48, height: 48, borderRadius: '50%',
                        background: meta.color + '22', color: meta.color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1.1rem', fontWeight: 700,
                        border: `2px solid ${meta.color}`,
                      }}>
                        {(d.fullName?.[0] ?? '?').toUpperCase()}
                      </div>
                    )}

                    {/* Nombre + estado */}
                    <div className="flex-grow-1" style={{ minWidth: 200 }}>
                      <div className="fw-bold">{d.fullName}</div>
                      <div className="d-flex align-items-center gap-2 flex-wrap mt-1">
                        <span className="badge rounded-pill px-3 py-1"
                              style={{
                                background: meta.color + '22',
                                color: meta.color,
                                fontSize: '0.72rem',
                                fontWeight: 600,
                              }}>
                          <i className={`fa-solid ${meta.icon} me-1`} />
                          {meta.label}
                        </span>
                        <span className="small bugie-muted">
                          <i className="fa-solid fa-calendar me-1" style={{ fontSize: '0.7rem' }} />
                          Registrado {new Date(d.createdAt).toLocaleDateString('es-PE', {
                            day: '2-digit', month: 'short', year: 'numeric'
                          })}
                        </span>
                      </div>
                    </div>

                    {/* Botón revisar */}
                    <Link to={`/admin/conductores/${d.id}`}
                          className="btn btn-bugie rounded-pill px-3 text-white"
                          title="Abrir detalle para aprobar/rechazar documentos">
                      <i className="fa-solid fa-magnifying-glass me-2" />
                      Revisar documentos
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Paginación */}
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mt-3">
            <div className="small bugie-muted">
              Mostrando <strong>{fromIdx}–{toIdx}</strong> de <strong>{total}</strong>
            </div>
            {totalPages > 1 && (
              <div className="d-flex gap-1 align-items-center">
                <button className="btn btn-sm btn-bugie-outline rounded-pill"
                        onClick={() => setPage(1)}
                        disabled={page === 1}
                        title="Primera página">
                  <i className="fa-solid fa-angles-left" />
                </button>
                <button className="btn btn-sm btn-bugie-outline rounded-pill"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}>
                  <i className="fa-solid fa-chevron-left" />
                </button>
                <span className="small mx-2">
                  Página <strong>{page}</strong> de <strong>{totalPages}</strong>
                </span>
                <button className="btn btn-sm btn-bugie-outline rounded-pill"
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}>
                  <i className="fa-solid fa-chevron-right" />
                </button>
                <button className="btn btn-sm btn-bugie-outline rounded-pill"
                        onClick={() => setPage(totalPages)}
                        disabled={page === totalPages}
                        title="Última página">
                  <i className="fa-solid fa-angles-right" />
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
