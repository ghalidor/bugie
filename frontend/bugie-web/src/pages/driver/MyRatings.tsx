import { useEffect, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import { API, apiFetch, ApiError } from '../../state/api';

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

interface RatingPage {
  items: Rating[];
  page: number;
  pageSize: number;
  total: number;
}

const PAGE_SIZE = 10;

/// Pantalla "Mis calificaciones" del conductor web.
/// Lista paginada con botón "Cargar más" (no scroll infinito porque es web).
/// Promedio = sobre los items mostrados.
export default function DriverRatings() {
  const [items, setItems]       = useState<Rating[]>([]);
  const [page, setPage]         = useState(1);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(false);
  const [initialLoading, setInitial] = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [hasMore, setHasMore]   = useState(true);

  async function loadPage(reset: boolean) {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const p = reset ? 1 : page;
      const data = await apiFetch<RatingPage>(
        `${API.trips}/trips/ratings/me?page=${p}&pageSize=${PAGE_SIZE}`);
      setItems(prev => reset ? data.items : [...prev, ...data.items]);
      setPage(p + 1);
      setTotal(data.total);
      setHasMore(p * data.pageSize < data.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudieron cargar las calificaciones.');
    } finally {
      setLoading(false);
      setInitial(false);
    }
  }

  useEffect(() => {
    loadPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Promedio sobre los items YA cargados. No es el promedio real histórico:
  // ese está en drivers.Drivers.Rating y se ve en el admin.
  const avg = items.length === 0
    ? 0
    : items.reduce((s, r) => s + r.stars, 0) / items.length;

  return (
    <>
      <PageHeader
        title="Mis calificaciones"
        subtitle="Lo que dicen tus pasajeros sobre tus viajes."
        icon="fa-solid fa-star"
      />

      {error && <div className="alert alert-danger small mb-3">{error}</div>}

      {initialLoading ? (
        <div className="d-flex justify-content-center py-5">
          <div className="spinner-border" />
        </div>
      ) : (
        <>
          {/* Resumen */}
          <div className="bugie-card mb-3">
            <div className="bugie-card-body d-flex align-items-center gap-3">
              <div>
                <div className="d-flex align-items-baseline gap-2">
                  <span className="fw-bold" style={{ fontSize: '2rem' }}>
                    {avg.toFixed(1)}
                  </span>
                  <i className="fa-solid fa-star" style={{ color: '#fbbf24', fontSize: '1.5rem' }} />
                </div>
                <div className="small bugie-muted">
                  {total === 0
                    ? 'Aún no tienes calificaciones'
                    : `${total} calificación${total === 1 ? '' : 'es'} en total`}
                </div>
              </div>
            </div>
          </div>

          {/* Lista */}
          {items.length === 0 ? (
            <div className="bugie-card">
              <div className="bugie-card-body text-center py-4 bugie-muted">
                <i className="fa-solid fa-star fa-2x mb-3" style={{ color: '#d1d5db' }} />
                <div>Aún no recibiste calificaciones de pasajeros.</div>
                <div className="small mt-1">
                  Cuando completes viajes, las calificaciones aparecerán aquí.
                </div>
              </div>
            </div>
          ) : (
            <div className="d-flex flex-column gap-2">
              {items.map(r => <RatingCard key={r.id} rating={r} />)}

              {hasMore && (
                <button
                  onClick={() => loadPage(false)}
                  disabled={loading}
                  className="btn btn-bugie-outline rounded-pill mt-2"
                >
                  {loading
                    ? <><span className="spinner-border spinner-border-sm me-2" />Cargando...</>
                    : `Cargar más (${items.length} / ${total})`}
                </button>
              )}
              {!hasMore && items.length > 0 && (
                <div className="text-center small bugie-muted mt-2">
                  Mostrando todas tus calificaciones
                </div>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}

function RatingCard({ rating }: { rating: Rating }) {
  const date = new Date(rating.createdAt).toLocaleString('es-PE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="bugie-card">
      <div className="bugie-card-body">
        <div className="d-flex align-items-center gap-2 mb-2">
          {[1,2,3,4,5].map(s => (
            <i key={s}
               className="fa-solid fa-star"
               style={{
                 color: s <= rating.stars ? '#fbbf24' : '#d1d5db',
                 fontSize: '1rem',
               }} />
          ))}
          <span className="fw-bold ms-1">{rating.stars}/5</span>
          <span className="ms-auto small bugie-muted">{date}</span>
        </div>
        <div className="small mb-2">
          <i className="fa-solid fa-user me-1 bugie-muted" />
          {rating.passengerName}
        </div>
        {rating.comment && (
          <div className="p-2 small" style={{
            background: 'var(--bugie-bg-2)',
            borderRadius: 8,
          }}>
            "{rating.comment}"
          </div>
        )}
      </div>
    </div>
  );
}
