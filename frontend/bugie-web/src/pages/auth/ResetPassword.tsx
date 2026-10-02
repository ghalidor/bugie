import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { API, ApiError, apiFetch } from '../../state/api';

// Llega desde el enlace del correo: /auth/restablecer?token=...
// El enlace vale 1 hora y un solo uso (lo controla el backend).
type Step = 'checking' | 'form' | 'invalid' | 'done';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [step,     setStep]     = useState<Step>('checking');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [show,     setShow]     = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  // Al abrir la pagina se verifica si el enlace sigue vigente
  useEffect(() => {
    if (!token) { setStep('invalid'); return; }
    apiFetch<{ valid: boolean }>(`${API.auth}/auth/reset-password/validate?token=${encodeURIComponent(token)}`)
      .then(r => setStep(r?.valid ? 'form' : 'invalid'))
      .catch(() => setStep('invalid'));
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return; }
    if (password !== confirm) { setError('Las contraseñas no coinciden.'); return; }

    setLoading(true);
    try {
      await apiFetch(`${API.auth}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });
      setStep('done');
    } catch (err) {
      // Si el enlace vencio mientras escribia, el backend lo indica
      setError(err instanceof ApiError ? err.message : 'No se pudo cambiar la contraseña. Intenta más tarde.');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'checking') {
    return (
      <div className="text-center py-4 bugie-muted">
        <span className="spinner-border spinner-border-sm me-2" />Verificando enlace…
      </div>
    );
  }

  if (step === 'invalid') {
    return (
      <>
        <div className="mb-4 text-center">
          <i className="fa-solid fa-link-slash fa-3x text-danger mb-3 d-block" />
          <h1 className="bugie-h3 mb-2">Enlace no válido</h1>
          <p className="bugie-muted">
            El enlace ya se usó o venció. Los enlaces de recuperación duran <strong>1 hora</strong>{' '}
            y sirven una sola vez.
          </p>
        </div>
        <div className="d-grid gap-2">
          <Link className="btn btn-bugie text-white" to="/auth/recuperar">
            <i className="fa-solid fa-paper-plane me-2" />Solicitar un nuevo enlace
          </Link>
          <Link className="small text-center" to="/auth/login">Volver al ingreso</Link>
        </div>
      </>
    );
  }

  if (step === 'done') {
    return (
      <>
        <div className="mb-4 text-center">
          <i className="fa-solid fa-circle-check fa-3x text-success mb-3 d-block" />
          <h1 className="bugie-h3 mb-2">Contraseña actualizada</h1>
          <p className="bugie-muted">
            Ya puedes ingresar con tu nueva contraseña. Te enviamos un correo de confirmación.
          </p>
        </div>
        <div className="d-grid">
          <Link className="btn btn-bugie text-white" to="/auth/login">
            <i className="fa-solid fa-right-to-bracket me-2" />Ingresar
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="mb-4">
        <div className="text-uppercase small fw-bold text-bugie-accent mb-2">Recuperación</div>
        <h1 className="bugie-h3 mb-2">Crea tu nueva contraseña</h1>
        <p className="bugie-muted mb-0">Debe tener al menos 8 caracteres.</p>
      </div>

      <form className="d-grid gap-3" onSubmit={onSubmit}>
        <div>
          <label className="form-label">Nueva contraseña</label>
          <div className="input-group">
            <input
              className="form-control"
              type={show ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
            <button type="button" className="btn btn-outline-secondary" onClick={() => setShow(s => !s)}
              aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
              <i className={`fa-solid ${show ? 'fa-eye-slash' : 'fa-eye'}`} />
            </button>
          </div>
        </div>
        <div>
          <label className="form-label">Repite la contraseña</label>
          <input
            className="form-control"
            type={show ? 'text' : 'password'}
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>

        {error && (
          <div className="alert alert-danger small mb-0">
            <i className="fa-solid fa-circle-exclamation me-2" />{error}
          </div>
        )}

        <button className="btn btn-bugie text-white" type="submit" disabled={loading}>
          {loading
            ? <><span className="spinner-border spinner-border-sm me-2" />Guardando…</>
            : <><i className="fa-solid fa-key me-2" />Guardar contraseña</>
          }
        </button>
      </form>

      <div className="small mt-4 text-center">
        <Link to="/auth/login">Volver al ingreso</Link>
      </div>
    </>
  );
}
