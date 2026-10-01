import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { API, apiFetch, ApiError } from '../../state/api';

interface User {
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

const STATUS_COLOR: Record<string, string> = {
  pending: '#f59e0b', approved: '#10b981', rejected: '#ef4444',
};

export default function PassengerDetail() {
  const { userId } = useParams<{ userId: string }>();
  const navigate   = useNavigate();

  const [user,    setUser]    = useState<User | null>(null);
  const [docs,    setDocs]    = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<Doc | null>(null);
  const [actingDoc, setActingDoc] = useState<string | null>(null);
  const [approvingAll, setApprovingAll] = useState(false);

  useEffect(() => { if (userId) load(userId); }, [userId]);

  async function load(id: string) {
    setLoading(true); setError(null);
    try {
      const detail = await apiFetch<{ user: User; documents: Doc[] }>(
        `${API.auth}/auth/admin/passengers/${id}`);
      setUser(detail.user);
      setDocs(detail.documents ?? []);
    } catch (e: any) {
      setError(e instanceof ApiError ? e.message : 'No se pudo cargar el pasajero.');
    } finally { setLoading(false); }
  }

  async function approveDoc(doc: Doc) {
    setActingDoc(doc.id);
    try {
      const updated = await apiFetch<Doc>(
        `${API.auth}/auth/passengers/documents/${doc.id}/approve`,
        { method: 'PUT' });
      setDocs(prev => prev.map(d => d.id === doc.id ? updated : d));
      setReviewed(prev => new Set([...prev, doc.id]));
    } catch (e: any) { setError(e.message ?? 'No se pudo aprobar.'); }
    finally { setActingDoc(null); }
  }

  async function rejectDoc(doc: Doc) {
    const reason = window.prompt('Motivo del rechazo (opcional):') ?? '';
    setActingDoc(doc.id);
    try {
      const updated = await apiFetch<Doc>(
        `${API.auth}/auth/passengers/documents/${doc.id}/reject`,
        { method: 'PUT', body: JSON.stringify({ reason }) });
      setDocs(prev => prev.map(d => d.id === doc.id ? updated : d));
    } catch (e: any) { setError(e.message ?? 'No se pudo rechazar.'); }
    finally { setActingDoc(null); }
  }

  async function approveUser() {
    if (!user) return;
    setApprovingAll(true);
    try {
      await apiFetch(`${API.auth}/auth/admin/passengers/${user.id}/approve`, { method: 'PUT' });
      setSuccess('Pasajero aprobado. Se envió correo de activación.');
      await load(user.id);
      setTimeout(() => setSuccess(null), 4000);
    } catch (e: any) { setError(e.message ?? 'No se pudo aprobar.'); }
    finally { setApprovingAll(false); }
  }

  async function rejectAll() {
    if (!user) return;
    const reason = window.prompt('Motivo (se le envía por correo al pasajero):') ?? '';
    setApprovingAll(true);
    try {
      await apiFetch(`${API.auth}/auth/admin/passengers/${user.id}/reject`, {
        method: 'PUT', body: JSON.stringify({ reason }),
      });
      setSuccess('Correo de rechazo enviado.');
      setTimeout(() => setSuccess(null), 4000);
    } catch (e: any) { setError(e.message ?? 'No se pudo enviar.'); }
    finally { setApprovingAll(false); }
  }

  /// Marca al pasajero como verificado (PUT /admin/passengers/{id}/approve).
  /// El backend manda mail de "cuenta activa" automáticamente.
  async function approvePassenger() {
    if (!user) return;
    setApprovingAll(true);
    setError(null);
    try {
      await apiFetch(`${API.auth}/auth/admin/passengers/${user.id}/approve`, {
        method: 'PUT',
      });
      await load(user.id); // recarga el detalle para reflejar isVerified=true
      setSuccess('Pasajero aprobado. Se envió el correo de cuenta activa.');
      setTimeout(() => setSuccess(null), 4000);
    } catch (e: any) {
      setError(e.message ?? 'No se pudo aprobar el pasajero.');
    } finally {
      setApprovingAll(false);
    }
  }

  const requiredKeys = ['dni_front', 'dni_back'];
  const allApproved  = requiredKeys.every(k => docs.find(d => d.docType === k)?.status === 'approved');
  const allReviewed  = docs.filter(d => requiredKeys.includes(d.docType))
                            .every(d => reviewed.has(d.id) || d.status === 'approved');
  const canApprove   = allApproved && allReviewed && !user?.isVerified;

  if (loading) {
    return <div className="d-flex justify-content-center py-5"><span className="spinner-border" /></div>;
  }
  if (error || !user) {
    return (
      <div className="alert alert-danger small">
        {error ?? 'Pasajero no encontrado.'}
        <div className="mt-2">
          <button className="btn btn-sm btn-bugie-outline" onClick={() => navigate('/admin/pasajeros')}>Volver</button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* HERO: header con gradiente + avatar grande + datos clave.
          Reemplaza al PageHeader genérico porque queremos el avatar como
          elemento principal (no como una imagen suelta más abajo). */}
      <div className="bugie-card mb-3"
           style={{
             background: 'linear-gradient(135deg, var(--bugie-primary)25 0%, var(--bugie-surface) 75%)',
             padding: '24px 28px',
             borderLeft: '4px solid var(--bugie-primary)',
           }}>
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-3">
          <div className="d-flex align-items-center gap-3 flex-wrap">
            {/* Avatar: foto si la subió, sino la inicial del nombre. */}
            {user.profilePhotoUrl ? (
              <img
                src={
                  user.profilePhotoUrl.startsWith('http')
                    ? user.profilePhotoUrl
                    : `${API.auth.replace(/\/api\/?$/, '')}${user.profilePhotoUrl}`
                }
                alt={user.fullName}
                style={{
                  width: 84, height: 84, borderRadius: '50%',
                  objectFit: 'cover',
                  border: '3px solid var(--bugie-primary)',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
                }}
              />
            ) : (
              <div style={{
                width: 84, height: 84, borderRadius: '50%',
                background: 'var(--bugie-primary)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '2rem', fontWeight: 700,
                boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
              }}>
                {(user.fullName?.[0] ?? '?').toUpperCase()}
              </div>
            )}

            <div>
              <div className="small bugie-muted text-uppercase fw-bold" style={{ letterSpacing: '0.08em' }}>
                Detalle del pasajero
              </div>
              <div className="h3 mb-1 fw-bold" style={{ letterSpacing: '-0.02em' }}>
                {user.fullName}
              </div>
              <div className="d-flex gap-2 flex-wrap">
                <span className="badge rounded-pill px-3 py-2"
                      style={{
                        background: user.isVerified ? '#10b98122' : '#f59e0b22',
                        color:      user.isVerified ? '#10b981'   : '#f59e0b',
                        fontSize: '0.78rem',
                      }}>
                  <i className={`fa-solid ${user.isVerified ? 'fa-circle-check' : 'fa-clock'} me-1`} />
                  {user.isVerified ? 'Verificado' : 'Pendiente'}
                </span>
                <span className="badge rounded-pill px-3 py-2"
                      style={{
                        background: user.isActive ? '#34d39922' : '#94a3b822',
                        color:      user.isActive ? '#34d399'   : '#94a3b8',
                        fontSize: '0.78rem',
                      }}>
                  <i className={`fa-solid ${user.isActive ? 'fa-bolt' : 'fa-pause'} me-1`} />
                  {user.isActive ? 'Activo' : 'Inactivo'}
                </span>
              </div>
            </div>
          </div>

          <button className="btn btn-bugie-outline rounded-pill" onClick={() => navigate('/admin/pasajeros')}>
            <i className="fa-solid fa-arrow-left me-2" />Volver
          </button>
        </div>
      </div>

      {success && <div className="alert alert-success small py-2 mb-3"><i className="fa-solid fa-circle-check me-2" />{success}</div>}
      {error   && <div className="alert alert-danger  small py-2 mb-3"><i className="fa-solid fa-circle-exclamation me-2" />{error}</div>}

      <div className="row g-3">

        {/* Términos y firma del registro */}
        <div className="col-12">
          <div className="bugie-card p-3">
            <h5 className="fw-bold mb-3">
              <i className="fa-solid fa-file-signature me-2" style={{ color: 'var(--bugie-primary)' }} />
              Términos y firma
            </h5>
            <div className="d-flex flex-wrap gap-4 align-items-start">
              <div>
                <div className="small bugie-muted">Aceptó términos y condiciones</div>
                <span className="badge rounded-pill px-3 py-2 mt-1"
                      style={{
                        background: user.termsAccepted ? '#10b98122' : '#ef444422',
                        color:      user.termsAccepted ? '#10b981'   : '#ef4444',
                      }}>
                  <i className={`fa-solid ${user.termsAccepted ? 'fa-circle-check' : 'fa-circle-xmark'} me-1`} />
                  {user.termsAccepted ? 'Sí' : 'No'}
                </span>
                {user.termsAcceptedAt && (
                  <div className="small bugie-muted mt-1">
                    {new Date(user.termsAcceptedAt).toLocaleString('es-PE')}
                  </div>
                )}
              </div>
              <div>
                <div className="small bugie-muted mb-1">Firma</div>
                {user.signatureImage ? (
                  <img src={user.signatureImage} alt="Firma"
                       style={{ maxWidth: 240, maxHeight: 120, background: '#fff',
                                borderRadius: 8, border: '1px solid #e5e7eb', padding: 4 }} />
                ) : (
                  <span className="small bugie-muted">Sin firma registrada</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* COLUMNA IZQUIERDA: datos de contacto */}
        <div className="col-lg-4">
          <div className="bugie-card p-3">
            <h5 className="fw-bold mb-3 d-flex align-items-center">
              <span style={{
                width: 30, height: 30, borderRadius: 8,
                background: 'var(--bugie-primary)22', color: 'var(--bugie-primary)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                marginRight: 10,
              }}>
                <i className="fa-solid fa-id-badge" />
              </span>
              Información
            </h5>

            <InfoRow icon="fa-envelope"      label="Correo"     value={user.email} />
            <InfoRow icon="fa-phone"         label="Teléfono"   value={user.phone || '—'} />
            <InfoRow icon="fa-calendar-plus" label="Registrado" value={new Date(user.createdAt).toLocaleDateString('es-PE',
                                                                          { day: '2-digit', month: 'long', year: 'numeric' })} />
          </div>
        </div>

        {/* COLUMNA DERECHA: documentos */}
        <div className="col-lg-8">
          <div className="bugie-card p-3">
            <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
              <h5 className="fw-bold mb-0 d-flex align-items-center">
                <span style={{
                  width: 30, height: 30, borderRadius: 8,
                  background: '#f59e0b22', color: '#f59e0b',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  marginRight: 10,
                }}>
                  <i className="fa-solid fa-folder-open" />
                </span>
                Documentos
                <span className="badge rounded-pill ms-2"
                      style={{ background: 'var(--bugie-primary)22', color: 'var(--bugie-primary)', fontSize: '0.72rem' }}>
                  {docs.length}
                </span>
              </h5>
              <div className="small bugie-muted">
                <i className="fa-solid fa-lightbulb me-1" style={{ color: '#fbbf24' }} />
                Marca el check después de revisar cada documento.
              </div>
            </div>

            {docs.length === 0 ? (
              <div className="text-center py-5 bugie-muted">
                <i className="fa-solid fa-folder-open fa-3x mb-3 d-block opacity-50" />
                <div className="fw-semibold mb-1">Sin documentos</div>
                <div className="small">El pasajero aún no ha subido documentos.</div>
              </div>
            ) : (
              <div className="d-flex flex-column gap-2">
                {docs.map(doc => {
                  const meta = DOC_LABEL[doc.docType] ?? { label: doc.docType, icon: 'fa-file' };
                  const color = STATUS_COLOR[doc.status];
                  const isReviewed = reviewed.has(doc.id) || doc.status === 'approved';

                  return (
                    <div key={doc.id}
                         className="d-flex align-items-center gap-3 flex-wrap"
                         style={{
                           background: 'var(--bugie-surface-2)',
                           borderRadius: 12,
                           padding: '12px 16px',
                           borderLeft: `3px solid ${color}`,
                         }}>

                      {/* Checkbox de revisado */}
                      <input type="checkbox" checked={isReviewed}
                             onChange={() => setReviewed(prev => {
                               const n = new Set(prev);
                               if (n.has(doc.id)) n.delete(doc.id); else n.add(doc.id);
                               return n;
                             })}
                             style={{ width: 20, height: 20, cursor: 'pointer' }}
                             title="Marcar como revisado" />

                      {/* Icono + título */}
                      <div className="d-flex align-items-center gap-2 flex-grow-1" style={{ minWidth: 200 }}>
                        <div className="d-flex align-items-center justify-content-center flex-shrink-0"
                             style={{ width: 40, height: 40, borderRadius: 10,
                                      background: color + '22', color }}>
                          <i className={`fa-solid ${meta.icon}`} />
                        </div>
                        <div className="flex-grow-1" style={{ minWidth: 0 }}>
                          <div className="fw-bold">{meta.label}</div>
                          <div className="small bugie-muted text-truncate" style={{ maxWidth: 280 }}>
                            {doc.originalFileName ?? 'archivo'}
                          </div>
                          {doc.rejectionReason && (
                            <div className="small text-danger mt-1">
                              <i className="fa-solid fa-circle-info me-1" />
                              {doc.rejectionReason}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Badge del estado */}
                      <span className="badge rounded-pill px-3 py-2"
                            style={{ background: color + '22', color, fontSize: '0.72rem',
                                     textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {doc.status === 'approved' ? 'Aprobado'
                          : doc.status === 'rejected' ? 'Rechazado' : 'Pendiente'}
                      </span>

                      {/* Acciones */}
                      <div className="d-flex gap-1 flex-wrap">
                        <button className="btn btn-sm btn-bugie-outline rounded-pill"
                                onClick={() => setPreview(doc)}
                                title="Ver imagen">
                          <i className="fa-solid fa-eye" />
                        </button>
                        <button className="btn btn-sm rounded-pill"
                                style={{ background: '#10b981', color: '#fff', border: 'none', minWidth: 40 }}
                                disabled={actingDoc === doc.id || doc.status === 'approved'}
                                onClick={() => approveDoc(doc)}
                                title="Aprobar">
                          {actingDoc === doc.id
                            ? <span className="spinner-border spinner-border-sm" />
                            : <i className="fa-solid fa-check" />}
                        </button>
                        <button className="btn btn-sm rounded-pill"
                                style={{ background: '#ef4444', color: '#fff', border: 'none', minWidth: 40 }}
                                disabled={actingDoc === doc.id}
                                onClick={() => rejectDoc(doc)}
                                title="Rechazar">
                          <i className="fa-solid fa-xmark" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Footer de acciones masivas */}
            <div className="d-flex justify-content-between align-items-center gap-2 mt-4 pt-3 flex-wrap"
                 style={{ borderTop: '1px solid var(--bugie-border)' }}>
              <div className="small bugie-muted">
                <i className="fa-solid fa-circle-info me-1" />
                Aprueba cada documento y marca el check de revisión para activar el botón.
              </div>
              <div className="d-flex gap-2 flex-wrap">
                <button className="btn btn-bugie-outline rounded-pill"
                        disabled={approvingAll || docs.length === 0}
                        onClick={rejectAll}>
                  <i className="fa-solid fa-paper-plane me-2" />Notificar para reenvío
                </button>
                <button className="btn btn-success btn-lg rounded-pill px-4"
                        disabled={approvingAll || !canApprove}
                        onClick={approvePassenger}>
                  {approvingAll
                    ? <span className="spinner-border spinner-border-sm me-2" />
                    : <i className="fa-solid fa-circle-check me-2" />}
                  Aprobar pasajero
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {preview && <DocPreviewModal doc={preview} onClose={() => setPreview(null)} />}
    </>
  );
}

/// Fila de información: icono + label + valor. Diseño limpio con icono soft
/// y label en mayúscula. Reemplaza al DataRow viejo que era muy plano.
function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="d-flex align-items-center gap-3 py-2"
         style={{ borderBottom: '1px solid var(--bugie-border)' }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: 'var(--bugie-primary)15', color: 'var(--bugie-primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <i className={`fa-solid ${icon}`} style={{ fontSize: '0.9rem' }} />
      </div>
      <div className="flex-grow-1" style={{ minWidth: 0 }}>
        <div className="small bugie-muted text-uppercase" style={{ fontSize: '0.68rem', letterSpacing: '0.08em' }}>
          {label}
        </div>
        <div className="fw-bold text-truncate">{value}</div>
      </div>
    </div>
  );
}

function DocPreviewModal({ doc, onClose }: { doc: Doc; onClose: () => void }) {
  // El backend devuelve fileUrl como ruta RELATIVA (ej: "/uploads/passengers/abc.jpg")
  // porque el host correcto depende de quién pregunte (admin web, app móvil por LAN).
  // Acá le anteponemos el host del backend Auth (API.auth es "http://host:5001/api",
  // le sacamos el "/api" final y nos queda "http://host:5001" donde están los archivos).
  // Si fileUrl ya viene como URL absoluta (empieza con http), la usamos tal cual.
  const previewUrl = doc.fileUrl?.startsWith('http')
    ? doc.fileUrl
    : `${API.auth.replace(/\/api\/?$/, '')}${doc.fileUrl}`;

  const downloadUrl = `${API.auth}/auth/passengers/documents/${doc.id}/download`;
  const meta        = DOC_LABEL[doc.docType] ?? { label: doc.docType, icon: 'fa-file' };
  const isImage     = doc.mimeType?.startsWith('image/');
  const isPdf       = doc.mimeType === 'application/pdf';

  return (
    <div onClick={onClose}
         style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
                  zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()}
           style={{ background: 'var(--bugie-surface)', borderRadius: 16,
                    maxWidth: 900, width: '100%', maxHeight: '90vh',
                    display: 'flex', flexDirection: 'column' }}>
        <div className="d-flex justify-content-between align-items-center p-3 border-bottom"
             style={{ borderColor: 'var(--bugie-border)' }}>
          <div>
            <div className="fw-bold">
              <i className={`fa-solid ${meta.icon} me-2`} />{meta.label}
            </div>
            <div className="small bugie-muted">{doc.originalFileName}</div>
          </div>
          <button className="btn btn-sm btn-bugie-outline" onClick={onClose}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
        <div className="flex-grow-1 d-flex align-items-center justify-content-center"
             style={{ overflow: 'auto', padding: 20, background: '#000' }}>
          {isImage && <img src={previewUrl} alt="" style={{ maxWidth: '100%', maxHeight: '70vh' }} />}
          {isPdf   && <iframe src={previewUrl} title="preview" style={{ width: '100%', height: '70vh', border: 0 }} />}
          {!isImage && !isPdf && (
            <div className="text-center text-white">
              <i className="fa-solid fa-file fa-3x mb-3 d-block" />
              <a href={previewUrl} target="_blank" rel="noreferrer" className="btn btn-bugie text-white">
                <i className="fa-solid fa-download me-2" />Abrir en pestaña
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}