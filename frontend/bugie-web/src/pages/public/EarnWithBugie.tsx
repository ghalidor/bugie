import { Link, useOutletContext } from 'react-router-dom';
import { useLanding, parse } from '../../hooks/useLanding';

const FALLBACK = {
  eyebrow: 'Gana con Bugie',
  title: 'Convierte tu vehículo en una fuente de ingresos.',
  subtitle: 'Únete a la red de conductores verificados de Trujillo. Sin cuotas mensuales, sin contratos, tú eliges cuándo trabajar.',
  ctaPrimary: 'Quiero ser conductor',
  ctaSecondary: 'Ya tengo cuenta',
  benefits: [
    {
      icon: 'fa-coins',
      title: 'Ingresos por viaje',
      text: 'Recibes el monto del viaje menos una comisión transparente del 10%. Sin cobros ocultos.',
    },
    {
      icon: 'fa-clock',
      title: 'Tú decides tu horario',
      text: 'Conéctate cuando quieras, desconéctate cuando lo necesites. Sin metas obligatorias.',
    },
    {
      icon: 'fa-shield-halved',
      title: 'Pasajeros verificados',
      text: 'Todos los pasajeros están registrados con cuenta verificada en la plataforma.',
    },
    {
      icon: 'fa-wallet',
      title: 'Cobros por Yape o Plin',
      text: 'Recibe tus pagos directamente. Retira tu billetera cuando quieras.',
    },
    {
      icon: 'fa-headset',
      title: 'Soporte 24/7',
      text: 'Equipo de monitoreo disponible para emergencias y soporte operativo.',
    },
    {
      icon: 'fa-route',
      title: 'Rutas optimizadas',
      text: 'Recibe solicitudes cercanas a tu ubicación con tarifa estimada antes de aceptar.',
    },
  ],
  requirementsTitle: 'Requisitos para registrarte',
  requirements: [
    'DNI vigente',
    'Licencia de conducir A-IIa o superior',
    'SOAT vigente',
    'Vehículo en buenas condiciones (modelo 2010 o más reciente)',
    'Certificado de antecedentes penales',
    'Disponibilidad para verificación presencial',
  ],
  stepsTitle: '¿Cómo empiezas?',
  steps: [
    { num: 1, title: 'Regístrate',         text: 'Completa el formulario con tus datos básicos.' },
    { num: 2, title: 'Sube tus documentos', text: 'DNI, licencia, SOAT y antecedentes desde la app.' },
    { num: 3, title: 'Verificación',        text: 'Validamos tus documentos en 24 a 48 horas.' },
    { num: 4, title: 'Empieza a ganar',     text: 'Activa tu disponibilidad y recibe tu primer viaje.' },
  ],
  finalCtaTitle: '¿Listo para empezar?',
  finalCtaText:  'El registro es gratuito y toma menos de 3 minutos.',
  finalCtaButton: 'Crear cuenta de conductor',
};

export default function EarnWithBugie() {
  const ctx  = useOutletContext<{ lang: string } | null>();
  const lang = ctx?.lang ?? 'es';
  const { data } = useLanding(lang);
  const d = parse(data?.sections ?? [], 'earn', FALLBACK);

  return (
    <div className="bugie-section-sm">
      <div className="container bugie-container">

        {/* Hero */}
        <div className="bugie-shell-card mb-4" data-reveal>
          <div className="row g-4 align-items-center">
            <div className="col-lg-7">
              <div className="text-uppercase small fw-bold text-bugie-accent mb-2">{d.eyebrow}</div>
              <h1 className="bugie-h1 mb-3">
                <span className="bugie-gradient-text">{d.title}</span>
              </h1>
              <p className="bugie-lead mb-4">{d.subtitle}</p>
              <div className="d-flex flex-wrap gap-2">
                <Link className="btn btn-bugie text-white" to="/auth/registro-conductor">
                  <i className="fa-solid fa-car me-2" />{d.ctaPrimary}
                </Link>
                <Link className="btn btn-bugie-outline" to="/auth/login">
                  {d.ctaSecondary}
                </Link>
              </div>
            </div>
            <div className="col-lg-5 text-center">
              <div
                className="d-inline-flex align-items-center justify-content-center"
                style={{
                  width: 220, height: 220, borderRadius: '50%',
                  background: 'linear-gradient(135deg, rgba(79,125,245,.18), rgba(230,115,217,.18))',
                  border: '1px solid var(--bugie-border)',
                }}
              >
                <i className="fa-solid fa-coins" style={{ fontSize: 90, color: '#D4A933' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Beneficios */}
        <h2 className="bugie-h3 mb-3" data-reveal>Por qué conducir con Bugie</h2>
        <div className="row g-3 mb-5">
          {(d.benefits ?? []).map((b: any, i: number) => (
            <div key={i} className="col-md-6 col-lg-4" data-reveal>
              <div className="bugie-card h-100 p-3">
                <div
                  className="bugie-mini-icon mb-3 d-inline-flex align-items-center justify-content-center"
                  style={{
                    width: 44, height: 44, borderRadius: 12,
                  }}
                >
                  <i className={`fa-solid ${b.icon}`} />
                </div>
                <div className="fw-bold mb-2">{b.title}</div>
                <div className="small bugie-muted">{b.text}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Requisitos + Pasos */}
        <div className="row g-4 mb-5">
          <div className="col-lg-6" data-reveal>
            <div className="bugie-card p-4 h-100">
              <h3 className="bugie-h4 mb-3">
                <i className="fa-solid fa-clipboard-check me-2 text-bugie-accent" />
                {d.requirementsTitle}
              </h3>
              <ul className="list-unstyled d-grid gap-2 mb-0">
                {(d.requirements ?? []).map((r: string, i: number) => (
                  <li key={i} className="d-flex align-items-start gap-2 small">
                    <i className="fa-solid fa-check text-success mt-1" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="col-lg-6" data-reveal>
            <div className="bugie-card p-4 h-100">
              <h3 className="bugie-h4 mb-3">
                <i className="fa-solid fa-list-ol me-2 text-bugie-accent" />
                {d.stepsTitle}
              </h3>
              <div className="d-grid gap-3">
                {(d.steps ?? []).map((s: any) => (
                  <div key={s.num} className="d-flex gap-3 align-items-start">
                    <div
                      className="d-flex align-items-center justify-content-center fw-bold"
                      style={{
                        width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                        background: 'linear-gradient(135deg, #4F7DF5, #B85FE6)',
                        color: '#fff', fontSize: 14,
                      }}
                    >
                      {s.num}
                    </div>
                    <div>
                      <div className="fw-bold small">{s.title}</div>
                      <div className="small bugie-muted">{s.text}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* CTA final */}
        <div className="bugie-shell-card text-center p-4 p-md-5" data-reveal>
          <h2 className="bugie-h3 mb-2">{d.finalCtaTitle}</h2>
          <p className="bugie-muted mb-4">{d.finalCtaText}</p>
          <Link className="btn btn-bugie text-white btn-lg px-4" to="/auth/registro-conductor">
            <i className="fa-solid fa-arrow-right me-2" />
            {d.finalCtaButton}
          </Link>
        </div>

      </div>
    </div>
  );
}