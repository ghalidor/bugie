import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, API, ApiError } from '../../state/api';

const AUTH_API = `${import.meta.env.VITE_API_AUTH}/auth/login`;


interface AuthResponse {
  token:    string;
  role:     string;
  fullName: string;
  userId:   string;
}

export default function Login() {
  const navigate = useNavigate();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const data = await apiFetch<any>(AUTH_API, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
      });


      if (data.role !== 'admin') {
        setError('Solo administradores pueden acceder a este panel.');
        return;
      }

      // Guardar sesión del admin
      localStorage.setItem('bugie_token',    data.token);
      localStorage.setItem('bugie_admin_user', JSON.stringify({
        userId:   data.userId,
        fullName: data.fullName,
        role:     data.role,
      }));

      navigate('/admin/dashboard', { replace: true });

    } catch (err) {
      // Antes cualquier error decia "no se pudo conectar", incluso con la
      // contrasena mal. Ahora se distingue cada caso.
      if (err instanceof ApiError && err.status === 401) {
        setError('Correo o contraseña incorrectos.');
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('No se pudo conectar con el servidor. ¿Está corriendo Auth.Api?');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="mb-4">
        <div className="text-uppercase small fw-bold" style={{ color: 'var(--bugie-accent)' }}>
          Acceso seguro
        </div>
        <h1 className="h3 fw-bold mt-2 mb-2" style={{ letterSpacing: '-.04em' }}>
          Ingresa al panel gestor.
        </h1>
        <p className="small bugie-muted mb-0">
          Vista administrativa para monitoreo, validación y control operativo.
        </p>
      </div>

      {error && (
        <div className="alert alert-danger d-flex align-items-center gap-2 py-2 mb-3">
          <i className="fa-solid fa-circle-exclamation" />
          <span className="small">{error}</span>
        </div>
      )}

      <form onSubmit={onSubmit} className="d-grid gap-3">
        <div>
          <label className="form-label">Correo</label>
          <input
            className="form-control"
            type="email"
            placeholder="admin@bugie.pe"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div>
          <label className="form-label">Contraseña</label>
          <input
            className="form-control"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        <button className="btn btn-bugie text-white w-100" type="submit" disabled={loading}>
          {loading
            ? <><span className="spinner-border spinner-border-sm me-2" />Ingresando…</>
            : 'Entrar al panel'
          }
        </button>
      </form>

      <div className="mt-4 small bugie-muted text-center">
        <i className="fa-solid fa-shield-halved me-1" />
        Solo para administradores autorizados
      </div>
    </>
  );
}
