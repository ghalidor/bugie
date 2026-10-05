import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import TopNav from '../components/TopNav'
import Sidebar from '../components/Sidebar'
import RightPanel, { hasRightPanel } from '../components/RightPanel'
import ProfileCompletionModal from '../components/ProfileCompletionModal'
import { getToken } from '../state/session'
import { useAppViewTransitions } from '../hooks/useAppViewTransitions'
import { ConfirmProvider, ToastProvider, storage, useLayer, useMediaQuery, useScrollLock } from '../components/ui'
import '../styles/app.scss'

const COLLAPSE_KEY = 'bugie_sidebar_collapsed'

/**
 * Layout de la web con sesion (pasajero y conductor):
 *  - Escritorio: menu lateral fijo (se puede contraer a iconos; se recuerda).
 *  - Movil/tablet (< 992 px): el menu es un cajon con fondo oscuro.
 *  - Panel derecho de ayuda solo en >= 1400 px y en las paginas donde aporta.
 */
export default function AppShell() {
  const location = useLocation()
  const isDesktop = useMediaQuery('(min-width: 992px)')
  // Transicion suave entre paginas de la cuenta (View Transitions; respaldo: bxPageIn).
  useAppViewTransitions()

  const [collapsed, setCollapsed] = useState(() => storage.get(COLLAPSE_KEY) === '1')
  const [mobileOpen, setMobileOpen] = useState(false)
  // Sube al completar los datos del perfil: vuelve a montar la página para que lea los datos nuevos.
  const [profileVersion, setProfileVersion] = useState(0)

  function toggleCollapsed() {
    setCollapsed(v => {
      storage.set(COLLAPSE_KEY, v ? '0' : '1')
      return !v
    })
  }

  // El cajon movil se cierra al navegar y al pasar a escritorio.
  useEffect(() => { setMobileOpen(false) }, [location.pathname])
  useEffect(() => { if (isDesktop) setMobileOpen(false) }, [isDesktop])

  const drawerOpen = mobileOpen && !isDesktop
  useLayer(drawerOpen, () => setMobileOpen(false))
  useScrollLock(drawerOpen)

  const showAside = hasRightPanel(location.pathname)

  return (
    <ToastProvider>
      <ConfirmProvider>
        <div className="bx-app">
          <a className="bx-skip" href="#contenido">Saltar al contenido</a>

          <TopNav
            collapsed={collapsed}
            onToggleCollapsed={toggleCollapsed}
            mobileOpen={drawerOpen}
            onToggleMobile={() => setMobileOpen(v => !v)}
          />

          <div className="bx-shell-body">
            <div
              className={`bx-sidebar-backdrop ${drawerOpen ? 'is-open' : ''}`}
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />
            <aside
              id="bx-sidebar"
              className={`bx-sidebar ${collapsed && isDesktop ? 'is-collapsed' : ''} ${drawerOpen ? 'is-open' : ''}`}
              aria-label="Menú"
            >
              <Sidebar path={location.pathname} onNavigate={() => setMobileOpen(false)} />
            </aside>

            <main className="bx-main" id="contenido" tabIndex={-1}>
              <div key={`${location.pathname}-${profileVersion}`} className="bx-route">
                <Outlet />
              </div>
            </main>

            {showAside && (
              <aside className="bx-aside" aria-label="Ayuda">
                <RightPanel path={location.pathname} />
              </aside>
            )}
          </div>
        </div>

        {getToken() && <ProfileCompletionModal onCompleted={() => setProfileVersion(v => v + 1)} />}
      </ConfirmProvider>
    </ToastProvider>
  )
}
