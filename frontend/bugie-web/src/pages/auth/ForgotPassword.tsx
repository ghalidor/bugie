import { useState } from 'react';
import { Link } from 'react-router-dom';
import { API, apiFetch } from '../../state/api';

type Step = 'email' | 'sent';

export default function ForgotPassword() {
  const [step,    setStep]    = useState<Step>('email');
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      await apiFetch(`${API.auth}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error('Error al procesar la solicitud.');
      setStep('sent');
    } catch {
      setError('No se pudo procesar la solicitud. Intenta más tarde.');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'sent') {
    return (
      <>
        <div className="mb-4 text-center">
          <i className="fa-solid fa-envelope-circle-check fa-3x text-success mb-3 d-block" />
          <h1 className="bugie-h3 mb-2">Revisa tu correo</h1>
          <p className="bugie-muted">
            Si <strong>{email}</strong> está registrado en Bugie, recibirás instrucciones
            para restablecer tu contraseña en los próximos minutos.
          </p>
        </div>
        <div className="small text-center">
          <Link to="/auth/login">Volver al ingreso</Link>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="mb-4">
        <div className="text-uppercase small fw-bold text-bugie-accent mb-2">Recuperación</div>
        <h1 className="bugie-h3 mb-2">Restablece tu acceso</h1>
        <p className="bugie-muted mb-0">
          Ingresa tu correo y te enviaremos instrucciones para crear una nueva contraseña.
        </p>
      </div>

      <form className="d-grid gap-3" onSubmit={onSubmit}>
        <div>
          <label className="form-label">Correo registrado</label>
          <input
            className="form-control"
            type="email"
            placeholder="correo@ejemplo.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
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
            ? <><span className="spinner-border spinner-border-sm me-2" />Enviando…</>
            : <><i className="fa-solid fa-paper-plane me-2" />Enviar instrucciones</>
          }
        </button>
      </form>

      <div className="small mt-4 text-center">
        <Link to="/auth/login">Volver al ingreso</Link>
      </div>
    </>
  );
}
