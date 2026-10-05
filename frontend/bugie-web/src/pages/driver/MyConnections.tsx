import { useEffect, useState } from 'react';
import { API, apiFetch, ApiError, driversFileUrl } from '../../state/api';
import {
  EmptyState, Modal, Notice, Page, PageLoading, Pagination, SectionCard, StatCard, StatGrid, StatusBadge,
} from '../../components/ui';

interface Connection {
  id: string;
  photoUrl: string;
  checkedInAt: string;
  checkedOutAt: string | null;
  durationMinutes: number;
  active: boolean;
  faceQualityScore: number | null;
}

interface ConnectionPage {
  items: Connection[];
  total: number;
  page: number;
  pageSize: number;
  summary: { today: number; last7Days: number; last30Days: number };
}

const PAGE_SIZE = 20;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
const fmtTime = (iso?: string | null) => iso
  ? new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
  : '—';

/// 135 -> "2 h 15 min"; 45 -> "45 min".
function fmtDuration(min: number): string {
  const m = Math.max(0, Math.floor(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

/// "Mis conexiones": cada vez que el conductor tocó «Conectarme» en la app
/// con su selfie. Solo consulta (conectarse se hace en la app).
export default function DriverConnections() {
  const [data, setData]         = useState<ConnectionPage | null>(null);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [selected, setSelected] = useState<Connection | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    apiFetch<ConnectionPage>(`${API.drivers}/drivers/me/presence/history?page=${page}&pageSize=${PAGE_SIZE}`)
      .then(d => { if (alive) setData(d); })
      .catch(err => { if (alive) setError(err instanceof ApiError ? err.message : 'No se pudieron cargar tus conexiones.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [page]);

  if (loading && !data) return <PageLoading />;

  const items = data?.items ?? [];
  const summary = data?.summary;

  return (
    <Page title="Mis conexiones" subtitle="Cada vez que te conectaste en la app con tu selfie." icon="fa-plug">
      {error && <Notice tone="bad">{error}</Notice>}

      <StatGrid min={150}>
        <StatCard label="Hoy" value={summary?.today ?? 0} icon="fa-calendar-day" />
        <StatCard label="Últimos 7 días" value={summary?.last7Days ?? 0} icon="fa-calendar-week" tone="info" />
        <StatCard label="Últimos 30 días" value={summary?.last30Days ?? 0} icon="fa-calendar" tone="neutral" />
      </StatGrid>

      {items.length === 0 ? (
        <SectionCard>
          <EmptyState
            icon="fa-plug"
            title="Aún no tienes conexiones"
            text="Cuando toques «Conectarme» en la app Bugie, tus conexiones aparecerán aquí."
          />
        </SectionCard>
      ) : (
        <div className="bx-stack">
          <div className="bx-rows" aria-busy={loading}>
            {items.map(c => <ConnectionRow key={c.id} item={c} onOpen={() => setSelected(c)} />)}
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPageChange={setPage} />
        </div>
      )}

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Selfie de la conexión"
        description={selected ? `${fmtDate(selected.checkedInAt)} · ${fmtTime(selected.checkedInAt)}` : undefined}
      >
        {selected && (
          <div className="text-center">
            <img src={driversFileUrl(selected.photoUrl)} alt="Selfie de la conexión"
                 style={{ maxWidth: '100%', maxHeight: '65dvh', borderRadius: 12 }} />
          </div>
        )}
      </Modal>
    </Page>
  );
}

function ConnectionRow({ item, onOpen }: { item: Connection; onOpen: () => void }) {
  const src = driversFileUrl(item.photoUrl);
  return (
    <article className="bx-row">
      <button type="button" className="btn p-0 border-0 flex-shrink-0" onClick={onOpen}
              aria-label={`Ver selfie del ${fmtDate(item.checkedInAt)}`}>
        {src ? (
          <img src={src} alt="" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 10, display: 'block' }} />
        ) : (
          <span className="d-inline-flex align-items-center justify-content-center bx-muted"
                style={{ width: 52, height: 52, borderRadius: 10, background: 'var(--bugie-surface-2)' }}>
            <i className="fa-solid fa-image" aria-hidden="true" />
          </span>
        )}
      </button>
      <div className="flex-grow-1" style={{ minWidth: 0 }}>
        <div className="fw-semibold text-capitalize">{fmtDate(item.checkedInAt)}</div>
        <div className="small bx-muted">
          <i className="fa-solid fa-right-to-bracket me-1" aria-hidden="true" />Entrada {fmtTime(item.checkedInAt)}
          <span className="mx-2" aria-hidden="true">·</span>
          <i className="fa-solid fa-right-from-bracket me-1" aria-hidden="true" />
          {item.active ? 'Sigues conectado' : `Salida ${fmtTime(item.checkedOutAt)}`}
        </div>
      </div>
      <div className="d-flex align-items-center gap-2 ms-auto">
        {item.active && <StatusBadge tone="ok" dot>Conectado ahora</StatusBadge>}
        <strong className="text-nowrap">{fmtDuration(item.durationMinutes)}</strong>
      </div>
    </article>
  );
}
