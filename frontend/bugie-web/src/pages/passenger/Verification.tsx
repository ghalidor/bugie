import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { API, apiFetch, ApiError } from '../../state/api';
import { Notice, Page, SectionCard, Skeleton, StatusBadge, Tone, useConfirm, useToast } from '../../components/ui';

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

type ReqKey = 'dni_front' | 'dni_back' | 'profile_photo';

/** GET /api/auth/passengers/documents/me/requirements */
interface Requirement {
  key:             ReqKey;
  label:           string;
  /** Documentos: missing | pending | approved | rejected. Foto: missing | uploaded. */
  status:          'missing' | 'pending' | 'approved' | 'rejected' | 'uploaded';
  rejectionReason: string | null;
  done:            boolean;
}
interface Requirements {
  isVerified:     boolean;
  readyForReview: boolean;
  missing:        string[];
  requirements:   Requirement[];
}

const DOC_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const INFO: Record<ReqKey, { icon: string; description: string }> = {
  dni_front:     { icon: 'fa-id-card', description: 'Foto clara del frente de tu DNI.' },
  dni_back:      { icon: 'fa-id-card', description: 'Foto clara del reverso de tu DNI.' },
  profile_photo: { icon: 'fa-camera',  description: 'Una foto tuya, de frente y con buena luz. Los conductores la verán.' },
};

const STATUS_CFG: Record<string, { label: string; tone: Tone }> = {
  missing:  { label: 'Falta subir', tone: 'neutral' },
  pending:  { label: 'En revisión', tone: 'warn' },
  approved: { label: 'Aprobado',    tone: 'ok' },
  rejected: { label: 'Rechazado',   tone: 'bad' },
  uploaded: { label: 'Subida',      tone: 'ok' },
};

/** Sube un archivo con el token (multipart) y devuelve el JSON de respuesta. */
async function uploadFile(url: string, fd: FormData) {
  const token = localStorage.getItem('bugie_token') ?? '';
  const res = await fetch(url, {
    method:  'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body:    fd,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error ?? `Error ${res.status}`);
  }
  return res.json();
}

export default function PassengerVerification() {
  const toast = useToast();
  const confirm = useConfirm();
  const [status, setStatus] = useState<UserStatus | null>(null);
  const [reqs,   setReqs]   = useState<Requirements | null>(null);
  const [docs,   setDocs]   = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [st, r, list] = await Promise.all([
        apiFetch<UserStatus>(`${API.auth}/auth/users/me/status`),
        apiFetch<Requirements>(`${API.auth}/auth/passengers/documents/me/requirements`),
        apiFetch<Doc[]>(`${API.auth}/auth/passengers/documents/me`),
      ]);
      setStatus(st);
      setReqs(r);
      setDocs(list);
    } catch (e: any) {
      setError(e instanceof ApiError ? e.message : 'No se pudo cargar la información.');
    } finally {
      setLoading(false);
    }
  }

  function reloadRequirements() {
    apiFetch<Requirements>(`${API.auth}/auth/passengers/documents/me/requirements`)
      .then(setReqs)
      .catch(() => { /* se verá al recargar */ });
  }

  async function handleUpload(key: ReqKey, file: File) {
    setError(null);
    const isPhoto = key === 'profile_photo';
    const maxMb = isPhoto ? 5 : 10;
    if (file.size > maxMb * 1024 * 1024) {
      setError(`El archivo supera los ${maxMb} MB.`);
      return;
    }
    if (!(isPhoto ? PHOTO_TYPES : DOC_TYPES).includes(file.type)) {
      setError(isPhoto ? 'Formato no permitido. Usa JPG, PNG o WEBP.' : 'Formato no permitido. Usa JPG, PNG, WEBP o PDF.');
      return;
    }

    if (isPhoto) {
      const ok = await confirm({
        title: '¿Usar esta foto de perfil?',
        message: `Se subirá «${file.name}» y los conductores la verán en tus viajes.`,
        confirmText: 'Subir foto',
      });
      if (!ok) return;
    }

    setUploading(key);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (isPhoto) {
        await uploadFile(`${API.auth}/auth/me/profile-photo`, fd);
        toast.success('Foto de perfil subida correctamente.');
      } else {
        fd.append('docType', key);
        const saved = await uploadFile(`${API.auth}/auth/passengers/documents`, fd);
        setDocs(prev => [...prev.filter(d => d.docType !== key), saved]);
        toast.success('Documento subido correctamente.');
      }
      reloadRequirements();
    } catch (e: any) {
      setError(e.message ?? 'No se pudo subir el archivo.');
    } finally {
      setUploading(null);
    }
  }

  const list = reqs?.requirements ?? [];
  // Cuenta como avance lo subido (aunque esté en revisión); lo rechazado no.
  const doneN = list.filter(r => r.status !== 'missing' && r.status !== 'rejected').length;
  const missingLabels = list.filter(r => r.status === 'missing' || r.status === 'rejected').map(r => r.label);

  return (
    <Page
      title="Verificación de cuenta"
      subtitle="Sube tu DNI y tu foto de perfil para activar tu cuenta y poder pedir viajes."
      icon="fa-shield-halved"
    >
      {/* Estado */}
      {!loading && (status?.isVerified ? (
        <Notice
          tone="ok"
          title="Tu cuenta está activa"
          action={<Link className="btn btn-sm btn-bugie" to="/app/pasajero/solicitar">Pedir un viaje</Link>}
        >
          Ya puedes pedir viajes y envíos.
        </Notice>
      ) : (
        <Notice tone="warn" icon="fa-clock" title="Tu cuenta aún no está verificada">
          {missingLabels.length > 0
            ? `Te falta: ${missingLabels.join(', ')}.`
            : 'Tus documentos están en revisión. Te enviaremos un correo cuando esté lista.'}
        </Notice>
      ))}

      {error && <Notice tone="bad">{error}</Notice>}

      <SectionCard
        title="Tus requisitos"
        icon="fa-id-card"
        description="DNI: JPG, PNG, WEBP o PDF de hasta 10 MB. Foto: JPG, PNG o WEBP de hasta 5 MB."
        actions={!loading && list.length > 0 && <span className="small fw-semibold bx-muted">{doneN} de {list.length}</span>}
        flush
      >
        <div className="px-3 pt-3">
          <div className="bx-progress" role="progressbar" aria-valuemin={0} aria-valuemax={list.length} aria-valuenow={doneN} aria-label="Requisitos subidos">
            <span style={{ width: `${list.length ? (doneN / list.length) * 100 : 0}%` }} />
          </div>
        </div>
        {loading ? (
          <div className="p-3"><Skeleton height={64} count={3} /></div>
        ) : (
          <ul className="bx-list mt-2">
            {list.map(req => (
              <ReqRow key={req.key} req={req}
                      doc={docs.find(d => d.docType === req.key)}
                      uploading={uploading === req.key}
                      onUpload={file => handleUpload(req.key, file)} />
            ))}
          </ul>
        )}
      </SectionCard>
    </Page>
  );
}

interface RowProps {
  req: Requirement;
  doc?: Doc;
  uploading: boolean;
  onUpload: (file: File) => void;
}

function ReqRow({ req, doc, uploading, onUpload }: RowProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cfg = STATUS_CFG[req.status] ?? STATUS_CFG.missing;
  const info = INFO[req.key] ?? { icon: 'fa-file', description: '' };
  const isPhoto = req.key === 'profile_photo';
  const hasFile = req.status !== 'missing';

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) onUpload(f);
    e.target.value = '';
  }

  return (
    <li className="bx-list-item">
      <span className={`bx-list-icon bx-tone-${cfg.tone}`} aria-hidden="true">
        <i className={`fa-solid ${info.icon}`} />
      </span>
      <div className="bx-list-text">
        <div className="bx-list-title">
          {req.label}
          <StatusBadge tone={cfg.tone} size="sm">{cfg.label}</StatusBadge>
        </div>
        <div className="bx-list-sub">{info.description}</div>
        {req.status === 'rejected' && req.rejectionReason && (
          <div className="small bx-text-bad mt-1">
            <i className="fa-solid fa-circle-info me-1" aria-hidden="true" />Motivo: {req.rejectionReason}
          </div>
        )}
        {doc && (
          <div className="bx-list-sub mt-1">
            <i className="fa-solid fa-paperclip me-1" aria-hidden="true" />{doc.originalFileName ?? 'archivo'}
          </div>
        )}
      </div>
      <div className="bx-list-end">
        <input type="file" ref={fileRef} hidden accept={(isPhoto ? PHOTO_TYPES : DOC_TYPES).join(',')} onChange={onFile} />
        <button type="button" className={`btn btn-sm ${hasFile ? 'btn-bugie-outline' : 'btn-bugie'}`}
                onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? (
            <><span className="spinner-border spinner-border-sm" aria-hidden="true" />Subiendo</>
          ) : hasFile ? (
            <><i className="fa-solid fa-rotate" aria-hidden="true" />Reemplazar</>
          ) : (
            <><i className="fa-solid fa-upload" aria-hidden="true" />Subir</>
          )}
        </button>
      </div>
    </li>
  );
}
