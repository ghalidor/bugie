import { CSSProperties } from 'react';
import { NavLink } from 'react-router-dom';
import { getUser } from '../state/session';

/* ──────────────────────────────────────────────────────────────────────────
   Menu lateral de la web con sesion. Un menu por rol, agrupado por secciones.
   NAV tambien lo usa TopNav para mostrar el nombre de la pagina actual.
   ────────────────────────────────────────────────────────────────────────── */

export interface NavItem { to: string; icon: string; label: string; }
export interface NavSection { title: string; color: string; items: NavItem[]; }

const PASSENGER_NAV: NavSection[] = [
  {
    title: 'Movilidad', color: 'var(--bugie-primary)',
    items: [
      { to: '/app/pasajero/inicio',      icon: 'fa-house',             label: 'Inicio' },
      { to: '/app/pasajero/solicitar',   icon: 'fa-route',             label: 'Pedir viaje o envío' },
      { to: '/app/pasajero/seguimiento', icon: 'fa-location-dot',      label: 'Seguimiento' },
      { to: '/app/pasajero/viajes',      icon: 'fa-clock-rotate-left', label: 'Mis viajes' },
    ],
  },
  {
    title: 'Mi cuenta', color: 'var(--bugie-accent)',
    items: [
      { to: '/app/pasajero/pagos',        icon: 'fa-credit-card', label: 'Pagos' },
      { to: '/app/pasajero/puntos',       icon: 'fa-star',        label: 'Mis puntos' },
      { to: '/app/pasajero/verificacion', icon: 'fa-id-card',     label: 'Verificación' },
      { to: '/app/pasajero/perfil',       icon: 'fa-user',        label: 'Perfil' },
    ],
  },
  {
    title: 'Seguridad', color: '#dc2626',
    items: [
      { to: '/app/pasajero/sos', icon: 'fa-shield-halved', label: 'SOS / Emergencia' },
    ],
  },
];

const DRIVER_NAV: NavSection[] = [
  {
    title: 'Actividad', color: 'var(--bugie-primary)',
    items: [
      { to: '/app/conductor/inicio',         icon: 'fa-gauge',                 label: 'Inicio' },
      { to: '/app/conductor/viajes',         icon: 'fa-clock-rotate-left',     label: 'Historial' },
      { to: '/app/conductor/ganancias',      icon: 'fa-money-bill-trend-up',   label: 'Ganancias' },
      { to: '/app/conductor/calificaciones', icon: 'fa-star-half-stroke',      label: 'Calificaciones' },
      { to: '/app/conductor/conexiones',     icon: 'fa-plug',                 label: 'Conexiones' },
      { to: '/app/conductor/puntos',         icon: 'fa-star',                  label: 'Mis puntos' },
    ],
  },
  {
    title: 'Mi cuenta', color: 'var(--bugie-accent)',
    items: [
      { to: '/app/conductor/documentos', icon: 'fa-id-card', label: 'Documentos' },
      { to: '/app/conductor/vehiculos',  icon: 'fa-car',     label: 'Vehículos' },
      { to: '/app/conductor/perfil',     icon: 'fa-user',    label: 'Perfil' },
    ],
  },
  {
    title: 'Seguridad', color: '#dc2626',
    items: [
      { to: '/app/conductor/sos', icon: 'fa-shield-halved', label: 'SOS / Emergencia' },
    ],
  },
];

export function navFor(path: string): { role: 'passenger' | 'driver'; sections: NavSection[] } {
  return path.startsWith('/app/conductor')
    ? { role: 'driver', sections: DRIVER_NAV }
    : { role: 'passenger', sections: PASSENGER_NAV };
}

/** Seccion y pagina actuales (para la cabecera). */
export function currentNav(path: string): { section: string; label: string } | null {
  for (const s of navFor(path).sections) {
    const it = s.items.find(i => path === i.to || path.startsWith(i.to + '/'));
    if (it) return { section: s.title, label: it.label };
  }
  return null;
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'B';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export default function Sidebar({ path, onNavigate }: { path: string; onNavigate?: () => void }) {
  const { role, sections } = navFor(path);
  const user = getUser();

  return (
    <>
      <nav className="bx-nav" aria-label="Menú principal">
        <div className="bx-nav-role" title={user?.fullName ?? undefined}>
          <span className="bx-avatar" aria-hidden="true">{initials(user?.fullName)}</span>
          <div className="who" style={{ minWidth: 0 }}>
            <div className="t">{role === 'driver' ? 'Conductor' : 'Pasajero'}</div>
            <div className="n">{user?.fullName ?? 'Mi cuenta'}</div>
          </div>
        </div>

        {sections.map(sec => (
          <div key={sec.title} className="bx-nav-section" style={{ ['--sec-color' as string]: sec.color } as CSSProperties}>
            <div className="bx-nav-title">{sec.title}</div>
            {sec.items.map(it => (
              <NavLink
                key={it.to}
                to={it.to}
                end
                title={it.label}
                onClick={onNavigate}
                className={({ isActive }) => `bx-nav-item ${isActive ? 'active' : ''}`}
              >
                <i className={`fa-solid ${it.icon}`} aria-hidden="true" />
                <span className="label">{it.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {role === 'driver' && (
        <div className="bx-nav-foot">
          <i className="fa-solid fa-mobile-screen" aria-hidden="true" />
          <span>Para conectarte y tomar viajes usa la app Bugie. Aquí consultas tu actividad.</span>
        </div>
      )}
    </>
  );
}
