import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import { API, apiFetch, ApiError } from '../../state/api';
import { authHeaders } from '../../state/session';
import { DriverPayoutsSection } from './DriverPayouts';

interface DriverDto {
  id: string; userId: string; fullName?: string;
  status: number; isOnline: boolean;
  rating: number; totalRatings: number;
  createdAt: string; approvedAt: string | null;
  // Foto de perfil del conductor (subida por él mismo).
  // El backend la devuelve como URL relativa tipo "/uploads/profiles/..".
  profilePhotoUrl?: string | null;
}
interface Vehicle {
  id: string; plate: string; brand: string;
  model: string; year: number; color: string; isActive: boolean;
  // Foto del vehículo (subida en la verificación). URL relativa.
  photoUrl?: string | null;
}
/// Info del usuario asociado al conductor: viene del módulo Auth vía
/// IAuthClient HTTP en el handler del backend. Contiene nombre, email,
/// teléfono — datos que el módulo Drivers no almacena directamente.
interface UserInfo {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  termsAccepted?: boolean;
  signatureImage?: string | null;
}
interface Doc {
  id: string; docType: string; fileUrl: string;
  originalFileName: string | null; mimeType: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'superseded';
  rejectionReason: string | null;
  expiresAt: string | null; createdAt: string;
}

const STATUS_LABEL: Record<number, string> = {
  1: 'Pendiente docs', 2: 'En revisión',
  3: 'Aprobado',       4: 'Suspendido', 5: 'Rechazado',
};

const DOC_LABEL: Record<string, { label: string; icon: string }> = {
  dni_front:                 { label: 'DNI - Frontal',             icon: 'fa-id-card' },
  dni_back:                  { label: 'DNI - Reverso',             icon: 'fa-id-card' },
  license:                   { label: 'Licencia de conducir',      icon: 'fa-car' },
  soat:                      { label: 'SOAT',                       icon: 'fa-shield-halved' },
  tarjeta_propiedad:         { label: 'Tarjeta de propiedad',      icon: 'fa-file-lines' },
  revision_tecnica:          { label: 'Revisión técnica',          icon: 'fa-screwdriver-wrench' },
  certificado_unico_laboral: { label: 'Certificado único laboral', icon: 'fa-clipboard-check' },
};

const STATUS_COLOR: Record<string, string> = {
  pending: '#f59e0b', approved: '#10b981', rejected: '#ef4444',
};

export default function DriverDetail() {
  const { driverId } = useParams<{ driverId: string }>();
  const navigate     = useNavigate();

  const [driver,   setDriver]   = useState<DriverDto | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [docs,     setDocs]     = useState<Doc[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  // Checks de revisión (solo en memoria, no se persisten)
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());

  // Preview modal
  const [preview, setPreview] = useState<Doc | null>(null);
  const [actingDoc, setActingDoc] = useState<string | null>(null);
  const [approvingAll, setApprovingAll] = useState(false);

  // Histórico de documentos (superseded)
  const [showHistory,    setShowHistory]    = useState(false);
  const [history,        setHistory]        = useState<Doc[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError,   setHistoryError]   = useState<string | null>(null);
  const [historyPreview, setHistoryPreview] = useState<Doc | null>(null);

  useEffect(() => { if (driverId) load(driverId); }, [driverId]);

  async function load(id: string) {
    setLoading(true); setError(null);
    try {
      const detail = await apiFetch<{
        driver: DriverDto;
        vehicles: Vehicle[];
        userInfo?: UserInfo | null;
      }>(`${API.drivers}/drivers/${id}/detail`);
      setDriver(detail.driver);
      setVehicles(detail.vehicles ?? []);
      setUserInfo(detail.userInfo ?? null);

      const list = await apiFetch<Doc[]>(`${API.drivers}/drivers/documents/by-driver/${id}`);
      setDocs(list);
    } catch (e: any) {
      setError(e instanceof ApiError ? e.message : 'No se pudo cargar el conductor.');
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory() {
    if (!driverId) return;
    setHistoryLoading(true);
    setHistoryError(null);
    setShowHistory(true);
    try {
      const all = await apiFetch<Doc[]>(`${API.drivers}/drivers/documents/by-driver/${driverId}/history`);
      // Solo mostrar los superseded (los activos ya están en la vista principal)
      const old = all.filter(d => d.status === 'superseded');
      setHistory(old);
    } catch (e: any) {
      setHistoryError(e instanceof ApiError ? e.message : 'No se pudo cargar el histórico.');
    } finally {
      setHistoryLoading(false);
    }
  }

  async function approveDoc(doc: Doc) {
    setActingDoc(doc.id);
    try {
      const updated = await apiFetch<Doc>(
        `${API.drivers}/drivers/documents/${doc.id}/approve`,
        { method: 'PUT' });
      setDocs(prev => prev.map(d => d.id === doc.id ? updated : d));
      setReviewed(prev => new Set([...prev, doc.id]));
    } catch (e: any) {
      setError(e.message ?? 'No se pudo aprobar el documento.');
    } finally { setActingDoc(null); }
  }

  async function rejectDoc(doc: Doc) {
    const reason = window.prompt('Motivo del rechazo (opcional):') ?? '';
    setActingDoc(doc.id);
    try {
      const updated = await apiFetch<Doc>(
        `${API.drivers}/drivers/documents/${doc.id}/reject`,
        { method: 'PUT', body: JSON.stringify({ reason }) });
      setDocs(prev => prev.map(d => d.id === doc.id ? updated : d));
    } catch (e: any) {
      setError(e.message ?? 'No se pudo rechazar el documento.');
    } finally { setActingDoc(null); }
  }

  async function approveDriver() {
    if (!driver) return;
    setApprovingAll(true);
    try {
      await apiFetch(`${API.drivers}/drivers/${driver.id}/approve`, { method: 'PUT' });
      await load(driver.id);
    } catch (e: any) {
      setError(e.message ?? 'No se pudo aprobar el registro.');
    } finally { setApprovingAll(false); }
  }

  // Para activar "Aprobar registro" hace falta:
  // 1) Que TODOS los documentos requeridos hayan sido aprobados,
  // 2) Y que el admin haya marcado el check de revisión de cada uno.
  const requiredKeys = Object.keys(DOC_LABEL);
  const allApproved  = requiredKeys.every(k => docs.find(d => d.docType === k)?.status === 'approved');
  const allReviewed  = docs
    .filter(d => requiredKeys.includes(d.docType))
    .every(d => reviewed.has(d.id) || d.status !== 'pending');
  const canApprove   = allApproved && allReviewed && driver?.status !== 3;

  if (loading) {
    return <div className="d-flex justify-content-center py-5"><span className="spinner-border" /></div>;
  }
  if (error || !driver) {
    return (
      <div className="alert alert-danger small">
        {error ?? 'Conductor no encontrado.'}
        <div className="mt-2">
          <button className="btn btn-sm btn-bugie-outline" onClick={() => navigate(-1)}>
            Volver
          </button>
        </div>
      </div>
    );
  }

  // Helper: si el conductor no tiene reseñas, mostrar "Sin calificación"
  // en vez de "5.0 (0)". El backend devuelve rating=5 por default,
  // que no representa una valoración real.
  const ratingShort = driver.totalRatings === 0
    ? 'Sin calificación'
    : `${driver.rating.toFixed(1)} (${driver.totalRatings})`;

  return (
    <>
      <PageHeader
        title={driver.fullName ?? `Conductor ${driver.userId.slice(0, 8)}…`}
        subtitle="Detalle del registro y documentos del conductor"
        icon="fa-solid fa-user"
        actions={
          <button className="btn btn-bugie-outline" onClick={() => navigate(-1)}>
            <i className="fa-solid fa-arrow-left me-2" />Volver
          </button>
        }
      />

      {/* ── HERO del conductor: foto grande + NOMBRE prominente + datos
              de contacto + badges de estado. Toda la info clave a la
              vista, sin tener que buscar en tablas. */}
      <div className="bugie-card mb-3" style={{
        padding: 0,
        overflow: 'hidden',
        borderLeft: `4px solid ${
          driver.status === 3 ? '#22c55e' :
          driver.status === 4 ? '#f59e0b' :
          driver.status === 5 ? '#ef4444' :
          driver.status === 6 ? '#ef4444' :
          'var(--bugie-primary)'
        }`,
      }}>
        <div className="d-flex flex-wrap align-items-center gap-3 p-3">
          {/* Avatar grande */}
          {driver.profilePhotoUrl ? (
            <img
              src={driver.profilePhotoUrl.startsWith('http')
                ? driver.profilePhotoUrl
                : `${API.drivers.replace(/\/api\/?$/, '')}${driver.profilePhotoUrl}`}
              alt={userInfo?.fullName ?? 'Conductor'}
              style={{
                width: 100, height: 100, borderRadius: '50%',
                objectFit: 'cover',
                border: '3px solid var(--bugie-primary)',
                flexShrink: 0,
              }}
            />
          ) : (
            <div style={{
              width: 100, height: 100, borderRadius: '50%',
              background: 'var(--bugie-primary)22',
              color: 'var(--bugie-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '2rem', fontWeight: 700,
              border: '3px solid var(--bugie-primary)',
              flexShrink: 0,
            }}>
              {(userInfo?.fullName?.[0] ?? '?').toUpperCase()}
            </div>
          )}

          {/* Info central: NOMBRE grande + email/teléfono + badges */}
          <div className="flex-grow-1" style={{ minWidth: 200 }}>
            {/* Nombre grande del conductor */}
            <h3 className="fw-bold mb-1" style={{ fontSize: '1.5rem', lineHeight: 1.2 }}>
              {userInfo?.fullName ?? 'Conductor sin nombre'}
            </h3>

            {/* Datos de contacto */}
            <div className="d-flex flex-wrap gap-3 mb-2 small">
              {userInfo?.email && (
                <a href={`mailto:${userInfo.email}`} className="text-decoration-none bugie-muted">
                  <i className="fa-solid fa-envelope me-1" style={{ fontSize: '0.78rem' }} />
                  {userInfo.email}
                </a>
              )}
              {userInfo?.phone && (
                <a href={`tel:${userInfo.phone}`} className="text-decoration-none bugie-muted">
                  <i className="fa-solid fa-phone me-1" style={{ fontSize: '0.78rem' }} />
                  {userInfo.phone}
                </a>
              )}
            </div>

            {/* Badges (estado + online + calificación) */}
            <div className="d-flex align-items-center gap-2 flex-wrap mb-2">
              {/* Badge de estado coloreado */}
              <span className="badge rounded-pill px-3 py-2" style={{
                background:
                  driver.status === 3 ? '#22c55e22' :
                  driver.status === 4 ? '#f59e0b22' :
                  driver.status === 5 ? '#ef444422' :
                  driver.status === 6 ? '#ef444422' :
                  'var(--bugie-primary)22',
                color:
                  driver.status === 3 ? '#22c55e' :
                  driver.status === 4 ? '#f59e0b' :
                  driver.status === 5 ? '#ef4444' :
                  driver.status === 6 ? '#ef4444' :
                  'var(--bugie-primary)',
                fontSize: '0.78rem',
                fontWeight: 600,
              }}>
                <i className={`fa-solid ${
                  driver.status === 3 ? 'fa-circle-check' :
                  driver.status === 4 ? 'fa-pause-circle' :
                  driver.status === 5 ? 'fa-circle-xmark' :
                  driver.status === 6 ? 'fa-triangle-exclamation' :
                  'fa-clock'
                } me-1`} />
                {STATUS_LABEL[driver.status]}
              </span>

              {/* Indicador En línea / Offline */}
              <span className="badge rounded-pill px-3 py-2" style={{
                background: driver.isOnline ? '#22c55e22' : 'var(--bugie-muted)22',
                color: driver.isOnline ? '#22c55e' : 'var(--bugie-muted)',
                fontSize: '0.78rem',
                fontWeight: 600,
              }}>
                <i className={`fa-solid fa-circle me-1`} style={{ fontSize: '0.55rem' }} />
                {driver.isOnline ? 'En línea' : 'Offline'}
              </span>

              {/* Calificación con estrellas */}
              <span className="badge rounded-pill px-3 py-2" style={{
                background: driver.totalRatings === 0 ? 'var(--bugie-muted)22' : '#fbbf2422',
                color: driver.totalRatings === 0 ? 'var(--bugie-muted)' : '#d97706',
                fontSize: '0.78rem',
                fontWeight: 600,
              }}>
                <i className="fa-solid fa-star me-1" style={{ fontSize: '0.7rem' }} />
                {ratingShort}
              </span>
            </div>

            {/* Fechas */}
            <div className="d-flex flex-wrap gap-3 small bugie-muted">
              <span>
                <i className="fa-solid fa-calendar-plus me-1" style={{ fontSize: '0.75rem' }} />
                Registrado {new Date(driver.createdAt).toLocaleDateString('es-PE', {
                  day: '2-digit', month: 'short', year: 'numeric'
                })}
              </span>
              {driver.approvedAt && (
                <span>
                  <i className="fa-solid fa-circle-check me-1" style={{ fontSize: '0.75rem', color: '#22c55e' }} />
                  Aprobado {new Date(driver.approvedAt).toLocaleDateString('es-PE', {
                    day: '2-digit', month: 'short', year: 'numeric'
                  })}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="row g-3">

        {/* Columna izquierda: IDs técnicos + Vehículos */}
        <div className="col-lg-4">
          {/* IDs técnicos (mucho más compacto que antes — los datos ya
              están arriba en el hero). Solo para referencia técnica. */}
          <div className="bugie-card p-3">
            <h5 className="fw-bold mb-3">
              <i className="fa-solid fa-fingerprint me-2 text-bugie-accent" />
              Identificación
            </h5>
            <InfoCell icon="fa-id-badge" label="ID conductor" value={driver.id.slice(0, 8) + '…'} copyValue={driver.id} />
            <InfoCell icon="fa-user-shield" label="UserId"  value={driver.userId.slice(0, 8) + '…'} copyValue={driver.userId} />
          </div>

          {/* Términos y firma del registro */}
          <div className="bugie-card p-3 mt-3">
            <h5 className="fw-bold mb-3">
              <i className="fa-solid fa-file-signature me-2 text-bugie-accent" />
              Términos y firma
            </h5>
            <div className="mb-3">
              <div className="small bugie-muted" style={{ fontSize: '0.72rem' }}>Aceptó términos y condiciones</div>
              <span className="badge rounded-pill px-3 py-2 mt-1 d-inline-flex align-items-center"
                    style={{
                      background: userInfo?.termsAccepted ? '#10b98122' : '#ef444422',
                      color:      userInfo?.termsAccepted ? '#10b981'   : '#ef4444',
                    }}>
                <i className={`fa-solid ${userInfo?.termsAccepted ? 'fa-circle-check' : 'fa-circle-xmark'} me-1`} />
                {userInfo?.termsAccepted ? 'Sí' : 'No'}
              </span>
            </div>
            <div>
              <div className="small bugie-muted mb-1" style={{ fontSize: '0.72rem' }}>Firma</div>
              {userInfo?.signatureImage ? (
                <img src={userInfo.signatureImage} alt="Firma"
                     style={{ maxWidth: '100%', maxHeight: 120, background: '#fff',
                              borderRadius: 8, border: '1px solid #e5e7eb', padding: 4 }} />
              ) : (
                <span className="small bugie-muted">Sin firma registrada</span>
              )}
            </div>
          </div>

          <div className="bugie-card p-3 mt-3">
            <h5 className="fw-bold mb-3">
              <i className="fa-solid fa-car me-2 text-bugie-accent" />
              Vehículos ({vehicles.length})
            </h5>
            {vehicles.length === 0 ? (
              <div className="small bugie-muted">Sin vehículos registrados.</div>
            ) : (
              <div className="d-grid gap-2">
                {/* Ordenamos: activos primero, inactivos al final.
                    Los inactivos se muestran con opacidad para indicar
                    que son históricos/desactivados. */}
                {[...vehicles]
                  .sort((a, b) => (a.isActive === b.isActive ? 0 : a.isActive ? -1 : 1))
                  .map(v => {
                    const photoSrc = v.photoUrl
                      ? (v.photoUrl.startsWith('http')
                          ? v.photoUrl
                          : `${API.drivers.replace(/\/api\/?$/, '')}${v.photoUrl}`)
                      : null;
                    return (
                      <div key={v.id}
                           className="p-2 small"
                           style={{
                             background: 'var(--bugie-surface-2)',
                             borderRadius: 10,
                             opacity: v.isActive ? 1 : 0.55,
                             borderLeft: `3px solid ${v.isActive ? '#22c55e' : '#6b7280'}`,
                           }}>
                        <div className="d-flex gap-2 align-items-start">
                          {/* Foto del auto (miniatura) */}
                          {photoSrc ? (
                            <img src={photoSrc} alt={v.plate}
                                 style={{
                                   width: 70, height: 70,
                                   objectFit: 'cover',
                                   borderRadius: 8,
                                   flexShrink: 0,
                                   filter: v.isActive ? 'none' : 'grayscale(60%)',
                                 }} />
                          ) : (
                            <div style={{
                              width: 70, height: 70,
                              borderRadius: 8,
                              background: 'var(--bugie-bg-2)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              flexShrink: 0,
                            }}>
                              <i className="fa-solid fa-car bugie-muted" style={{ fontSize: '1.6rem' }} />
                            </div>
                          )}
                          <div className="flex-grow-1" style={{ minWidth: 0 }}>
                            <div className="fw-bold">{v.plate}</div>
                            <div className="bugie-muted">{v.brand} {v.model}</div>
                            <div className="bugie-muted" style={{ fontSize: '0.75rem' }}>
                              {v.year} · {v.color}
                            </div>
                            <div className="mt-1">
                              {v.isActive
                                ? <span className="badge text-bg-success">Activo</span>
                                : <span className="badge text-bg-secondary">Inactivo</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>

        {/* Documentos */}
        <div className="col-lg-8">
          <div className="bugie-card p-3">
            <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
              <h5 className="fw-bold mb-0">
                <i className="fa-solid fa-folder-open me-2 text-bugie-accent" />
                Documentos ({docs.length})
              </h5>
              <div className="d-flex align-items-center gap-3 flex-wrap">
                <div className="small bugie-muted">
                  Marca el check después de revisar cada documento.
                </div>
                <button className="btn btn-sm btn-bugie-outline rounded-pill"
                  onClick={loadHistory}
                  title="Ver documentos antiguos reemplazados">
                  <i className="fa-solid fa-clock-rotate-left me-1" />
                  Ver histórico
                </button>
              </div>
            </div>

            {docs.length === 0 ? (
              <div className="text-center py-4 bugie-muted">
                <i className="fa-solid fa-folder-open fa-2x mb-2 d-block" />
                El conductor aún no ha subido documentos.
              </div>
            ) : (
              <div className="d-grid gap-2">
                {docs.map(doc => {
                  const meta = DOC_LABEL[doc.docType] ?? { label: doc.docType, icon: 'fa-file' };
                  const color = STATUS_COLOR[doc.status];
                  const isReviewed = reviewed.has(doc.id) || doc.status === 'approved';

                  return (
                    <div
                      key={doc.id}
                      className="p-3 d-flex align-items-center gap-3 flex-wrap"
                      style={{ background: 'var(--bugie-surface-2)', borderRadius: 10 }}
                    >
                      {/* Check de revisión */}
                      <input
                        type="checkbox"
                        checked={isReviewed}
                        onChange={() => {
                          setReviewed(prev => {
                            const n = new Set(prev);
                            if (n.has(doc.id)) n.delete(doc.id); else n.add(doc.id);
                            return n;
                          });
                        }}
                        style={{ width: 22, height: 22 }}
                        title="Marcar como revisado"
                      />

                      {/* Icono + label */}
                      <div className="d-flex align-items-center gap-2 flex-grow-1" style={{ minWidth: 200 }}>
                        <div
                          className="d-flex align-items-center justify-content-center flex-shrink-0"
                          style={{ width: 36, height: 36, borderRadius: 10, background: color + '22', color }}
                        >
                          <i className={`fa-solid ${meta.icon}`} />
                        </div>
                        <div>
                          <div className="fw-bold small">{meta.label}</div>
                          <div className="small bugie-muted text-truncate" style={{ maxWidth: 240 }}>
                            {doc.originalFileName ?? 'archivo'}
                          </div>
                          {doc.expiresAt && (
                            <div className="small mt-1" style={{
                              color: new Date(doc.expiresAt) <= new Date() ? '#ef4444' : '#94a3b8'
                            }}>
                              <i className="fa-solid fa-calendar-day me-1" style={{ fontSize: '0.7rem' }} />
                              Vence: {new Date(doc.expiresAt).toLocaleDateString('es-PE', {
                                day: '2-digit', month: 'short', year: 'numeric'
                              })}
                              {new Date(doc.expiresAt) <= new Date() && (
                                <span className="ms-1 fw-bold">(VENCIDO)</span>
                              )}
                            </div>
                          )}
                          {doc.rejectionReason && (
                            <div className="small text-danger">Motivo: {doc.rejectionReason}</div>
                          )}
                        </div>
                      </div>

                      {/* Estado */}
                      <span
                        className="badge rounded-pill"
                        style={{ background: color + '22', color, fontSize: '0.72rem' }}
                      >
                        {doc.status}
                      </span>

                      {/* Acciones */}
                      <div className="d-flex gap-2 flex-wrap">
                        <button
                          className="btn btn-sm btn-bugie-outline"
                          onClick={() => setPreview(doc)}
                          title="Previsualizar"
                        >
                          <i className="fa-solid fa-eye" />
                        </button>
                        <button
                          className="btn btn-sm btn-success"
                          disabled={actingDoc === doc.id || doc.status === 'approved'}
                          onClick={() => approveDoc(doc)}
                        >
                          {actingDoc === doc.id ? <span className="spinner-border spinner-border-sm" /> : <i className="fa-solid fa-check" />}
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          disabled={actingDoc === doc.id}
                          onClick={() => rejectDoc(doc)}
                        >
                          <i className="fa-solid fa-xmark" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Botón Aprobar registro */}
            <div className="d-flex justify-content-end mt-4 pt-3 border-top" style={{ borderColor: 'var(--bugie-border)' }}>
              <button
                className="btn btn-success btn-lg px-4"
                disabled={!canApprove || approvingAll}
                onClick={approveDriver}
                title={!canApprove ? 'Aprueba y revisa todos los documentos primero' : 'Aprobar registro del conductor'}
              >
                {approvingAll ? (
                  <><span className="spinner-border spinner-border-sm me-2" />Aprobando...</>
                ) : (
                  <><i className="fa-solid fa-circle-check me-2" />Aprobar registro</>
                )}
              </button>
            </div>
            {!canApprove && driver.status !== 3 && (
              <div className="small bugie-muted text-end mt-2">
                Aprueba cada documento y marca el check de revisión para activar el botón.
              </div>
            )}
          </div>

          {/* Historial de calificaciones recibidas (paginado) */}
          <DriverRatingsSection driverUserId={driver.userId} />

          {/* Pagos que se le hicieron (bonos, premios, manuales) */}
          <DriverPayoutsSection driverUserId={driver.userId} />
        </div>
      </div>

      {/* Preview modal */}
      {preview && (
        <DocPreviewModal doc={preview} onClose={() => setPreview(null)} />
      )}

      {/* Histórico de documentos */}
      {showHistory && (
        <HistoryModal
          loading={historyLoading}
          error={historyError}
          docs={history}
          onPreview={(d) => setHistoryPreview(d)}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* Preview del histórico (modal separado por encima del histórico) */}
      {historyPreview && (
        <DocPreviewModal
          doc={historyPreview}
          onClose={() => setHistoryPreview(null)}
        />
      )}
    </>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="d-flex justify-content-between small py-1" style={{ borderBottom: '1px solid var(--bugie-border)' }}>
      <span className="bugie-muted">{label}</span>
      <span className="fw-bold">{value}</span>
    </div>
  );
}

/// Celda informativa con icono. Reemplaza a DataRow donde queremos un
/// poco más de jerarquía visual. El icono va a la izquierda en un
/// recuadro soft del color primary.
function InfoCell({ icon, label, value, copyValue }: { icon: string; label: string; value: string; copyValue?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(copyValue ?? value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard no disponible */ }
  };
  return (
    <div className="d-flex align-items-center gap-2 py-2"
         style={{ borderBottom: '1px solid var(--bugie-border)' }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: 'var(--bugie-primary)18',
        color: 'var(--bugie-primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <i className={`fa-solid ${icon}`} style={{ fontSize: '0.85rem' }} />
      </div>
      <div className="flex-grow-1" style={{ minWidth: 0 }}>
        <div className="small bugie-muted" style={{ fontSize: '0.72rem' }}>{label}</div>
        <div className="fw-bold small text-truncate">{value}</div>
      </div>
      {copyValue && (
        <button type="button" onClick={handleCopy}
                title={copied ? 'Copiado' : 'Copiar'}
                className="btn btn-sm btn-bugie-outline rounded-circle d-flex align-items-center justify-content-center"
                style={{ width: 32, height: 32, flexShrink: 0, padding: 0 }}>
          <i className={`fa-solid ${copied ? 'fa-check' : 'fa-copy'}`}
             style={{ fontSize: '0.8rem', color: copied ? '#22c55e' : undefined }} />
        </button>
      )}
    </div>
  );
}

function DocPreviewModal({ doc, onClose }: { doc: Doc; onClose: () => void }) {
  // El backend devuelve fileUrl como ruta RELATIVA (ej: "/uploads/drivers/abc.jpg").
  // Anteponemos el host del backend Drivers (API.drivers es "http://host:5003/api",
  // le sacamos el "/api" final y nos queda el host base con los archivos estáticos).
  // Si fileUrl ya viene absoluta (http...), la usamos tal cual.
  const previewUrl = doc.fileUrl?.startsWith('http')
    ? doc.fileUrl
    : `${API.drivers.replace(/\/api\/?$/, '')}${doc.fileUrl}`;

  // Endpoint protegido para descarga forzada con el nombre original
  const downloadUrl = `${API.drivers}/drivers/documents/${doc.id}/download`;
  const meta = DOC_LABEL[doc.docType] ?? { label: doc.docType, icon: 'fa-file' };

  const isImage = doc.mimeType?.startsWith('image/');
  const isPdf   = doc.mimeType === 'application/pdf';

  // Un <a href> no manda el token, y el endpoint exige rol admin.
  // Por eso se pide el archivo con fetch (con token) y se descarga desde memoria.
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function downloadOriginal() {
    setDownloading(true); setDownloadError(null);
    try {
      const res = await fetch(downloadUrl, { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const blobUrl = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = doc.originalFileName ?? `documento-${doc.id}`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      setDownloadError('No se pudo descargar el archivo.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bugie-surface)', borderRadius: 16,
          maxWidth: 900, width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        }}
      >
        <div className="d-flex justify-content-between align-items-center p-3 border-bottom" style={{ borderColor: 'var(--bugie-border)' }}>
          <div>
            <div className="fw-bold">
              <i className={`fa-solid ${meta.icon} me-2`} />
              {meta.label}
            </div>
            <div className="small bugie-muted">{doc.originalFileName}</div>
          </div>
          <button className="btn btn-sm btn-bugie-outline" onClick={onClose}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
        <div className="flex-grow-1 d-flex align-items-center justify-content-center" style={{ overflow: 'auto', padding: 20, background: '#000' }}>
          {isImage && (
            <img src={previewUrl} alt={doc.originalFileName ?? ''} style={{ maxWidth: '100%', maxHeight: '70vh' }} />
          )}
          {isPdf && (
            <iframe src={previewUrl} title="preview" style={{ width: '100%', height: '70vh', border: 0 }} />
          )}
          {!isImage && !isPdf && (
            <div className="text-center text-white">
              <i className="fa-solid fa-file fa-3x mb-3 d-block" />
              <a href={previewUrl} target="_blank" rel="noreferrer" className="btn btn-bugie text-white">
                <i className="fa-solid fa-download me-2" />Descargar
              </a>
            </div>
          )}
        </div>
        <div className="p-3 d-flex justify-content-end gap-2 border-top" style={{ borderColor: 'var(--bugie-border)' }}>
          <a href={previewUrl} target="_blank" rel="noreferrer" className="btn btn-sm btn-bugie-outline">
            <i className="fa-solid fa-up-right-from-square me-2" />Abrir en pestaña
          </a>
          {downloadError && <span className="small text-danger align-self-center">{downloadError}</span>}
          <button type="button" onClick={downloadOriginal} disabled={downloading}
            className="btn btn-sm btn-bugie-outline">
            <i className={`fa-solid ${downloading ? 'fa-spinner fa-spin' : 'fa-download'} me-2`} />Descargar original
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Modal de histórico (documentos superseded)
// ─────────────────────────────────────────────────────────────────────
function HistoryModal({ loading, error, docs, onPreview, onClose }: {
  loading: boolean;
  error: string | null;
  docs: Doc[];
  onPreview: (doc: Doc) => void;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bugie-card"
        style={{ width: 'min(720px, 92vw)', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
      >
        <div className="p-3 d-flex justify-content-between align-items-center border-bottom"
             style={{ borderColor: 'var(--bugie-border)' }}>
          <h5 className="fw-bold mb-0">
            <i className="fa-solid fa-clock-rotate-left me-2 text-bugie-accent" />
            Histórico de documentos
          </h5>
          <button className="btn btn-sm btn-bugie-outline" onClick={onClose}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div className="p-3" style={{ overflow: 'auto' }}>
          <div className="small bugie-muted mb-3">
            Documentos antiguos que fueron reemplazados por uno nuevo.
            Estos archivos quedan archivados como histórico y no son visibles para el conductor.
          </div>

          {loading ? (
            <div className="d-flex justify-content-center py-4">
              <span className="spinner-border" />
            </div>
          ) : error ? (
            <div className="alert alert-danger small">{error}</div>
          ) : docs.length === 0 ? (
            <div className="text-center py-4 bugie-muted">
              <i className="fa-solid fa-folder-open fa-2x mb-2 d-block" />
              Sin documentos antiguos.
            </div>
          ) : (
            <div className="d-grid gap-2">
              {docs
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map(doc => {
                  const meta = DOC_LABEL[doc.docType] ?? { label: doc.docType, icon: 'fa-file' };
                  return (
                    <div key={doc.id} className="p-3 d-flex align-items-center gap-3 flex-wrap"
                         style={{ background: 'var(--bugie-surface-2)', borderRadius: 10 }}>
                      <div
                        className="d-flex align-items-center justify-content-center flex-shrink-0"
                        style={{ width: 36, height: 36, borderRadius: 10,
                                 background: '#94a3b822', color: '#94a3b8' }}
                      >
                        <i className={`fa-solid ${meta.icon}`} />
                      </div>
                      <div className="flex-grow-1" style={{ minWidth: 0 }}>
                        <div className="fw-bold small">{meta.label}</div>
                        <div className="small bugie-muted text-truncate">
                          {doc.originalFileName ?? 'archivo'}
                        </div>
                        <div className="small bugie-muted mt-1">
                          <i className="fa-solid fa-calendar-day me-1" style={{ fontSize: '0.7rem' }} />
                          Subido: {new Date(doc.createdAt).toLocaleDateString('es-PE',
                            { day: '2-digit', month: 'short', year: 'numeric' })}
                          {doc.expiresAt && (
                            <span className="ms-2">
                              · Caducaba: {new Date(doc.expiresAt).toLocaleDateString('es-PE',
                                { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="badge rounded-pill"
                            style={{ background: '#94a3b822', color: '#94a3b8', fontSize: '0.72rem' }}>
                        Reemplazado
                      </span>
                      <button
                        className="btn btn-sm btn-bugie-outline"
                        onClick={() => onPreview(doc)}
                        title="Previsualizar archivo viejo"
                      >
                        <i className="fa-solid fa-eye me-1" />Ver archivo
                      </button>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────
// Sección de historial de calificaciones recibidas por el conductor.
// Lista paginada (10 por página) con botón "Cargar más".
// Promedio "real" lo trae driver.rating (de DriverDetail principal);
// este componente solo lista las calificaciones individuales.
// ─────────────────────────────────────────────────────────────────────
interface AdminRating {
  id: string;
  tripId: string;
  passengerId: string;
  passengerName: string;
  driverId: string;
  stars: number;
  comment: string | null;
  createdAt: string;
}
interface AdminRatingPage {
  items: AdminRating[];
  page: number;
  pageSize: number;
  total: number;
}

function DriverRatingsSection({ driverUserId }: { driverUserId: string }) {
  const PAGE_SIZE = 10;
  const [items, setItems]     = useState<AdminRating[]>([]);
  const [page, setPage]       = useState(1);
  const [total, setTotal]     = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [initial, setInitial] = useState(true);

  async function loadPage(reset: boolean) {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const p = reset ? 1 : page;
      const data = await apiFetch<AdminRatingPage>(
        `${API.trips}/trips/ratings/driver/${driverUserId}?page=${p}&pageSize=${PAGE_SIZE}`);
      setItems(prev => reset ? data.items : [...prev, ...data.items]);
      setPage(p + 1);
      setTotal(data.total);
      setHasMore(p * data.pageSize < data.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudieron cargar las calificaciones.');
    } finally {
      setLoading(false);
      setInitial(false);
    }
  }

  useEffect(() => {
    loadPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverUserId]);

  return (
    <div className="bugie-card p-3 mt-3">
      <h5 className="fw-bold mb-3">
        <i className="fa-solid fa-star me-2" style={{ color: '#fbbf24' }} />
        Calificaciones recibidas ({total})
      </h5>

      {error && <div className="alert alert-danger small mb-2">{error}</div>}

      {initial ? (
        <div className="d-flex justify-content-center py-3">
          <div className="spinner-border spinner-border-sm" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-3 bugie-muted small">
          <i className="fa-regular fa-star fa-2x mb-2 d-block" />
          Este conductor aún no tiene calificaciones.
        </div>
      ) : (
        <div className="d-grid gap-2">
          {items.map(r => <AdminRatingCard key={r.id} rating={r} />)}

          {hasMore && (
            <button
              onClick={() => loadPage(false)}
              disabled={loading}
              className="btn btn-sm btn-bugie-outline rounded-pill mt-2"
            >
              {loading
                ? <><span className="spinner-border spinner-border-sm me-2" />Cargando...</>
                : `Cargar más (${items.length} / ${total})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function AdminRatingCard({ rating }: { rating: AdminRating }) {
  const date = new Date(rating.createdAt).toLocaleString('es-PE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  return (
    <div className="p-2" style={{
      background: 'var(--bugie-surface-2)',
      borderRadius: 10,
    }}>
      <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
        <div className="d-flex">
          {[1,2,3,4,5].map(s => (
            <i key={s}
               className="fa-solid fa-star"
               style={{
                 color: s <= rating.stars ? '#fbbf24' : '#374151',
                 fontSize: '0.85rem',
                 marginRight: 1,
               }} />
          ))}
        </div>
        <span className="fw-bold small">{rating.stars}/5</span>
        <span className="ms-auto small bugie-muted" style={{ fontSize: '0.7rem' }}>
          {date}
        </span>
      </div>
      <div className="small">
        <i className="fa-solid fa-user me-1 bugie-muted" style={{ fontSize: '0.7rem' }} />
        {rating.passengerName}
      </div>
      {rating.comment && (
        <div className="small mt-2 p-2" style={{
          background: 'var(--bugie-bg-2)',
          borderRadius: 6,
          fontStyle: 'italic',
        }}>
          "{rating.comment}"
        </div>
      )}
    </div>
  );
}
