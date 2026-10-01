import { useEffect, useRef, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import { API, apiFetch, ApiError } from '../../state/api';

interface Doc {
  id:               string;
  docType:          string;   // 'dni_front' | 'dni_back'
  fileUrl:          string;
  originalFileName: string | null;
  mimeType:         string | null;
  sizeBytes:        number | null;
  status:           'pending' | 'approved' | 'rejected';
  rejectionReason:  string | null;
  createdAt:        string;
}

interface UserStatus {
  isActive:   boolean;
  isVerified: boolean;
  fullName:   string;
  email:      string;
}

const REQUIRED: Array<{ key: 'dni_front' | 'dni_back'; label: string; icon: string; description: string; }> = [
  { key: 'dni_front', label: 'DNI - Frontal', icon: 'fa-id-card', description: 'Foto clara del frente de tu DNI.' },
  { key: 'dni_back',  label: 'DNI - Reverso', icon: 'fa-id-card', description: 'Foto clara del reverso de tu DNI.' },
];

const STATUS_COLOR: Record<string, string> = {
  pending: '#f59e0b', approved: '#10b981', rejected: '#ef4444',
};
const STATUS_LABEL: Record<string, string> = {
  pending: 'En revisión', approved: 'Aprobado', rejected: 'Rechazado',
};

export default function PassengerVerification() {
  const [status, setStatus] = useState<UserStatus | null>(null);
  const [docs,   setDocs]   = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [st, list] = await Promise.all([
        apiFetch<UserStatus>(`${API.auth}/auth/users/me/status`),
        apiFetch<Doc[]>(`${API.auth}/auth/passengers/documents/me`),
      ]);
      setStatus(st);
      setDocs(list);
    } catch (e: any) {
      setError(e instanceof ApiError ? e.message : 'No se pudo cargar la información.');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(docType: 'dni_front' | 'dni_back', file: File) {
    setError(null); setSuccess(null);
    if (file.size > 10 * 1024 * 1024) {
      setError('El archivo supera los 10 MB.');
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

      const token = localStorage.getItem('bugie_token') ?? '';
      const res = await fetch(`${API.auth}/auth/passengers/documents`, {
        method:  'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body:    fd,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? `Error ${res.status}`);
      }
      const saved = await res.json();
      setDocs(prev => [...prev.filter(d => d.docType !== docType), saved]);
      setSuccess('Documento subido correctamente.');
      setTimeout(() => setSuccess(null), 4000);
    } catch (e: any) {
      setError(e.message ?? 'No se pudo subir el archivo.');
    } finally {
      setUploading(null);
    }
  }

  const allUploaded = REQUIRED.every(r =>
    docs.some(d => d.docType === r.key && d.status !== 'rejected'));

  return (
    <>
      <PageHeader
        title="Verificación de cuenta"
        subtitle="Sube tu DNI para activar tu cuenta y poder solicitar viajes."
        icon="fa-shield-halved"
      />

      {/* Banner de estado */}
      {status && status.isVerified ? (
        <div className="alert alert-success py-3 mb-3 d-flex align-items-center gap-2">
          <i className="fa-solid fa-circle-check fa-lg" />
          <div>
            <strong>Tu cuenta está activa.</strong> Ya puedes solicitar viajes.
          </div>
        </div>
      ) : (
        <div className="alert alert-warning py-3 mb-3 d-flex align-items-center gap-2">
          <i className="fa-solid fa-clock fa-lg" />
          <div>
            <strong>Tu cuenta aún no está verificada.</strong>{' '}
            {allUploaded
              ? 'Tus documentos están en revisión. Te enviaremos un correo cuando esté lista.'
              : 'Sube los documentos requeridos para activarla.'}
          </div>
        </div>
      )}

      {error   && <div className="alert alert-danger small py-2 mb-3"><i className="fa-solid fa-circle-exclamation me-2" />{error}</div>}
      {success && <div className="alert alert-success small py-2 mb-3"><i className="fa-solid fa-circle-check me-2" />{success}</div>}

      {loading ? (
        <div className="d-flex justify-content-center py-5"><span className="spinner-border" /></div>
      ) : (
        <div className="d-grid gap-3">
          {REQUIRED.map(req => {
            const doc = docs.find(d => d.docType === req.key);
            return <DocRow key={req.key} req={req} doc={doc}
                           uploading={uploading === req.key}
                           onUpload={file => handleUpload(req.key, file)} />;
          })}
        </div>
      )}
    </>
  );
}

interface RowProps {
  req: typeof REQUIRED[number];
  doc?: Doc;
  uploading: boolean;
  onUpload: (file: File) => void;
}

function DocRow({ req, doc, uploading, onUpload }: RowProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const status  = doc?.status;
  const color   = status ? STATUS_COLOR[status] : '#94a3b8';

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) onUpload(f);
    e.target.value = '';
  }

  return (
    <div className="bugie-card p-3">
      <div className="d-flex align-items-start gap-3 flex-wrap">
        <div
          className="d-flex align-items-center justify-content-center flex-shrink-0"
          style={{ width: 48, height: 48, borderRadius: 12, background: color + '22', color, fontSize: 20 }}
        >
          <i className={`fa-solid ${req.icon}`} />
        </div>
        <div className="flex-grow-1" style={{ minWidth: 200 }}>
          <div className="d-flex flex-wrap gap-2 align-items-center mb-1">
            <span className="fw-bold">{req.label}</span>
            {status && (
              <span className="badge rounded-pill"
                    style={{ background: color + '22', color, fontSize: '0.72rem' }}>
                {STATUS_LABEL[status]}
              </span>
            )}
          </div>
          <div className="small bugie-muted">{req.description}</div>
          {doc?.status === 'rejected' && doc.rejectionReason && (
            <div className="small text-danger mt-1">
              <i className="fa-solid fa-circle-info me-1" />Motivo: {doc.rejectionReason}
            </div>
          )}
          {doc && (
            <div className="small bugie-muted mt-1">
              <i className="fa-solid fa-paperclip me-1" />{doc.originalFileName ?? 'archivo'}
            </div>
          )}
        </div>
        <div className="d-flex flex-column gap-2 flex-shrink-0">
          <input
            type="file" ref={fileRef} hidden
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={onFile}
          />
          <button type="button" className="btn btn-sm btn-bugie text-white"
                  onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? (
              <><span className="spinner-border spinner-border-sm me-2" />Subiendo</>
            ) : doc ? (
              <><i className="fa-solid fa-rotate me-1" />Reemplazar</>
            ) : (
              <><i className="fa-solid fa-upload me-1" />Subir</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}