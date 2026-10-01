import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useTheme from '../hooks/useTheme';
import ThemeToggle from './ThemeToggle';

interface Props {
  onMenuClick?:             () => void;     // toggle móvil (offcanvas)
  desktopHidden?:           boolean;        // estado del sidebar desktop
  onToggleDesktopSidebar?:  () => void;     // toggle desktop
}

export default function TopNav({ onMenuClick, desktopHidden = false, onToggleDesktopSidebar }: Props) {
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const stored = localStorage.getItem('bugie_admin_user');
  const user   = stored ? JSON.parse(stored) : null;

  function logout() {
    localStorage.removeItem('bugie_token');
    localStorage.removeItem('bugie_admin_user');
    navigate('/auth/login', { replace: true });
  }

  return (
    <nav className="navbar bugie-navbar navbar-light sticky-top">
      <div className="bugie-admin-frame py-2 gap-3 d-flex align-items-center">

        {/* Botones de menú */}
        <div className="d-flex align-items-center gap-2">
          {/* Hamburger móvil */}
          <button
            className="btn btn-sm btn-outline-secondary bugie-icon-btn d-inline-flex d-lg-none"
            type="button"
            onClick={onMenuClick}
            title="Abrir menú"
          >
            <i className="fa-solid fa-bars" />
          </button>

          {/* Toggle desktop */}
          {onToggleDesktopSidebar && (
            <button
              className="btn btn-sm btn-outline-secondary bugie-icon-btn d-none d-lg-inline-flex"
              type="button"
              onClick={onToggleDesktopSidebar}
              title={desktopHidden ? 'Mostrar menú' : 'Ocultar menú'}
            >
              <i className={`fa-solid ${desktopHidden ? 'fa-bars' : 'fa-angles-left'}`} />
            </button>
          )}

          <Link className="navbar-brand d-flex align-items-center gap-2 mb-0" to="/admin/dashboard">
            <img src="/bugie.png" alt="Bugie" style={{ height: 32, width: "auto", objectFit: "contain" }} />
            <span className="badge rounded-pill badge-bugie">Admin</span>
          </Link>
        </div>

        {/* Buscador */}
        <form className="bugie-topnav-search d-none d-md-flex flex-grow-1 justify-content-center" role="search">
          <div className="input-group bugie-topnav-searchbox">
            <span className="input-group-text">
              <i className="fa-solid fa-magnifying-glass" />
            </span>
            <input className="form-control" placeholder="Buscar usuarios, viajes, conductores…" />
          </div>
        </form>

        {/* Acciones derecha */}
        <div className="d-flex align-items-center gap-2 ms-auto">
          <ThemeToggle theme={theme} onToggle={toggle} />

          <button className="btn btn-sm btn-outline-secondary bugie-icon-btn" type="button" title="Notificaciones">
            <i className="fa-solid fa-bell" />
          </button>

          <div className="position-relative" ref={ref}>
            <button
              className="btn btn-sm d-flex align-items-center gap-2 rounded-pill px-3"
              style={{ border: '1px solid var(--bugie-border)', background: 'var(--bugie-surface)' }}
              onClick={() => setOpen(o => !o)}
              type="button"
            >
              <i className="fa-solid fa-circle-user" style={{ color: 'var(--bugie-primary)' }} />
              <span className="small fw-semibold d-none d-sm-inline" style={{ color: 'var(--bugie-text)' }}>
                {user?.fullName ?? 'Admin'}
              </span>
              <i className="fa-solid fa-chevron-down small" style={{ color: 'var(--bugie-muted)', fontSize: '0.65rem' }} />
            </button>

            {open && (
              <div
                className="position-absolute end-0 mt-2 rounded-3 shadow py-1"
                style={{
                  minWidth: 220,
                  background: 'var(--bugie-surface)',
                  border: '1px solid var(--bugie-border)',
                  zIndex: 1050,
                }}
              >
                <div className="px-3 py-2 border-bottom" style={{ borderColor: 'var(--bugie-border) !important' }}>
                  <div className="small fw-semibold" style={{ color: 'var(--bugie-text)' }}>
                    {user?.fullName ?? 'Administrador'}
                  </div>
                  <div className="small" style={{ color: 'var(--bugie-muted)' }}>
                    {user?.role === 'admin' ? 'Administrador' : user?.role}
                  </div>
                </div>

                <div className="py-1">
                  <button
                    className="dropdown-item d-flex align-items-center gap-2 px-3 py-2 w-100 text-start"
                    style={{ background: 'transparent', border: 'none', color: 'var(--bugie-text)' }}
                    onClick={() => { setOpen(false); navigate('/admin/configuracion'); }}
                  >
                    <i className="fa-solid fa-gear" style={{ width: 16, color: 'var(--bugie-muted)' }} />
                    <span className="small">Configuración</span>
                  </button>

                  <hr className="my-1" style={{ borderColor: 'var(--bugie-border)' }} />

                  <button
                    className="dropdown-item d-flex align-items-center gap-2 px-3 py-2 w-100 text-start"
                    style={{ background: 'transparent', border: 'none', color: 'var(--bugie-danger)' }}
                    onClick={logout}
                  >
                    <i className="fa-solid fa-arrow-right-from-bracket" style={{ width: 16 }} />
                    <span className="small">Cerrar sesión</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}