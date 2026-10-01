import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="bugie-card p-4">
      <div className="h4 mb-2">404</div>
      <div className="text-secondary">Ruta no encontrada.</div>
      <div className="mt-3">
        <Link className="btn btn-bugie text-white" to="/admin/dashboard">Volver</Link>
      </div>
    </div>
  )
}
