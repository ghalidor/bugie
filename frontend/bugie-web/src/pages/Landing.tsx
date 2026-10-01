import { Link } from 'react-router-dom'

export default function Landing() {
  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center p-3">
      <div className="bugie-card p-4" style={{ width: '100%', maxWidth: 860 }}>
        <div className="d-flex align-items-center justify-content-between">
          <div>
            <div className="bugie-brand h3 mb-1">Bugie</div>
            <div className="text-secondary">Plataforma de transporte seguro • Maquetas UI</div>
          </div>
          <span className="badge rounded-pill badge-bugie">Bootstrap</span>
        </div>

        <hr />

        <div className="row g-3">
          <div className="col-12 col-md-4">
            <div className="bugie-card p-3 h-100">
              <div className="fw-semibold mb-1">Pasajero</div>
              <div className="small text-secondary mb-3">Solicitar, seguir y pagar viajes.</div>
              <div className="d-grid gap-2">
                <Link className="btn btn-bugie text-white" to="/app/pasajero/inicio">Entrar</Link>
                <Link className="btn btn-outline-secondary" to="/auth/login">Login</Link>
              </div>
            </div>
          </div>
          <div className="col-12 col-md-4">
            <div className="bugie-card p-3 h-100">
              <div className="fw-semibold mb-1">Conductor</div>
              <div className="small text-secondary mb-3">Disponibilidad, solicitudes y ganancias.</div>
              <div className="d-grid gap-2">
                <Link className="btn btn-outline-secondary" to="/app/conductor/inicio">Entrar</Link>
                <Link className="btn btn-outline-secondary" to="/auth/registro">Registro</Link>
              </div>
            </div>
          </div>
          <div className="col-12 col-md-4">
            <div className="bugie-card p-3 h-100">
              <div className="fw-semibold mb-1">Gestor (Admin)</div>
              <div className="small text-secondary mb-3">Panel administrativo separado.</div>
              <div className="d-grid gap-2">
                <a className="btn btn-outline-secondary" href="http://localhost:5174" target="_blank" rel="noreferrer">Abrir admin</a>
                <div className="small text-secondary">(corre en otro puerto)</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 small text-secondary">
          Nota: estas vistas son maquetación (sin API). Separamos <b>app</b> (pasajero + conductor) del <b>admin</b> para aislar funciones.
        </div>
      </div>
    </div>
  )
}
