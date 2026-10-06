import { useNavigate } from 'react-router-dom';
import { useTripsHub, UserNotificationEvent } from '../hooks/useTripsHub';
import { getRole } from '../state/session';
import { useToast } from './ui';

/**
 * Traduce la ruta que manda el backend en una notificación (pensada para la
 * app móvil) a la ruta equivalente de la web. null = no hay pantalla
 * equivalente (el conductor en la web solo consulta): el aviso no navega.
 */
export function webRouteFor(appRoute: string | undefined, role: string | null): string | null {
  if (!appRoute) return null;
  const [path, query = ''] = appRoute.split('?');
  const qs = query ? `?${query}` : '';

  if (path === '/passenger/tracking') return role === 'passenger' ? `/app/pasajero/seguimiento` : null;
  if (path === '/rewards' || path === '/passenger/rewards' || path === '/driver/rewards') {
    if (role === 'passenger') return `/app/pasajero/puntos${qs}`;
    if (role === 'driver')    return `/app/conductor/puntos${qs}`;
    return null;
  }
  if (path === '/driver/earnings') return role === 'driver' ? '/app/conductor/ganancias' : null;
  return null;
}

/// alert_type (data de la notificación) que se muestran como advertencia.
const WARN_TYPES = new Set(['trip_cancelled', 'route_deviation', 'scheduled_no_driver', 'driver_no_confirm', 'confirm_expired']);

/**
 * Avisos en tiempo real para toda el área con sesión (pasajero y conductor):
 * cada push FCM al usuario llega también por el hub como "UserNotification"
 * y se muestra como toast. Al hacer clic se va a la pantalla relacionada
 * si existe en la web. La web no tiene bandeja de notificaciones, así que
 * no hay nada más que refrescar aquí; las pantallas abiertas (Tracking)
 * recargan por su cuenta.
 */
export default function RealtimeNotices() {
  const navigate = useNavigate();
  const toast = useToast();

  useTripsHub({
    onUserNotification(n: UserNotificationEvent) {
      if (!n.title && !n.body) return;
      const route = webRouteFor(n.data.route, getRole());
      toast.show({
        tone: WARN_TYPES.has(n.data.alert_type) ? 'warning' : 'info',
        title: n.title || undefined,
        message: n.body || n.title,
        duration: 7000,
        onClick: route ? () => navigate(route) : undefined,
      });
    },
  });

  return null;
}
