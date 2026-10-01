import { useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { API, apiFetch } from '../state/api';

interface DriverProfile {
  id: string;
  userId: string;
  status: number;   // 1=PendingDocs, 2=UnderReview, 3=Approved, 4=Suspended, 5=Rejected, 6=ExpiredDocs
}

interface CheckExpiredResult {
  hasExpired: boolean;
  newStatus:  number;
  expiredDocTypes: string[];
}

const DOC_LABELS: Record<string, string> = {
  license:          'Licencia de conducir',
  soat:             'SOAT',
  revision_tecnica: 'Revisión técnica',
};

const STATUS_MESSAGES: Record<number, { title: string; message: string; icon: string; color: string }> = {
  1: { title: 'Sube tus documentos',          message: 'Aún no has subido los documentos necesarios para verificar tu cuenta. Hazlo desde la sección Documentos.', icon: 'fa-id-card', color: '#f59e0b' },
  2: { title: 'Tus documentos están en revisión', message: 'Nuestro equipo está revisando los documentos que subiste. En 24 a 48 horas te avisaremos por correo cuando tu cuenta esté lista.', icon: 'fa-clock', color: '#38bdf8' },
  4: { title: 'Cuenta suspendida',             message: 'Tu cuenta está suspendida. Contáctanos para más información.', icon: 'fa-ban', color: '#ef4444' },
  5: { title: 'Cuenta rechazada',              message: 'Tu cuenta fue rechazada. Sube nuevamente tus documentos para que el equipo los revise.', icon: 'fa-circle-xmark', color: '#ef4444' },
  6: { title: 'Documentos vencidos',           message: 'Algunos de tus documentos vencieron. Sube los nuevos desde Documentos y espera la aprobación del equipo.', icon: 'fa-calendar-xmark', color: '#f59e0b' },
};

/**
 * Bloquea acceso a rutas que requieren que el conductor esté aprobado.
 * Antes de verificar el estado, llama a /check-expiration para que el
 * backend marque docs vencidos si los hay.
 */
export default function RequireApprovedDriver() {
  const [profile,    setProfile]    = useState<DriverProfile | null>(null);
  const [expiredDocs, setExpiredDocs] = useState<string[]>([]);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        // 1. Disparar verificación de caducidad (puede cambiar el status)
        const check = await apiFetch<CheckExpiredResult>(
          `${API.drivers}/drivers/me/check-expiration`,
          { method: 'POST' }
        ).catch(() => null);

        if (check?.hasExpired) {
          setExpiredDocs(check.expiredDocTypes ?? []);
        }

        // 2. Obtener perfil (con el status ya actualizado si hubo caducados)
        const p = await apiFetch<DriverProfile>(`${API.drivers}/drivers/me`);
        if (!cancelled) setProfile(p);
      } catch {
        if (!cancelled) setProfile(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="d-flex justify-content-center py-5">
        <span className="spinner-border" />
      </div>
    );
  }

  if (!profile || profile.status !== 3) {
    const status  = profile?.status ?? 1;
    const message = STATUS_MESSAGES[status] ?? STATUS_MESSAGES[1];

    return (
      <div className="container py-4">
        <div className="bugie-card p-4 text-center" style={{ maxWidth: 540, margin: '0 auto' }}>
          <div
            className="d-inline-flex align-items-center justify-content-center mb-3"
            style={{
              width: 64, height: 64, borderRadius: '50%',
              background: message.color + '22', color: message.color,
            }}
          >
            <i className={`fa-solid ${message.icon} fa-2x`} />
          </div>
          <h3 className="bugie-h4 mb-2">{message.title}</h3>
          <p className="bugie-muted mb-3">{message.message}</p>

          {/* Si hay docs vencidos, listarlos */}
          {status === 6 && expiredDocs.length > 0 && (
            <div className="alert alert-warning text-start mb-4" style={{ maxWidth: 400, margin: '0 auto 1rem' }}>
              <div className="fw-bold mb-2">
                <i className="fa-solid fa-triangle-exclamation me-2" />
                Documentos vencidos:
              </div>
              <ul className="mb-0 ps-3">
                {expiredDocs.map(d => (
                  <li key={d}>{DOC_LABELS[d] ?? d}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="d-flex gap-2 justify-content-center flex-wrap">
            <Link className="btn btn-bugie text-white" to="/app/conductor/documentos">
              <i className="fa-solid fa-id-card me-2" />Mis documentos
            </Link>
            <Link className="btn btn-bugie-outline" to="/app/conductor/inicio">
              <i className="fa-solid fa-house me-2" />Ir al inicio
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <Outlet />;
}