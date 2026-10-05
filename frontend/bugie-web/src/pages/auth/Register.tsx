import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { API, apiFetch, ApiError } from '../../state/api';
import { saveSession, SessionUser } from '../../state/session';
import { parse } from '../../hooks/useLanding';
import SignaturePad, { SignaturePadHandle } from '../../components/SignaturePad';
import IdentityFields from '../../components/IdentityFields';
import { Checkbox, Field, FormGrid } from '../../components/ui';
import { EMPTY_IDENTITY, IdentityForm, identityPayload, validateIdentity } from '../../state/identity';

const LANDING_API = `${import.meta.env.VITE_API_LANDING}/landing`;

const FALLBACK = {
  eyebrow: 'Registro',
  title: 'Crea tu cuenta de pasajero.',
  subtitle: 'Solicita viajes seguros con conductores verificados.',
  emailLabel: 'Correo', emailPlaceholder: 'correo@ejemplo.com',
  phoneLabel: 'Teléfono', phonePlaceholder: '999 999 999',
  passwordLabel: 'Contraseña', passwordPlaceholder: 'Mínimo 8 caracteres',
  submitLabel: 'Crear cuenta',
  loadingLabel: 'Creando cuenta…',
  hasAccountLabel: '¿Ya tienes cuenta?',
  loginLabel: 'Ingresar',
  isDriverLabel: '¿Quieres ganar dinero conduciendo?',
  isDriverLink:  'Regístrate como conductor',
};

interface AuthResponse { token: string; role: string; fullName: string; userId: string; }

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Register() {
  const navigate = useNavigate();
  const [d, setD] = useState(FALLBACK);
  const [form, setForm] = useState({
    email: '', phone: '', password: '',
    referralCode: '',
  });
  const [identity, setIdentity] = useState<IdentityForm>(EMPTY_IDENTITY);
  const [triedSubmit, setTriedSubmit] = useState(false);
  const identityErrors = validateIdentity(identity);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const sigRef = useRef<SignaturePadHandle>(null);
  const [loading, setLoading] = useState(false);
  const [errors,  setErrors]  = useState<string[]>([]);

  useEffect(() => {
    fetch(`${LANDING_API}?lang=es`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.sections) setD({ ...FALLBACK, ...parse(data.sections, 'auth_register', FALLBACK) }); })
      .catch(() => {});
  }, []);

  const set = (field: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }));

  // Valida todo el formulario y devuelve la lista de errores (vacía si está OK).
  function validar(): string[] {
    const errs: string[] = [];
    errs.push(...Object.values(identityErrors).filter((m): m is string => !!m));
    if (!form.email.trim())                errs.push('Ingresa tu correo.');
    else if (!emailRegex.test(form.email)) errs.push('El correo no tiene un formato válido.');
    if (!form.phone.trim())                errs.push('Ingresa tu teléfono.');
    if (!form.password)                    errs.push('Ingresa una contraseña.');
    else if (form.password.length < 8)     errs.push('La contraseña debe tener al menos 8 caracteres.');
    if (!acceptTerms)                      errs.push('Debe aceptar los términos y condiciones.');
    if (sigRef.current?.isEmpty() ?? true) errs.push('Debe firmar para completar el registro.');
    return errs;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    setTriedSubmit(true);
    const errs = validar();
    if (errs.length > 0) { setErrors(errs); return; }
    setErrors([]);

    setLoading(true);
    try {
      // Role siempre pasajero — el conductor usa la otra vista
      const data = await apiFetch<AuthResponse>(`${API.auth}/auth/register`, {
        method: 'POST',
        body: JSON.stringify({
          ...identityPayload(identity),
          email: form.email, password: form.password,
          phone: form.phone, role: 'passenger',
          acceptedTerms: true,
          signatureImage: sigRef.current?.toDataURL() ?? '',
          // Opcional: si viene vacío se manda null y el backend lo ignora.
          referralCode: form.referralCode.trim() || null,
        }),
      });
      saveSession(data.token, {
        userId: data.userId, fullName: data.fullName,
        email: form.email, role: data.role as SessionUser['role'],
      });
      navigate('/app/pasajero/inicio', { replace: true });
    } catch (err) {
      setErrors([err instanceof ApiError ? err.message : 'No se pudo conectar con el servidor.']);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="mb-4">
        <div className="text-uppercase small fw-bold text-bugie-accent mb-2">{d.eyebrow}</div>
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

      <form onSubmit={onSubmit} className="bx-form" noValidate>
        <IdentityFields value={identity} onChange={setIdentity}
                        errors={identityErrors} showAll={triedSubmit} disabled={loading} />
        <FormGrid>
          <Field label={d.emailLabel} required>
            <input className="form-control" type="email" placeholder={d.emailPlaceholder}
                   value={form.email} onChange={set('email')} autoComplete="email" />
          </Field>
          <Field label={d.phoneLabel} required>
            <input className="form-control" type="tel" placeholder={d.phonePlaceholder}
                   value={form.phone} onChange={set('phone')} />
          </Field>
          <Field label={d.passwordLabel} required>
            <input className="form-control" type="password" placeholder={d.passwordPlaceholder}
                   value={form.password} onChange={set('password')} autoComplete="new-password" />
          </Field>
          {/* Código de invitación. Opcional: si alguien te invitó, al ponerlo esa persona gana puntos.
              Va acá y no dentro de la app ya registrado, porque si no cualquiera se autorreferiría con una segunda cuenta. */}
          <Field label="Código de invitación" optional
                 help="Si alguien te invitó a Bugie, pon su código y le damos puntos por traerte.">
            <input className="form-control text-uppercase" placeholder="Ej. ANA4K7MP" maxLength={12}
                   value={form.referralCode}
                   onChange={e => setForm({ ...form, referralCode: e.target.value.toUpperCase() })} />
          </Field>
        </FormGrid>

        {/* Aceptación de términos y condiciones */}
        <Checkbox id="acceptTerms" size="sm" checked={acceptTerms} onChange={setAcceptTerms}
                  label={<>Acepto los{' '}
                    <Link to="/terminos" target="_blank" rel="noreferrer" className="fw-semibold">términos y condiciones</Link>
                  </>} />

        {/* Firma digital */}
        <div className="bx-field">
          <span className="bx-field-label">Firma digital</span>
          <p className="bugie-muted small mb-1">
            Firma dentro del recuadro con el mouse o con el dedo para completar tu registro.
          </p>
          <SignaturePad ref={sigRef} />
          <div className="text-end">
            <button type="button" className="btn btn-link btn-sm p-0"
              onClick={() => sigRef.current?.clear()}>
              <i className="fa-solid fa-eraser me-1" />Limpiar firma
            </button>
          </div>
        </div>

        <button className="btn btn-bugie text-white w-100" type="submit" disabled={loading}>
          {loading
            ? <><span className="spinner-border spinner-border-sm me-2" />{d.loadingLabel}</>
            : d.submitLabel
          }
        </button>
      </form>

      <div className="small mt-4 d-flex flex-wrap justify-content-between gap-2">
        <div>
          {d.hasAccountLabel} <Link to="/auth/login">{d.loginLabel}</Link>
        </div>
        <div className="bugie-muted">
          {d.isDriverLabel} <Link to="/auth/registro-conductor">{d.isDriverLink}</Link>
        </div>
      </div>
    </>
  );
}
