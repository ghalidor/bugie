import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import EmergencyContactForm from '../../components/EmergencyContactForm';
import DriverAccountStatus, { DriverAccountInfo } from '../../components/DriverAccountStatus';
import ChangePasswordCard from '../../components/ChangePasswordCard';
import { identityInfoItems } from '../../components/IdentityFields';
import { MeProfile } from '../../state/identity';
import { API, apiFetch, driversFileUrl } from '../../state/api';
import { usePlatformConfig } from '../../hooks/usePlatformConfig';
import { InfoList, Notice, Page, PageLoading, SectionCard, StatCard, StatGrid, StatusBadge, Tone, useToast } from '../../components/ui';

interface DriverProfile {
  id: string;
  status: number;
  isOnline: boolean;
  rating: number;
  totalRatings: number;
  profilePhotoUrl: string | null;
  faceIdPhotoUrl:  string | null;
}

const STATUS: Record<number, { label: string; tone: Tone }> = {
  1: { label: 'Pendiente de documentos', tone: 'warn' },
  2: { label: 'En revisión',             tone: 'info' },
  3: { label: 'Aprobado',                tone: 'ok'   },
  4: { label: 'Suspendido',              tone: 'bad'  },
  5: { label: 'Rechazado',               tone: 'bad'  },
  6: { label: 'Documentos vencidos',     tone: 'bad'  },
};

const LINKS = [
  { to: '/app/conductor/vehiculos',  icon: 'fa-car',          label: 'Mis vehículos',          desc: 'Ver, agregar y activar vehículos' },
  { to: '/app/conductor/documentos', icon: 'fa-id-card',      label: 'Actualizar documentos', desc: 'Subir o verificar documentos de habilitación' },
  { to: '/app/conductor/sos',        icon: 'fa-shield-halved', label: 'SOS / Emergencia',     desc: 'Botón de emergencia en ruta', danger: true },
];

export default function DriverProfile() {
  const { supportEmail } = usePlatformConfig();
  const toast = useToast();
  const [user,    setUser]    = useState<MeProfile | null>(null);
  const [driver,  setDriver]  = useState<DriverProfile | null>(null);
  // Estado de la cuenta (motivo de suspensión/rechazo y solicitud de revisión)
  const [account, setAccount] = useState<DriverAccountInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const [u, d, a] = await Promise.allSettled([
      apiFetch<MeProfile>(`${API.auth}/auth/me`),
      apiFetch<DriverProfile>(`${API.drivers}/drivers/profile/me`),
      apiFetch<DriverAccountInfo>(`${API.drivers}/drivers/me`),
    ]);
    if (u.status === 'fulfilled') setUser(u.value);
    if (d.status === 'fulfilled') setDriver(d.value);
    if (a.status === 'fulfilled') setAccount(a.value);
    if (u.status === 'rejected') setError('No se pudo cargar el perfil.');
    setLoading(false);
  }

  function reloadAccount() {
    apiFetch<DriverAccountInfo>(`${API.drivers}/drivers/me`).then(setAccount).catch(() => { /* se verá al recargar */ });
  }

  async function uploadProfilePhoto(file: File) {
    setError(null); setUploading(true);
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
      toast.success('Foto de perfil actualizada.');
    } catch (err: any) {
      setError(err.message ?? 'Error al subir la foto.');
    } finally {
      setUploading(false);
    }
  }

  if (loading) return <PageLoading />;

  const si = driver ? STATUS[driver.status] : null;

  return (
    <Page title="Mi perfil" subtitle="Tu foto, tus datos y el estado de tu cuenta de conductor." icon="fa-user">
      {error && <Notice tone="bad">{error}</Notice>}

      {account && <DriverAccountStatus driver={account} onChanged={reloadAccount} />}

      {/* Cabecera con foto */}
      <SectionCard>
        <div className="bx-media-row">
          <div className="bx-photo">
            {driver?.profilePhotoUrl
              ? <img src={driversFileUrl(driver.profilePhotoUrl)} alt="Tu foto de perfil" />

              : <i className="fa-solid fa-user" aria-hidden="true" />}
          </div>
          <div className="grow bx-stack-sm">
            <div>
              <div className="fw-bold fs-5 text-break">{user?.fullName ?? '—'}</div>
              <div className="small bx-muted text-break">{user?.email}</div>
            </div>
            {si && <div><StatusBadge tone={si.tone} dot>{si.label}</StatusBadge></div>}
            <p className="small bx-muted mb-0">
              Los pasajeros ven esta foto en su historial. Es distinta de la selfie que te tomas al conectarte.
              Máximo 5 MB · JPG, PNG o WEBP.
            </p>
            <div>
              <label className={`btn btn-bugie ${uploading ? 'disabled' : ''}`} style={{ cursor: 'pointer' }}>
                {uploading
                  ? <><span className="spinner-border spinner-border-sm" aria-hidden="true" />Subiendo…</>
                  : <><i className="fa-solid fa-camera" aria-hidden="true" />{driver?.profilePhotoUrl ? 'Cambiar foto' : 'Subir foto'}</>}
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
      </SectionCard>

      {driver && (
        <StatGrid min={160}>
          <StatCard label="Calificación" value={<>{driver.rating.toFixed(1)} <i className="fa-solid fa-star" style={{ color: '#f59e0b', fontSize: '.8em' }} aria-hidden="true" /></>}
                    icon="fa-star" tone="warn" hint={`${driver.totalRatings} viajes calificados`} to="/app/conductor/calificaciones" />
          <StatCard label="Disponibilidad" value={driver.isOnline ? 'En línea' : 'Desconectado'}
                    icon="fa-signal" tone={driver.isOnline ? 'ok' : 'neutral'} hint="Se cambia desde la app" pulse={driver.isOnline} />
        </StatGrid>
      )}

      <SectionCard title="Información personal" icon="fa-id-card" description={`Para corregirlos contacta a soporte${supportEmail ? ` (${supportEmail})` : ''}.`}>
        <InfoList items={[
          ...identityInfoItems(user),
          { label: 'Correo', value: user?.email ?? '—' },
          { label: 'Teléfono', value: user?.phone ?? '—' },
          { label: 'Miembro desde', value: user ? new Date(user.createdAt).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' }) : '—' },
        ]} />
      </SectionCard>

      {/* Contacto de emergencia (recomendado, no obligatorio) */}
      <EmergencyContactForm />

      <ChangePasswordCard />

      <SectionCard title="Accesos rápidos" icon="fa-bolt" flush>
        <div className="bx-list">
          {LINKS.map(l => (
            <Link key={l.to} className="bx-list-item" to={l.to}>
              <span className={`bx-list-icon ${l.danger ? 'bx-tone-bad' : ''}`} aria-hidden="true"><i className={`fa-solid ${l.icon}`} /></span>
              <span className="bx-list-text">
                <span className="bx-list-title">{l.label}</span>
                <span className="bx-list-sub d-block">{l.desc}</span>
              </span>
              <i className="fa-solid fa-chevron-right chev" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </SectionCard>
    </Page>
  );
}
