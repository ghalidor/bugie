import { Navigate, Outlet } from 'react-router-dom';
import { getToken, getRole, UserRole } from '../state/session';

export default function RequireRole({ allowed }: { allowed: UserRole[] }) {
  const token = getToken();
  const role  = getRole();

  if (!token || !role) return <Navigate to="/auth/login" replace />;

  if (!allowed.includes(role)) {
    if (role === 'passenger') return <Navigate to="/app/pasajero/inicio" replace />;
    if (role === 'driver')    return <Navigate to="/app/conductor/inicio" replace />;
    if (role === 'admin')     return <Navigate to="/auth/login" replace />;
    return <Navigate to="/auth/login" replace />;
  }

  return <Outlet />;
}
