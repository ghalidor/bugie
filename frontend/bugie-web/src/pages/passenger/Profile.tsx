import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import EmergencyContactForm from '../../components/EmergencyContactForm';
import ChangePasswordCard from '../../components/ChangePasswordCard';
import { identityInfoItems } from '../../components/IdentityFields';
import { initials } from '../../components/Sidebar';
import { API, apiFetch } from '../../state/api';
import { MeProfile } from '../../state/identity';
import { usePlatformConfig } from '../../hooks/usePlatformConfig';
import { InfoList, Notice, Page, PageLoading, SectionCard } from '../../components/ui';

export default function PassengerProfile() {
  const { supportEmail } = usePlatformConfig();
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    apiFetch<MeProfile>(`${API.auth}/auth/me`)
      .then(setProfile)
      .catch(() => setError('No se pudo cargar el perfil.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageLoading />;

  const since = profile
    ? new Date(profile.createdAt).toLocaleDateString('es-PE', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  return (
    <Page title="Mi perfil" subtitle="Tus datos, tu contacto de emergencia y tu seguridad." icon="fa-user">
      {error && <Notice tone="bad">{error}</Notice>}

      <SectionCard>
        <div className="bx-media-row">
          <span className="bx-avatar" style={{ width: 64, height: 64, fontSize: '1.3rem' }} aria-hidden="true">
            {initials(profile?.fullName)}
          </span>
          <div className="grow">
            <div className="fw-bold fs-5 text-break">{profile?.fullName}</div>
            <div className="bx-muted small text-break">{profile?.email}</div>
            {since && <div className="bx-muted small">Pasajero desde el {since}</div>}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Datos personales" icon="fa-id-card" description="Así te verán los conductores.">
        <div className="bx-stack">
          <InfoList items={[
            ...identityInfoItems(profile),
            { label: 'Teléfono', value: profile?.phone || '—' },
            { label: 'Correo electrónico', value: profile?.email || '—' },
            { label: 'Verificación', value: profile?.isVerified ? 'Cuenta verificada' : 'Pendiente de verificación' },
          ]} />
          <p className="small bx-muted mb-0">
            <i className="fa-solid fa-circle-info me-1" aria-hidden="true" />
            Para corregirlos contacta a soporte{supportEmail ? ` (${supportEmail})` : ''}.
          </p>
        </div>
      </SectionCard>

      <EmergencyContactForm />

      <ChangePasswordCard />

      <SectionCard title="Accesos rápidos" icon="fa-bolt" flush>
        <div className="bx-list">
          <Link className="bx-list-item" to="/app/pasajero/verificacion">
            <span className="bx-list-icon" aria-hidden="true"><i className="fa-solid fa-id-card" /></span>
            <span className="bx-list-text">
              <span className="bx-list-title">Verificación de identidad</span>
              <span className="bx-list-sub d-block">Sube o revisa tu DNI y tu foto de perfil</span>
            </span>
            <i className="fa-solid fa-chevron-right chev" aria-hidden="true" />
          </Link>
          <Link className="bx-list-item" to="/app/pasajero/sos">
            <span className="bx-list-icon bx-tone-bad" aria-hidden="true"><i className="fa-solid fa-shield-halved" /></span>
            <span className="bx-list-text">
              <span className="bx-list-title">SOS / Emergencia</span>
              <span className="bx-list-sub d-block">Cómo funciona el botón de emergencia en ruta</span>
            </span>
            <i className="fa-solid fa-chevron-right chev" aria-hidden="true" />
          </Link>
        </div>
      </SectionCard>
    </Page>
  );
}
