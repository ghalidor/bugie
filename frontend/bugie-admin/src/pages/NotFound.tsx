import { Link } from 'react-router-dom'
import { EmptyState } from '../components/ui'

/// Página no encontrada. Dentro del panel se muestra con el menú y la barra
/// superior (ruta /admin/* en App.tsx); fuera del panel, sola.
export default function NotFound() {
  return (
    <div className="bugie-card p-4">
      <EmptyState
        icon="fa-compass"
        title="No encontramos esta página"
        text="Puede que el enlace esté mal escrito o que la página ya no exista."
        action={<Link className="btn btn-sm btn-bugie" to="/admin/dashboard">Ir al inicio</Link>}
      />
    </div>
  )
}
