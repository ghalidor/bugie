import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center p-3">
      <div className="bugie-card p-4" style={{ maxWidth: 520, width: '100%' }}>
        <div className="h4 mb-2">404</div>
        <div className="text-secondary">Ruta no encontrada.</div>
        <div className="d-grid gap-2 mt-3">
          <Link to="/" className="btn btn-bugie text-white">Volver al inicio</Link>
        </div>
      </div>
    </div>
  )
}
