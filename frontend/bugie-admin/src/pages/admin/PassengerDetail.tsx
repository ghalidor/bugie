import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import UserTripsSection from '../../components/UserTripsSection';
import { API, apiFetch, ApiError } from '../../state/api';
import EmergencyContactCard from '../../components/EmergencyContactCard';
import {
  Checkbox, EmptyState, Page, SectionCard, Skeleton, StatusBadge, Tabs, Tone, useConfirm, useTabParam, useToast,
} from '../../components/ui';
import {
  Avatar, Checklist, DocPreviewModal, DocStatusBadge, InfoRow, TermsBlock, fileUrl, fmtDate,
} from './people/PeopleShared';
import {
  AccountAccessCard, AccountAuditList, AccountIdentity, DeactivatedBadge, DeletedAccountBanner, IdentityCard, IncompleteBadge,
} from './people/AccountShared';
import UserNotifications from './people/UserNotifications';

/// Requisitos de verificación que calcula el backend (DNI frente/reverso + foto de perfil).
interface Requirement {
  key: 'dni_front' | 'dni_back' | 'profile_photo' | string;
  label: string;
  status: 'missing' | 'pending' | 'approved' | 'rejected' | 'uploaded' | string;
  rejectionReason: string | null;
  done: boolean;
}
interface Requirements { isVerified: boolean; readyForReview: boolean; missing: string[]; requirements: Requirement[] }

interface User extends AccountIdentity {
  id: string; email: string; fullName: string; phone: string;
  role: string; isActive: boolean; isVerified: boolean; createdAt: string;
  profilePhotoUrl?: string | null;
  termsAccepted?: boolean;
  termsAcceptedAt?: string | null;
  signatureImage?: string | null;
}
interface Doc {
  id: string; docType: string; fileUrl: string;
  originalFileName: string | null; mimeType: string | null;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason: string | null; createdAt: string;
}

const DOC_LABEL: Record<string, { label: string; icon: string }> = {
  dni_front: { label: 'DNI - Frontal', icon: 'fa-id-card' },
  dni_back:  { label: 'DNI - Reverso', icon: 'fa-id-card' },
};
const docMeta = (t: string) => DOC_LABEL[t] ?? { label: t, icon: 'fa-file' };

const TABS = ['resumen', 'viajes', 'documentos', 'notificaciones', 'cuenta'];

export default function PassengerDetail() {
  const { userId } = useParams<{ userId: string }>();
  const toast   = useToast();
  const confirm = useConfirm();
  const [tab] = useTabParam(TABS);

  const [user,    setUser]    = useState<User | null>(null);
  const [docs,    setDocs]    = useState<Doc[]>([]);
  const [reqs,    setReqs]    = useState<Requirements | null>(null);
  const [auditKey, setAuditKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // Checks de revisión: solo en memoria (no se guardan).
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<Doc | null>(null);
  const [actingDoc, setActingDoc] = useState<string | null>(null);
  const [approvingAll, setApprovingAll] = useState(false);

  useEffect(() => { if (userId) load(userId); }, [userId]);

  async function load(id: string, silent = false) {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const detail = await apiFetch<{ user: User; documents: Doc[]; requirements?: Requirements }>(`${API.auth}/auth/admin/passengers/${id}`);
      setUser(detail.user);
      setDocs(detail.documents ?? []);
      setReqs(detail.requirements ?? null);
    } catch (e: any) {
      setError(e instanceof ApiError ? e.message : 'No se pudo cargar el pasajero.');
    } finally { setLoading(false); }
  }

  /// Tras corregir datos o restaurar: recarga sin parpadeo y refresca el historial.
  function refreshAccount() {
    if (!user) return;
    load(user.id, true);
    setAuditKey(k => k + 1);
  }

  async function approveDoc(doc: Doc) {
    const ok = await confirm({
      title: `¿Aprobar ${docMeta(doc.docType).label}?`,
      message: 'Confirma que revisaste la imagen y que los datos se leen bien y coinciden con el pasajero.',
      confirmText: 'Aprobar documento',
    });
    if (!ok) return;
    setActingDoc(doc.id);
    try {
      const updated = await apiFetch<Doc>(`${API.auth}/auth/passengers/documents/${doc.id}/approve`, { method: 'PUT' });
      setDocs(prev => prev.map(d => d.id === doc.id ? updated : d));
      setReviewed(prev => new Set([...prev, doc.id]));
      setReqs(prev => prev && ({ ...prev, requirements: prev.requirements.map(r => r.key === doc.docType ? { ...r, status: 'approved', rejectionReason: null, done: true } : r) }));
      toast.success(`${docMeta(doc.docType).label} aprobado.`);
    } catch (e: any) { toast.error(e.message ?? 'No se pudo aprobar.'); }
    finally { setActingDoc(null); }
  }

  async function rejectDoc(doc: Doc) {
    const res = await confirm({
      title: `¿Rechazar ${docMeta(doc.docType).label}?`,
      message: 'El pasajero verá el motivo y tendrá que subir el documento de nuevo.',
      tone: 'danger', confirmText: 'Rechazar documento',
      reason: 'required', reasonLabel: 'Motivo del rechazo', reasonPlaceholder: 'Ej.: La foto está borrosa y no se leen los datos.',
    });
    if (!res) return;
    setActingDoc(doc.id);
    try {
      const updated = await apiFetch<Doc>(`${API.auth}/auth/passengers/documents/${doc.id}/reject`,
        { method: 'PUT', body: JSON.stringify({ reason: res.reason }) });
      setDocs(prev => prev.map(d => d.id === doc.id ? updated : d));
      setReqs(prev => prev && ({ ...prev, requirements: prev.requirements.map(r => r.key === doc.docType ? { ...r, status: 'rejected', rejectionReason: res.reason, done: false } : r) }));
      toast.info('Documento rechazado.');
    } catch (e: any) { toast.error(e.message ?? 'No se pudo rechazar.'); }
    finally { setActingDoc(null); }
  }

  async function rejectAll() {
    if (!user) return;
    const res = await confirm({
      title: '¿Pedir que reenvíe sus documentos?',
      message: 'Le enviaremos un correo al pasajero con el motivo para que vuelva a subir su DNI.',
      tone: 'warning', confirmText: 'Enviar correo',
      reason: 'required', reasonLabel: 'Motivo (se envía por correo)',
    });
    if (!res) return;
    setApprovingAll(true);
    try {
      await apiFetch(`${API.auth}/auth/admin/passengers/${user.id}/reject`, {
        method: 'PUT', body: JSON.stringify({ reason: res.reason }),
      });
      toast.success('Correo de rechazo enviado.');
    } catch (e: any) { toast.error(e.message ?? 'No se pudo enviar.'); }
    finally { setApprovingAll(false); }
  }

  /// Marca al pasajero como verificado. El backend manda el correo de "cuenta activa".
  async function approvePassenger() {
    if (!user) return;
    const ok = await confirm({
      title: '¿Aprobar a este pasajero?',
      message: 'Su cuenta quedará verificada y le enviaremos el correo de cuenta activa.',
      confirmText: 'Aprobar pasajero',
    });
    if (!ok) return;
    setApprovingAll(true);
    try {
      await apiFetch(`${API.auth}/auth/admin/passengers/${user.id}/approve`, { method: 'PUT' });
      await load(user.id);
      toast.success('Pasajero aprobado. Se envió el correo de cuenta activa.');
    } catch (e: any) {
      toast.error(e.message ?? 'No se pudo aprobar el pasajero.');
    } finally { setApprovingAll(false); }
  }

  const requiredKeys = ['dni_front', 'dni_back'];
  const allApproved  = requiredKeys.every(k => docs.find(d => d.docType === k)?.status === 'approved');
  const allReviewed  = docs.filter(d => requiredKeys.includes(d.docType))
                           .every(d => reviewed.has(d.id) || d.status === 'approved');
  const deleted      = !!user?.deletedAt;
  // La foto de perfil es requisito (el backend responde 409 si falta).
  const photoReq     = reqs?.requirements.find(r => r.key === 'profile_photo');
  const hasPhoto     = photoReq ? photoReq.done : !!user?.profilePhotoUrl;
  const canApprove   = allApproved && allReviewed && hasPhoto && !deleted && !user?.isVerified;
  // Por qué está deshabilitado «Aprobar pasajero» (lo más importante primero).
  const blockReason  = deleted ? 'La cuenta está eliminada. Restáurala antes de verificarla.'
    : !hasPhoto ? 'Falta la foto de perfil del pasajero. Pídele que la suba desde la app.'
    : null;
  const pendingCount = docs.filter(d => d.status === 'pending').length;

  const back = { to: '/admin/pasajeros', label: 'Pasajeros' };

  if (loading) {
    return (
      <Page title="Cargando pasajero…" back={back}>
        <SectionCard><Skeleton height={64} radius={12} /><div className="mt-3"><Skeleton count={3} /></div></SectionCard>
      </Page>
    );
  }
  if (error || !user) {
    return (
      <Page title="Pasajero" back={back}>
        <SectionCard>
          <EmptyState variant="error" title="No se pudo abrir el pasajero" text={error ?? 'Pasajero no encontrado.'}
            action={userId && <button className="btn btn-sm btn-bugie" onClick={() => load(userId)}>Reintentar</button>} />
        </SectionCard>
      </Page>
    );
  }

  const toggleReviewed = (id: string) => setReviewed(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  // Bloque de verificación: qué falta y botones finales. Se ve en Resumen y al pie de Documentos.
  const verification = (
    <SectionCard
      title="Verificación"
      icon="fa-user-check"
      tourId="passenger-verify"
      description={user.isVerified ? 'Este pasajero ya está verificado.'
        : deleted ? 'No se puede verificar una cuenta eliminada.'
        : 'Completa los pasos para activar la cuenta.'}
      footer={!user.isVerified && (
        <div className="d-grid gap-2">
          {blockReason && (
            <div className="small text-danger d-flex gap-2 align-items-start" role="note">
              <i className="fa-solid fa-circle-info mt-1" aria-hidden="true" /><span>{blockReason}</span>
            </div>
          )}
          <div className="d-flex flex-wrap gap-2 justify-content-end">
            <button className="btn btn-outline-secondary" disabled={approvingAll || docs.length === 0 || deleted} onClick={rejectAll}>
              <i className="fa-solid fa-paper-plane me-2" aria-hidden="true" />Pedir reenvío
            </button>
            <button className="btn btn-success" disabled={approvingAll || !canApprove} onClick={approvePassenger}
                    title={blockReason ?? undefined}>
              {approvingAll
                ? <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
                : <i className="fa-solid fa-circle-check me-2" aria-hidden="true" />}
              Aprobar pasajero
            </button>
          </div>
        </div>
      )}
    >
      {user.isVerified ? (
        <EmptyState compact variant="done" title="Cuenta verificada" text="No hay nada pendiente de revisar." />
      ) : (
        <div className="d-grid gap-3">
          {reqs && <RequirementList items={reqs.requirements} />}
          <Checklist items={[
            { done: docs.length > 0, label: 'El pasajero subió su DNI (frontal y reverso).' },
            { done: hasPhoto, label: 'El pasajero subió su foto de perfil.' },
            { done: allApproved, label: 'Aprobaste los dos lados del DNI.' },
            { done: allReviewed && docs.length > 0, label: 'Marcaste cada documento como revisado.' },
          ]} />
        </div>
      )}
    </SectionCard>
  );

  // Foto de perfil grande junto al DNI (frontal) para comparar la cara.
  const dniFront = docs.find(d => d.docType === 'dni_front' && d.mimeType?.startsWith('image/'));
  const compareCard = (
    <SectionCard title="Comparar identidad" icon="fa-user-check"
                 description="Revisa que la foto de perfil sea de la misma persona del DNI.">
      <div className="d-grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 360px))', justifyContent: 'center' }}>
        <ComparePhoto label="Foto de perfil" src={fileUrl('auth', user.profilePhotoUrl)} empty="El pasajero aún no sube su foto de perfil." />
        <ComparePhoto label="DNI - Frontal" src={dniFront ? fileUrl('auth', dniFront.fileUrl) : null}
                      empty="Sin imagen del DNI frontal." />
      </div>
    </SectionCard>
  );

  return (
    <Page
      title={user.fullName}
      subtitle="Detalle del pasajero"
      back={back}
      helpKey="passenger-detail"
      extra={
        <span className="d-inline-flex flex-wrap gap-2">
          {deleted ? (
            <StatusBadge tone="bad" icon="fa-user-xmark">Cuenta eliminada</StatusBadge>
          ) : (
            <>
              <StatusBadge tone={user.isVerified ? 'ok' : 'warn'} icon={user.isVerified ? 'fa-circle-check' : 'fa-clock'}>
                {user.isVerified ? 'Verificado' : 'Por verificar'}
              </StatusBadge>
              <StatusBadge tone={user.isActive ? 'ok' : 'neutral'} dot>{user.isActive ? 'Activo' : 'Inactivo'}</StatusBadge>
              {user.deactivatedAt && <DeactivatedBadge deactivatedAt={user.deactivatedAt} deactivatedReason={user.deactivatedReason} />}
            </>
          )}
          {user.needsProfileCompletion && <IncompleteBadge />}
        </span>
      }
    >
      {user.deletedAt && (
        <DeletedAccountBanner userId={user.id} deletedAt={user.deletedAt} deletedReason={user.deletedReason}
          onRestored={refreshAccount}
          note="Mientras esté eliminada no se puede verificar ni pedir reenvío de documentos." />
      )}

      <div data-tour="passenger-tabs">
        <Tabs items={[
          { value: 'resumen', label: 'Resumen', icon: 'fa-user' },
          { value: 'viajes', label: 'Viajes', icon: 'fa-route' },
          { value: 'documentos', label: 'Documentos', icon: 'fa-folder-open', count: pendingCount || undefined },
          { value: 'notificaciones', label: 'Notificaciones', icon: 'fa-bell' },
          { value: 'cuenta', label: 'Historial de cuenta', icon: 'fa-clock-rotate-left' },
        ]} />
      </div>

      {tab === 'resumen' && (
        <div className="bx-split">
          <div className="d-grid gap-3">
            <SectionCard>
              <div className="d-flex align-items-center gap-3 flex-wrap">
                <Avatar src={fileUrl('auth', user.profilePhotoUrl)} name={user.fullName} size={72} />
                <div style={{ minWidth: 0 }}>
                  <div className="h5 fw-bold mb-1" style={{ overflowWrap: 'anywhere' }}>{user.fullName}</div>
                  <div className="small bugie-muted">Pasajero desde {fmtDate(user.createdAt)}</div>
                </div>
              </div>
              <div className="mt-3">
                <InfoRow icon="fa-envelope" label="Correo"><a href={`mailto:${user.email}`}>{user.email}</a></InfoRow>
                <InfoRow icon="fa-phone" label="Teléfono">{user.phone ? <a href={`tel:${user.phone}`}>{user.phone}</a> : '—'}</InfoRow>
                <InfoRow icon="fa-calendar-plus" label="Registrado">{fmtDate(user.createdAt)}</InfoRow>
              </div>
            </SectionCard>
            <IdentityCard userId={user.id} info={user} onChanged={refreshAccount} />
            <AccountAccessCard userId={user.id} info={user} onChanged={refreshAccount} />
            <EmergencyContactCard userId={user.id} />
          </div>
          <div className="d-grid gap-3">
            {verification}
            <SectionCard title="Términos y firma" icon="fa-file-signature">
              <TermsBlock accepted={user.termsAccepted} acceptedAt={user.termsAcceptedAt} signature={user.signatureImage} />
            </SectionCard>
          </div>
        </div>
      )}

      {tab === 'documentos' && (
        <>
          <SectionCard
            title="Documentos"
            icon="fa-folder-open"
            description="Abre cada documento, apruébalo o recházalo y marca «Revisado»."
            flush
          >
            {docs.length === 0 ? (
              <EmptyState title="Sin documentos" text="El pasajero aún no ha subido documentos." icon="fa-folder-open" />
            ) : (
              <ul className="list-unstyled mb-0">
                {docs.map(doc => (
                  <DocRow
                    key={doc.id}
                    doc={doc}
                    reviewed={reviewed.has(doc.id) || doc.status === 'approved'}
                    acting={actingDoc === doc.id}
                    onToggleReviewed={() => toggleReviewed(doc.id)}
                    onPreview={() => setPreview(doc)}
                    onApprove={() => approveDoc(doc)}
                    onReject={() => rejectDoc(doc)}
                  />
                ))}
              </ul>
            )}
          </SectionCard>
          {compareCard}
          {verification}
        </>
      )}

      {tab === 'viajes' && <UserTripsSection mode="passenger" userId={user.id} />}

      {tab === 'notificaciones' && <UserNotifications userId={user.id} who="pasajero" />}

      {tab === 'cuenta' && <AccountAuditList userId={user.id} reloadKey={auditKey} />}

      <DocPreviewModal
        doc={preview}
        label={preview ? docMeta(preview.docType).label : ''}
        icon={preview ? docMeta(preview.docType).icon : undefined}
        service="auth"
        onClose={() => setPreview(null)}
      />
    </Page>
  );
}

/// Estado de cada requisito de verificación (incluye la foto de perfil).
const REQ_STATUS: Record<string, { label: string; tone: Tone; icon: string }> = {
  missing:  { label: 'Falta',       tone: 'bad',  icon: 'fa-circle-exclamation' },
  pending:  { label: 'Por revisar', tone: 'warn', icon: 'fa-clock' },
  approved: { label: 'Aprobado',    tone: 'ok',   icon: 'fa-circle-check' },
  rejected: { label: 'Rechazado',   tone: 'bad',  icon: 'fa-circle-xmark' },
  uploaded: { label: 'Subida',      tone: 'ok',   icon: 'fa-circle-check' },
};

function RequirementList({ items }: { items: Requirement[] }) {
  return (
    <ul className="list-unstyled d-grid gap-2 mb-0">
      {items.map(r => {
        const s = REQ_STATUS[r.status] ?? { label: r.status, tone: 'neutral' as Tone, icon: 'fa-circle' };
        return (
          <li key={r.key} className="d-flex align-items-start gap-2 flex-wrap small">
            <i className={`fa-solid ${r.key === 'profile_photo' ? 'fa-user' : 'fa-id-card'} mt-1 bugie-muted`} aria-hidden="true" />
            <div className="flex-grow-1" style={{ minWidth: 0 }}>
              <span className="fw-semibold">{r.label}</span>
              {r.rejectionReason && <div className="text-danger">Motivo: {r.rejectionReason}</div>}
            </div>
            <StatusBadge tone={s.tone} icon={s.icon} size="sm">{s.label}</StatusBadge>
          </li>
        );
      })}
    </ul>
  );
}

function ComparePhoto({ label, src, empty }: { label: string; src: string | null; empty: string }) {
  return (
    <figure className="mb-0">
      {src ? (
        <a href={src} target="_blank" rel="noreferrer" title={`Abrir ${label} en otra pestaña`}>
          <img src={src} alt={label}
               style={{ width: '100%', aspectRatio: '4 / 3', maxHeight: 280, objectFit: 'contain', borderRadius: 12,
                        background: 'var(--bugie-bg-2)', border: '1px solid var(--bugie-border)', display: 'block' }} />
        </a>
      ) : (
        <div className="d-flex flex-column align-items-center justify-content-center text-center small bugie-muted p-3 gap-2"
             style={{ aspectRatio: '4 / 3', maxHeight: 280, borderRadius: 12, background: 'var(--bugie-bg-2)', border: '1px dashed var(--bugie-border)' }}>
          <i className="fa-solid fa-image fa-2x" aria-hidden="true" />{empty}
        </div>
      )}
      <figcaption className="small fw-semibold mt-2 text-center">{label}</figcaption>
    </figure>
  );
}

/// Fila de documento: check de revisado, nombre, estado y acciones con texto.
function DocRow({ doc, reviewed, acting, onToggleReviewed, onPreview, onApprove, onReject }: {
  doc: Doc; reviewed: boolean; acting: boolean;
  onToggleReviewed: () => void; onPreview: () => void; onApprove: () => void; onReject: () => void;
}) {
  const meta = docMeta(doc.docType);
  const checkId = `rev-${doc.id}`;
  return (
    <li className="d-flex flex-wrap align-items-center gap-3 p-3" style={{ borderTop: '1px solid var(--bugie-border)' }}>
      <div className="d-flex align-items-center gap-3 flex-grow-1" style={{ minWidth: 0, flexBasis: 240 }}>
        <span className="bx-stat-icon bx-tone-primary" aria-hidden="true"><i className={`fa-solid ${meta.icon}`} /></span>
        <div style={{ minWidth: 0 }}>
          <div className="fw-semibold d-flex flex-wrap align-items-center gap-2">{meta.label} <DocStatusBadge status={doc.status} /></div>
          <div className="small bugie-muted text-truncate">{doc.originalFileName ?? 'archivo'} · subido {fmtDate(doc.createdAt)}</div>
          {doc.rejectionReason && (
            <div className="small text-danger mt-1"><i className="fa-solid fa-circle-info me-1" aria-hidden="true" />Motivo: {doc.rejectionReason}</div>
          )}
        </div>
      </div>
      <Checkbox id={checkId} size="sm" checked={reviewed} onChange={() => onToggleReviewed()} label="Revisado" />
      <div className="d-flex flex-wrap gap-2">
        <button className="btn btn-sm btn-outline-secondary" onClick={onPreview}>
          <i className="fa-solid fa-eye me-1" aria-hidden="true" />Ver
        </button>
        <button className="btn btn-sm btn-success" disabled={acting || doc.status === 'approved'} onClick={onApprove}>
          {acting ? <span className="spinner-border spinner-border-sm me-1" aria-hidden="true" /> : <i className="fa-solid fa-check me-1" aria-hidden="true" />}
          Aprobar
        </button>
        <button className="btn btn-sm btn-outline-danger" disabled={acting} onClick={onReject}>
          <i className="fa-solid fa-xmark me-1" aria-hidden="true" />Rechazar
        </button>
      </div>
    </li>
  );
}
