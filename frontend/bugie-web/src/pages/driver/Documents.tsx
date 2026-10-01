import { useEffect, useRef, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import { API, apiFetch, ApiError } from '../../state/api';

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

interface DriverProfile { id: string; status: number; }

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

const STATUS_COLOR: Record<string, string> = {
  pending:    '#f59e0b',
  approved:   '#10b981',
  rejected:   '#ef4444',
  superseded: '#94a3b8',
};
const STATUS_LABEL: Record<string, string> = {
  pending:    'Pendiente de revisión',
  approved:   'Aprobado',
  rejected:   'Rechazado',
  superseded: 'Reemplazado',
};

function isExpired(doc: Doc): boolean {
  if (!doc.expiresAt) return false;
  return new Date(doc.expiresAt) <= new Date();
}

export default function DriverDocuments() {
  const [_profile, setProfile] = useState<DriverProfile | null>(null);
  const [docs,     setDocs]    = useState<Doc[]>([]);
  const [loading,  setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error,    setError]   = useState<string | null>(null);
  const [success,  setSuccess] = useState<string | null>(null);

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
    setError(null); setSuccess(null);

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
      setSuccess(`${labelOf(docType)} subido correctamente.`);
      setTimeout(() => setSuccess(null), 4000);
    } catch (e: any) {
      setError(e.message ?? 'No se pudo subir el archivo.');
    } finally {
      setUploading(null);
    }
  }

  function labelOf(docType: string) {
    return REQUIRED_DOCS.find(d => d.key === docType)?.label ?? docType;
  }

  // Solo cuentan los activos (no superseded)
  const activeDocs  = docs.filter(d => d.status !== 'superseded');
  const completed   = activeDocs.filter(d => d.status !== 'rejected').length;
  const allUploaded = REQUIRED_DOCS.every(r =>
    activeDocs.some(x => x.docType === r.key && x.status !== 'rejected'));

  return (
    <>
      <PageHeader
        title="Mis documentos"
        subtitle="Sube los documentos necesarios para activar tu cuenta de conductor."
        icon="fa-folder-open"
      />

      {error && (
        <div className="alert alert-danger small py-2 mb-3 d-flex align-items-center gap-2">
          <i className="fa-solid fa-circle-exclamation" /> {error}
        </div>
      )}
      {success && (
        <div className="alert alert-success small py-2 mb-3 d-flex align-items-center gap-2">
          <i className="fa-solid fa-circle-check" /> {success}
        </div>
      )}

      {/* Progreso */}
      <div className="bugie-card p-3 mb-3">
        <div className="d-flex justify-content-between align-items-center mb-2 small">
          <span className="fw-bold">Avance de verificación</span>
          <span className="bugie-muted">{completed} / {REQUIRED_DOCS.length}</span>
        </div>
        <div className="progress" style={{ height: 8 }}>
          <div className="progress-bar"
            style={{
              width: `${(completed / REQUIRED_DOCS.length) * 100}%`,
              background: 'linear-gradient(90deg, #4F7DF5, #B85FE6, #E673D9)',
            }}
          />
        </div>
        {allUploaded && (
          <div className="small mt-2 text-success">
            <i className="fa-solid fa-circle-check me-1" />
            Todos los documentos subidos. El equipo de Bugie los revisará en 24-48 horas.
          </div>
        )}
      </div>

      {/* Lista de documentos */}
      {loading ? (
        <div className="d-flex justify-content-center py-5">
          <span className="spinner-border" />
        </div>
      ) : (
        <div className="d-grid gap-3">
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
    </>
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

  const status   = doc?.status;
  const color    = status ? STATUS_COLOR[status] : '#94a3b8';
  const expired  = doc ? isExpired(doc) : false;

  // ¿Está bloqueado para cambios?
  // Aprobado y NO vencido = bloqueado completo (no se puede reemplazar ni cambiar fecha)
  // Aprobado y vencido = se permite subir uno nuevo y editar fecha (porque va a renovar)
  const lockedByApproval = doc?.status === 'approved' && !expired;

  function pick() {
    if (lockedByApproval) return;
    // Si requiere fecha y no la escogió, no permitir abrir el selector de archivos
    if (req.needsExpiry && !expiresAt) {
      alert('Primero escoge la fecha de caducidad.');
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

  return (
    <div className="bugie-card p-3">
      <div className="d-flex align-items-start gap-3">
        <div
          className="d-flex align-items-center justify-content-center flex-shrink-0"
          style={{
            width: 48, height: 48, borderRadius: 12,
            background: color + '22', color, fontSize: 20,
          }}
        >
          <i className={`fa-solid ${req.icon}`} />
        </div>

        <div className="flex-grow-1" style={{ minWidth: 0 }}>
          <div className="d-flex flex-wrap gap-2 align-items-center mb-1">
            <span className="fw-bold">{req.label}</span>
            {status && (
              <span
                className="badge rounded-pill"
                style={{ background: color + '22', color, fontSize: '0.72rem' }}
              >
                {STATUS_LABEL[status]}
              </span>
            )}
            {expired && doc?.status === 'approved' && (
              <span
                className="badge rounded-pill"
                style={{ background: '#ef444422', color: '#ef4444', fontSize: '0.72rem' }}
              >
                <i className="fa-solid fa-calendar-xmark me-1" />Vencido
              </span>
            )}
          </div>
          <div className="small bugie-muted">{req.description}</div>

          {doc?.status === 'rejected' && doc.rejectionReason && (
            <div className="small text-danger mt-1">
              <i className="fa-solid fa-circle-info me-1" />
              Motivo: {doc.rejectionReason}
            </div>
          )}

          {doc && (
            <div className="small bugie-muted mt-1">
              <i className="fa-solid fa-paperclip me-1" />
              {doc.originalFileName ?? 'archivo'}
              {doc.sizeBytes ? ` · ${(doc.sizeBytes / 1024).toFixed(0)} KB` : ''}
            </div>
          )}

          {req.needsExpiry && (
            <div className="mt-2" style={{ maxWidth: 240 }}>
              <label className="form-label small mb-1">
                Fecha de caducidad <span className="text-danger">*</span>
              </label>
              <input
                type="date"
                className="form-control form-control-sm"
                value={expiresAt}
                onChange={e => setExpiresAt(e.target.value)}
                disabled={lockedByApproval}
                min={new Date().toISOString().slice(0, 10)}
              />
              {req.needsExpiry && !doc && !expiresAt && (
                <div className="small mt-1" style={{ color: '#f59e0b' }}>
                  <i className="fa-solid fa-triangle-exclamation me-1" />
                  Obligatoria para subir este documento
                </div>
              )}
              {lockedByApproval && (
                <div className="small bugie-muted mt-1">
                  <i className="fa-solid fa-lock me-1" />
                  Bloqueado tras aprobación
                </div>
              )}
            </div>
          )}
        </div>

        <div className="d-flex flex-column gap-2 flex-shrink-0">
          <input
            type="file" ref={fileRef} hidden
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={onFile}
          />

          {/* Botón Subir/Reemplazar — deshabilitado si está aprobado y no vencido */}
          <button
            type="button"
            className="btn btn-sm btn-bugie text-white"
            onClick={pick}
            disabled={uploading || lockedByApproval}
            title={lockedByApproval ? 'Este documento ya fue aprobado' : ''}
          >
            {uploading ? (
              <><span className="spinner-border spinner-border-sm me-2" />Subiendo</>
            ) : lockedByApproval ? (
              <><i className="fa-solid fa-lock me-1" />Aprobado</>
            ) : doc ? (
              <><i className="fa-solid fa-rotate me-1" />Reemplazar</>
            ) : (
              <><i className="fa-solid fa-upload me-1" />Subir</>
            )}
          </button>

          {doc && (
            <a
              href={doc.fileUrl}
              target="_blank" rel="noreferrer"
              className="btn btn-sm btn-bugie-outline"
            >
              <i className="fa-solid fa-eye me-1" />Ver
            </a>
          )}
        </div>
      </div>
    </div>
  );
}