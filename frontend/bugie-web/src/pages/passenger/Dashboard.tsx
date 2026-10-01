import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import { API, apiFetch } from '../../state/api';
import { getUser } from '../../state/session';

interface ActiveTrip {
  id: string; originAddress: string; destAddress: string;
  estimatedFare: number; status: number; driverId: string | null;
}
interface TripHistory { id: string; status: number; finalFare: number | null; estimatedFare: number; createdAt: string; }

const STATUS_MSG: Record<number, string> = {
  1: 'Buscando conductor…', 2: 'Conductor en camino',
  3: 'Viaje en curso', 4: 'Completado', 5: 'Cancelado', 6: 'SOS activo',
};

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

  const completed = history.filter(t => t.status === 4);
  const totalGasto = completed.reduce((s, t) => s + (t.finalFare ?? t.estimatedFare), 0);

  return (
    <>
      <PageHeader
        title={`Hola, ${user?.fullName?.split(' ')[0] ?? 'pasajero'}`}
        subtitle="Tu centro de movilidad segura."
        icon="fa-solid fa-user"
        actions={
          isVerified
            ? <Link className="btn btn-light rounded-pill fw-bold" to="/app/pasajero/solicitar">Solicitar viaje</Link>
            : <button className="btn btn-light rounded-pill fw-bold" disabled title="Verifica tu cuenta primero">Solicitar viaje</button>
        }
      />

      {/* Warning si no está verificado. Bloquea visualmente el acceso a
          /pasajero/solicitar — y el backend también lo rechaza. */}
      {!loading && isVerified === false && (
        <div className="alert alert-warning d-flex align-items-center gap-3 mb-3">
          <i className="fa-solid fa-triangle-exclamation fa-lg" />
          <div className="flex-grow-1">
            <div className="fw-bold">Tu cuenta aún no está verificada</div>
            <div className="small">
              Sube tu DNI (frontal y reverso) desde tu perfil y espera la aprobación
              del administrador. Sin esa verificación no puedes solicitar viajes.
            </div>
          </div>
          <Link className="btn btn-warning btn-sm rounded-pill" to="/app/pasajero/verificacion">
            Verificar ahora
          </Link>
        </div>
      )}

      {/* Viaje activo */}
      {!loading && activeTrip && (
        <div className="alert alert-info d-flex align-items-center gap-3 mb-3">
          <i className="fa-solid fa-car fa-lg" />
          <div className="flex-grow-1">
            <div className="fw-bold">{STATUS_MSG[activeTrip.status] ?? 'Viaje activo'}</div>
            <div className="small">{activeTrip.originAddress} → {activeTrip.destAddress}</div>
          </div>
          <Link className="btn btn-sm btn-primary rounded-pill" to="/app/pasajero/seguimiento">Ver</Link>
        </div>
      )}

      {/* KPIs */}
      <div className="row g-3 mb-3">
        {[
          ['Viajes realizados', loading ? '…' : String(completed.length)],
          ['Total gastado',     loading ? '…' : `S/ ${totalGasto.toFixed(2)}`],
          ['Viaje activo',      loading ? '…' : (activeTrip ? 'Sí' : 'No')],
        ].map(([label, value]) => (
          <div className="col-md-4" key={label}>
            <div className="bugie-kpi">
              <div className="label">{label}</div>
              <div className="value">{value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Acciones rápidas */}
      <div className="bugie-card mb-3">
        <div className="bugie-card-header">Acciones rápidas</div>
        <div className="bugie-card-body d-grid gap-2">
          {[
            { to: '/app/pasajero/solicitar',   icon: 'fa-car',              label: 'Solicitar viaje',    desc: 'Pedir un conductor verificado ahora',
              requiresVerified: true },
            { to: '/app/pasajero/seguimiento', icon: 'fa-location-dot',     label: 'Ver seguimiento',    desc: 'Tracking de tu viaje activo'            },
            { to: '/app/pasajero/viajes',      icon: 'fa-clock-rotate-left',label: 'Historial',          desc: 'Todos tus viajes anteriores'            },
            { to: '/app/pasajero/pagos',       icon: 'fa-credit-card',      label: 'Mis pagos',          desc: 'Historial de transacciones'             },
            { to: '/app/pasajero/sos',         icon: 'fa-shield-halved',    label: 'SOS / Emergencia',   desc: 'Activar alerta de seguridad'            },
          ].map(item => {
            // "Solicitar viaje" se deshabilita visualmente si el pasajero no está verificado.
            const disabled = item.requiresVerified && !isVerified;
            const content = (
              <>
                <div className="bugie-mini-icon"><i className={`fa-solid ${item.icon}`} /></div>
                <div className="flex-grow-1">
                  <div className="fw-semibold">{item.label}</div>
                  <div className="small bugie-muted">
                    {disabled ? 'Verifica tu cuenta para usar esta opción' : item.desc}
                  </div>
                </div>
                <i className="fa-solid fa-chevron-right bugie-muted" />
              </>
            );
            if (disabled) {
              return (
                <div key={item.to} className="bugie-list-item"
                     style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                  {content}
                </div>
              );
            }
            return (
              <Link key={item.to} to={item.to} className="bugie-list-item text-decoration-none">
                {content}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Últimos viajes */}
      {history.length > 0 && (
        <div className="bugie-card">
          <div className="bugie-card-header d-flex align-items-center justify-content-between">
            <span>Últimos viajes</span>
            <Link className="small" style={{ color: 'var(--bugie-primary)', textDecoration: 'none' }} to="/app/pasajero/viajes">
              Ver todos <i className="fa-solid fa-arrow-right ms-1" style={{ fontSize: '0.7rem' }} />
            </Link>
          </div>
          <div className="bugie-card-body p-0">
            {history.slice(0, 5).map((t, i) => {
              const isComp = t.status === 4;
              const color  = isComp ? '#34d399' : '#94a3b8';
              const date   = new Date(t.createdAt);
              return (
                <div key={t.id} className="d-flex align-items-center gap-3 px-3 py-2"
                  style={{ borderBottom: i < Math.min(history.length, 5) - 1 ? '1px solid var(--bugie-border)' : 'none' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <i className={`fa-solid ${isComp ? 'fa-circle-check' : 'fa-circle-xmark'}`} style={{ color, fontSize: '0.85rem' }} />
                  </div>
                  <div className="flex-grow-1 min-w-0">
                    <div className="small fw-semibold" style={{ color }}>
                      {STATUS_MSG[t.status] ?? '?'}
                    </div>
                    <div className="small bugie-muted">
                      {date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}
                      {' · '}
                      {date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <div className="fw-bold" style={{ color: isComp ? '#34d399' : 'var(--bugie-muted)', flexShrink: 0 }}>
                    S/ {(t.finalFare ?? t.estimatedFare).toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}