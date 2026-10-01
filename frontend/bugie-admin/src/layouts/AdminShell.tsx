import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import TopNav from '../components/TopNav';
import { PermissionsProvider } from '../state/permissions';

/// Layout principal del admin. Usa flexbox real (no grid columns de Bootstrap)
/// para que el contenido SIEMPRE ocupe exactamente lo que sobra al sidebar,
/// sin desajustes ni huecos. Tres modos:
///   - Desktop expandido: sidebar 240px, contenido = resto
///   - Desktop colapsado: sidebar 72px (solo íconos), contenido = resto
///   - Móvil: sidebar oculto, se abre como overlay
///
/// PermissionsProvider envuelve TODO para que cualquier componente del admin
/// (Sidebar, páginas, etc.) pueda llamar usePermissions() y saber qué mostrar.
export default function AdminShell() {
  return (
    <PermissionsProvider>
      <AdminShellInner />
    </PermissionsProvider>
  );
}

function AdminShellInner() {
  const navigate = useNavigate();
  const location = useLocation();

  /// Sidebar móvil (overlay completo, slide-in)
  const [mobileOpen, setMobileOpen] = useState(false);
  /// Sidebar desktop colapsado (default: colapsado, solo iconos. El boton del
  /// menu lo expande para ver las secciones agrupadas)
  const [desktopCollapsed, setDesktopCollapsed] = useState(true);
  /// Sidebar desktop oculto completamente (botón en TopNav)
  const [desktopHidden, setDesktopHidden] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('bugie_token');
    const user  = localStorage.getItem('bugie_admin_user');
    if (!token || !user) navigate('/auth/login', { replace: true });
  }, [navigate]);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // Ancho del sidebar según estado.
  const sidebarWidth = desktopHidden ? 0 : (desktopCollapsed ? 72 : 240);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bugie-bg)' }}>
      <TopNav
        onMenuClick={() => setMobileOpen(v => !v)}
        desktopHidden={desktopHidden}
        onToggleDesktopSidebar={() => setDesktopHidden(v => !v)}
      />

      {/* Overlay móvil */}
      {mobileOpen && (
        <div
          className="d-lg-none"
          onClick={() => setMobileOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1040,
          }}
        />
      )}

      {/* Layout flex: sidebar + contenido. Importante usar flex real (no
          col-* de bootstrap) para que las anchuras coincidan SIEMPRE. */}
      <div style={{ display: 'flex', minHeight: 'calc(100vh - 64px)' }}>

        {/* Sidebar desktop */}
        <aside
          className="d-none d-lg-block"
          style={{
            width:      sidebarWidth,
            flexShrink: 0,
            transition: 'width 0.25s ease',
            overflow:   'hidden',
            background: 'var(--bugie-surface)',
            borderRight: '1px solid var(--bugie-border)',
            position: 'sticky',
            top: 64,
            alignSelf: 'flex-start',
            height: 'calc(100vh - 64px)',
            overflowY: 'auto',
          }}
        >
          <Sidebar
            collapsed={desktopCollapsed}
            onToggle={() => setDesktopCollapsed(v => !v)}
          />
        </aside>

        {/* Sidebar móvil (overlay) */}
        <aside
          className="d-lg-none"
          style={{
            position: 'fixed', top: 0, left: 0, bottom: 0,
            width: 260, zIndex: 1045,
            transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform .25s ease',
            background: 'var(--bugie-surface)',
            borderRight: '1px solid var(--bugie-border)',
            overflowY: 'auto',
            paddingTop: 64,
          }}
        >
          <Sidebar collapsed={false} />
        </aside>

        {/* Contenido principal — tiene su PROPIO scroll para que el navegador
            no use el scrollbar del <html> raíz (que en Chrome/Windows ignora
            customización CSS). Así el scroll vive dentro de un contenedor y
            respeta el diseño violeta de Bugie igual que los modales. */}
        <main
          style={{
            flex: 1,
            minWidth: 0,
            padding: '1rem 1rem 3rem',
            height: 'calc(100vh - 64px)',
            overflowY: 'auto',
          }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
