import { useEffect, useState } from 'react';
import { API, apiFetch, ApiError } from '../../state/api';
import { EmptyState, Notice, Page, PageLoading, SectionCard, StatCard, StatGrid } from '../../components/ui';

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
/// Lista paginada con botón "Cargar más".
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

  // Promedio sobre los items YA cargados (el histórico real se ve en el admin).
  const avg = items.length === 0
    ? 0
    : items.reduce((s, r) => s + r.stars, 0) / items.length;
  const fives = items.filter(r => r.stars === 5).length;

  if (initialLoading) return <PageLoading />;

  return (
    <Page title="Mis calificaciones" subtitle="Lo que dicen tus pasajeros sobre tus viajes." icon="fa-star-half-stroke">
      {error && <Notice tone="bad">{error}</Notice>}

      <StatGrid min={160}>
        <StatCard
          label="Promedio"
          value={<>{avg.toFixed(1)} <i className="fa-solid fa-star" style={{ color: '#f59e0b', fontSize: '.8em' }} aria-hidden="true" /></>}
          icon="fa-star"
          tone="warn"
          hint={items.length < total ? `Sobre las ${items.length} mostradas` : undefined}
        />
        <StatCard label="Calificaciones" value={total} icon="fa-comments" />
        <StatCard label="De 5 estrellas" value={fives} icon="fa-face-smile" tone="ok" hint={items.length < total ? 'Entre las mostradas' : undefined} />
      </StatGrid>

      {items.length === 0 ? (
        <SectionCard>
          <EmptyState
            icon="fa-star"
            title="Aún no recibiste calificaciones"
            text="Cuando completes viajes, las calificaciones de tus pasajeros aparecerán aquí."
          />
        </SectionCard>
      ) : (
        <div className="bx-stack">
          <div className="bx-rows">
            {items.map(r => <RatingCard key={r.id} rating={r} />)}
          </div>
          <div className="text-center">
            {hasMore ? (
              <button onClick={() => loadPage(false)} disabled={loading} className="btn btn-bugie-outline">
                {loading
                  ? <><span className="spinner-border spinner-border-sm" aria-hidden="true" />Cargando…</>
                  : `Cargar más (${items.length} de ${total})`}
              </button>
            ) : (
              <span className="small bx-muted">Mostrando todas tus calificaciones</span>
            )}
          </div>
        </div>
      )}
    </Page>
  );
}

function RatingCard({ rating }: { rating: Rating }) {
  const date = new Date(rating.createdAt).toLocaleString('es-PE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <article className="bx-row d-grid">
      <div className="d-flex align-items-center gap-2 flex-wrap">
        <span className="bx-stars" aria-label={`${rating.stars} de 5 estrellas`}>
          {[1, 2, 3, 4, 5].map(s => <i key={s} className={`fa-solid fa-star ${s <= rating.stars ? '' : 'off'}`} aria-hidden="true" />)}
        </span>
        <strong>{rating.stars}/5</strong>
        <span className="ms-auto small bx-muted">{date}</span>
      </div>
      <div className="small"><i className="fa-solid fa-user me-1 bx-muted" aria-hidden="true" />{rating.passengerName}</div>
      {rating.comment && <div className="bx-quote">“{rating.comment}”</div>}
    </article>
  );
}
