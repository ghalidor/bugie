import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import useTheme from '../hooks/useTheme';
import { getUser, clearSession } from '../state/session';
import { IconButton, useClickOutside, useLayer } from './ui';
import { currentNav, initials } from './Sidebar';

interface Props {
  /** Menu lateral contraido (solo escritorio). */
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Menu movil abierto. */
  mobileOpen: boolean;
  onToggleMobile: () => void;
}

/** Barra superior de la web con sesion: menu, marca, pagina actual, tema y cuenta. */
export default function TopNav({ collapsed, onToggleCollapsed, mobileOpen, onToggleMobile }: Props) {
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const user = getUser();
  const isDriver = pathname.startsWith('/app/conductor');
  const base = isDriver ? '/app/conductor' : '/app/pasajero';
  const crumb = currentNav(pathname);

  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  useClickOutside([boxRef], open, () => setOpen(false));
  useLayer(open, () => setOpen(false));

  function go(to: string) {
    setOpen(false);
    navigate(to);
  }

  function logout() {
    setOpen(false);
    clearSession();
    navigate('/', { replace: true });
  }

  const firstName = user?.fullName?.split(' ')[0] ?? 'Mi cuenta';

  return (
    <header className="bx-topbar">
      <div className="bx-topnav">
        {/* Movil: abre/cierra el cajon */}
        <span className="d-lg-none">
          <IconButton
            icon={mobileOpen ? 'fa-xmark' : 'fa-bars'}
            label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={mobileOpen}
            aria-controls="bx-sidebar"
            onClick={onToggleMobile}
          />
        </span>
        {/* Escritorio: contrae el menu a solo iconos */}
        <span className="d-none d-lg-inline-flex">
          <IconButton
            icon={collapsed ? 'fa-bars' : 'fa-angles-left'}
            label={collapsed ? 'Mostrar menú completo' : 'Contraer menú'}
            aria-controls="bx-sidebar"
            onClick={onToggleCollapsed}
          />
        </span>

        <Link className="bx-topnav-brand" to={`${base}/inicio`} aria-label="Bugie, ir al inicio">
          <img src="/bugie.png" alt="Bugie" />
        </Link>

        {crumb && (
          <div className="bx-topnav-crumb" aria-label="Estás en">
            <span className="sec">{crumb.section}</span>
            <i className="fa-solid fa-chevron-right sep" aria-hidden="true" />
            <span className="page">{crumb.label}</span>
          </div>
        )}

        <div className="bx-topnav-right">
          <IconButton
            icon={theme === 'dark' ? 'fa-sun' : 'fa-moon'}
            label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            onClick={toggle}
          />

          <div className="bx-user" ref={boxRef}>
            <button
              type="button"
              className="bx-user-btn"
              aria-haspopup="menu"
              aria-expanded={open}
              aria-label={`Menú de cuenta de ${user?.fullName ?? 'usuario'}`}
              onClick={() => setOpen(o => !o)}
            >
              <span className="bx-avatar" aria-hidden="true">{initials(user?.fullName)}</span>
              <span className="name">{firstName}</span>
              <i className="fa-solid fa-chevron-down chev" aria-hidden="true" />
            </button>

            {open && (
              <div className="bx-menu-list" role="menu">
                <div className="bx-menu-head">
                  <span className="bx-avatar lg" aria-hidden="true">{initials(user?.fullName)}</span>
                  <div className="who">
                    <div className="n">{user?.fullName ?? 'Usuario'}</div>
                    <div className="e">{user?.email}</div>
                    <span className="bx-badge sm bx-tone-primary mt-1">{isDriver ? 'Conductor' : 'Pasajero'}</span>
                  </div>
                </div>
                <button type="button" role="menuitem" className="bx-menu-item" onClick={() => go(`${base}/perfil`)}>
                  <i className="fa-solid fa-user" aria-hidden="true" />Mi perfil
                </button>
                <button type="button" role="menuitem" className="bx-menu-item" onClick={() => go(`${base}/puntos`)}>
                  <i className="fa-solid fa-star" aria-hidden="true" />Mis puntos
                </button>
                {isDriver
                  ? (
                    <button type="button" role="menuitem" className="bx-menu-item" onClick={() => go('/app/conductor/documentos')}>
                      <i className="fa-solid fa-id-card" aria-hidden="true" />Mis documentos
                    </button>
                  ) : (
                    <button type="button" role="menuitem" className="bx-menu-item" onClick={() => go('/app/pasajero/verificacion')}>
                      <i className="fa-solid fa-id-card" aria-hidden="true" />Verificación
                    </button>
                  )}
                <button type="button" role="menuitem" className="bx-menu-item" onClick={() => go(`${base}/sos`)}>
                  <i className="fa-solid fa-shield-halved" aria-hidden="true" />SOS / Emergencia
                </button>
                <div className="bx-menu-sep" />
                <button type="button" role="menuitem" className="bx-menu-item danger" onClick={logout}>
                  <i className="fa-solid fa-arrow-right-from-bracket" aria-hidden="true" />Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
