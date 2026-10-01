import { useEffect, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import { API, apiFetch, ApiError } from '../../state/api';
import { getUser, saveSession, getToken } from '../../state/session';

interface UserProfile {
  id: string; fullName: string; email: string;
  phone: string; role: string; isActive: boolean; createdAt: string;
}

export default function PassengerProfile() {
  const session = getUser();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState({ fullName: '', phone: '' });

  useEffect(() => {
    apiFetch<UserProfile>(`${API.auth}/auth/me`)
      .then(d => { setProfile(d); setForm({ fullName: d.fullName, phone: d.phone }); })
      .catch(() => setError('No se pudo cargar el perfil.'))
      .finally(() => setLoading(false));
  }, []);

  const set = (f: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, [f]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null); setSuccess(false);
    try {
      // Actualizar sesión local
      const token = getToken();
      if (session && token) {
        saveSession(token, { ...session, fullName: form.fullName });
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al guardar.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="d-flex justify-content-center py-5"><span className="spinner-border" /></div>;

  return (
    <>
      <PageHeader title="Mi perfil" subtitle="Datos personales de tu cuenta Bugie." icon="fa-solid fa-user" />
      {error   && <div className="alert alert-danger  small mb-3"><i className="fa-solid fa-circle-exclamation me-2" />{error}</div>}
      {success && <div className="alert alert-success small mb-3"><i className="fa-solid fa-check me-2" />Nombre actualizado correctamente.</div>}

      <div className="bugie-card mb-3">
        <div className="bugie-card-header">Información personal</div>
        <div className="bugie-card-body">
          <form onSubmit={save} className="row g-3">
            <div className="col-md-6">
              <label className="form-label">Nombre completo</label>
              <input className="form-control" value={form.fullName} onChange={set('fullName')} required />
            </div>
            <div className="col-md-6">
              <label className="form-label">Teléfono</label>
              <input className="form-control" value={form.phone} onChange={set('phone')} placeholder="+51 999 999 999" />
            </div>
            <div className="col-12">
              <label className="form-label">Correo electrónico</label>
              <input className="form-control" value={profile?.email ?? ''} disabled />
              <div className="form-text">El correo no se puede modificar.</div>
            </div>
            <div className="col-12">
              <label className="form-label">Miembro desde</label>
              <input
                className="form-control"
                value={profile ? new Date(profile.createdAt).toLocaleDateString('es-PE', { year: 'numeric', month: 'long', day: 'numeric' }) : ''}
                disabled
              />
            </div>
            <div className="col-12">
              <button className="btn btn-bugie text-white" type="submit" disabled={saving}>
                {saving
                  ? <><span className="spinner-border spinner-border-sm me-2" />Guardando…</>
                  : <><i className="fa-solid fa-floppy-disk me-2" />Guardar cambios</>
                }
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="bugie-card">
        <div className="bugie-card-header">Seguridad</div>
        <div className="bugie-card-body">
          <a className="bugie-list-item text-decoration-none" href="/app/pasajero/sos">
            <div className="bugie-mini-icon"><i className="fa-solid fa-shield-halved" /></div>
            <div className="flex-grow-1">
              <div className="fw-semibold">Configurar SOS</div>
              <div className="small bugie-muted">Botón de emergencia y contactos de confianza</div>
            </div>
            <i className="fa-solid fa-chevron-right bugie-muted" />
          </a>
        </div>
      </div>
    </>
  );
}
