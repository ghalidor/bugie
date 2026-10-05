import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { API, apiFetch, ApiError, driversFileUrl } from '../../state/api';
import { Notice, Page, SectionCard, Skeleton, StatusBadge, Tone, useToast } from '../../components/ui';

interface Doc {
  id:               string;
  docType:          string;
  fileUrl:          string;
  originalFileName: string | null;
  mimeType:         string | null;
  sizeBytes:        number | null;
  status:           'pending' | 'approved' | 'rejected' | 'superseded';
  rejectionReason:  string | null;
  expiresAt:        string | null;
  createdAt:        string;
}

interface DriverProfile {
  id: string; status: number;
  // Aprobación por excepción: fecha límite para completar documentos,
  // faltas acumuladas y documentos obligatorios que faltan (los calcula el backend).
  documentsDeadline?: string | null;
  strikes?: number;
  missingDocuments?: string[] | null;
}

const REQUIRED_DOCS: Array<{
  key: string; label: string; icon: string; description: string; needsExpiry?: boolean;
}> = [
  { key: 'dni_front',                 label: 'DNI - Frontal',              icon: 'fa-id-card',           description: 'Foto clara del frente de tu DNI.' },
  { key: 'dni_back',                  label: 'DNI - Reverso',              icon: 'fa-id-card',           description: 'Foto clara del reverso de tu DNI.' },
  { key: 'license',                   label: 'Licencia de conducir',       icon: 'fa-car',               description: 'Licencia A-IIa o superior, vigente.', needsExpiry: true },
  { key: 'soat',                      label: 'SOAT',                        icon: 'fa-shield-halved',     description: 'SOAT vigente del vehículo.',          needsExpiry: true },
  { key: 'tarjeta_propiedad',         label: 'Tarjeta de propiedad',       icon: 'fa-file-lines',        description: 'Tarjeta de propiedad del vehículo.' },
  { key: 'revision_tecnica',          label: 'Revisión técnica',           icon: 'fa-screwdriver-wrench', description: 'Solo obligatoria si el vehículo tiene 5 años o más.', needsExpiry: true },
  { key: 'certificado_unico_laboral', label: 'Certificado único laboral',  icon: 'fa-clipboard-check',   description: 'Certificado único laboral del MTPE.' },
];

// Requisitos que no son documentos de esta lista pero pueden venir en missingDocuments.
const EXTRA_LABELS: Record<string, string> = {
  profile_photo: 'Foto de perfil',
};

const STATUS_CFG: Record<string, { label: string; tone: Tone }> = {
  pending:    { label: 'En revisión', tone: 'warn' },
  approved:   { label: 'Aprobado',    tone: 'ok' },
  rejected:   { label: 'Rechazado',   tone: 'bad' },
  superseded: { label: 'Reemplazado', tone: 'neutral' },
};

function isExpired(doc: Doc): boolean {
  if (!doc.expiresAt) return false;
  return new Date(doc.expiresAt) <= new Date();
}

export default function DriverDocuments() {
  const toast = useToast();
  const [profile,  setProfile] = useState<DriverProfile | null>(null);
  const [docs,     setDocs]    = useState<Doc[]>([]);
  const [loading,  setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error,    setError]   = useState<string | null>(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const p = await apiFetch<DriverProfile>(`${API.drivers}/drivers/me`);
      setProfile(p);
      const list = await apiFetch<Doc[]>(`${API.drivers}/drivers/documents/me`);
      setDocs(list);
    } catch (e: any) {
      setError(e instanceof ApiError ? e.message : 'No se pudo cargar la información.');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(docType: string, file: File, expiresAt?: string) {
    setError(null);

    // Validar fecha obligatoria para licencia/soat/revision_tecnica
    const requirement = REQUIRED_DOCS.find(d => d.key === docType);
    if (requirement?.needsExpiry && !expiresAt) {
      setError('Debes escoger la fecha de caducidad antes de subir este documento.');
      return;
    }
    if (requirement?.needsExpiry && expiresAt) {
      const ex = new Date(expiresAt);
      if (ex <= new Date()) {
        setError('La fecha de caducidad debe ser futura.');
        return;
      }
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('El archivo supera el límite de 10 MB.');
      return;
    }
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.type)) {
      setError('Formato no permitido. Usa JPG, PNG, WEBP o PDF.');
      return;
    }

    setUploading(docType);
    try {
      const fd = new FormData();
      fd.append('docType', docType);
      fd.append('file', file);
      if (expiresAt) fd.append('expiresAt', expiresAt);

      const token = localStorage.getItem('bugie_token') ?? '';
      const res = await fetch(`${API.drivers}/drivers/documents`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: fd,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? `Error ${res.status}`);
      }
      const saved = await res.json();
      // Reemplazar el doc anterior del mismo tipo
      setDocs(prev => [...prev.filter(d => d.docType !== docType), saved]);
      toast.success(`${labelOf(docType)} subido correctamente.`);
    } catch (e: any) {
      setError(e.message ?? 'No se pudo subir el archivo.');
    } finally {
      setUploading(null);
    }
  }

  function labelOf(docType: string) {
    return REQUIRED_DOCS.find(d => d.key === docType)?.label ?? EXTRA_LABELS[docType] ?? docType;
  }

  // Solo cuentan los activos (no superseded)
  const activeDocs  = docs.filter(d => d.status !== 'superseded');
  const completed   = activeDocs.filter(d => d.status !== 'rejected').length;
  const approvedN   = activeDocs.filter(d => d.status === 'approved').length;
  const allUploaded = REQUIRED_DOCS.every(r =>
    activeDocs.some(x => x.docType === r.key && x.status !== 'rejected'));

  return (
    <Page
      title="Mis documentos"
      subtitle="Sube y mantén al día los documentos que habilitan tu cuenta de conductor."
      icon="fa-folder-open"
    >
      {error && <Notice tone="bad">{error}</Notice>}

      {/* Aviso de plazo: aprobado por excepción con documentos pendientes */}
      {profile?.documentsDeadline && (
        <Notice
          tone="warn"
          icon="fa-hourglass-half"
          title={`Tienes hasta el ${new Date(profile.documentsDeadline).toLocaleString('es-PE', {
            day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
          })} para completar tus documentos.`}
        >
          {(profile.missingDocuments?.length ?? 0) > 0 && (
            <div>Te faltan (subidos y aprobados): {profile.missingDocuments!.map(labelOf).join(', ')}.</div>
          )}
          <div className="mt-1">
            Si no los completas a tiempo, tu cuenta se desactivará automáticamente y se te registrará una falta.
          </div>
        </Notice>
      )}

      {/* La foto de perfil también es obligatoria (se sube desde Mi perfil) */}
      {profile?.missingDocuments?.includes('profile_photo') && (
        <Notice
          tone="warn"
          icon="fa-camera"
          title="Te falta tu foto de perfil"
          action={<Link className="btn btn-sm btn-bugie" to="/app/conductor/perfil">Subir foto</Link>}
        >
          Es obligatoria para que podamos aprobar tu cuenta.
        </Notice>
      )}

      {/* Progreso */}
      <SectionCard>
        <div className="d-flex justify-content-between align-items-center gap-2 flex-wrap mb-2">
          <span className="fw-bold">Avance de verificación</span>
          <span className="small bx-muted">
            {completed} de {REQUIRED_DOCS.length} subidos · {approvedN} aprobados
          </span>
        </div>
        <div className="bx-progress" role="progressbar" aria-label="Documentos subidos"
             aria-valuemin={0} aria-valuemax={REQUIRED_DOCS.length} aria-valuenow={completed}>
          <span style={{ width: `${(completed / REQUIRED_DOCS.length) * 100}%` }} />
        </div>
        {allUploaded && (
          <p className="small mt-2 mb-0 bx-text-ok">
            <i className="fa-solid fa-circle-check me-1" aria-hidden="true" />
            Todos los documentos subidos. El equipo de Bugie los revisará en 24-48 horas.
          </p>
        )}
      </SectionCard>

      {/* Lista de documentos */}
      {loading ? (
        <div className="bx-rows">{[0, 1, 2].map(i => <Skeleton key={i} height={96} radius={14} />)}</div>
      ) : (
        <div className="bx-rows">
          {REQUIRED_DOCS.map(req => {
            const doc = activeDocs.find(d => d.docType === req.key);
            return (
              <DocumentRow
                key={req.key}
                req={req}
                doc={doc}
                uploading={uploading === req.key}
                onUpload={(file, expiresAt) => handleUpload(req.key, file, expiresAt)}
              />
            );
          })}
        </div>
      )}
    </Page>
  );
}

interface RowProps {
  req: typeof REQUIRED_DOCS[number];
  doc?: Doc;
  uploading: boolean;
  onUpload: (file: File, expiresAt?: string) => void;
}

function DocumentRow({ req, doc, uploading, onUpload }: RowProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [expiresAt, setExpiresAt] = useState(doc?.expiresAt?.slice(0, 10) ?? '');
  const [needDate, setNeedDate] = useState(false);

  const cfg      = doc ? STATUS_CFG[doc.status] : null;
  const expired  = doc ? isExpired(doc) : false;

  // Aprobado y NO vencido = bloqueado (no se puede reemplazar ni cambiar fecha).
  // Aprobado y vencido = se permite subir uno nuevo y editar la fecha.
  const lockedByApproval = doc?.status === 'approved' && !expired;
  const dateId = `exp-${req.key}`;

  function pick() {
    if (lockedByApproval) return;
    // Si requiere fecha y no la escogió, no abrir el selector de archivos
    if (req.needsExpiry && !expiresAt) {
      setNeedDate(true);
      document.getElementById(dateId)?.focus();
      return;
    }
    fileRef.current?.click();
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    onUpload(file, req.needsExpiry ? expiresAt : undefined);
    e.target.value = '';
  }

  const tone: Tone = expired && doc?.status === 'approved' ? 'bad' : cfg?.tone ?? 'neutral';

  return (
    <div className="bx-row">
      <span className={`bx-list-icon bx-tone-${tone}`} aria-hidden="true">
        <i className={`fa-solid ${req.icon}`} />
      </span>

      <div className="bx-list-text">
        <div className="bx-list-title">
          {req.label}
          {cfg ? <StatusBadge tone={cfg.tone} size="sm">{cfg.label}</StatusBadge> : <StatusBadge tone="neutral" size="sm">Falta subir</StatusBadge>}
          {expired && doc?.status === 'approved' && (
            <StatusBadge tone="bad" icon="fa-calendar-xmark" size="sm">Vencido</StatusBadge>
          )}
        </div>
        <div className="bx-list-sub">{req.description}</div>

        {doc?.status === 'rejected' && doc.rejectionReason && (
          <div className="small bx-text-bad mt-1">
            <i className="fa-solid fa-circle-info me-1" aria-hidden="true" />Motivo: {doc.rejectionReason}
          </div>
        )}

        {doc && (
          <div className="bx-list-sub mt-1">
            <i className="fa-solid fa-paperclip me-1" aria-hidden="true" />
            {doc.originalFileName ?? 'archivo'}
            {doc.sizeBytes ? ` · ${(doc.sizeBytes / 1024).toFixed(0)} KB` : ''}
            {doc.expiresAt && ` · vence el ${new Date(doc.expiresAt).toLocaleDateString('es-PE')}`}
          </div>
        )}

        {req.needsExpiry && (
          <div className={`bx-field mt-2 ${needDate && !expiresAt ? 'has-error' : ''}`} style={{ maxWidth: '16rem' }}>
            <label className="bx-field-label" htmlFor={dateId}>
              Fecha de caducidad <span className="bx-field-req" aria-hidden="true">*</span>
            </label>
            <input
              id={dateId}
              type="date"
              className="form-control form-control-sm"
              value={expiresAt}
              onChange={e => { setExpiresAt(e.target.value); setNeedDate(false); }}
              disabled={lockedByApproval}
              min={new Date().toISOString().slice(0, 10)}
              aria-invalid={needDate && !expiresAt ? true : undefined}
            />
            {needDate && !expiresAt ? (
              <p className="bx-field-error" role="alert"><i className="fa-solid fa-circle-exclamation" aria-hidden="true" />Primero escoge la fecha de caducidad.</p>
            ) : !doc && !expiresAt ? (
              <p className="bx-field-help bx-text-warn">Obligatoria para subir este documento.</p>
            ) : lockedByApproval ? (
              <p className="bx-field-help"><i className="fa-solid fa-lock me-1" aria-hidden="true" />Bloqueado tras aprobación</p>
            ) : null}
          </div>
        )}
      </div>

      <div className="bx-list-end flex-wrap">
        <input
          type="file" ref={fileRef} hidden
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={onFile}
        />
        {doc && (
          <a href={driversFileUrl(doc.fileUrl)} target="_blank" rel="noreferrer" className="btn btn-sm btn-bugie-outline">
            <i className="fa-solid fa-eye" aria-hidden="true" />Ver
          </a>
        )}
        <button
          type="button"
          className={`btn btn-sm ${doc ? 'btn-bugie-outline' : 'btn-bugie'}`}
          onClick={pick}
          disabled={uploading || lockedByApproval}
          title={lockedByApproval ? 'Este documento ya fue aprobado' : undefined}
        >
          {uploading ? (
            <><span className="spinner-border spinner-border-sm" aria-hidden="true" />Subiendo</>
          ) : lockedByApproval ? (
            <><i className="fa-solid fa-lock" aria-hidden="true" />Aprobado</>
          ) : doc ? (
            <><i className="fa-solid fa-rotate" aria-hidden="true" />Reemplazar</>
          ) : (
            <><i className="fa-solid fa-upload" aria-hidden="true" />Subir</>
          )}
        </button>
      </div>
    </div>
  );
}
