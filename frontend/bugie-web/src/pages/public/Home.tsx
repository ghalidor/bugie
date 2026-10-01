import { useEffect, useRef, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { useLanding, parse } from '../../hooks/useLanding';

const FALLBACK_HERO = {
  title: 'Transporte seguro en Trujillo',
  subtitle: 'Conductores verificados, monitoreo 24/7 y botón SOS.',
  ctaPrimary: 'Solicitar viaje', ctaSecondary: 'Crear cuenta',
  pills: ['Transporte seguro', 'Monitoreo visible', 'Verificación'],
  safetyLink: 'Ver seguridad',
  stats: [
    { value: '5,000+', label: 'Conductores verificados' },
    { value: '24/7',   label: 'Monitoreo activo' },
    { value: '100%',   label: 'Seguridad como ADN' },
  ],
  phone: {
    tripLabel: 'Viaje activo', appName: 'Bugie', badge: 'Seguro',
    driverLabel: 'Conductor verificado', driverInfo: 'José M. • Toyota Yaris • ABC-123',
    etaLabel: 'Tiempo estimado', etaValue: '12 min',
    fareLabel: 'Tarifa', fareValue: 'S/ 14.20',
    safetyLabel: 'Seguridad activa', safetyDesc: 'SOS, soporte y trazabilidad', sosLabel: 'SOS',
  },
  marquee: ['Verificación diaria','Trazabilidad del viaje','Documentos y Face ID','Soporte visual','Panel gestor aislado','Responsive real'],
};

const FALLBACK_FEATURES = {
  eyebrow: 'Valor', title: 'Una plataforma que comunica seguridad desde la primera pantalla.',
  text: 'Cada vista está pensada para transmitir confianza antes de que el usuario siquiera suba al vehículo.',
  items: [
    { icon: 'fa-shield-halved', title: 'Seguridad operacional',  text: 'Verificación de identidad, soporte, historial y flujo SOS.' },
    { icon: 'fa-user-check',    title: 'Conductores validados',   text: 'Documentos, estados y monitoreo comunican confianza.' },
    { icon: 'fa-location-dot',  title: 'Seguimiento visible',     text: 'Trazabilidad y contexto del viaje sin saturar la pantalla.' },
    { icon: 'fa-bolt',          title: 'Solicitud simple',         text: 'Solicitar, aceptar, seguir y cerrar un viaje en pasos claros.' },
  ],
};

const FALLBACK_STATS = {
  metricsTitle: 'Métricas',
  metrics: [
    { label: 'Viajes realizados', value: 5000, suffix: '+' },
    { label: 'Conductores',       value: 800,  suffix: '+' },
    { label: 'Confianza',         value: 98,   suffix: '%' },
    { label: 'Soporte',           value: 24,   suffix: '/7' },
  ],
  features: [
    { icon: 'fa-fingerprint',          title: 'Reconocimiento y validación', text: 'Face ID diario y controles de identidad para conductores.' },
    { icon: 'fa-location-crosshairs',  title: 'Seguimiento del servicio',    text: 'Estados, recorrido y contexto del viaje para todos los roles.' },
    { icon: 'fa-triangle-exclamation', title: 'Botón SOS',                   text: 'Acciones prioritarias y visibles para incidentes o reportes.' },
    { icon: 'fa-building-shield',      title: 'Panel operativo separado',    text: 'El gestor trabaja aparte para aislar funciones críticas.' },
  ],
};

const FALLBACK_TESTIMONIALS = {
  eyebrow: 'Prueba social',
  title: 'La plataforma que inspira confianza desde la primera pantalla.',
  items: [
    { name: 'Camila R.', role: 'Pasajera frecuente', text: 'La interfaz transmite seguridad. Se entiende rápido quién conduce, por dónde va el viaje y dónde pedir ayuda.' },
    { name: 'Luis M.',   role: 'Conductor',          text: 'La app del conductor se siente más seria: disponibilidad, documentos, ingresos y soporte están más claros.' },
    { name: 'Operaciones', role: 'Gestión',           text: 'Separar la web pública del panel admin ayuda a validar el producto sin mezclar flujos.' },
  ],
};

const FALLBACK_CTA = {
  eyebrow: 'Siguiente paso', title: 'Empieza a movilizarte de forma segura hoy.',
  text: 'Regístrate y solicita tu primer viaje verificado.',
  ctaPrimary: 'Solicitar viaje', ctaSecondary: 'Contactar equipo',
};

function Metric({ value, label, suffix = '' }: { value: number; label: string; suffix?: string }) {
  return (
    <div className="bugie-kpi">
      <div className="label">{label}</div>
      <div className="value"><span>{value}</span>{suffix}</div>
    </div>
  );
}

export default function Home() {
  const ctx = useOutletContext<{ lang: string } | null>();
  const lang = ctx?.lang ?? 'es';
  const { data, error } = useLanding(lang);
  const sections = data?.sections ?? [];

  const hero         = parse(sections, 'hero',         FALLBACK_HERO);
  const features     = parse(sections, 'features',     FALLBACK_FEATURES);
  const stats        = parse(sections, 'stats',        FALLBACK_STATS);
  const testimonials = parse(sections, 'testimonials', FALLBACK_TESTIMONIALS);
  const cta          = parse(sections, 'cta',          FALLBACK_CTA);

  const marqueeItems = [...(hero.marquee ?? []), ...(hero.marquee ?? [])];
  const phone = hero.phone ?? FALLBACK_HERO.phone;

  return (
    <>
      {/* HERO */}
      <section className="bugie-hero bugie-grid-lines">
        <div className="container bugie-container">
          <div className="bugie-hero-wrap">
            <div className="bugie-hero-media" aria-hidden="true" />
            <div className="bugie-orb orb-a" aria-hidden="true" />
            <div className="bugie-orb orb-b" aria-hidden="true" />
            <div className="bugie-orb orb-c" aria-hidden="true" />
            <div className="bugie-hero-content row g-4 align-items-center">
              <div className="col-lg-7">
                <div className="bugie-hero-copy" data-reveal>
                  <div className="d-flex flex-wrap gap-2 mb-3">
                    {(hero.pills ?? []).map((pill: string) => (
                      <span key={pill} className="bugie-pill">
                        <i className="fa-solid fa-shield-halved text-bugie-accent" /> {pill}
                      </span>
                    ))}
                  </div>
                  <h1 className="bugie-h1 mb-3">
                    <span className="bugie-gradient-text">{hero.title}</span>
                  </h1>
                  <p className="bugie-lead mb-4">{hero.subtitle}</p>
                  <div className="d-flex flex-wrap gap-2 mb-4">
                    <Link className="btn btn-bugie text-white" to="/auth/login">{hero.ctaPrimary}</Link>
                    <Link className="btn btn-bugie-outline" to="/auth/registro">{hero.ctaSecondary}</Link>
                    <Link className="btn btn-outline-secondary" to="/seguridad">{hero.safetyLink ?? 'Ver seguridad'}</Link>
                  </div>
                  <div className="row g-3">
                    {(hero.stats ?? []).map((s: any) => (
                      <div key={s.label} className="col-sm-4">
                        <div className="bugie-hero-stat">
                          <strong>{s.value}</strong>
                          <span>{s.label}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="col-lg-5">
                <div className="bugie-hero-phone">
                  <div className="bugie-phone">
                    <div className="bugie-phone-notch" />
                    <div className="bugie-phone-screen d-flex flex-column gap-3">
                      <div className="d-flex justify-content-between align-items-center">
                        <div>
                          <div className="fw-bold">{phone.tripLabel}</div>
                          <div className="small text-secondary">{phone.appName}</div>
                        </div>
                        <span className="badge rounded-pill text-bg-success">{phone.badge}</span>
                      </div>
                      <div className="bugie-phone-widget">
                        <div className="d-flex align-items-center justify-content-between mb-2">
                          <div className="fw-semibold">{phone.driverLabel}</div>
                          <i className="fa-solid fa-badge-check text-success" />
                        </div>
                        <div className="small text-secondary">{phone.driverInfo}</div>
                        <div className="bugie-route-line mt-3">
                          <span className="bugie-route-dot" style={{ top: 18 }} />
                          <span className="bugie-route-dot end" />
                        </div>
                      </div>
                      <div className="row g-2">
                        <div className="col-6">
                          <div className="bugie-phone-widget h-100">
                            <div className="small text-secondary">{phone.etaLabel}</div>
                            <div className="fw-bold fs-4">{phone.etaValue}</div>
                          </div>
                        </div>
                        <div className="col-6">
                          <div className="bugie-phone-widget h-100">
                            <div className="small text-secondary">{phone.fareLabel}</div>
                            <div className="fw-bold fs-4">{phone.fareValue}</div>
                          </div>
                        </div>
                      </div>
                      <div className="bugie-phone-widget">
                        <div className="d-flex justify-content-between align-items-center">
                          <div>
                            <div className="fw-semibold">{phone.safetyLabel}</div>
                            <div className="small text-secondary">{phone.safetyDesc}</div>
                          </div>
                          <button className="btn btn-sm btn-danger rounded-pill px-3" type="button">{phone.sosLabel}</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-4 pt-2" data-reveal>
              <div className="bugie-marquee">
                <div className="bugie-marquee-track">
                  {marqueeItems.map((item: string, i: number) => (
                    <span className="bugie-marquee-item" key={`${item}-${i}`}>{item}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="bugie-section-tight">
        <div className="container bugie-container">
          <div className="bugie-section-title">
            <div className="text-uppercase small fw-bold text-bugie-accent mb-2">{features.eyebrow}</div>
            <h2 className="bugie-h2 mb-3">{features.title}</h2>
            <p className="bugie-lead mb-0">{features.text}</p>
          </div>
          <div className="row g-4 bugie-feature-grid">
            {(features.items ?? []).map((f: any) => (
              <div className="col-md-6 col-xl-3" key={f.title}>
                <div className="bugie-feature bugie-tilt">
                  <div className="bugie-mini-icon mb-3"><i className={`fa-solid ${f.icon}`} /></div>
                  <h3 className="bugie-h3 mb-2">{f.title}</h3>
                  <p className="bugie-muted mb-0">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* STATS */}
      <section className="bugie-section bugie-section-alt">
        <div className="container bugie-container">
          <div className="row g-4 align-items-stretch">
            <div className="col-lg-7">
              <div className="bugie-card h-100">
                <div className="bugie-card-body p-4 p-lg-5">
                  <div className="row g-3">
                    {(stats.features ?? []).map((f: any) => (
                      <div className="col-md-6" key={f.title}>
                        <div className="bugie-feature bugie-tilt h-100">
                          <div className="bugie-mini-icon mb-3"><i className={`fa-solid ${f.icon}`} /></div>
                          <div className="fw-bold mb-2">{f.title}</div>
                          <div className="small bugie-muted">{f.text}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="col-lg-5">
              <div className="bugie-card h-100">
                <div className="bugie-card-header">{stats.metricsTitle ?? 'Métricas'}</div>
                <div className="bugie-card-body">
                  <div className="row g-3 bugie-stats-grid">
                    {(stats.metrics ?? []).map((m: any) => (
                      <div className="col-6" key={`${lang}-${m.label}`}>
                        <Metric value={m.value} label={m.label} suffix={m.suffix} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="bugie-section-sm">
        <div className="container bugie-container">
          <div className="bugie-section-title">
            <div className="text-uppercase small fw-bold text-bugie-accent mb-2">{testimonials.eyebrow}</div>
            <h2 className="bugie-h2 mb-3">{testimonials.title}</h2>
          </div>
          <div className="row g-4">
            {(testimonials.items ?? []).map((t: any, i: number) => (
              <div className="col-lg-4" key={`${t.name}-${i}`}>
                <div className="bugie-testimonial">
                  <div className="d-flex gap-1 text-warning mb-3">
                    {Array.from({ length: t.stars ?? 5 }).map((_, i) => (
                      <i className="fa-solid fa-star" key={i} />
                    ))}
                  </div>
                  <p className="mb-4">"{t.text}"</p>
                  <div className="d-flex align-items-center gap-3">
                    <div className="bugie-avatar">{t.name[0]}</div>
                    <div>
                      <div className="fw-semibold">{t.name}</div>
                      <div className="small bugie-muted">{t.role}</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bugie-section-sm">
        <div className="container bugie-container">
          <div className="bugie-cta-panel">
            <div className="row g-4 align-items-center">
              <div className="col-lg-8">
                <div className="text-uppercase small fw-bold text-bugie-accent mb-2">{cta.eyebrow}</div>
                <h2 className="bugie-h2 mb-3">{cta.title}</h2>
                <p className="bugie-lead mb-0">{cta.text}</p>
              </div>
              <div className="col-lg-4">
                <div className="d-grid gap-2">
                  {(cta.ctaPrimaryHref ?? '/auth/login').startsWith('http')
                    ? <a className="btn btn-light rounded-pill fw-bold" href={cta.ctaPrimaryHref} target="_blank" rel="noreferrer">
                        {cta.ctaPrimaryIcon && <i className={`fa-solid ${cta.ctaPrimaryIcon} me-2`} />}{cta.ctaPrimary}
                      </a>
                    : <Link className="btn btn-light rounded-pill fw-bold" to={cta.ctaPrimaryHref ?? '/auth/login'}>
                        {cta.ctaPrimaryIcon && <i className={`fa-solid ${cta.ctaPrimaryIcon} me-2`} />}{cta.ctaPrimary}
                      </Link>}
                  {(cta.ctaSecondaryHref ?? '/contacto').startsWith('http')
                    ? <a className="btn btn-outline-light rounded-pill fw-bold" href={cta.ctaSecondaryHref} target="_blank" rel="noreferrer">
                        {cta.ctaSecondaryIcon && <i className={`fa-solid ${cta.ctaSecondaryIcon} me-2`} />}{cta.ctaSecondary}
                      </a>
                    : <Link className="btn btn-outline-light rounded-pill fw-bold" to={cta.ctaSecondaryHref ?? '/contacto'}>
                        {cta.ctaSecondaryIcon && <i className={`fa-solid ${cta.ctaSecondaryIcon} me-2`} />}{cta.ctaSecondary}
                      </Link>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}