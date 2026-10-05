// Conexiones del conductor: cada "Conectarme" con su selfie de verificación.
// GET /api/drivers/admin/{driverId}/presence?page&pageSize&from&to
import { useEffect, useState } from 'react';
import { API, apiFetch, ApiError } from '../../state/api';
import {
  Column, DataTable, EmptyState, FilterBar, Modal, Pagination, SectionCard, StatCard, StatGrid, StatusBadge,
} from '../../components/ui';
import { fileUrl, fmtDate } from './people/PeopleShared';

export interface PresenceItem {
  id: string;
  photoUrl: string;
  checkedInAt: string;
  checkedOutAt: string | null;
  durationMinutes: number;
  active: boolean;
  faceQualityScore: number | null;
}
interface PresencePage {
  items: PresenceItem[];
  total: number;
  page: number;
  pageSize: number;
  summary: { today: number; last7Days: number; last30Days: number };
}

/// Foto con la que comparar la selfie (perfil, DNI o licencia). null = no existe.
export interface ComparePhoto { label: string; src: string | null; }

export const fmtTime = (iso?: string | null) => iso
  ? new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
  : '—';

/// 135 -> "2 h 15 min"; 45 -> "45 min".
export function fmtDuration(min: number): string {
  const m = Math.max(0, Math.floor(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

export function DriverPresenceSection({ driverId, comparePhotos }: { driverId: string; comparePhotos: ComparePhoto[] }) {
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [from, setFrom]         = useState('');
  const [to, setTo]             = useState('');
  const [data, setData]         = useState<PresencePage | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [selected, setSelected] = useState<PresenceItem | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    apiFetch<PresencePage>(`${API.drivers}/drivers/admin/${driverId}/presence?${q}`)
      .then(d => { if (alive) setData(d); })
      .catch(e => { if (alive) setError(e instanceof ApiError ? e.message : 'No se pudieron cargar las conexiones.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [driverId, page, pageSize, from, to]);

  const activeCount = (from ? 1 : 0) + (to ? 1 : 0);
  const summary = data?.summary;

  const columns: Column<PresenceItem>[] = [
    {
      key: 'photo', header: 'Selfie', mobileLabel: 'Selfie', priority: 1, width: '10%',
      render: r => <SelfieThumb item={r} onOpen={() => setSelected(r)} />,
    },
    { key: 'date', header: 'Fecha', priority: 1, render: r => fmtDate(r.checkedInAt) },
    { key: 'in', header: 'Entrada', priority: 2, render: r => fmtTime(r.checkedInAt) },
    {
      key: 'out', header: 'Salida', priority: 2,
      render: r => r.active
        ? <StatusBadge tone="ok" dot size="sm">Conectado ahora</StatusBadge>
        : fmtTime(r.checkedOutAt),
    },
    { key: 'duration', header: 'Duración', priority: 1, align: 'right', render: r => fmtDuration(r.durationMinutes) },
  ];

  return (
    <div className="d-grid gap-3">
      <StatGrid tourId="driver-presence-stats">
        <StatCard label="Hoy" value={summary?.today ?? 0} icon="fa-calendar-day" loading={loading && !data} />
        <StatCard label="Últimos 7 días" value={summary?.last7Days ?? 0} icon="fa-calendar-week" tone="info" loading={loading && !data} />
        <StatCard label="Últimos 30 días" value={summary?.last30Days ?? 0} icon="fa-calendar" tone="neutral" loading={loading && !data} />
      </StatGrid>

      <SectionCard
        title="Conexiones"
        icon="fa-plug"
        description="Cada vez que tocó «Conectarme» con su selfie. Toca la foto para compararla con sus otras fotos."
        flush
        tourId="driver-presence-list"
      >
        <div className="p-3">
          <FilterBar activeCount={activeCount} onClear={activeCount ? () => { setFrom(''); setTo(''); setPage(1); } : undefined}>
            <label className="ops-filter"><span>Desde</span>
              <input type="date" className="form-control form-control-sm" value={from} max={to || undefined}
                     onChange={e => { setFrom(e.target.value); setPage(1); }} />
            </label>
            <label className="ops-filter"><span>Hasta</span>
              <input type="date" className="form-control form-control-sm" value={to} min={from || undefined}
                     onChange={e => { setTo(e.target.value); setPage(1); }} />
            </label>
          </FilterBar>
        </div>
        {error ? (
          <EmptyState compact variant="error" title="No se pudo cargar" text={error} />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={data?.items ?? []}
              rowKey={r => r.id}
              loading={loading}
              onRowClick={r => setSelected(r)}
              mobileTitle={r => fmtDate(r.checkedInAt)}
              mobileSubtitle={r => `${fmtTime(r.checkedInAt)} – ${r.active ? 'Conectado ahora' : fmtTime(r.checkedOutAt)}`}
              empty={{ title: 'Sin conexiones', text: activeCount ? 'No hay conexiones en esas fechas.' : 'El conductor aún no se ha conectado.', icon: 'fa-plug' }}
              caption="Conexiones del conductor"
            />
            <div className="px-3">
              <Pagination page={page} pageSize={pageSize} total={data?.total ?? 0}
                          onPageChange={setPage} onPageSizeChange={s => { setPageSize(s); setPage(1); }} />
            </div>
          </>
        )}
      </SectionCard>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        size="xl"
        title={<><i className="fa-solid fa-user-check me-2" aria-hidden="true" />¿Es la misma persona?</>}
        description={selected ? `Conexión del ${fmtDate(selected.checkedInAt)} a las ${fmtTime(selected.checkedInAt)}` : undefined}
      >
        {selected && (
          <div className="d-grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))' }}>
            <ComparePanel label="Selfie al conectarse" src={fileUrl('drivers', selected.photoUrl)} highlight />
            {comparePhotos.map(p => <ComparePanel key={p.label} label={p.label} src={p.src} />)}
          </div>
        )}
      </Modal>
    </div>
  );
}

function SelfieThumb({ item, onOpen }: { item: PresenceItem; onOpen: () => void }) {
  const src = fileUrl('drivers', item.photoUrl);
  return (
    <button type="button" className="btn p-0 border-0" title="Ver y comparar la selfie"
            aria-label={`Ver selfie del ${fmtDate(item.checkedInAt)}`}
            onClick={e => { e.stopPropagation(); onOpen(); }}>
      {src ? (
        <img src={src} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, display: 'block', border: '1px solid var(--bugie-border)' }} />
      ) : (
        <span className="d-inline-flex align-items-center justify-content-center bugie-muted"
              style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--bugie-bg-2)' }}>
          <i className="fa-solid fa-image" aria-hidden="true" />
        </span>
      )}
    </button>
  );
}

function ComparePanel({ label, src, highlight }: { label: string; src: string | null; highlight?: boolean }) {
  return (
    <figure className="mb-0 text-center">
      <div className="d-flex align-items-center justify-content-center rounded-3 overflow-hidden"
           style={{
             aspectRatio: '3 / 4', background: 'var(--bugie-bg-2)',
             border: `${highlight ? 2 : 1}px solid ${highlight ? 'var(--bugie-primary)' : 'var(--bugie-border)'}`,
           }}>
        {src
          ? <img src={src} alt={label} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          : <span className="small bugie-muted"><i className="fa-solid fa-image me-1" aria-hidden="true" />Sin foto</span>}
      </div>
      <figcaption className={`small mt-2 ${highlight ? 'fw-semibold' : 'bugie-muted'}`}>{label}</figcaption>
    </figure>
  );
}
