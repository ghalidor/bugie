import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import TopNav from '../components/TopNav'
import Sidebar from '../components/Sidebar'
import RightPanel from '../components/RightPanel'

export default function AppShell() {
  const location = useLocation()

  // Colapsado del sidebar en desktop. Por defecto OCULTO para que el contenido tenga más espacio.
  // En móvil sigue usando el offcanvas de Bootstrap.
  const [sidebarHidden, setSidebarHidden] = useState(true)

  return (
    <div className="min-vh-100">
      <TopNav
        sidebarHidden={sidebarHidden}
        onToggleSidebar={() => setSidebarHidden(v => !v)}
      />

      {/* Sidebar móvil (offcanvas Bootstrap) */}
      <div
        className="offcanvas offcanvas-start bugie-offcanvas"
        tabIndex={-1}
        id="bugieSidebar"
        aria-labelledby="bugieSidebarLabel"
      >
        <div className="offcanvas-header">
          <div className="fw-bold" id="bugieSidebarLabel">Menú</div>
          <button type="button" className="btn-close" data-bs-dismiss="offcanvas" aria-label="Close" />
        </div>
        <div className="offcanvas-body">
          <Sidebar path={location.pathname} />
        </div>
      </div>

      <div className="bugie-app-frame bugie-page">
        <div className={`bugie-app-layout ${sidebarHidden ? 'bugie-sidebar-hidden' : ''}`}>
          <aside className="bugie-left-column d-none d-lg-block">
            <div className="bugie-sticky">
              <Sidebar path={location.pathname} />
            </div>
          </aside>

          <main className="bugie-center-column">
            <div key={location.pathname} className="bugie-route">
              <Outlet />
            </div>
          </main>

          <aside className="bugie-right-column d-none d-lg-block">
            <div className="bugie-sticky">
              <RightPanel path={location.pathname} />
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}