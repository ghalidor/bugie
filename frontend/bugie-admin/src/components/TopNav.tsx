import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import useTheme from '../hooks/useTheme';
import ThemeToggle from './ThemeToggle';
import NotificationBell from './NotificationBell';
import { findNavItem } from './navConfig';
import { PERMS, usePermissions } from '../state/permissions';
import { useClickOutside, useLayer } from './ui';

interface Props {
  /** Unico boton de menu: en escritorio colapsa/expande, en movil abre/cierra el cajon. */
  onMenuClick: () => void;
  /** Si el menu esta expandido (escritorio) o abierto (movil). */
  menuExpanded: boolean;
  isDesktop: boolean;
}

/// Barra superior: boton de menu, logo, "Seccion › Pagina", tema y usuario.
/// La campana muestra el historial de avisos (NotificationBell).
export default function TopNav({ onMenuClick, menuExpanded, isDesktop }: Props) {
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { has } = usePermissions();

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside([ref], open, () => setOpen(false));
  useLayer(open, () => setOpen(false));

  let user: { fullName?: string; role?: string } | null = null;
  try {
    const stored = localStorage.getItem('bugie_admin_user');
    user = stored ? JSON.parse(stored) : null;
  } catch { user = null; }

  const current = findNavItem(location.pathname);
  // "Configuración" solo con su permiso (como en el menú lateral).
  const canSettings = has(PERMS.ViewSettings);

  function logout() {
    localStorage.removeItem('bugie_token');
    localStorage.removeItem('bugie_admin_user');
    navigate('/auth/login', { replace: true });
  }

  const menuLabel = isDesktop
    ? (menuExpanded ? 'Contraer menú' : 'Expandir menú')
    : (menuExpanded ? 'Cerrar menú' : 'Abrir menú');

  return (
    <nav className="navbar bugie-navbar" aria-label="Barra superior">
      <div className="bx-topnav w-100">
        <button
          className="bx-icon-btn"
          type="button"
          onClick={onMenuClick}
          aria-label={menuLabel}
          title={menuLabel}
          aria-expanded={menuExpanded}
          aria-controls="bugie-sidebar"
        >
          <i className={`fa-solid ${!isDesktop && menuExpanded ? 'fa-xmark' : 'fa-bars'}`} aria-hidden="true" />
        </button>

        <Link className="bx-topnav-brand" to="/admin/dashboard" aria-label="Ir al inicio">
          <img src="/bugie.png" alt="Bugie" />
          <span className="badge rounded-pill badge-bugie">Admin</span>
        </Link>

        {current && (
          <div className="bx-topnav-crumb" aria-label="Ubicación actual">
            {current.section.title && (
              <>
                <span className="sec">{current.section.title}</span>
                <i className="fa-solid fa-chevron-right sep bugie-muted" style={{ fontSize: '.6rem' }} aria-hidden="true" />
              </>
            )}
            <span className="page">{current.item.label}</span>
          </div>
        )}

        <div className="bx-topnav-right">
          <NotificationBell />
          <ThemeToggle theme={theme} onToggle={toggle} />

          <div className="position-relative" ref={ref}>
            <button
              className="bx-user-btn"
              onClick={() => setOpen(o => !o)}
              type="button"
              aria-haspopup="menu"
              aria-expanded={open}
              aria-label="Menú de usuario"
            >
              <i className="fa-solid fa-circle-user" style={{ color: 'var(--bugie-primary)' }} aria-hidden="true" />
              <span className="small fw-semibold d-none d-md-inline name">{user?.fullName ?? 'Admin'}</span>
              <i className="fa-solid fa-chevron-down bugie-muted" style={{ fontSize: '0.65rem' }} aria-hidden="true" />
            </button>

            {open && (
              <div
                role="menu"
                className="bx-menu-list"
                style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', left: 'auto' }}
              >
                <div className="px-2 py-2 border-bottom mb-1" style={{ borderColor: 'var(--bugie-border)' }}>
                  <div className="small fw-semibold">{user?.fullName ?? 'Administrador'}</div>
                  <div className="small bugie-muted">{user?.role === 'admin' ? 'Administrador' : user?.role}</div>
                </div>
                {canSettings && (
                  <>
                    <button role="menuitem" type="button" className="bx-menu-item" onClick={() => { setOpen(false); navigate('/admin/configuracion'); }}>
                      <i className="fa-solid fa-gear" aria-hidden="true" />Configuración
                    </button>
                    <div className="bx-menu-sep" role="separator" />
                  </>
                )}
                <button role="menuitem" type="button" className="bx-menu-item danger" onClick={logout}>
                  <i className="fa-solid fa-arrow-right-from-bracket" aria-hidden="true" />Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
