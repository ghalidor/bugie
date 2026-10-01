import { useEffect, useState } from 'react';
import { apiFetch } from '../../state/api';
import PageHeader from '../../components/PageHeader';
import { Link } from 'react-router-dom';

interface Stats {
  onlineDrivers: number; pendingDrivers: number;
  activeSos: number;     pendingTrips: number;
}

function PulseDot({ color }: { color: string }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: 8, height: 8 }}>
      <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: color, opacity: .5, animation: 'kpiPulse 1.8s ease-out infinite' }} />
      <span style={{ borderRadius: '50%', width: 8, height: 8, background: color, display: 'inline-block' }} />
      <style>{`@keyframes kpiPulse{0%{transform:scale(1);opacity:.5}100%{transform:scale(2.8);opacity:0}}`}</style>
    </span>
  );
}

export default function Dashboard() {
  const [stats,   setStats]   = useState<Stats>({ onlineDrivers: 0, pendingDrivers: 0, activeSos: 0, pendingTrips: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      apiFetch<any[]>(`${import.meta.env.VITE_API_DRIVERS}/drivers/online`).catch(() => []),
      apiFetch<any[]>(`${import.meta.env.VITE_API_DRIVERS}/drivers/pending`).catch(() => []),
      apiFetch<any[]>(`${import.meta.env.VITE_API_TRIPS}/sos`).catch(() => []),
      apiFetch<any[]>(`${import.meta.env.VITE_API_TRIPS}/trips/pending`).catch(() => []),
    ]).then(([online, pending, sos, trips]) => {
      const val = (r: any) => Array.isArray(r.value) ? r.value.length : 0;
      setStats({ onlineDrivers: val(online), pendingDrivers: val(pending), activeSos: val(sos), pendingTrips: val(trips) });
    }).finally(() => setLoading(false));
  }, []);

  const kpis = [
    { label: 'Conductores en línea',   value: stats.onlineDrivers,  hint: 'Disponibles ahora',       icon: 'fa-circle-dot',           color: '#34d399', pulse: stats.onlineDrivers > 0,  href: '/admin/monitoreo'   },
    { label: 'Viajes pendientes',      value: stats.pendingTrips,   hint: 'Sin conductor asignado',  icon: 'fa-route',                color: '#f59e0b', pulse: stats.pendingTrips > 0,   href: '/admin/viajes'      },
    { label: 'Conductores pendientes', value: stats.pendingDrivers, hint: 'Esperan aprobación',      icon: 'fa-id-card',              color: '#818cf8', pulse: stats.pendingDrivers > 0, href: '/admin/verificacion'},
    { label: 'Alertas SOS',            value: stats.activeSos,      hint: 'Requieren atención',      icon: 'fa-triangle-exclamation', color: '#f87171', pulse: stats.activeSos > 0,      href: '/admin/sos'         },
  ];

  return (
    <>
      <PageHeader
        title="Centro de operación"
        subtitle="Visibilidad en tiempo real de la plataforma Bugie."
      />

      {/* KPIs */}
      <div className="row g-3 mb-4">
        {kpis.map(k => (
          <div className="col-sm-6 col-xl-3" key={k.label}>
            <Link to={k.href} className="text-decoration-none">
              <div className="bugie-card p-4 h-100" style={{ border: k.pulse ? `1px solid ${k.color}33` : undefined, transition: 'all .2s', cursor: 'pointer' }}>

                {/* Header fila */}
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: k.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className={`fa-solid ${k.icon}`} style={{ color: k.color, fontSize: '1.1rem' }} />
                  </div>
                  {k.pulse && <PulseDot color={k.color} />}
                </div>

                {/* Valor */}
                {loading
                  ? <div className="spinner-border spinner-border-sm mb-2" style={{ borderColor: k.color, borderRightColor: 'transparent' }} />
                  : <div style={{ fontSize: '2.4rem', fontWeight: 800, lineHeight: 1, color: k.color, marginBottom: 4 }}>
                      {k.value}
                    </div>
                }

                <div className="fw-semibold small mb-1">{k.label}</div>
                <div className="small bugie-muted">{k.hint}</div>
              </div>
            </Link>
          </div>
        ))}
      </div>

      <div className="row g-3">

        {/* Accesos rápidos */}
        <div className="col-xl-7">
          <div className="bugie-card h-100">
            <div className="bugie-card-header">
              <i className="fa-solid fa-bolt me-2" style={{ color: '#f59e0b' }} />
              Accesos rápidos
            </div>
            <div className="bugie-card-body">
              <div className="row g-2">
                {[
                  { href: '/admin/verificacion', icon: 'fa-id-card',          color: '#818cf8', label: 'Verificar conductores',  desc: 'Aprobar documentos'       },
                  { href: '/admin/sos',          icon: 'fa-shield-halved',    color: '#f87171', label: 'Centro SOS',             desc: 'Alertas en tiempo real'   },
                  { href: '/admin/monitoreo',    icon: 'fa-map-location-dot', color: '#34d399', label: 'Monitoreo',              desc: 'Mapa con conductores'     },
                  { href: '/admin/conductores',  icon: 'fa-car-side',         color: '#38bdf8', label: 'Conductores',            desc: 'Gestionar conductores'    },
                  { href: '/admin/usuarios',     icon: 'fa-users',            color: '#c084fc', label: 'Usuarios',               desc: 'Ver todos los usuarios'   },
                  { href: '/admin/viajes',       icon: 'fa-route',            color: '#f59e0b', label: 'Viajes',                 desc: 'Auditoría de viajes'      },
                  { href: '/admin/pagos',        icon: 'fa-credit-card',      color: '#34d399', label: 'Pagos',                  desc: 'Transacciones'            },
                  { href: '/admin/landing',      icon: 'fa-paintbrush',       color: '#818cf8', label: 'Landing',                desc: 'Editar contenido público' },
                ].map(item => (
                  <div className="col-6 col-md-3" key={item.href}>
                    <Link to={item.href} className="text-decoration-none">
                      <div className="bugie-card p-3 text-center h-100" style={{ background: 'var(--bugie-bg-2)', transition: 'transform .15s' }}
                        onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-3px)')}
                        onMouseLeave={e => (e.currentTarget.style.transform = 'none')}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: item.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
                          <i className={`fa-solid ${item.icon}`} style={{ color: item.color }} />
                        </div>
                        <div className="fw-semibold small">{item.label}</div>
                        <div className="bugie-muted" style={{ fontSize: '0.72rem' }}>{item.desc}</div>
                      </div>
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Estado de APIs */}
        <div className="col-xl-5">
          <div className="bugie-card h-100">
            <div className="bugie-card-header">
              <i className="fa-solid fa-server me-2" style={{ color: '#34d399' }} />
              Estado de servicios
            </div>
            <div className="bugie-card-body p-0">
              {[
                { name: 'Auth.Api',     port: 5001, desc: 'Autenticación y usuarios'   },
                { name: 'Trips.Api',    port: 5002, desc: 'Viajes y rutas'             },
                { name: 'Drivers.Api',  port: 5003, desc: 'Conductores y vehículos'    },
                { name: 'Payments.Api', port: 5004, desc: 'Pagos y ganancias'          },
                { name: 'Landing.Api',  port: 5005, desc: 'Contenido público'          },
              ].map((api, i, arr) => (
                <ApiStatus key={api.name} name={api.name} port={api.port} desc={api.desc}
                  isLast={i === arr.length - 1} />
              ))}
            </div>
          </div>
        </div>

      </div>
    </>
  );
}

function ApiStatus({ name, port, desc, isLast }: { name: string; port: number; desc: string; isLast: boolean }) {
  const [status, setStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  useEffect(() => {
    // Endpoint /api/health es público en TODAS las APIs.
    // No requiere token ni rol, así que el admin puede consultarlo sin permisos especiales.
    const url = `http://localhost:${port}/api/health`;

    fetch(url, { method: 'GET', signal: AbortSignal.timeout(3000) })
      .then(r => r.ok ? setStatus('online') : setStatus('offline'))
      .catch(() => setStatus('offline'));
  }, [port]);

  const cfg = {
    online:   { color: '#34d399', label: 'Online',     icon: 'fa-circle-check'  },
    offline:  { color: '#f87171', label: 'Offline',    icon: 'fa-circle-xmark'  },
    checking: { color: '#f59e0b', label: 'Verificando', icon: 'fa-circle'       },
  }[status];

  return (
    <div className="d-flex align-items-center gap-3 px-3 py-3"
      style={{ borderBottom: isLast ? 'none' : '1px solid var(--bugie-border)' }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: cfg.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <i className={`fa-solid ${cfg.icon}`} style={{ color: cfg.color, fontSize: '0.9rem' }} />
      </div>
      <div className="flex-grow-1">
        <div className="fw-semibold small">{name}</div>
        <div className="bugie-muted" style={{ fontSize: '0.72rem' }}>{desc} · :{port}</div>
      </div>
      <span className="badge rounded-pill" style={{ background: cfg.color + '22', color: cfg.color, fontSize: '0.72rem' }}>
        {cfg.label}
      </span>
    </div>
  );
}