import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

// Bootstrap y FontAwesome se cargan UNA sola vez, aqui.
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'
import '@fortawesome/fontawesome-free/css/all.min.css'

import './styles/index.scss'
import App from './App'
import { applyTheme, initialTheme } from './hooks/useTheme'
import { ConfirmProvider, ToastProvider, TourProvider } from './components/ui'

// Tema: el elegido por el usuario o, si nunca eligio, el del sistema.
applyTheme(initialTheme())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <ToastProvider>
      <ConfirmProvider>
        <TourProvider>
          <App />
        </TourProvider>
      </ConfirmProvider>
    </ToastProvider>
  </BrowserRouter>
)
