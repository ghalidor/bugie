import { Link } from 'react-router-dom';
import { useLandingContent } from '../../hooks/useLandingContent';
import { EARN, EARN_STATIC } from '../../content/landing/earn';
import LandingPage from '../../components/landing/LandingPage';
import Eyebrow from '../../components/landing/Eyebrow';

/** /gana-con-bugie. Textos en src/content/landing/earn.ts (sección 'earn'). */
export default function EarnWithBugie() {
  const { section } = useLandingContent();
  const d = section('earn', EARN);

  return (
    <LandingPage>

      {/* Hero */}
      <div className="bugie-shell-card mb-4" data-reveal>
        <div className="row g-4 align-items-center">
          <div className="col-lg-7">
            <Eyebrow>{d.eyebrow}</Eyebrow>
            <h1 className="bugie-h1 mb-3">
              <span className="bugie-gradient-text">{d.title}</span>
            </h1>
            <p className="bugie-lead mb-4">{d.subtitle}</p>
            <div className="d-flex flex-wrap gap-2">
              <Link className="btn btn-bugie text-white" to={EARN_STATIC.registerHref}>
                <i className="fa-solid fa-car me-2" />{d.ctaPrimary}
              </Link>
              <Link className="btn btn-bugie-outline" to={EARN_STATIC.loginHref}>
                {d.ctaSecondary}
              </Link>
            </div>
          </div>
          <div className="col-lg-5 text-center">
            <div className="bugie-earn-badge d-inline-flex align-items-center justify-content-center">
              <i className="fa-solid fa-coins" />
            </div>
          </div>
        </div>
      </div>

      {/* Beneficios */}
      <h2 className="bugie-h3 mb-3" data-reveal>{EARN_STATIC.benefitsTitle}</h2>
      <div className="row g-3 mb-5">
        {(d.benefits ?? []).map((b, i) => (
          <div key={i} className="col-md-6 col-lg-4" data-reveal>
            <div className="bugie-card h-100 p-3">
              <div className="bugie-mini-icon bugie-benefit-icon mb-3">
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
              {(d.requirements ?? []).map((r, i) => (
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
              {(d.steps ?? []).map(s => (
                <div key={s.num} className="d-flex gap-3 align-items-start">
                  <div className="bugie-step-num d-flex align-items-center justify-content-center fw-bold">
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
        <Link className="btn btn-bugie text-white btn-lg px-4" to={EARN_STATIC.registerHref}>
          <i className="fa-solid fa-arrow-right me-2" />
          {d.finalCtaButton}
        </Link>
      </div>

    </LandingPage>
  );
}
