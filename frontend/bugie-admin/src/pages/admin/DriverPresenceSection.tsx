// Conexiones del conductor: cada "Conectarme" con su selfie de verificación.
// GET /api/drivers/admin/{driverId}/presence?page&pageSize&from&to
// Verificación facial (interna): resultado por conexión, foto de referencia y
// observaciones ("No era él"): GET /api/drivers/admin/{driverId}/face
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { API, apiFetch, ApiError } from '../../state/api';
import {
  Column, DataTable, DateField, EmptyState, FilterBar, Modal, Pagination, SectionCard, StatCard, StatGrid, StatusBadge, Tone,
} from '../../components/ui';
import { fileUrl, fmtDate, fmtDateTime } from './people/PeopleShared';

export interface PresenceItem {
  id: string;
  photoUrl: string;
  checkedInAt: string;
  checkedOutAt: string | null;
  durationMinutes: number;
  active: boolean;
  faceQualityScore: number | null;
  // Verificación facial (solo admin). faceStatus null = conexión anterior a la verificación.
  liveness?: string | null;
  faceStatus?: FaceStatus | null;
  faceScore?: number | null;
  faceMatchPercent?: number | null;
  faceReferencePhotoUrl?: string | null;
  faceError?: string | null;
  faceReviewStatus?: FaceReviewStatus | null;
  faceReviewNote?: string | null;
  faceReviewedByName?: string | null;
  faceReviewedAt?: string | null;
}

export type FaceStatus = 'disabled' | 'match' | 'mismatch' | 'no_reference' | 'error';
export type FaceReviewStatus = 'pending' | 'confirmed_ok' | 'not_him';

/// Etiqueta y tono del resultado de la verificación facial.
export function faceResultMeta(status: FaceStatus | null | undefined, percent?: number | null): { label: string; tone: Tone; icon: string } {
  switch (status) {
    case 'match':        return { label: percent != null ? `Coincide (${percent}%)` : 'Coincide', tone: 'ok', icon: 'fa-circle-check' };
    case 'mismatch':     return { label: percent != null ? `No coincide (${percent}%)` : 'No coincide', tone: 'bad', icon: 'fa-triangle-exclamation' };
    case 'no_reference': return { label: 'Sin foto de referencia', tone: 'neutral', icon: 'fa-image' };
    case 'error':        return { label: 'Error al verificar', tone: 'warn', icon: 'fa-circle-exclamation' };
    case 'disabled':     return { label: 'Verificación apagada', tone: 'neutral', icon: 'fa-power-off' };
    default:             return { label: '—', tone: 'neutral', icon: 'fa-minus' };
  }
}

export const FACE_REVIEW_LABEL: Record<FaceReviewStatus, { label: string; tone: Tone }> = {
  pending:      { label: 'Por revisar', tone: 'warn' },
  confirmed_ok: { label: 'Era él (error del sistema)', tone: 'ok' },
  not_him:      { label: 'No era él', tone: 'bad' },
};

interface DriverFaceInfo {
  enabled: boolean;
  threshold: number;
  reference: { photoUrl: string; hasEmbedding: boolean; autoApproved: boolean; approvedByName: string | null; approvedAt: string } | null;
  pendingPhoto: { id: string; photoUrl: string; faceResult: FaceStatus; matchPercent: number | null; createdAt: string } | null;
  observations: {
    id: string; photoUrl: string; referencePhotoUrl: string | null; matchPercent: number | null; checkedInAt: string;
    reviewNote: string | null; reviewedByName: string | null; reviewedAt: string | null;
  }[];
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
  const [face, setFace]         = useState<DriverFaceInfo | null>(null);

  useEffect(() => {
    let alive = true;
    apiFetch<DriverFaceInfo>(`${API.drivers}/drivers/admin/${driverId}/face`)
      .then(d => { if (alive) setFace(d); })
      .catch(() => { /* sin datos de verificación: la sección sigue funcionando */ });
    return () => { alive = false; };
  }, [driverId]);

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
    {
      key: 'face', header: 'Verificación facial', mobileLabel: 'Verificación', priority: 2,
      render: r => <FaceResultBadge item={r} />,
    },
  ];

  return (
    <div className="d-grid gap-3">
      <StatGrid tourId="driver-presence-stats">
        <StatCard label="Hoy" value={summary?.today ?? 0} icon="fa-calendar-day" loading={loading && !data} />
        <StatCard label="Últimos 7 días" value={summary?.last7Days ?? 0} icon="fa-calendar-week" tone="info" loading={loading && !data} />
        <StatCard label="Últimos 30 días" value={summary?.last30Days ?? 0} icon="fa-calendar" tone="neutral" loading={loading && !data} />
      </StatGrid>

      {face && <FaceInfoCard face={face} />}

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
              <DateField size="sm" value={from} max={to || undefined}
                         onChange={v => { setFrom(v); setPage(1); }} />
            </label>
            <label className="ops-filter"><span>Hasta</span>
              <DateField size="sm" value={to} min={from || undefined}
                         onChange={v => { setTo(v); setPage(1); }} />
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
          <div className="d-grid gap-3">
            {selected.faceStatus && (
              <div className="d-flex flex-wrap align-items-center gap-2">
                <FaceResultBadge item={selected} />
                {selected.liveness === 'passed' && <StatusBadge tone="info" size="sm" icon="fa-eye">Prueba de vida OK</StatusBadge>}
                {selected.faceError && <span className="small bugie-muted">{selected.faceError}</span>}
              </div>
            )}
            {selected.faceReviewStatus === 'not_him' && selected.faceReviewNote && (
              <div className="sa-note bx-tone-bad" role="note">
                <i className="fa-solid fa-flag" aria-hidden="true" />
                <span><strong>Observación:</strong> {selected.faceReviewNote}
                  {selected.faceReviewedByName && <> — {selected.faceReviewedByName}, {fmtDateTime(selected.faceReviewedAt)}</>}</span>
              </div>
            )}
            <div className="d-grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))' }}>
              <ComparePanel label="Selfie al conectarse" src={fileUrl('drivers', selected.photoUrl)} highlight />
              {selected.faceReferencePhotoUrl && (
                <ComparePanel label="Referencia usada al verificar" src={fileUrl('drivers', selected.faceReferencePhotoUrl)} />
              )}
              {comparePhotos.map(p => <ComparePanel key={p.label} label={p.label} src={p.src} />)}
            </div>
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

/// Resultado de la verificación facial de una conexión (+ revisión del admin).
function FaceResultBadge({ item }: { item: PresenceItem }) {
  if (!item.faceStatus) return <span className="bugie-muted">—</span>;
  const m = faceResultMeta(item.faceStatus, item.faceMatchPercent);
  const review = item.faceReviewStatus ? FACE_REVIEW_LABEL[item.faceReviewStatus] : null;
  return (
    <span className="d-inline-flex flex-wrap gap-1">
      <StatusBadge tone={m.tone} size="sm" icon={m.icon} title={item.faceError ?? undefined}>{m.label}</StatusBadge>
      {review && item.faceStatus === 'mismatch' && <StatusBadge tone={review.tone} size="sm">{review.label}</StatusBadge>}
    </span>
  );
}

/// Foto de referencia (quién y cuándo la aprobó), foto pendiente y observaciones.
function FaceInfoCard({ face }: { face: DriverFaceInfo }) {
  const ref = face.reference;
  return (
    <SectionCard
      title="Verificación facial"
      icon="fa-user-check"
      description={face.enabled
        ? 'Cada selfie de conexión se compara con su foto de referencia. Es interno: el conductor no ve el resultado.'
        : 'La verificación facial está apagada en Configuración: solo se guardan las fotos.'}
      actions={<Link className="btn btn-sm btn-outline-secondary" to="/admin/verificacion-facial">
        <i className="fa-solid fa-arrow-up-right-from-square me-2" aria-hidden="true" />Ir a revisión</Link>}
    >
      <div className="d-grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))' }}>
        <div className="d-flex gap-3 align-items-start">
          <Thumb src={fileUrl('drivers', ref?.photoUrl)} />
          <div className="small" style={{ minWidth: 0 }}>
            <div className="fw-semibold">Foto de referencia</div>
            {ref ? (
              <>
                <div>{ref.autoApproved ? 'Aprobada automáticamente (coincidió con la anterior)' : `Aprobada por ${ref.approvedByName ?? 'un administrador'}`}</div>
                <div className="bugie-muted">{fmtDateTime(ref.approvedAt)}</div>
                {!ref.hasEmbedding && <StatusBadge tone="warn" size="sm" className="mt-1">Sin rostro detectable</StatusBadge>}
              </>
            ) : <div className="bugie-muted">Aún no tiene. Se fija al aprobar su foto de perfil.</div>}
          </div>
        </div>
        {face.pendingPhoto && (
          <div className="d-flex gap-3 align-items-start">
            <Thumb src={fileUrl('drivers', face.pendingPhoto.photoUrl)} />
            <div className="small">
              <div className="fw-semibold">Foto de perfil por revisar</div>
              <div className="bugie-muted">Subida el {fmtDateTime(face.pendingPhoto.createdAt)}</div>
              <Link to="/admin/verificacion-facial?tab=fotos">Revisar ahora</Link>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3">
        <div className="fw-semibold small mb-2">
          <i className="fa-solid fa-flag me-2" style={{ color: 'var(--bugie-bad)' }} aria-hidden="true" />
          Observaciones ({face.observations.length})
        </div>
        {face.observations.length === 0 ? (
          <p className="small bugie-muted mb-0">Sin observaciones. Aquí quedan las conexiones marcadas como «No era él».</p>
        ) : (
          <ul className="list-unstyled d-grid gap-2 mb-0">
            {face.observations.map(o => (
              <li key={o.id} className="d-flex gap-3 align-items-start">
                <Thumb src={fileUrl('drivers', o.photoUrl)} size={44} />
                <div className="small" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                  <div><strong>Conexión del {fmtDateTime(o.checkedInAt)}</strong>{o.matchPercent != null && <> · {o.matchPercent}% de parecido</>}</div>
                  <div>{o.reviewNote}</div>
                  <div className="bugie-muted">{o.reviewedByName ?? 'Administrador'} · {fmtDateTime(o.reviewedAt)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SectionCard>
  );
}

function Thumb({ src, size = 64 }: { src: string | null; size?: number }) {
  return src ? (
    <img src={src} alt="" style={{ width: size, height: size, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--bugie-border)', flexShrink: 0 }} />
  ) : (
    <span className="d-inline-flex align-items-center justify-content-center bugie-muted"
          style={{ width: size, height: size, borderRadius: 8, background: 'var(--bugie-bg-2)', flexShrink: 0 }}>
      <i className="fa-solid fa-image" aria-hidden="true" />
    </span>
  );
}

export function ComparePanel({ label, src, highlight }: { label: string; src: string | null; highlight?: boolean }) {
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
