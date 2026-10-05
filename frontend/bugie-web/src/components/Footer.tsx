import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { parse } from '../hooks/useLanding';
import { LANDING_API } from '../content/landing/api';
import { FOOTER, FOOTER_LEGAL_HREFS, type FooterLink } from '../content/landing/footer';
import SmartLink from './landing/SmartLink';
import { DEFAULT_LEGAL_NAME, useCompany } from '../hooks/useCompany';
import { fillCity, useCity } from '../hooks/useCity';

/** Pie de página de la landing. Textos en src/content/landing/footer.ts;
    se reemplazan por la sección 'footer' del gestor si existe. */
export default function Footer() {
  const [raw, setD] = useState(FOOTER);
  // Los textos llevan {city}/{cityCountry}: se rellenan con la ciudad configurada.
  const city = useCity();
  const d = fillCity(raw, city);

  useEffect(() => {
    fetch(`${LANDING_API}?lang=es`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.sections) setD(parse(data.sections, 'footer', FOOTER));
      })
      .catch(() => {});
  }, []);

  const legalLinks = d.legalLinks ?? FOOTER.legalLinks;

  // Razón social desde "Datos de la empresa". Si no carga, queda el texto de siempre.
  const company = useCompany();
  const legalSub = company?.legalName
    ? (d.legalSub ?? '').split(DEFAULT_LEGAL_NAME).join(company.legalName)
    : d.legalSub;

  return (
    <footer className="bugie-footer">
      <div className="container bugie-container">
        <div className="row g-4 align-items-start">

          {/* Marca */}
          <div className="col-lg-4">
            <div className="d-flex align-items-center gap-3 mb-3">
              <div className="bugie-brand fs-5">Bugie</div>
            </div>
            <p className="bugie-muted mb-3">{d.description}</p>
            <div className="d-flex gap-2">
              {(d.social ?? []).map(s => (
                <a
                  className="btn btn-sm btn-bugie-outline bugie-icon-btn"
                  href={s.url ?? '#'}
                  key={s.name}
                  target={s.url && s.url !== '#' ? '_blank' : undefined}
                  rel="noreferrer"
                  aria-label={s.name}
                >
                  <i className={`fa-brands fa-${s.name}`} />
                </a>
              ))}
            </div>
          </div>

          <FooterColumn title={d.companyCol} links={d.links} />
          <FooterColumn title={d.productCol} links={d.productLinks} />

          {/* Legal */}
          <div className="col-6 col-md-3 col-lg-2">
            <div className="fw-bold mb-3">{d.legalCol ?? FOOTER.legalCol}</div>
            <div className="d-flex flex-column gap-2 small">
              <Link to={FOOTER_LEGAL_HREFS.terms}>{legalLinks.terms}</Link>
              <Link to={FOOTER_LEGAL_HREFS.privacy}>{legalLinks.privacy}</Link>
              <a
                href={FOOTER_LEGAL_HREFS.complaints}
                target="_blank"
                rel="noopener noreferrer"
                className="d-inline-flex align-items-center gap-2"
              >
                <i className="fa-solid fa-book bugie-complaints-icon" />
                <span>{legalLinks.complaints}</span>
              </a>
            </div>
          </div>

          {/* Contacto */}
          <div className="col-6 col-md-3 col-lg-2">
            <div className="fw-bold mb-3">{d.contactCol}</div>
            <div className="d-flex flex-column gap-2 small bugie-muted">
              <span>{d.contact?.city}</span>
              <span>{d.contact?.email}</span>
              <span>{d.contact?.support}</span>
            </div>
          </div>

        </div>

        {/* Línea inferior */}
        <div className="d-flex flex-column flex-md-row justify-content-between gap-2 mt-4 pt-3 border-top small bugie-muted">
          <div>{d.legal}</div>
          <div>{legalSub}</div>
        </div>
      </div>
    </footer>
  );
}

/** Columna de enlaces (Empresa, Producto). Los marcados como `external`
    se abren en pestaña nueva. */
function FooterColumn({ title, links }: { title: string; links?: FooterLink[] }) {
  return (
    <div className="col-6 col-md-3 col-lg-2">
      <div className="fw-bold mb-3">{title}</div>
      <div className="d-flex flex-column gap-2 small">
        {(links ?? []).map(l => (
          <SmartLink key={l.href} href={l.href} external={!!l.external}>{l.label}</SmartLink>
        ))}
      </div>
    </div>
  );
}
