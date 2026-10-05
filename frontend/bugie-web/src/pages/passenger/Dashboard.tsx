import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { API, apiFetch } from '../../state/api';
import { getUser } from '../../state/session';
import { CountUp, EmptyState, Notice, Page, SectionCard, Skeleton, StatCard, StatGrid, StatusBadge } from '../../components/ui';
import { fmtDateTime, money, tripStatus } from '../../components/tripFormat';

interface ActiveTrip {
  id: string; originAddress: string; destAddress: string;
  estimatedFare: number; status: number; driverId: string | null;
}
interface TripHistory { id: string; status: number; finalFare: number | null; estimatedFare: number; createdAt: string; }

const STATUS_MSG: Record<number, string> = {
  1: 'Buscando conductor…', 2: 'Conductor en camino',
  3: 'Viaje en curso', 4: 'Completado', 5: 'Cancelado', 6: 'SOS activo',
};

const QUICK = [
  { to: '/app/pasajero/solicitar',   icon: 'fa-route',             label: 'Pedir viaje o envío', desc: 'Un conductor verificado te lleva', requiresVerified: true },
  { to: '/app/pasajero/seguimiento', icon: 'fa-location-dot',      label: 'Seguimiento',         desc: 'Tu viaje o envío en curso' },
  { to: '/app/pasajero/viajes',      icon: 'fa-clock-rotate-left', label: 'Mis viajes',          desc: 'Historial, detalle y fotos' },
  { to: '/app/pasajero/pagos',       icon: 'fa-credit-card',       label: 'Mis pagos',           desc: 'Historial de transacciones' },
  { to: '/app/pasajero/puntos',      icon: 'fa-star',              label: 'Mis puntos',          desc: 'Saldo, canjes y cupones' },
  { to: '/app/pasajero/sos',         icon: 'fa-shield-halved',     label: 'SOS / Emergencia',    desc: 'Alerta al centro de monitoreo', danger: true },
];

export default function PassengerDashboard() {
  const user = getUser();
  const [activeTrip, setActiveTrip] = useState<ActiveTrip | null>(null);
  const [history,    setHistory]    = useState<TripHistory[]>([]);
  /// Estado de verificación: si isVerified=false, NO puede solicitar viajes
  /// (el backend también lo rechaza, pero acá lo bloqueamos para mejor UX).
  const [isVerified, setIsVerified] = useState<boolean | null>(null);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    Promise.allSettled([
      apiFetch<ActiveTrip | null>(`${API.trips}/trips/active`),
      apiFetch<TripHistory[]>(`${API.trips}/trips/history`),
      apiFetch<{ isVerified: boolean }>(`${API.auth}/auth/users/me/status`),
    ]).then(([active, hist, status]) => {
      if (active.status === 'fulfilled') setActiveTrip(active.value);
      if (hist.status   === 'fulfilled') setHistory(hist.value ?? []);
      // Si la consulta de verificación falla, asumimos NO verificado (más seguro).
      setIsVerified(status.status === 'fulfilled' ? !!status.value?.isVerified : false);
    }).finally(() => setLoading(false));
  }, []);

  const completed  = history.filter(t => t.status === 4);
  const totalGasto = completed.reduce((s, t) => s + (t.finalFare ?? t.estimatedFare), 0);

  return (
    <Page
      title={`Hola, ${user?.fullName?.split(' ')[0] ?? 'pasajero'}`}
      subtitle="Tu centro de movilidad segura: pide, sigue y revisa tus viajes."
      icon="fa-house"
      actions={[{
        label: 'Pedir viaje o envío', icon: 'fa-route', variant: 'primary',
        to: '/app/pasajero/solicitar',
        disabled: !isVerified,
        title: isVerified ? undefined : 'Verifica tu cuenta primero',
      }]}
    >
      {/* Sin verificación no puede solicitar (el backend también lo rechaza). */}
      {!loading && isVerified === false && (
        <Notice
          tone="warn"
          title="Tu cuenta aún no está verificada"
          action={<Link className="btn btn-sm btn-bugie" to="/app/pasajero/verificacion">Verificar ahora</Link>}
        >
          Sube tu DNI (frontal y reverso) y espera la aprobación. Sin esa verificación no puedes pedir viajes.
        </Notice>
      )}

      {!loading && activeTrip && (
        <Notice
          tone="info"
          icon="fa-car"
          title={STATUS_MSG[activeTrip.status] ?? 'Viaje activo'}
          action={<Link className="btn btn-sm btn-bugie" to="/app/pasajero/seguimiento">Ver seguimiento</Link>}
        >
          {activeTrip.originAddress} → {activeTrip.destAddress}
        </Notice>
      )}

      <StatGrid min={180}>
        <StatCard label="Viajes realizados" value={<CountUp value={completed.length} />} icon="fa-route" loading={loading} />
        <StatCard label="Total gastado" value={<CountUp value={totalGasto} format={money} decimals={2} />} icon="fa-wallet" tone="info" loading={loading} />
        <StatCard
          label="Viaje activo"
          value={activeTrip ? 'Sí' : 'No'}
          icon="fa-location-dot"
          tone={activeTrip ? 'ok' : 'neutral'}
          hint={activeTrip ? 'Toca para ver el seguimiento' : 'No tienes viajes en curso'}
          pulse={!!activeTrip}
          loading={loading}
          to={activeTrip ? '/app/pasajero/seguimiento' : undefined}
        />
      </StatGrid>

      <div className="bx-split">
        <SectionCard title="Acciones rápidas" icon="fa-bolt" flush>
          <div className="bx-list">
            {QUICK.map(item => {
              // "Pedir viaje" se deshabilita si el pasajero no está verificado.
              const disabled = item.requiresVerified && !isVerified;
              const body = (
                <>
                  <span className={`bx-list-icon ${item.danger ? 'bx-tone-bad' : ''}`} aria-hidden="true">
                    <i className={`fa-solid ${item.icon}`} />
                  </span>
                  <span className="bx-list-text">
                    <span className="bx-list-title">{item.label}</span>
                    <span className="bx-list-sub d-block">
                      {disabled ? 'Verifica tu cuenta para usar esta opción' : item.desc}
                    </span>
                  </span>
                  <i className="fa-solid fa-chevron-right chev" aria-hidden="true" />
                </>
              );
              return disabled
                ? <div key={item.to} className="bx-list-item is-disabled" aria-disabled="true">{body}</div>
                : <Link key={item.to} to={item.to} className="bx-list-item">{body}</Link>;
            })}
          </div>
        </SectionCard>

        <SectionCard
          title="Últimos viajes"
          icon="fa-clock-rotate-left"
          flush
          actions={history.length > 0 && (
            <Link className="btn btn-sm btn-bugie-outline" to="/app/pasajero/viajes">
              Ver todos <i className="fa-solid fa-arrow-right" aria-hidden="true" />
            </Link>
          )}
        >
          {loading ? (
            <div className="p-3"><Skeleton height={44} count={4} /></div>
          ) : history.length === 0 ? (
            <EmptyState
              compact
              icon="fa-route"
              title="Todavía no tienes viajes"
              text="Cuando pidas tu primer viaje o envío aparecerá aquí."
            />
          ) : (
            <div className="bx-list">
              {history.slice(0, 5).map(t => {
                const st = tripStatus(t.status);
                return (
                  <div key={t.id} className="bx-list-item">
                    <span className={`bx-list-icon bx-tone-${st.tone}`} aria-hidden="true">
                      <i className={`fa-solid ${st.icon}`} />
                    </span>
                    <span className="bx-list-text">
                      <StatusBadge tone={st.tone} size="sm">{st.label}</StatusBadge>
                      <span className="bx-list-sub d-block mt-1">{fmtDateTime(t.createdAt)}</span>
                    </span>
                    <span className="bx-list-end">
                      <span className={`amount ${t.status === 4 ? '' : 'bx-muted'}`}>{money(t.finalFare ?? t.estimatedFare)}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>
    </Page>
  );
}
