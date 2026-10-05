import { useEffect, useState } from 'react';
import { API, ApiError, apiFetch } from '../../../state/api';
import { fmtPeru } from '../../../state/adminInbox';
import { EmptyState, Pagination, SectionCard, Skeleton, StatusBadge, Tone } from '../../../components/ui';
import '../../../components/inbox.scss';

/* ──────────────────────────────────────────────────────────────────────────
   Pestaña "Notificaciones" del detalle de pasajero y de conductor (soporte):
   la bandeja del usuario tal como la ve en la app. Solo lectura.
   GET /api/trips/admin/users/{userId}/notifications
   ────────────────────────────────────────────────────────────────────────── */

interface UserNotification {
  id: string;
  title: string;
  body: string;
  type: string | null;
  alertType: string | null;
  route: string | null;
  data: Record<string, string> | null;
  createdAt: string;
  readAt: string | null;
  read: boolean;
}

interface UserNotificationPage {
  items: UserNotification[];
  total: number;
  page: number;
  pageSize: number;
  unread: number;
}

interface Kind { label: string; icon: string; tone: Tone }

/* Mismo criterio que los banners de la app (in_app_alert_service.dart):
   primero avisos de cuenta, luego data.type, luego alert_type y por último
   la ruta. */
const K = {
  trip:      { label: 'Viaje',       icon: 'fa-car',              tone: 'info' },
  proposal:  { label: 'Propuesta',   icon: 'fa-hand-holding-dollar', tone: 'warn' },
  accepted:  { label: 'Aceptado',    icon: 'fa-circle-check',     tone: 'ok' },
  arrived:   { label: 'Llegó',       icon: 'fa-location-dot',     tone: 'ok' },
  cancelled: { label: 'Cancelado',   icon: 'fa-circle-xmark',     tone: 'neutral' },
  delivery:  { label: 'Envío',       icon: 'fa-box',              tone: 'primary' },
  deviation: { label: 'Desvío',      icon: 'fa-route',            tone: 'bad' },
  scheduled: { label: 'Programado',  icon: 'fa-calendar-check',   tone: 'info' },
  sos:       { label: 'SOS',         icon: 'fa-triangle-exclamation', tone: 'bad' },
  points:    { label: 'Puntos',      icon: 'fa-star',             tone: 'warn' },
  payout:    { label: 'Pago',        icon: 'fa-money-bill-wave',  tone: 'ok' },
  accountOk: { label: 'Cuenta',      icon: 'fa-user-check',       tone: 'ok' },
  accountBad:{ label: 'Cuenta',      icon: 'fa-user-xmark',       tone: 'bad' },
  accountWarn:{ label: 'Cuenta',     icon: 'fa-id-card',          tone: 'warn' },
} satisfies Record<string, Kind>;

function kindOf(n: Pick<UserNotification, 'type' | 'alertType' | 'route'>): Kind {
  const type = (n.type ?? '').toLowerCase();
  const alert = (n.alertType ?? '').toLowerCase();
  const route = (n.route ?? '').toLowerCase();

  if (type === 'account') {
    switch (alert) {
      case 'driver_approved':
      case 'driver_reactivated': return K.accountOk;
      case 'driver_rejected':
      case 'document_rejected':
      case 'driver_suspended':   return K.accountBad;
      case 'document_expiring':
      case 'review_kept':        return K.accountWarn;
    }
    return K.accountWarn;
  }
  switch (type) {
    case 'route_deviation':  return K.deviation;
    case 'points_expiring':
    case 'points_expired':   return K.points;
    case 'payout':           return K.payout;
    case 'trip_cancelled':
    case 'trip_republished': return K.cancelled;
  }
  if (type.includes('scheduled') || alert.includes('scheduled') || route.includes('scheduled')) return K.scheduled;
  switch (alert) {
    case 'trip':     return K.trip;
    case 'proposal': return K.proposal;
    case 'accepted': return K.accepted;
    case 'sos':      return K.sos;
    case 'arrived':  return K.arrived;
    case 'delivery': return K.delivery;
  }
  if (route.includes('sos')) return K.sos;
  if (route.includes('proposal')) return K.proposal;
  if (route.includes('rewards')) return K.points;
  if (route.includes('trip-in-progress') || route.includes('trip-active')) return K.accepted;
  return K.trip;
}

const PAGE_SIZE = 20;

export default function UserNotifications({ userId, who }: { userId: string; who: 'pasajero' | 'conductor' }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<UserNotificationPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    apiFetch<UserNotificationPage>(`${API.trips}/trips/admin/users/${userId}/notifications?page=${page}&pageSize=${PAGE_SIZE}`)
      .then(r => { if (alive) setData(r); })
      .catch(e => { if (alive) setError(e instanceof ApiError ? e.message : 'No se pudieron cargar las notificaciones.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [userId, page, retry]);

  return (
    <SectionCard
      title="Notificaciones"
      icon="fa-bell"
      description={`Lo que el ${who} ve en la bandeja de la app. Solo lectura: no se marca nada como leído.`}
      tourId="user-notifications"
      flush
      actions={data && !error && (
        <div className="d-flex gap-2 flex-wrap">
          <StatusBadge tone="neutral">{data.total.toLocaleString('es-PE')} en total</StatusBadge>
          <StatusBadge tone={data.unread > 0 ? 'primary' : 'ok'}>{data.unread > 0 ? `${data.unread.toLocaleString('es-PE')} sin leer` : 'Todo leído'}</StatusBadge>
        </div>
      )}
    >
      {loading && !data ? (
        <div className="p-3"><Skeleton count={4} height={56} radius={10} /></div>
      ) : error ? (
        <EmptyState compact variant="error" title="No se pudieron cargar las notificaciones" text={error}
          action={<button type="button" className="btn btn-sm btn-bugie" onClick={() => setRetry(r => r + 1)}>Reintentar</button>} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState compact icon="fa-bell-slash" title="Sin notificaciones" text={`Este ${who} todavía no recibió notificaciones.`} />
      ) : (
        <>
          <ul className="bx-unotif" aria-busy={loading}>
            {data.items.map(n => {
              const k = kindOf(n);
              return (
                <li key={n.id} className={`bx-unotif-item bx-tone-${k.tone} ${n.read ? '' : 'is-unread'}`}>
                  <span className="bx-unotif-icon" aria-hidden="true"><i className={`fa-solid ${k.icon}`} /></span>
                  <div className="bx-unotif-text">
                    <div className="bx-unotif-head">
                      <span className="bx-unotif-title">{n.title || k.label}</span>
                      <span className="bx-unotif-date">{fmtPeru(n.createdAt)}</span>
                    </div>
                    {n.body && <p className="bx-unotif-body">{n.body}</p>}
                    <div className="bx-unotif-meta">
                      <StatusBadge tone={k.tone} size="sm">{k.label}</StatusBadge>
                      {n.read
                        ? <span className="bugie-muted"><i className="fa-solid fa-check-double me-1" aria-hidden="true" />Leída el {fmtPeru(n.readAt)}</span>
                        : <span className="fw-semibold" style={{ color: 'var(--bugie-primary-soft)' }}><i className="fa-solid fa-circle me-1" style={{ fontSize: '.5rem' }} aria-hidden="true" />Sin leer</span>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {data.total > PAGE_SIZE && (
            <div className="px-3">
              <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}
