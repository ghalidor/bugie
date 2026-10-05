import { HOME_LINKS, type CtaContent } from '../../../content/landing/home';
import Eyebrow from '../Eyebrow';
import SmartLink from '../SmartLink';

/** Panel final con los dos botones de acción. Enlace e ícono de cada botón
    pueden venir del gestor; si no, se usan las rutas por defecto. */
export default function CtaSection({ cta }: { cta: CtaContent }) {
  return (
    <section className="bugie-section-sm">
      <div className="container bugie-container">
        <div className="bugie-cta-panel">
          <div className="row g-4 align-items-center">
            <div className="col-lg-8">
              <Eyebrow>{cta.eyebrow}</Eyebrow>
              <h2 className="bugie-h2 mb-3">{cta.title}</h2>
              <p className="bugie-lead mb-0">{cta.text}</p>
            </div>
            <div className="col-lg-4">
              <div className="d-grid gap-2">
                <CtaButton className="btn btn-light rounded-pill fw-bold"
                  href={cta.ctaPrimaryHref ?? HOME_LINKS.ctaPrimary}
                  icon={cta.ctaPrimaryIcon} label={cta.ctaPrimary} />
                <CtaButton className="btn btn-outline-light rounded-pill fw-bold"
                  href={cta.ctaSecondaryHref ?? HOME_LINKS.ctaSecondary}
                  icon={cta.ctaSecondaryIcon} label={cta.ctaSecondary} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CtaButton({ className, href, icon, label }: { className: string; href: string; icon?: string; label: string }) {
  return (
    <SmartLink className={className} href={href}>
      {icon && <i className={`fa-solid ${icon} me-2`} />}{label}
    </SmartLink>
  );
}
