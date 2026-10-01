import { useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { API, apiFetch } from '../state/api';

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

  useEffect(() => {
    apiFetch<UserStatus>(`${API.auth}/auth/users/me/status`)
      .then(setStatus)
      .catch(() => setStatus({ isActive: false, isVerified: false }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="d-flex justify-content-center py-5">
        <span className="spinner-border" />
      </div>
    );
  }

  if (!status?.isVerified) {
    return (
      <div className="container py-4">
        <div className="bugie-card p-4 text-center" style={{ maxWidth: 520, margin: '0 auto' }}>
          <div
            className="d-inline-flex align-items-center justify-content-center mb-3"
            style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'rgba(245,158,11,0.2)', color: '#f59e0b',
            }}
          >
            <i className="fa-solid fa-shield-halved fa-2x" />
          </div>
          <h3 className="bugie-h4 mb-2">Tu cuenta aún no está verificada</h3>
          <p className="bugie-muted mb-4">
            Para solicitar viajes necesitamos verificar tu identidad.
            Sube tu DNI y nuestro equipo lo revisará en 24 a 48 horas.
          </p>
          <Link className="btn btn-bugie text-white" to="/app/pasajero/verificacion">
            <i className="fa-solid fa-id-card me-2" />Completar verificación
          </Link>
        </div>
      </div>
    );
  }

  return <Outlet />;
}