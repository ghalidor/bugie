import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useTheme from '../hooks/useTheme';
import ThemeToggle from './ThemeToggle';
import { getUser, clearSession } from '../state/session';

interface Props {
  sidebarHidden?:    boolean;
  onToggleSidebar?:  () => void;
}

export default function TopNav({ sidebarHidden = false, onToggleSidebar }: Props) {
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const user = getUser();

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function logout() {
    clearSession();
    navigate('/', { replace: true });
  }

  const profilePath = user?.role === 'driver'
    ? '/app/conductor/perfil'
    : '/app/pasajero/perfil';

  return (
    <nav className="navbar bugie-navbar">
      <div className="bugie-app-frame py-2 gap-3 d-flex align-items-center">

        {/* Hamburger móvil (offcanvas Bootstrap) */}
        <div className="d-flex align-items-center gap-2">
          <button
            className="btn btn-sm btn-bugie-outline bugie-icon-btn d-inline-flex d-lg-none"
            type="button"
            data-bs-toggle="offcanvas"
            data-bs-target="#bugieSidebar"
            aria-controls="bugieSidebar"
            title="Abrir menú"
          >
            <i className="fa-solid fa-bars" />
          </button>

          {/* Toggle de sidebar en desktop */}
          {onToggleSidebar && (
            <button
              className="btn btn-sm btn-bugie-outline bugie-icon-btn d-none d-lg-inline-flex"
              type="button"
              onClick={onToggleSidebar}
              title={sidebarHidden ? 'Mostrar menú' : 'Ocultar menú'}
            >
              <i className={`fa-solid ${sidebarHidden ? 'fa-bars' : 'fa-angles-left'}`} />
            </button>
          )}

          <Link className="navbar-brand d-flex align-items-center gap-3 mb-0" to="/">
            <img src="/bugie.png" alt="Bugie" style={{ height: 32, width: "auto", objectFit: "contain" }} />
            <span className="bugie-chip d-none d-md-inline-flex">
              <i className="fa-solid fa-shield-halved text-bugie-accent" /> Operación segura
            </span>
          </Link>
        </div>

        {/* Buscador */}
        <form className="bugie-topnav-search d-none d-md-flex flex-grow-1 justify-content-center" role="search">
          <div className="input-group bugie-search bugie-topnav-searchbox">
            <span className="input-group-text"><i className="fa-solid fa-magnifying-glass" /></span>
            <input className="form-control" placeholder="Buscar viajes, conductores o soporte" />
          </div>
        </form>

        {/* Derecha: tema + usuario */}
        <div className="d-flex align-items-center gap-2 ms-auto">
          <ThemeToggle theme={theme} onToggle={toggle} />

          <div className="position-relative" ref={ref}>
            <button
              className="btn btn-sm d-flex align-items-center gap-2 rounded-pill px-3"
              style={{ border: '1px solid var(--bugie-border)', background: 'var(--bugie-surface)' }}
              onClick={() => setOpen(o => !o)}
              type="button"
            >
              <i className="fa-solid fa-circle-user" style={{ color: 'var(--bugie-primary)' }} />
              <span className="small fw-semibold d-none d-sm-inline" style={{ color: 'var(--bugie-text)' }}>
                {user?.fullName?.split(' ')[0] ?? 'Usuario'}
              </span>
              <i className="fa-solid fa-chevron-down" style={{ color: 'var(--bugie-muted)', fontSize: '0.65rem' }} />
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
                <div className="px-3 py-2 border-bottom" style={{ borderColor: 'var(--bugie-border)' }}>
                  <div className="small fw-semibold" style={{ color: 'var(--bugie-text)' }}>
                    {user?.fullName ?? 'Usuario'}
                  </div>
                  <div className="small" style={{ color: 'var(--bugie-muted)' }}>{user?.email}</div>
                </div>

                <div className="py-1">
                  <button
                    className="w-100 text-start px-3 py-2 d-flex align-items-center gap-2"
                    style={{ background: 'transparent', border: 'none', color: 'var(--bugie-text)' }}
                    onClick={() => { setOpen(false); navigate(profilePath); }}
                  >
                    <i className="fa-solid fa-user" style={{ width: 16, color: 'var(--bugie-muted)' }} />
                    <span className="small">Mi perfil</span>
                  </button>
                  <hr className="my-1" style={{ borderColor: 'var(--bugie-border)' }} />
                  <button
                    className="w-100 text-start px-3 py-2 d-flex align-items-center gap-2"
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