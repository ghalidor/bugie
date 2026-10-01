import { Link, Outlet } from 'react-router-dom';

export default function AuthLayout() {
  return (
    <div className="bugie-auth-wrap">
      <div className="container bugie-container">
        <div className="bugie-auth-card mx-auto">
          <div className="d-flex align-items-center justify-content-between mb-4">
            <Link to="/admin" className="text-decoration-none">
              <span className="fw-bold fs-5" style={{ color: 'var(--bugie-primary)', letterSpacing: '-.04em' }}>Bugie Admin</span>
            </Link>
            <span className="badge rounded-pill badge-bugie">Panel gestor</span>
          </div>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
