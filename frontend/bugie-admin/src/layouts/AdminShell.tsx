import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import TopNav from '../components/TopNav';
import NotificationCenter from '../components/NotificationCenter';
import RouteGuard from '../components/RouteGuard';
import { PermissionsProvider } from '../state/permissions';
import { storage, useLayer, useMediaQuery, useScrollLock } from '../components/ui';

/// Layout principal del admin.
///   - Escritorio (>= 992px): menu fijo a la izquierda, expandido o solo
///     iconos. UN solo boton (en la barra superior) lo colapsa y el estado
///     se recuerda en localStorage.
///   - Movil/tablet: el menu es un cajon que se abre DEBAJO de la barra
///     superior (asi el mismo boton sirve para cerrarlo).
///   - La pagina hace scroll en el documento (no en un contenedor interno).
///
/// PermissionsProvider envuelve TODO para que cualquier componente pueda
/// llamar usePermissions().
export default function AdminShell() {
  return (
    <PermissionsProvider>
      <AdminShellInner />
    </PermissionsProvider>
  );
}

const COLLAPSE_KEY = 'bugie_sidebar_collapsed';

function AdminShellInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const isDesktop = useMediaQuery('(min-width: 992px)');

  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => storage.get(COLLAPSE_KEY) === '1');

  useEffect(() => {
    const token = localStorage.getItem('bugie_token');
    const user  = localStorage.getItem('bugie_admin_user');
    if (!token || !user) navigate('/auth/login', { replace: true });
  }, [navigate]);

  // Cerrar el menu movil al navegar o al pasar a escritorio.
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  useEffect(() => { if (isDesktop) setMobileOpen(false); }, [isDesktop]);

  // Al cambiar de pagina, volver arriba.
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);

  const drawerOpen = mobileOpen && !isDesktop;
  useLayer(drawerOpen, () => setMobileOpen(false));
  useScrollLock(drawerOpen);

  function onMenuClick() {
    if (isDesktop) {
      setCollapsed(c => {
        storage.set(COLLAPSE_KEY, c ? '0' : '1');
        return !c;
      });
    } else {
      setMobileOpen(o => !o);
    }
  }

  const sidebarCls = [
    'bx-sidebar',
    collapsed ? 'is-collapsed' : '',
    drawerOpen ? 'is-open' : '',
  ].join(' ');

  return (
    <div className="bx-shell">
      <TopNav
        onMenuClick={onMenuClick}
        menuExpanded={isDesktop ? !collapsed : drawerOpen}
        isDesktop={isDesktop}
      />

      <div className="bx-shell-body">
        <div
          className={`bx-sidebar-backdrop ${drawerOpen ? 'is-open' : ''}`}
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
        <aside id="bugie-sidebar" className={sidebarCls} aria-label="Menú">
          <div className="bx-sidebar-mobile-head">
            <span>Menú</span>
            <button type="button" className="bx-icon-btn sm ghost" onClick={() => setMobileOpen(false)} aria-label="Cerrar menú">
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          </div>
          <Sidebar collapsed={collapsed && isDesktop} />
        </aside>

        <main className="bx-main" id="contenido">
          {/* Transicion de entrada en cada cambio de pagina */}
          <div key={location.pathname} className="bx-page-enter">
            <RouteGuard><Outlet /></RouteGuard>
          </div>
        </main>
      </div>

      {/* Avisos en vivo y recordatorios (arriba a la derecha) */}
      <NotificationCenter />
    </div>
  );
}
