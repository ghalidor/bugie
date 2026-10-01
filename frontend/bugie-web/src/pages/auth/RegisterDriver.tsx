import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { API, apiFetch, ApiError } from '../../state/api';
import { saveSession, SessionUser } from '../../state/session';
import { parse } from '../../hooks/useLanding';
import SignaturePad, { SignaturePadHandle } from '../../components/SignaturePad';

const LANDING_API = `${import.meta.env.VITE_API_LANDING}/landing`;

const FALLBACK = {
  eyebrow: 'Gana con Bugie',
  title: 'Regístrate como conductor.',
  subtitle: 'Después del registro podrás subir tus documentos para la verificación.',
  firstNameLabel: 'Nombre', firstNamePlaceholder: 'Nombre',
  lastNameLabel: 'Apellido', lastNamePlaceholder: 'Apellido',
  emailLabel: 'Correo', emailPlaceholder: 'correo@ejemplo.com',
  phoneLabel: 'Teléfono', phonePlaceholder: '999 999 999',
  passwordLabel: 'Contraseña', passwordPlaceholder: 'Mínimo 8 caracteres',
  cityLabel: 'Ciudad donde operarás',
  cityPlaceholder: 'Trujillo',
  submitLabel: 'Crear cuenta de conductor',
  loadingLabel: 'Creando cuenta…',
  hasAccountLabel: '¿Ya tienes cuenta?',
  loginLabel: 'Ingresar',
  isPassengerLabel: '¿Buscas viajar?',
  isPassengerLink:  'Regístrate como pasajero',
  nextStepsTitle: 'Después del registro',
  nextSteps: [
    'Sube tu DNI y licencia de conducir',
    'Adjunta el SOAT vigente del vehículo',
    'Carga tus antecedentes penales',
    'Espera la verificación (24 a 48 horas)',
  ],
};

interface AuthResponse { token: string; role: string; fullName: string; userId: string; }

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterDriver() {
  const navigate = useNavigate();
  const [d, setD] = useState(FALLBACK);
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', password: '', city: 'Trujillo',
  });
  const [acceptTerms, setAcceptTerms] = useState(false);
  const sigRef = useRef<SignaturePadHandle>(null);
  const [loading,     setLoading]     = useState(false);
  const [errors,      setErrors]      = useState<string[]>([]);

  useEffect(() => {
    fetch(`${LANDING_API}?lang=es`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.sections) setD({ ...FALLBACK, ...parse(data.sections, 'auth_register_driver', FALLBACK) }); })
      .catch(() => {});
  }, []);

  const set = (field: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }));

  // Valida todo el formulario y devuelve la lista de errores (vacía si está OK).
  function validar(): string[] {
    const errs: string[] = [];
    if (!form.firstName.trim())            errs.push('Ingresa tu nombre.');
    if (!form.lastName.trim())             errs.push('Ingresa tu apellido.');
    if (!form.email.trim())                errs.push('Ingresa tu correo.');
    else if (!emailRegex.test(form.email)) errs.push('El correo no tiene un formato válido.');
    if (!form.phone.trim())                errs.push('Ingresa tu teléfono.');
    if (!form.city.trim())                 errs.push('Ingresa la ciudad donde operarás.');
    if (!form.password)                    errs.push('Ingresa una contraseña.');
    else if (form.password.length < 8)     errs.push('La contraseña debe tener al menos 8 caracteres.');
    if (!acceptTerms)                      errs.push('Debe aceptar los términos y condiciones.');
    if (sigRef.current?.isEmpty() ?? true) errs.push('Debe firmar para completar el registro.');
    return errs;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    const errs = validar();
    if (errs.length > 0) { setErrors(errs); return; }
    setErrors([]);

    setLoading(true);
    try {
      // Role hardcodeado a 'driver' — no se elige
      const data = await apiFetch<AuthResponse>(`${API.auth}/auth/register`, {
        method: 'POST',
        body: JSON.stringify({
          fullName: `${form.firstName} ${form.lastName}`.trim(),
          email: form.email, password: form.password,
          phone: form.phone, role: 'driver',
          acceptedTerms: true,
          signatureImage: sigRef.current?.toDataURL() ?? '',
        }),
      });
      saveSession(data.token, {
        userId: data.userId, fullName: data.fullName,
        email: form.email, role: data.role as SessionUser['role'],
      });
      navigate('/app/conductor/inicio', { replace: true });
    } catch (err) {
      setErrors([err instanceof ApiError ? err.message : 'No se pudo conectar con el servidor.']);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="mb-4">
        <div className="text-uppercase small fw-bold text-bugie-accent mb-2">
          <i className="fa-solid fa-car me-2" />{d.eyebrow}
        </div>
        <h1 className="bugie-h3 mb-2">{d.title}</h1>
        <p className="bugie-muted mb-0">{d.subtitle}</p>
      </div>

      {errors.length > 0 && (
        <div className="alert alert-danger py-2 mb-3">
          <div className="d-flex align-items-center gap-2 fw-semibold mb-1">
            <i className="fa-solid fa-circle-exclamation" />
            <span className="small">Revisa lo siguiente:</span>
          </div>
          <ul className="mb-0 ps-4 small">
            {errors.map((msg, i) => <li key={i}>{msg}</li>)}
          </ul>
        </div>
      )}

      <form onSubmit={onSubmit} className="d-grid gap-3" noValidate>
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label">{d.firstNameLabel}</label>
            <input className="form-control" placeholder={d.firstNamePlaceholder}
              value={form.firstName} onChange={set('firstName')} />
          </div>
          <div className="col-md-6">
            <label className="form-label">{d.lastNameLabel}</label>
            <input className="form-control" placeholder={d.lastNamePlaceholder}
              value={form.lastName} onChange={set('lastName')} />
          </div>
        </div>
        <div>
          <label className="form-label">{d.emailLabel}</label>
          <input className="form-control" type="email" placeholder={d.emailPlaceholder}
            value={form.email} onChange={set('email')} autoComplete="email" />
        </div>
        <div>
          <label className="form-label">{d.phoneLabel}</label>
          <input className="form-control" type="tel" placeholder={d.phonePlaceholder}
            value={form.phone} onChange={set('phone')} />
        </div>
        <div>
          <label className="form-label">{d.cityLabel}</label>
          <input className="form-control" placeholder={d.cityPlaceholder}
            value={form.city} onChange={set('city')} />
        </div>
        <div>
          <label className="form-label">{d.passwordLabel}</label>
          <input className="form-control" type="password" placeholder={d.passwordPlaceholder}
            value={form.password} onChange={set('password')} autoComplete="new-password" />
        </div>

        {/* Aceptación de términos y condiciones */}
        <div className="form-check">
          <input
            className="form-check-input"
            type="checkbox"
            id="acceptTermsDriver"
            checked={acceptTerms}
            onChange={e => setAcceptTerms(e.target.checked)}
          />
          <label className="form-check-label small" htmlFor="acceptTermsDriver">
            Acepto los{' '}
            <Link to="/terminos" target="_blank" rel="noreferrer" className="fw-semibold">
              términos y condiciones
            </Link>
          </label>
        </div>

        {/* Firma digital */}
        <div>
          <label className="form-label mb-1">Firma digital</label>
          <p className="bugie-muted small mb-2">
            Firma dentro del recuadro con el mouse o con el dedo para completar tu registro.
          </p>
          <SignaturePad ref={sigRef} />
          <div className="text-end mt-1">
            <button type="button" className="btn btn-link btn-sm p-0"
              onClick={() => sigRef.current?.clear()}>
              <i className="fa-solid fa-eraser me-1" />Limpiar firma
            </button>
          </div>
        </div>

        {/* Bloque informativo de próximos pasos */}
        <div
          className="p-3 small"
          style={{
            background: 'var(--bugie-surface-2)',
            border: '1px solid var(--bugie-border)',
            borderRadius: 12,
          }}
        >
          <div className="fw-bold mb-2">
            <i className="fa-solid fa-circle-info me-2 text-bugie-accent" />
            {d.nextStepsTitle}
          </div>
          <ul className="mb-0 ps-3 bugie-muted">
            {(d.nextSteps ?? []).map((s: string, i: number) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>

        <button className="btn btn-bugie text-white w-100" type="submit" disabled={loading}>
          {loading
            ? <><span className="spinner-border spinner-border-sm me-2" />{d.loadingLabel}</>
            : <><i className="fa-solid fa-car me-2" />{d.submitLabel}</>
          }
        </button>
      </form>

      <div className="small mt-4 d-flex flex-wrap justify-content-between gap-2">
        <div>
          {d.hasAccountLabel} <Link to="/auth/login">{d.loginLabel}</Link>
        </div>
        <div className="bugie-muted">
          {d.isPassengerLabel} <Link to="/auth/registro">{d.isPassengerLink}</Link>
        </div>
      </div>
    </>
  );
}
