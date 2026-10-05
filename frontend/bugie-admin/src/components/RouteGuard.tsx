import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { usePermissions } from '../state/permissions';
import { findNavItem } from './navConfig';
import { EmptyState, Skeleton } from './ui';

/// Protege las rutas del panel con el permiso de su entrada del menú
/// (navConfig.ts). Así cada ruta usa el mismo permiso que su ítem:
/// /admin/conductores/123 exige el de "Conductores", /admin/avisos el de
/// "Avisos", etc. Si la ruta no está en el menú, no se restringe aquí.
export default function RouteGuard({ children }: { children: ReactNode }) {
  const { has, loading } = usePermissions();
  const { pathname } = useLocation();
  const match = findNavItem(pathname);

  // Sin ruta en el menú o sin permiso especial ('' = cualquier admin).
  if (!match || !match.item.permission) return <>{children}</>;
  if (loading) return <Skeleton height={220} radius={14} />;
  if (has(match.item.permission)) return <>{children}</>;

  return (
    <EmptyState
      icon="fa-lock"
      title="No tienes acceso a esta sección"
      text={`Pide a un administrador que agregue el permiso de "${match.item.label}" a tu rol.`}
      action={<Link to="/admin/dashboard" className="btn btn-sm btn-outline-secondary">Ir al inicio</Link>}
    />
  );
}
