import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { API, apiFetch, ApiError } from '../../state/api';
import { saveSession, SessionUser } from '../../state/session';
import { parse } from '../../hooks/useLanding';

const LANDING_API = `${import.meta.env.VITE_API_LANDING}/landing`;

const FALLBACK = {
  eyebrow: 'Bienvenido',
  title: 'Inicia sesión para continuar.',
  subtitle: 'Accede con tu cuenta de pasajero o conductor.',
  emailLabel: 'Correo', emailPlaceholder: 'correo@ejemplo.com',
  passwordLabel: 'Contraseña', passwordPlaceholder: '••••••••',
  rememberLabel: 'Recordarme',
  forgotLabel: '¿Olvidaste tu contraseña?',
  submitLabel: 'Continuar',
  loadingLabel: 'Ingresando…',
  noAccountLabel: '¿Aún no tienes cuenta?',
  registerLabel: 'Crear cuenta',
};

interface AuthResponse { token: string; role: string; fullName: string; userId: string; email: string; }

export default function Login() {
  const navigate = useNavigate();
  const [d, setD] = useState(FALLBACK);
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    fetch(`${LANDING_API}?lang=es`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.sections) setD(parse(data.sections, 'auth_login', FALLBACK)); })
      .catch(() => {});
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(null); setLoading(true);
    try {
      const data = await apiFetch<AuthResponse>(`${API.auth}/auth/login`, {
        method: 'POST', body: JSON.stringify({ email, password }),
      });
      saveSession(data.token, {
        userId: data.userId, fullName: data.fullName, email,
        role: data.role as SessionUser['role'],
      });
      if (data.role === 'passenger')   navigate('/app/pasajero/inicio', { replace: true });
      else if (data.role === 'driver') navigate('/app/conductor/inicio', { replace: true });
      else if (data.role === 'admin') {
        localStorage.setItem('bugie_admin_user', JSON.stringify({
          userId: data.userId, fullName: data.fullName, role: data.role,
        }));
        window.location.href = 'http://localhost:5174/admin/dashboard';
      } else navigate('/auth/rol', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo conectar con el servidor.');
    } finally { setLoading(false); }
  }

  return (
    <>
      <div className="mb-4">
        <div className="text-uppercase small fw-bold text-bugie-accent mb-2">{d.eyebrow}</div>
        <h1 className="bugie-h3 mb-2">{d.title}</h1>
        <p className="bugie-muted mb-0">{d.subtitle}</p>
      </div>

      {error && (
        <div className="alert alert-danger d-flex align-items-center gap-2 py-2 mb-3">
          <i className="fa-solid fa-circle-exclamation" />
          <span className="small">{error}</span>
        </div>
      )}

      <form onSubmit={onSubmit} className="d-grid gap-3">
        <div>
          <label className="form-label">{d.emailLabel}</label>
          <input className="form-control" type="email" placeholder={d.emailPlaceholder}
            value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
        </div>
        <div>
          <label className="form-label">{d.passwordLabel}</label>
          <input className="form-control" type="password" placeholder={d.passwordPlaceholder}
            value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
        </div>
        <div className="d-flex justify-content-between align-items-center small">
          <label className="d-flex align-items-center gap-2 bugie-muted">
            <input type="checkbox" /> {d.rememberLabel}
          </label>
          <Link to="/auth/recuperar">{d.forgotLabel}</Link>
        </div>
        <button className="btn btn-bugie text-white w-100" type="submit" disabled={loading}>
          {loading
            ? <><span className="spinner-border spinner-border-sm me-2" />{d.loadingLabel}</>
            : d.submitLabel
          }
        </button>
      </form>

      <div className="d-flex justify-content-between mt-4 small">
        <span className="bugie-muted">{d.noAccountLabel}</span>
        <Link to="/auth/registro">{d.registerLabel}</Link>
      </div>
    </>
  );
}
