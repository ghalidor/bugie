import { useEffect, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import { API, apiFetch } from '../../state/api';

interface UserProfile {
  id: string; fullName: string; email: string; phone: string; createdAt: string;
}

interface DriverProfile {
  id: string;
  status: number;
  isOnline: boolean;
  rating: number;
  totalRatings: number;
  profilePhotoUrl: string | null;
  faceIdPhotoUrl:  string | null;
}

const STATUS: Record<number, { label: string; color: string }> = {
  1: { label: 'Pendiente de documentos', color: 'warning' },
  2: { label: 'En revisión',             color: 'info'    },
  3: { label: 'Aprobado',                color: 'success' },
  4: { label: 'Suspendido',              color: 'danger'  },
  5: { label: 'Rechazado',               color: 'danger'  },
  6: { label: 'Documentos vencidos',     color: 'danger'  },
};

export default function DriverProfile() {
  const [user,    setUser]    = useState<UserProfile | null>(null);
  const [driver,  setDriver]  = useState<DriverProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const [u, d] = await Promise.allSettled([
      apiFetch<UserProfile>(`${API.auth}/auth/me`),
      apiFetch<DriverProfile>(`${API.drivers}/drivers/profile/me`),
    ]);
    if (u.status === 'fulfilled') setUser(u.value);
    if (d.status === 'fulfilled') setDriver(d.value);
    if (u.status === 'rejected') setError('No se pudo cargar el perfil.');
    setLoading(false);
  }

  async function uploadProfilePhoto(file: File) {
    setError(null); setSuccess(null); setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const token = localStorage.getItem('bugie_token');
      const res = await fetch(`${API.drivers}/drivers/profile/me/photo`, {
        method:  'POST',
        body:    form,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'No se pudo subir la foto.');
      }
      const data = await res.json();
      setDriver(prev => prev
        ? { ...prev, profilePhotoUrl: data.profilePhotoUrl }
        : prev);
      setSuccess('Foto de perfil actualizada.');
    } catch (err: any) {
      setError(err.message ?? 'Error al subir la foto.');
    } finally {
      setUploading(false);
    }
  }

  if (loading) return (
    <div className="d-flex justify-content-center py-5">
      <span className="spinner-border" />
    </div>
  );

  const si = driver ? STATUS[driver.status] : null;

  return (
    <>
      <PageHeader title="Mi perfil" subtitle="Datos personales y foto de perfil." icon="fa-solid fa-user" />

      {error   && <div className="alert alert-danger  small mb-3">{error}</div>}
      {success && <div className="alert alert-success small mb-3"><i className="fa-solid fa-check me-2" />{success}</div>}

      {/* Foto de perfil */}
      <div className="bugie-card mb-3">
        <div className="bugie-card-header">
          <i className="fa-solid fa-camera me-2 text-bugie-accent" />
          Foto de perfil
        </div>
        <div className="bugie-card-body">
          <div className="row g-3 align-items-center">
            <div className="col-12 col-md-auto">
              <div style={{
                width: 140, height: 140, borderRadius: '50%',
                overflow: 'hidden',
                background: 'var(--bugie-bg-2)',
                border: '3px solid var(--bugie-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto',
              }}>
                {driver?.profilePhotoUrl ? (
                  <img src={driver.profilePhotoUrl} alt="Perfil"
                       style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <i className="fa-solid fa-user" style={{ fontSize: 56, color: 'var(--bugie-muted)' }} />
                )}
              </div>
            </div>
            <div className="col-12 col-md">
              <div className="small bugie-muted mb-2">
                <i className="fa-solid fa-circle-info me-1" />
                Esta foto se mostrará a los pasajeros en su historial cuando hayas hecho un viaje.
                Es independiente de tu foto de verificación facial (Face ID). Máximo 5 MB.
                Formatos: JPG, PNG, WEBP.
              </div>
              <label className="btn btn-bugie text-white rounded-pill" style={{ cursor: 'pointer' }}>
                {uploading
                  ? <><span className="spinner-border spinner-border-sm me-2" />Subiendo…</>
                  : <><i className="fa-solid fa-upload me-2" />
                      {driver?.profilePhotoUrl ? 'Cambiar foto' : 'Subir foto'}</>}
                <input type="file" accept="image/*" hidden disabled={uploading}
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) uploadProfilePhoto(f);
                    e.target.value = '';
                  }} />
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Información personal */}
      <div className="bugie-card mb-3">
        <div className="bugie-card-header">
          <i className="fa-solid fa-id-card me-2 text-bugie-accent" />
          Información personal
        </div>
        <div className="bugie-card-body">
          <div className="row g-3">
            <div className="col-md-6">
              <div className="small bugie-muted mb-1">Nombre completo</div>
              <div className="fw-semibold">{user?.fullName ?? '—'}</div>
            </div>
            <div className="col-md-6">
              <div className="small bugie-muted mb-1">Correo</div>
              <div className="fw-semibold">{user?.email ?? '—'}</div>
            </div>
            <div className="col-md-6">
              <div className="small bugie-muted mb-1">Teléfono</div>
              <div className="fw-semibold">{user?.phone ?? '—'}</div>
            </div>
            <div className="col-md-6">
              <div className="small bugie-muted mb-1">Miembro desde</div>
              <div className="fw-semibold">{user
                ? new Date(user.createdAt).toLocaleDateString('es-PE')
                : '—'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Estado del conductor */}
      {driver && (
        <div className="bugie-card mb-3">
          <div className="bugie-card-header d-flex justify-content-between align-items-center">
            <span><i className="fa-solid fa-circle-check me-2 text-bugie-accent" />Estado de la cuenta</span>
            {si && <span className={`badge text-bg-${si.color}`}>{si.label}</span>}
          </div>
          <div className="bugie-card-body">
            <div className="row g-3">
              <div className="col-md-4">
                <div className="small bugie-muted mb-1">Rating</div>
                <div className="fw-semibold">
                  <i className="fa-solid fa-star me-1" style={{ color: '#f59e0b' }} />
                  {driver.rating.toFixed(1)}
                  <span className="bugie-muted ms-2">({driver.totalRatings} viajes calificados)</span>
                </div>
              </div>
              <div className="col-md-4">
                <div className="small bugie-muted mb-1">Disponibilidad</div>
                <div className="fw-semibold">
                  {driver.isOnline
                    ? <span style={{ color: '#34d399' }}><i className="fa-solid fa-circle-dot me-1" />En línea</span>
                    : <span className="bugie-muted">Desconectado</span>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Acciones */}
      <div className="bugie-card">
        <div className="bugie-card-header">Acciones rápidas</div>
        <div className="bugie-card-body d-grid gap-2">
          <a className="bugie-list-item text-decoration-none" href="/app/conductor/vehiculos">
            <div className="bugie-mini-icon"><i className="fa-solid fa-car" /></div>
            <div className="flex-grow-1">
              <div className="fw-semibold">Mis vehículos</div>
              <div className="small bugie-muted">Ver, agregar y activar vehículos</div>
            </div>
            <i className="fa-solid fa-chevron-right bugie-muted" />
          </a>
          <a className="bugie-list-item text-decoration-none" href="/app/conductor/documentos">
            <div className="bugie-mini-icon"><i className="fa-solid fa-id-card" /></div>
            <div className="flex-grow-1">
              <div className="fw-semibold">Actualizar documentos</div>
              <div className="small bugie-muted">Subir o verificar documentos de habilitación</div>
            </div>
            <i className="fa-solid fa-chevron-right bugie-muted" />
          </a>
          <a className="bugie-list-item text-decoration-none" href="/app/conductor/sos">
            <div className="bugie-mini-icon"><i className="fa-solid fa-shield-halved" /></div>
            <div className="flex-grow-1">
              <div className="fw-semibold">Configurar SOS</div>
              <div className="small bugie-muted">Botón de emergencia en ruta</div>
            </div>
            <i className="fa-solid fa-chevron-right bugie-muted" />
          </a>
        </div>
      </div>
    </>
  );
}