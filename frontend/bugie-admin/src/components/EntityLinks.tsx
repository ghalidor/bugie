import { ReactNode, useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { API, apiFetch } from '../state/api';
import { PERMS, usePermissions } from '../state/permissions';
import { EmptyState, Skeleton } from './ui';

/// Enlaces entre entidades del panel (pasajero, conductor). Si el admin no
/// tiene permiso para la ficha, se muestra solo el texto (sin enlace).
///
/// Los viajes guardan el UserId del conductor, pero la ficha del conductor usa
/// el Id de su perfil: por eso el enlace va a /admin/conductores/usuario/{userId},
/// que busca el perfil y redirige a la ficha.

export const passengerPath = (userId: string) => `/admin/pasajeros/${userId}`;
export const driverByUserPath = (userId: string) => `/admin/conductores/usuario/${userId}`;

interface LinkProps {
  userId?: string | null;
  children: ReactNode;
  className?: string;
  /// Se llama al hacer clic (p. ej. para cerrar el modal que contiene el enlace).
  onNavigate?: () => void;
}

function EntityLink({ to, perm, children, className, onNavigate, title }:
  { to: string | null; perm: string; children: ReactNode; className?: string; onNavigate?: () => void; title: string }) {
  const { has } = usePermissions();
  if (!to || !has(perm)) return <span className={className}>{children}</span>;
  return (
    <Link to={to} className={`bx-entity-link ${className ?? ''}`} title={title}
          onClick={e => { e.stopPropagation(); onNavigate?.(); }}>
      {children}
    </Link>
  );
}

export function PassengerLink({ userId, children, className, onNavigate }: LinkProps) {
  return (
    <EntityLink to={userId ? passengerPath(userId) : null} perm={PERMS.ViewPassengers}
                className={className} onNavigate={onNavigate} title="Ver ficha del pasajero">
      {children}
    </EntityLink>
  );
}

/// userId = UserId del conductor (el que guardan viajes, pagos y SOS).
export function DriverLink({ userId, children, className, onNavigate }: LinkProps) {
  return (
    <EntityLink to={userId ? driverByUserPath(userId) : null} perm={PERMS.ViewDrivers}
                className={className} onNavigate={onNavigate} title="Ver ficha del conductor">
      {children}
    </EntityLink>
  );
}

/// Ruta /admin/conductores/usuario/:userId → busca el perfil del conductor y
/// redirige a su ficha (/admin/conductores/{driverId}).
export function DriverByUserRedirect() {
  const { userId } = useParams<{ userId: string }>();
  const [driverId, setDriverId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!userId) { setFailed(true); return; }
    let cancelled = false;
    apiFetch<{ id: string }>(`${API.drivers}/drivers/by-user/${userId}/status`)
      .then(d => { if (!cancelled) setDriverId(d.id); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [userId]);

  if (driverId) return <Navigate to={`/admin/conductores/${driverId}`} replace />;
  if (failed) {
    return (
      <EmptyState
        variant="error"
        icon="fa-id-badge"
        title="No encontramos al conductor"
        text="Puede que la cuenta ya no tenga perfil de conductor."
        action={<Link to="/admin/conductores" className="btn btn-sm btn-outline-secondary">Ir a Conductores</Link>}
      />
    );
  }
  return <Skeleton height={220} radius={14} />;
}
