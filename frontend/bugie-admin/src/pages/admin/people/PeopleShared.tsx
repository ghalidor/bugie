// Piezas compartidas por las pantallas de Personas (pasajeros, conductores,
// verificación y usuarios). Solo presentación: no llaman a la API.
import { ReactNode, useState } from 'react';
import { API } from '../../../state/api';
import { authHeaders } from '../../../state/session';
import { IconButton, Modal, StatusBadge, Tone } from '../../../components/ui';

/* ── Fechas ─────────────────────────────────────────────────────────── */

export const fmtDate = (iso?: string | null) => iso
  ? new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—';

export const fmtDateTime = (iso?: string | null) => iso
  ? new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';

/* ── Archivos ───────────────────────────────────────────────────────── */

/// El backend devuelve rutas relativas ("/uploads/..."). Les anteponemos el
/// host del servicio (API.x sin el "/api" final). Si ya es absoluta, se usa tal cual.
export function fileUrl(service: 'auth' | 'drivers', path?: string | null): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${API[service].replace(/\/api\/?$/, '')}${path}`;
}

/* ── Avatar ─────────────────────────────────────────────────────────── */

export function Avatar({ src, name, size = 40, tone = 'primary' }: { src?: string | null; name?: string | null; size?: number; tone?: Tone }) {
  const initials = (name ?? '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '?';
  const style = { width: size, height: size, borderRadius: '50%', flexShrink: 0 } as const;
  if (src) return <img src={src} alt="" style={{ ...style, objectFit: 'cover', border: '2px solid var(--bugie-border)' }} />;
  return (
    <span className={`bx-tone-${tone}`} aria-hidden="true"
          style={{ ...style, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                   background: 'var(--tone-bg)', color: 'var(--tone)', fontWeight: 700, fontSize: size * 0.36 }}>
      {initials}
    </span>
  );
}

/// Nombre + subtítulo con avatar, para la primera columna de las tablas.
export function PersonCell({ name, sub, src, tone, muted }: { name: ReactNode; sub?: ReactNode; src?: string | null; tone?: Tone; muted?: boolean }) {
  return (
    <div className="d-flex align-items-center gap-2" style={{ minWidth: 0, opacity: muted ? 0.6 : undefined }}>
      <Avatar src={src} name={typeof name === 'string' ? name : undefined} size={36} tone={muted ? 'neutral' : tone} />
      <div style={{ minWidth: 0 }}>
        <div className="fw-semibold text-truncate">{name}</div>
        {sub && <div className="small bugie-muted text-truncate">{sub}</div>}
      </div>
    </div>
  );
}

/* ── Filas de información ───────────────────────────────────────────── */

export function InfoRow({ icon, label, children }: { icon: string; label: string; children: ReactNode }) {
  return (
    <div className="d-flex align-items-start gap-3 py-2" style={{ borderBottom: '1px solid var(--bugie-border)' }}>
      <span className="bx-stat-icon bx-tone-primary" aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 9 }}>
        <i className={`fa-solid ${icon}`} style={{ fontSize: '.85rem' }} />
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="small bugie-muted">{label}</div>
        <div className="fw-semibold" style={{ overflowWrap: 'anywhere' }}>{children}</div>
      </div>
    </div>
  );
}

/// Valor copiable (IDs técnicos).
export function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* portapapeles no disponible */ }
  };
  return (
    <div className="d-flex align-items-center gap-2 py-2" style={{ borderBottom: '1px solid var(--bugie-border)' }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="small bugie-muted">{label}</div>
        <code className="small" style={{ overflowWrap: 'anywhere' }}>{value}</code>
      </div>
      <IconButton icon={copied ? 'fa-check' : 'fa-copy'} label={copied ? 'Copiado' : `Copiar ${label}`} size="sm" variant="ghost" onClick={copy} />
    </div>
  );
}

/* ── Estados de documento (en español) ──────────────────────────────── */

export const DOC_STATUS: Record<string, { label: string; tone: Tone; icon: string }> = {
  pending:    { label: 'Por revisar', tone: 'warn',    icon: 'fa-clock' },
  approved:   { label: 'Aprobado',    tone: 'ok',      icon: 'fa-circle-check' },
  rejected:   { label: 'Rechazado',   tone: 'bad',     icon: 'fa-circle-xmark' },
  superseded: { label: 'Reemplazado', tone: 'neutral', icon: 'fa-clock-rotate-left' },
};

export function DocStatusBadge({ status }: { status: string }) {
  const s = DOC_STATUS[status] ?? { label: status, tone: 'neutral' as Tone, icon: 'fa-circle' };
  return <StatusBadge tone={s.tone} icon={s.icon}>{s.label}</StatusBadge>;
}

/* ── Términos y firma ───────────────────────────────────────────────── */

export function TermsBlock({ accepted, acceptedAt, signature }: { accepted?: boolean; acceptedAt?: string | null; signature?: string | null }) {
  return (
    <div className="d-grid gap-3">
      <div>
        <div className="small bugie-muted mb-1">Aceptó términos y condiciones</div>
        <StatusBadge tone={accepted ? 'ok' : 'bad'} icon={accepted ? 'fa-circle-check' : 'fa-circle-xmark'}>
          {accepted ? 'Sí' : 'No'}
        </StatusBadge>
        {acceptedAt && <div className="small bugie-muted mt-1">{fmtDateTime(acceptedAt)}</div>}
      </div>
      <div>
        <div className="small bugie-muted mb-1">Firma</div>
        {signature ? (
          // La firma es tinta oscura sobre transparente: fondo blanco para que se lea también en modo oscuro.
          <img src={signature} alt="Firma del usuario"
               style={{ maxWidth: '100%', maxHeight: 120, background: 'white', borderRadius: 8,
                        border: '1px solid var(--bugie-border)', padding: 4 }} />
        ) : <span className="small bugie-muted">Sin firma registrada</span>}
      </div>
    </div>
  );
}

/* ── Estrellas ──────────────────────────────────────────────────────── */

/// Sin reseñas reales no mostramos "5.0 (0)": el 5.0 es el valor por defecto.
export function StarRating({ rating, total }: { rating: number; total: number }) {
  const has = total > 0;
  return (
    <span className="d-inline-flex align-items-center gap-1" aria-label={has ? `${rating.toFixed(1)} de 5, ${total} calificaciones` : 'Sin calificación'}>
      {[1, 2, 3, 4, 5].map(i => (
        <i key={i} className="fa-solid fa-star" aria-hidden="true"
           style={{ fontSize: '.7rem', color: has && i <= Math.round(rating) ? 'var(--bugie-warn)' : 'var(--bugie-border)' }} />
      ))}
      <span className="small bugie-muted ms-1">{has ? `${rating.toFixed(1)} (${total})` : 'Sin calificación'}</span>
    </span>
  );
}

/* ── Vista previa de documento ──────────────────────────────────────── */

export interface PreviewDoc {
  id: string; docType: string; fileUrl: string;
  originalFileName: string | null; mimeType: string | null;
}

/// `downloadUrl`: endpoint protegido para descargar el original (requiere token).
export function DocPreviewModal({ doc, label, icon = 'fa-file', service, downloadUrl, onClose, footerExtra }: {
  doc: PreviewDoc | null; label: string; icon?: string; service: 'auth' | 'drivers';
  downloadUrl?: string; onClose: () => void; footerExtra?: ReactNode;
}) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const url = doc ? fileUrl(service, doc.fileUrl) ?? '' : '';
  const isImage = doc?.mimeType?.startsWith('image/');
  const isPdf = doc?.mimeType === 'application/pdf';

  // Un <a href> no manda el token y el endpoint exige rol admin: se pide con fetch y se descarga desde memoria.
  async function downloadOriginal() {
    if (!doc || !downloadUrl) return;
    setDownloading(true); setDownloadError(null);
    try {
      const res = await fetch(downloadUrl, { headers: authHeaders() });
      if (!res.ok) {
        // 403 de permiso: mostrar el motivo que manda el backend.
        const b = await res.json().catch(() => ({}));
        throw new Error((b as any).error ?? '');
      }
      const blobUrl = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = doc.originalFileName ?? `documento-${doc.id}`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch (e: any) {
      setDownloadError(e?.message || 'No se pudo descargar el archivo.');
    } finally { setDownloading(false); }
  }

  return (
    <Modal
      open={!!doc}
      onClose={onClose}
      size="lg"
      title={<><i className={`fa-solid ${icon} me-2`} aria-hidden="true" />{label}</>}
      description={doc?.originalFileName ?? undefined}
      footer={doc && (
        <div className="d-flex flex-wrap gap-2 justify-content-end align-items-center w-100">
          {downloadError && <span className="small text-danger me-auto">{downloadError}</span>}
          {footerExtra}
          <a href={url} target="_blank" rel="noreferrer" className="btn btn-sm btn-outline-secondary">
            <i className="fa-solid fa-up-right-from-square me-2" aria-hidden="true" />Abrir en otra pestaña
          </a>
          {downloadUrl && (
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={downloadOriginal} disabled={downloading}>
              <i className={`fa-solid ${downloading ? 'fa-spinner fa-spin' : 'fa-download'} me-2`} aria-hidden="true" />Descargar original
            </button>
          )}
        </div>
      )}
    >
      {doc && (
        <div className="d-flex align-items-center justify-content-center rounded-3"
             style={{ background: 'var(--bugie-bg-2)', minHeight: 200, overflow: 'auto' }}>
          {isImage && <img src={url} alt={label} style={{ maxWidth: '100%', maxHeight: '65dvh' }} />}
          {isPdf && <iframe src={url} title={label} style={{ width: '100%', height: '65dvh', border: 0 }} />}
          {!isImage && !isPdf && (
            <div className="text-center p-4">
              <i className="fa-solid fa-file fa-3x mb-3 d-block bugie-muted" aria-hidden="true" />
              <p className="small bugie-muted mb-0">No se puede previsualizar este tipo de archivo. Ábrelo en otra pestaña.</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

/* ── Paso de revisión (guía visual) ─────────────────────────────────── */

/// Lista de pasos con check: muestra al admin qué falta para poder aprobar.
export function Checklist({ items }: { items: { done: boolean; label: ReactNode }[] }) {
  return (
    <ul className="list-unstyled d-grid gap-2 mb-0">
      {items.map((it, i) => (
        <li key={i} className="d-flex align-items-start gap-2 small">
          <i className={`fa-solid ${it.done ? 'fa-circle-check' : 'fa-circle'} mt-1`} aria-hidden="true"
             style={{ color: it.done ? 'var(--bugie-ok)' : 'var(--bugie-border)', transition: 'color var(--bugie-dur) var(--bugie-ease)' }} />
          <span className={it.done ? '' : 'bugie-muted'}>{it.label}</span>
        </li>
      ))}
    </ul>
  );
}

/* ── Conductores: estados y documentos ──────────────────────────────── */

/// Estado del conductor (enum numérico del backend).
export const DRIVER_STATUS: Record<number, { label: string; tone: Tone; icon: string }> = {
  1: { label: 'Faltan documentos', tone: 'warn',    icon: 'fa-file-circle-exclamation' },
  2: { label: 'En revisión',       tone: 'info',    icon: 'fa-magnifying-glass' },
  3: { label: 'Aprobado',          tone: 'ok',      icon: 'fa-circle-check' },
  4: { label: 'Suspendido',        tone: 'bad',     icon: 'fa-ban' },
  5: { label: 'Rechazado',         tone: 'bad',     icon: 'fa-circle-xmark' },
  6: { label: 'Docs vencidos',     tone: 'bad',     icon: 'fa-calendar-xmark' },
};

/// "2026-10-15T23:59:59" (hora de Perú) → "15/10/2026". Se lee el texto tal cual
/// para no correr el día por la zona horaria del navegador.
export function fmtDay(iso?: string | null): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/// Con status 4 y `suspendedUntil` muestra "Suspendido hasta el dd/MM/yyyy";
/// sin fecha, "Suspendido (indefinida)".
export function DriverStatusBadge({ status, suspendedUntil }: { status: number; suspendedUntil?: string | null }) {
  const s = DRIVER_STATUS[status] ?? { label: 'Desconocido', tone: 'neutral' as Tone, icon: 'fa-circle' };
  let label = s.label;
  if (status === 4 && suspendedUntil !== undefined) {
    label = suspendedUntil ? `Suspendido hasta el ${fmtDay(suspendedUntil)}` : 'Suspendido (indefinida)';
  }
  return <StatusBadge tone={s.tone} icon={s.icon}>{label}</StatusBadge>;
}

/// Documentos del conductor (las claves vienen del backend).
export const DRIVER_DOC_LABEL: Record<string, { label: string; icon: string }> = {
  dni_front:                 { label: 'DNI - Frontal',             icon: 'fa-id-card' },
  dni_back:                  { label: 'DNI - Reverso',             icon: 'fa-id-card' },
  license:                   { label: 'Licencia de conducir',      icon: 'fa-car' },
  soat:                      { label: 'SOAT',                      icon: 'fa-shield-halved' },
  tarjeta_propiedad:         { label: 'Tarjeta de propiedad',      icon: 'fa-file-lines' },
  revision_tecnica:          { label: 'Revisión técnica',          icon: 'fa-screwdriver-wrench' },
  certificado_unico_laboral: { label: 'Certificado único laboral', icon: 'fa-clipboard-check' },
};
/// Requisitos que no son un documento subido (pueden venir en missingDocuments).
const DRIVER_EXTRA_LABEL: Record<string, { label: string; icon: string }> = {
  profile_photo: { label: 'Foto de perfil', icon: 'fa-user' },
};
export const driverDocMeta = (t: string) => DRIVER_DOC_LABEL[t] ?? DRIVER_EXTRA_LABEL[t] ?? { label: t, icon: 'fa-file' };
