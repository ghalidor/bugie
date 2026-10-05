import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, ApiError } from '../../state/api';
import { LOGIN_AT_KEY } from '../../state/adminNotify';
import { resetNavSections } from '../../components/Sidebar';
import { Field, storage } from '../../components/ui';
import { takeLogoutMessage } from '../../state/session';

const AUTH_API = `${import.meta.env.VITE_API_AUTH}/auth/login`;

export default function Login() {
  const navigate = useNavigate();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  // Si la sesion se cerro desde el backend (sesiones cerradas, cuenta desactivada...), se muestra el motivo.
  const [error,    setError]    = useState<string | null>(() => takeLogoutMessage());

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

      // Menu: todas las secciones plegadas (se abre sola la de la pagina actual).
      resetNavSections();
      // Centro de avisos: marca el inicio de sesion para los recordatorios
      // configurados "al iniciar sesion".
      storage.set(LOGIN_AT_KEY, String(Date.now()));

      navigate('/admin/dashboard', { replace: true });

    } catch (err) {
      // Antes cualquier error decia "no se pudo conectar", incluso con la
      // contrasena mal. Ahora se distingue cada caso.
      if (err instanceof ApiError && err.status === 401) {
        // Cuenta desactivada o eliminada: el backend explica el motivo.
        const generic = !err.message || err.message === 'Credenciales inválidas.';
        setError(generic ? 'Correo o contraseña incorrectos.' : err.message);
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('No pudimos conectar con Bugie. Revisa tu conexión a internet y vuelve a intentarlo en unos minutos.');
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

      <form onSubmit={onSubmit} className="bx-form">
        <Field label="Correo">
          <input
            className="form-control"
            type="email"
            placeholder="admin@bugie.pe"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </Field>
        <Field label="Contraseña">
          <input
            className="form-control"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </Field>
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
