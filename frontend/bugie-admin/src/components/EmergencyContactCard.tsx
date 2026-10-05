import { useEffect, useState } from 'react';
import { API, apiFetch } from '../state/api';
import { SectionCard } from './ui';

/// Contacto de emergencia de un usuario (pasajero o conductor).
/// GET /api/auth/admin/users/{userId}/emergency-contact → contacto o null.
interface EmergencyContact {
  fullName: string;
  phone: string;
  relationship: string;
  email: string | null;
  updatedAt: string;
}

/// Tarjeta con el contacto de emergencia del usuario. Muestra
/// "Sin contacto registrado" si no tiene, y un botón para llamar (tel:).
/// `compact` quita el borde de tarjeta (útil dentro de otro panel, ej. SOS).
export default function EmergencyContactCard({ userId, compact = false }: { userId: string; compact?: boolean }) {
  const [contact, setContact] = useState<EmergencyContact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null); setContact(null);
    apiFetch<EmergencyContact | null>(`${API.auth}/auth/admin/users/${userId}/emergency-contact`)
      .then(c => { if (!cancelled) setContact(c ?? null); })
      .catch(() => { if (!cancelled) setError('No se pudo cargar el contacto de emergencia.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  const body = (
    <>
      {compact && (
        <h6 className="fw-bold mb-2 d-flex align-items-center">
          <i className="fa-solid fa-user-shield me-2" style={{ color: 'var(--bugie-bad)' }} aria-hidden="true" />
          Contacto de emergencia
        </h6>
      )}

      {loading ? (
        <div className="small bugie-muted"><span className="spinner-border spinner-border-sm me-2" />Cargando...</div>
      ) : error ? (
        <div className="small text-danger">{error}</div>
      ) : !contact ? (
        <div className="small bugie-muted">
          <i className="fa-solid fa-circle-info me-1" />Sin contacto registrado
        </div>
      ) : (
        <div className="d-flex align-items-center justify-content-between gap-3 flex-wrap">
          <div style={{ minWidth: 0 }}>
            <div className="fw-bold">{contact.fullName}</div>
            <div className="small bugie-muted">{contact.relationship}</div>
            <div className="small"><i className="fa-solid fa-phone me-1" />{contact.phone}</div>
            {contact.email && (
              <div className="small text-truncate"><i className="fa-solid fa-envelope me-1" />{contact.email}</div>
            )}
          </div>
          <a href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}
             className="btn btn-sm btn-success rounded-pill">
            <i className="fa-solid fa-phone me-1" />Llamar
          </a>
        </div>
      )}
    </>
  );

  return compact
    ? <div>{body}</div>
    : <SectionCard title="Contacto de emergencia" icon="fa-user-shield" description="A quién llamar si el usuario activa un SOS.">{body}</SectionCard>;
}
