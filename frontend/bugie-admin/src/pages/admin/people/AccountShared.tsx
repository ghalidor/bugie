// Cuenta de usuario (pasajero, conductor o admin): documento, nombres,
// cuenta eliminada / restaurar, sesiones y cuenta desactivada, e historial de cuenta.
// Endpoints: /api/auth/admin/users/{userId}[/document|/names|/restore|/revoke-sessions|/audit]
// y /api/auth/users/{userId}/reactivate.
import { ReactNode, useEffect, useState } from 'react';
import { API, apiFetch, ApiError } from '../../../state/api';
import {
  EmptyState, Field, FormGrid, Modal, SectionCard, Select, Skeleton, StatusBadge, Tone, useConfirm, useToast,
} from '../../../components/ui';
import { InfoRow, fmtDate, fmtDateTime } from './PeopleShared';

/* ── Tipos ──────────────────────────────────────────────────────────── */

export interface AccountIdentity {
  docType?: string | null;
  docNumber?: string | null;
  firstNames?: string | null;
  lastNamePaternal?: string | null;
  lastNameMaternal?: string | null;
  needsProfileCompletion?: boolean;
  deletedAt?: string | null;
  deletedReason?: string | null;
  /// Cuenta desactivada por el admin (null = no desactivada).
  deactivatedAt?: string | null;
  deactivatedReason?: string | null;
}

export interface AccountAuditItem {
  id: string;
  action: 'deleted' | 'restored' | 'document_changed' | 'names_changed' | 'profile_completed' | string;
  actionLabel: string;
  actorUserId: string | null;
  actorName: string | null;
  actorRole: 'user' | 'admin' | string;
  reason: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
}

const accountUrl = (userId: string) => `${API.auth}/auth/admin/users/${userId}`;

export const REASON_RULES = { reason: 'required' as const, reasonMinLength: 10, reasonMaxLength: 500 };

/* ── Documento y nombres: reglas del backend ───────────────────────── */

export const DOC_TYPE_OPTIONS = [
  { value: 'DNI',       label: 'DNI',                  icon: 'fa-id-card' },
  { value: 'CE',        label: 'Carné de extranjería', icon: 'fa-id-badge' },
  { value: 'PASAPORTE', label: 'Pasaporte',            icon: 'fa-passport' },
];

export const docTypeLabel = (t?: string | null) =>
  DOC_TYPE_OPTIONS.find(o => o.value === t?.toUpperCase())?.label ?? t ?? '';

/// Limpia lo que escribe el admin: sin espacios, en mayúsculas; DNI solo dígitos (máx. 8).
export function normalizeDocNumber(docType: string, raw: string): string {
  const v = raw.replace(/\s+/g, '').toUpperCase();
  return docType === 'DNI' ? v.replace(/\D/g, '').slice(0, 8) : v.replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

/// Mismos mensajes que el backend.
export function docNumberError(docType: string, num: string): string | null {
  if (!num) return 'El número de documento es obligatorio.';
  if (docType === 'DNI' && !/^\d{8}$/.test(num)) return 'El DNI debe tener 8 dígitos.';
  if (docType === 'CE' && !/^[A-Z0-9]{9,12}$/.test(num)) return 'El carné de extranjería debe tener entre 9 y 12 caracteres (solo letras y números).';
  if (docType === 'PASAPORTE' && !/^[A-Z0-9]{6,12}$/.test(num)) return 'El pasaporte debe tener entre 6 y 12 caracteres (solo letras y números).';
  return null;
}

const NAME_RE = /^[\p{L}\s'.-]+$/u;

export function nameError(value: string, label: string, max: number, required: boolean): string | null {
  const v = value.trim();
  if (!v) return required ? `${label} ${label.startsWith('Los') ? 'son obligatorios' : 'es obligatorio'}.` : null;
  if (v.length > max) return `Máximo ${max} caracteres.`;
  if (!NAME_RE.test(v)) return 'Solo letras, espacios, apóstrofo, punto o guion.';
  return null;
}

export const fmtDocument = (i: AccountIdentity) =>
  i.docType && i.docNumber ? `${docTypeLabel(i.docType)} ${i.docNumber}` : null;

/* ── Campos reutilizables (crear admin, corregir) ───────────────────── */

export interface DocValue { docType: string; docNumber: string }
export interface NamesValue { firstNames: string; lastNamePaternal: string; lastNameMaternal: string }

/// Tipo + número con validación en vivo. `touched` muestra el error aunque el campo esté vacío.
export function DocFields({ value, onChange, touched, disabled }: {
  value: DocValue; onChange: (v: DocValue) => void; touched?: boolean; disabled?: boolean;
}) {
  const err = value.docNumber || touched ? docNumberError(value.docType, value.docNumber) : null;
  return (
    <FormGrid>
      <Field label="Tipo de documento" required>
        <Select value={value.docType} disabled={disabled} options={DOC_TYPE_OPTIONS}
                onChange={t => onChange({ docType: t, docNumber: normalizeDocNumber(t, value.docNumber) })} />
      </Field>
      <Field label="Número de documento" required error={err ?? undefined}
             help={value.docType === 'DNI' ? '8 dígitos.' : value.docType === 'CE' ? '9 a 12 letras o números.' : '6 a 12 letras o números.'}>
        <input className="form-control" value={value.docNumber} disabled={disabled} autoComplete="off"
               inputMode={value.docType === 'DNI' ? 'numeric' : 'text'} maxLength={value.docType === 'DNI' ? 8 : 12}
               onChange={e => onChange({ ...value, docNumber: normalizeDocNumber(value.docType, e.target.value) })} />
      </Field>
    </FormGrid>
  );
}

export function namesErrors(v: NamesValue) {
  return {
    firstNames: nameError(v.firstNames, 'Los nombres', 60, true),
    lastNamePaternal: nameError(v.lastNamePaternal, 'El apellido paterno', 40, true),
    lastNameMaternal: nameError(v.lastNameMaternal, 'El apellido materno', 40, false),
  };
}

export function NameFields({ value, onChange, touched }: {
  value: NamesValue; onChange: (v: NamesValue) => void; touched?: boolean;
}) {
  const errs = namesErrors(value);
  const show = (k: keyof NamesValue) => (value[k] || touched ? errs[k] ?? undefined : undefined);
  const set = (k: keyof NamesValue) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value });
  return (
    <FormGrid>
      <Field label="Nombres" required error={show('firstNames')} span="full">
        <input className="form-control" value={value.firstNames} onChange={set('firstNames')} maxLength={60} autoComplete="off" placeholder="Juan Carlos" />
      </Field>
      <Field label="Apellido paterno" required error={show('lastNamePaternal')}>
        <input className="form-control" value={value.lastNamePaternal} onChange={set('lastNamePaternal')} maxLength={40} autoComplete="off" placeholder="Pérez" />
      </Field>
      <Field label="Apellido materno" optional error={show('lastNameMaternal')} help="Si tiene un solo apellido, déjalo vacío.">
        <input className="form-control" value={value.lastNameMaternal} onChange={set('lastNameMaternal')} maxLength={40} autoComplete="off" placeholder="García" />
      </Field>
    </FormGrid>
  );
}

/* ── Insignias ──────────────────────────────────────────────────────── */

/// "Cuenta eliminada" + fecha; el motivo va en el tooltip (y en la línea si `showReason`).
export function DeletedBadge({ deletedAt, deletedReason, withDate = true }: {
  deletedAt: string; deletedReason?: string | null; withDate?: boolean;
}) {
  const title = `Eliminada el ${fmtDateTime(deletedAt)}${deletedReason ? ` · Motivo: ${deletedReason}` : ''}`;
  return (
    <span className="d-inline-flex flex-column gap-1" style={{ minWidth: 0 }}>
      <StatusBadge tone="bad" icon="fa-user-xmark" size="sm" title={title}>Cuenta eliminada</StatusBadge>
      {withDate && <span className="small bugie-muted text-truncate" title={title}>el {fmtDate(deletedAt)}</span>}
    </span>
  );
}

export function IncompleteBadge() {
  return (
    <StatusBadge tone="warn" icon="fa-triangle-exclamation" size="sm"
                 title="Le falta el documento o los nombres separados. Se le pedirán al iniciar sesión.">
      Datos incompletos
    </StatusBadge>
  );
}

/* ── Banner de cuenta eliminada + restaurar ─────────────────────────── */

/// Aviso de cuenta eliminada con el botón «Restaurar cuenta» (motivo 10-500).
/// `note`: qué acciones quedan deshabilitadas mientras siga eliminada.
export function DeletedAccountBanner({ userId, deletedAt, deletedReason, note, onRestored }: {
  userId: string; deletedAt: string; deletedReason?: string | null; note?: ReactNode; onRestored: () => void;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function restore() {
    const res = await confirm({
      title: '¿Restaurar esta cuenta?',
      message: 'La persona podrá volver a iniciar sesión con su correo y contraseña. Queda registrado en el historial de la cuenta.',
      tone: 'primary', confirmText: 'Restaurar cuenta',
      reasonLabel: 'Motivo de la restauración', reasonPlaceholder: 'Ej.: La persona lo pidió por soporte y validamos su identidad.',
      ...REASON_RULES,
    });
    if (!res) return;
    setBusy(true);
    try {
      await apiFetch(`${accountUrl(userId)}/restore`, { method: 'POST', body: JSON.stringify({ reason: res.reason }) });
      toast.success('Cuenta restaurada.');
      onRestored();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'No se pudo restaurar la cuenta.');
    } finally { setBusy(false); }
  }

  return (
    <div className="alert alert-danger mb-3" role="status">
      <div className="d-flex align-items-start gap-3 flex-wrap">
        <span className="bx-stat-icon bx-tone-bad" aria-hidden="true"><i className="fa-solid fa-user-xmark" /></span>
        <div className="flex-grow-1" style={{ minWidth: 0, flexBasis: 240 }}>
          <div className="fw-bold">Cuenta eliminada</div>
          <div className="small">Eliminada el {fmtDateTime(deletedAt)}</div>
          <div className="small mt-1" style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-line' }}>
            <span className="fw-semibold">Motivo:</span> {deletedReason || 'Sin motivo indicado.'}
          </div>
          {note && <div className="small mt-1">{note}</div>}
        </div>
        <button type="button" className="btn btn-sm btn-bugie" disabled={busy} onClick={restore} style={{ alignSelf: 'center' }}>
          {busy ? <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
                : <i className="fa-solid fa-rotate-left me-2" aria-hidden="true" />}
          Restaurar cuenta
        </button>
      </div>
    </div>
  );
}

/* ── Acceso: cuenta desactivada + reactivar, cerrar todas las sesiones ── */

/// "Cuenta desactivada" + fecha; el motivo va en el tooltip.
export function DeactivatedBadge({ deactivatedAt, deactivatedReason }: {
  deactivatedAt: string; deactivatedReason?: string | null;
}) {
  const title = `Desactivada el ${fmtDateTime(deactivatedAt)}${deactivatedReason ? ` · Motivo: ${deactivatedReason}` : ''}`;
  return <StatusBadge tone="bad" icon="fa-user-slash" size="sm" title={title}>Cuenta desactivada</StatusBadge>;
}

/// Tarjeta «Acceso a la cuenta»:
///  - Si está desactivada: estado, fecha, motivo y «Reactivar cuenta».
///  - «Cerrar todas sus sesiones»: sus tokens dejan de valer en todas las APIs
///    (en la app, la web y el panel tendrá que volver a iniciar sesión).
/// Ambas acciones piden confirmación con motivo opcional y quedan en el historial.
/// No se muestra para cuentas eliminadas (ya no pueden iniciar sesión).
export function AccountAccessCard({ userId, info, onChanged }: {
  userId: string; info: AccountIdentity; onChanged: () => void;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState<'revoke' | 'reactivate' | null>(null);

  if (info.deletedAt) return null;

  async function revoke() {
    const res = await confirm({
      title: '¿Cerrar todas sus sesiones?',
      message: 'Se cerrará su sesión en la app, la web y el panel. Podrá volver a iniciar sesión con su correo y contraseña. Queda registrado en el historial de la cuenta.',
      tone: 'warning', confirmText: 'Cerrar sesiones',
      reason: 'optional', reasonMaxLength: 500,
      reasonPlaceholder: 'Ej.: Reportó que perdió su celular.',
    });
    if (!res) return;
    setBusy('revoke');
    try {
      await apiFetch(`${accountUrl(userId)}/revoke-sessions`, { method: 'POST', body: JSON.stringify({ reason: res.reason || null }) });
      toast.success('Se cerraron todas sus sesiones.');
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'No se pudieron cerrar las sesiones.');
    } finally { setBusy(null); }
  }

  async function reactivate() {
    const res = await confirm({
      title: '¿Reactivar esta cuenta?',
      message: 'La persona podrá volver a iniciar sesión con su correo y contraseña. Queda registrado en el historial de la cuenta.',
      tone: 'primary', confirmText: 'Reactivar cuenta',
      reason: 'optional', reasonMaxLength: 500,
      reasonPlaceholder: 'Ej.: Se aclaró el reporte con soporte.',
    });
    if (!res) return;
    setBusy('reactivate');
    try {
      await apiFetch(`${API.auth}/auth/users/${userId}/reactivate`, { method: 'PUT', body: JSON.stringify({ reason: res.reason || null }) });
      toast.success('Cuenta reactivada.');
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'No se pudo reactivar la cuenta.');
    } finally { setBusy(null); }
  }

  const spin = <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />;
  return (
    <SectionCard title="Acceso a la cuenta" icon="fa-key">
      {info.deactivatedAt ? (
        <div className="alert alert-danger mb-3" role="status">
          <div className="d-flex align-items-start gap-3 flex-wrap">
            <span className="bx-stat-icon bx-tone-bad" aria-hidden="true"><i className="fa-solid fa-user-slash" /></span>
            <div className="flex-grow-1" style={{ minWidth: 0, flexBasis: 220 }}>
              <div className="fw-bold">Cuenta desactivada</div>
              <div className="small">Desactivada el {fmtDateTime(info.deactivatedAt)}</div>
              <div className="small mt-1" style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-line' }}>
                <span className="fw-semibold">Motivo:</span> {info.deactivatedReason || 'Sin motivo indicado.'}
              </div>
              <div className="small mt-1">No puede iniciar sesión mientras siga desactivada.</div>
            </div>
            <button type="button" className="btn btn-sm btn-bugie" disabled={!!busy} onClick={reactivate} style={{ alignSelf: 'center' }}>
              {busy === 'reactivate' ? spin : <i className="fa-solid fa-user-check me-2" aria-hidden="true" />}
              Reactivar cuenta
            </button>
          </div>
        </div>
      ) : (
        <p className="small bugie-muted mb-3">
          Si la persona perdió su celular o sospecha que alguien entró a su cuenta, cierra todas sus sesiones.
        </p>
      )}
      <button type="button" className="btn btn-sm btn-outline-secondary" disabled={!!busy} onClick={revoke}>
        {busy === 'revoke' ? spin : <i className="fa-solid fa-right-from-bracket me-2" aria-hidden="true" />}
        Cerrar todas sus sesiones
      </button>
    </SectionCard>
  );
}

/* ── Tarjeta de identidad + correcciones ────────────────────────────── */

/// Nombres, apellidos y documento, con «Corregir nombres» y «Corregir documento».
export function IdentityCard({ userId, info, onChanged }: {
  userId: string; info: AccountIdentity; onChanged: () => void;
}) {
  const [editing, setEditing] = useState<'names' | 'document' | null>(null);
  const doc = fmtDocument(info);
  return (
    <SectionCard
      title="Identidad"
      icon="fa-id-card"
      description="Datos con los que se registró. Corrígelos solo con un motivo."
      actions={info.needsProfileCompletion ? <IncompleteBadge /> : undefined}
      footer={
        <div className="d-flex flex-wrap gap-2 justify-content-end">
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setEditing('names')}>
            <i className="fa-solid fa-signature me-1" aria-hidden="true" />Corregir nombres
          </button>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setEditing('document')}>
            <i className="fa-solid fa-id-card me-1" aria-hidden="true" />Corregir documento
          </button>
        </div>
      }
    >
      <InfoRow icon="fa-user" label="Nombres">{info.firstNames || <Missing />}</InfoRow>
      <InfoRow icon="fa-user" label="Apellido paterno">{info.lastNamePaternal || <Missing />}</InfoRow>
      <InfoRow icon="fa-user" label="Apellido materno">{info.lastNameMaternal || <span className="bugie-muted fw-normal">—</span>}</InfoRow>
      <InfoRow icon="fa-id-card" label="Documento">{doc ?? <Missing />}</InfoRow>

      <CorrectNamesModal open={editing === 'names'} userId={userId} info={info}
                         onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />
      <CorrectDocumentModal open={editing === 'document'} userId={userId} info={info}
                            onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />
    </SectionCard>
  );
}

const Missing = () => <span className="text-warning fw-normal">Sin registrar</span>;

/// Motivo obligatorio (10-500) con contador.
function ReasonField({ value, onChange, touched }: { value: string; onChange: (v: string) => void; touched: boolean }) {
  const len = value.trim().length;
  const err = touched || value ? (len < 10 ? 'El motivo debe tener al menos 10 caracteres.' : len > 500 ? 'Máximo 500 caracteres.' : null) : null;
  return (
    <Field label="Motivo de la corrección" required error={err ?? undefined} help={`${len}/500 · mínimo 10 caracteres. Queda en el historial de la cuenta.`}>
      <textarea className="form-control" rows={3} maxLength={500} value={value} onChange={e => onChange(e.target.value)}
                placeholder="Ej.: El pasajero envió foto de su DNI y el número estaba mal digitado." />
    </Field>
  );
}

const reasonOk = (r: string) => r.trim().length >= 10 && r.trim().length <= 500;

function CorrectNamesModal({ open, userId, info, onClose, onSaved }: {
  open: boolean; userId: string; info: AccountIdentity; onClose: () => void; onSaved: () => void;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const [names, setNames] = useState<NamesValue>({ firstNames: '', lastNamePaternal: '', lastNameMaternal: '' });
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setNames({ firstNames: info.firstNames ?? '', lastNamePaternal: info.lastNamePaternal ?? '', lastNameMaternal: info.lastNameMaternal ?? '' });
    setReason(''); setTouched(false); setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const full = (n: { firstNames?: string | null; lastNamePaternal?: string | null; lastNameMaternal?: string | null }) =>
    [n.firstNames, n.lastNamePaternal, n.lastNameMaternal].map(x => x?.trim()).filter(Boolean).join(' ') || '—';

  async function save() {
    setTouched(true); setError(null);
    if (Object.values(namesErrors(names)).some(Boolean) || !reasonOk(reason)) return;
    const ok = await confirm({
      title: '¿Guardar la corrección de nombres?',
      message: <>Antes: <strong>{full(info)}</strong><br />Ahora: <strong>{full(names)}</strong></>,
      confirmText: 'Guardar corrección',
    });
    if (!ok) return;
    setSaving(true);
    try {
      await apiFetch(`${accountUrl(userId)}/names`, {
        method: 'PUT',
        body: JSON.stringify({
          firstNames: names.firstNames.trim(),
          lastNamePaternal: names.lastNamePaternal.trim(),
          lastNameMaternal: names.lastNameMaternal.trim() || null,
          reason: reason.trim(),
        }),
      });
      toast.success('Nombres corregidos.');
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar la corrección.');
    } finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} busy={saving} dirty="auto" size="md"
           title="Corregir nombres" description="El nombre completo se arma con nombres + apellidos."
           footer={<ModalButtons saving={saving} onCancel={onClose} onSave={save} />}>
      <div className="d-grid gap-3">
        <NameFields value={names} onChange={setNames} touched={touched} />
        <ReasonField value={reason} onChange={setReason} touched={touched} />
        {error && <div className="alert alert-danger small mb-0" role="alert">{error}</div>}
      </div>
    </Modal>
  );
}

function CorrectDocumentModal({ open, userId, info, onClose, onSaved }: {
  open: boolean; userId: string; info: AccountIdentity; onClose: () => void; onSaved: () => void;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const [doc, setDoc] = useState<DocValue>({ docType: 'DNI', docNumber: '' });
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const t = (info.docType ?? 'DNI').toUpperCase();
    setDoc({ docType: DOC_TYPE_OPTIONS.some(o => o.value === t) ? t : 'DNI', docNumber: info.docNumber ?? '' });
    setReason(''); setTouched(false); setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function save() {
    setTouched(true); setError(null);
    if (docNumberError(doc.docType, doc.docNumber) || !reasonOk(reason)) return;
    const ok = await confirm({
      title: '¿Guardar la corrección de documento?',
      message: <>Antes: <strong>{fmtDocument(info) ?? 'Sin documento'}</strong><br />Ahora: <strong>{fmtDocument(doc)}</strong></>,
      confirmText: 'Guardar corrección',
    });
    if (!ok) return;
    setSaving(true);
    try {
      await apiFetch(`${accountUrl(userId)}/document`, {
        method: 'PUT', body: JSON.stringify({ docType: doc.docType, docNumber: doc.docNumber, reason: reason.trim() }),
      });
      toast.success('Documento corregido.');
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar la corrección.');
    } finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} busy={saving} dirty="auto" size="md"
           title="Corregir documento" description="No puede repetirse con el de otra cuenta."
           footer={<ModalButtons saving={saving} onCancel={onClose} onSave={save} />}>
      <div className="d-grid gap-3">
        <DocFields value={doc} onChange={setDoc} touched={touched} />
        <ReasonField value={reason} onChange={setReason} touched={touched} />
        {error && <div className="alert alert-danger small mb-0" role="alert">{error}</div>}
      </div>
    </Modal>
  );
}

function ModalButtons({ saving, onCancel, onSave }: { saving: boolean; onCancel: () => void; onSave: () => void }) {
  return (
    <div className="d-flex gap-2 justify-content-end w-100">
      <button type="button" className="btn btn-outline-secondary" onClick={onCancel} disabled={saving}>Cancelar</button>
      <button type="button" className="btn btn-bugie" onClick={onSave} disabled={saving}>
        {saving ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Guardando…</>
                : <><i className="fa-solid fa-floppy-disk me-2" aria-hidden="true" />Guardar</>}
      </button>
    </div>
  );
}

/* ── Historial de cuenta ────────────────────────────────────────────── */

export const fetchAccountAudit = (userId: string) => apiFetch<AccountAuditItem[]>(`${accountUrl(userId)}/audit`);

export const AUDIT_META: Record<string, { icon: string; tone: Tone }> = {
  deleted:           { icon: 'fa-user-xmark',      tone: 'bad' },
  restored:          { icon: 'fa-rotate-left',     tone: 'ok' },
  document_changed:  { icon: 'fa-id-card',         tone: 'info' },
  names_changed:     { icon: 'fa-signature',       tone: 'info' },
  profile_completed: { icon: 'fa-user-check',      tone: 'primary' },
  deactivated:       { icon: 'fa-user-slash',      tone: 'bad' },
  reactivated:       { icon: 'fa-user-check',      tone: 'ok' },
  sessions_revoked:  { icon: 'fa-right-from-bracket', tone: 'warn' },
};

export const auditActor = (a: AccountAuditItem) =>
  `${a.actorName || (a.actorRole === 'user' ? 'La misma persona' : 'Administrador')} · ${a.actorRole === 'admin' ? 'Administrador' : 'Usuario'}`;

/// "anterior → nuevo" (o solo uno de los dos si falta).
export function AuditChange({ oldValue, newValue }: { oldValue: string | null; newValue: string | null }) {
  if (!oldValue && !newValue) return null;
  return (
    <div className="mt-1" style={{ overflowWrap: 'anywhere' }}>
      <span className="bugie-muted">Cambio:</span>{' '}
      {oldValue ? <s className="bugie-muted">{oldValue}</s> : <span className="bugie-muted">—</span>}
      <i className="fa-solid fa-arrow-right mx-2 bugie-muted" aria-hidden="true" />
      <strong>{newValue || '—'}</strong>
    </div>
  );
}

/// Lista tipo línea de tiempo (más reciente primero). `reloadKey` recarga.
export function AccountAuditList({ userId, reloadKey = 0 }: { userId: string; reloadKey?: number }) {
  const [items, setItems] = useState<AccountAuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    fetchAccountAudit(userId)
      .then(list => { if (alive) setItems([...(list ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))); })
      .catch(e => { if (alive) setError(e instanceof ApiError ? e.message : 'No se pudo cargar el historial.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [userId, reloadKey, retry]);

  return (
    <SectionCard
      title="Historial de cuenta"
      icon="fa-clock-rotate-left"
      description="Correcciones de datos, eliminación y restauración: quién, cuándo y por qué."
      actions={!loading && !error && <StatusBadge tone="neutral">{items.length} registro{items.length === 1 ? '' : 's'}</StatusBadge>}
    >
      {loading ? (
        <Skeleton count={3} height={56} radius={10} />
      ) : error ? (
        <EmptyState compact variant="error" title="No se pudo cargar el historial" text={error}
          action={<button className="btn btn-sm btn-bugie" onClick={() => setRetry(r => r + 1)}>Reintentar</button>} />
      ) : items.length === 0 ? (
        <EmptyState compact title="Sin movimientos" text="Esta cuenta no tiene correcciones ni cambios registrados." icon="fa-clock-rotate-left" />
      ) : (
        <ol className="list-unstyled mb-0">
          {items.map((a, i) => (
            <AuditTimelineRow key={a.id} last={i === items.length - 1}
              icon={AUDIT_META[a.action]?.icon ?? 'fa-circle-info'} tone={AUDIT_META[a.action]?.tone ?? 'neutral'}
              title={a.actionLabel} at={a.createdAt} actor={auditActor(a)} reason={a.reason}>
              <AuditChange oldValue={a.oldValue} newValue={a.newValue} />
            </AuditTimelineRow>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}

/// Fila de la línea de tiempo (ícono + riel vertical).
export function AuditTimelineRow({ last, icon, tone, title, at, actor, reason, reasonLabel = 'Motivo:', children }: {
  last: boolean; icon: string; tone: Tone; title: ReactNode; at: string; actor: ReactNode;
  reason?: string | null; reasonLabel?: string; children?: ReactNode;
}) {
  return (
    <li className="d-flex gap-3">
      <div className="d-flex flex-column align-items-center" style={{ flex: '0 0 auto' }}>
        <span className={`bx-stat-icon bx-tone-${tone}`} aria-hidden="true"><i className={`fa-solid ${icon}`} /></span>
        {!last && <span aria-hidden="true" style={{ flex: '1 1 auto', width: 2, minHeight: 12, background: 'var(--bugie-border)', margin: '4px 0' }} />}
      </div>
      <div className={`small flex-grow-1 ${last ? '' : 'pb-3'}`} style={{ minWidth: 0 }}>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <span className="fw-semibold">{title}</span>
          <span className="ms-auto bugie-muted">{fmtDateTime(at)}</span>
        </div>
        <div className="bugie-muted mt-1">{actor}</div>
        {reason && (
          <div className="mt-1" style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-line' }}>
            <span className="bugie-muted">{reasonLabel}</span> {reason}
          </div>
        )}
        {children}
      </div>
    </li>
  );
}
