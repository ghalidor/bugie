import { useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { API, apiFetch } from '../state/api';
import { EmptyState, Page, PageLoading, SectionCard } from '../components/ui';

interface UserStatus {
  isActive:   boolean;
  isVerified: boolean;
}

/**
 * Componente que envuelve rutas que requieren verificación.
 * Si el usuario no está verificado, muestra un mensaje y redirige a /app/pasajero/verificacion.
 * Si sí lo está, renderiza el contenido normal.
 */
export default function RequireVerified() {
  const [status,  setStatus]  = useState<UserStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed,  setFailed]  = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setLoading(true); setFailed(false);
    apiFetch<UserStatus>(`${API.auth}/auth/users/me/status`)
      .then(setStatus)
      // Sin conexión no sabemos si está verificado: no decirle que no lo está.
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [attempt]);

  if (loading) return <PageLoading />;

  if (failed) {
    return (
      <Page title="Sin conexión" subtitle="No pudimos comprobar tu verificación." icon="fa-wifi">
        <SectionCard>
          <EmptyState
            icon="fa-plug-circle-exclamation"
            title="No pudimos conectar con Bugie"
            text="Revisa tu conexión a internet e inténtalo de nuevo."
            action={
              <button className="btn btn-bugie" onClick={() => setAttempt(a => a + 1)}>
                <i className="fa-solid fa-rotate-right" aria-hidden="true" />Reintentar
              </button>
            }
          />
        </SectionCard>
      </Page>
    );
  }

  if (!status?.isVerified) {
    return (
      <Page title="Verifica tu cuenta" subtitle="Es un paso único para cuidar a todos en Bugie." icon="fa-shield-halved">
        <SectionCard>
          <EmptyState
            icon="fa-id-card"
            title="Tu cuenta aún no está verificada"
            text="Para pedir viajes necesitamos verificar tu identidad. Sube tu DNI y tu foto de perfil, y nuestro equipo los revisará en 24 a 48 horas."
            action={
              <Link className="btn btn-bugie" to="/app/pasajero/verificacion">
                <i className="fa-solid fa-id-card" aria-hidden="true" />Completar verificación
              </Link>
            }
          />
        </SectionCard>
      </Page>
    );
  }

  return <Outlet />;
}