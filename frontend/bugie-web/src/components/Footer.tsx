import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { parse } from '../hooks/useLanding';

const LANDING_API = `${import.meta.env.VITE_API_LANDING}/landing`;

const FALLBACK = {
  tagline: 'Tu App de Transporte Seguro',
  description: 'Plataforma de transporte seguro con foco en identidad, trazabilidad y soporte en Trujillo, Perú.',
  links: [
    { label: 'Empresa',              href: '/empresa' },
    { label: 'Seguridad',            href: '/seguridad' },
    { label: 'Comunidad',            href: '/comunidad' },
    { label: 'Gana con Bugie',       href: '/gana-con-bugie' },
    { label: 'Contacto',             href: '/contacto' },
    { label: 'Preguntas frecuentes', href: '/faq' },
  ],
  productLinks: [
    { label: 'Solicitar viaje', href: '/auth/login' },
    { label: 'Crear cuenta',    href: '/auth/registro' },
    { label: 'Panel admin',     href: 'http://localhost:5174', external: true },
  ],
  contact: { email: 'hola@bugie.pe', city: 'Trujillo, Perú', support: 'Soporte y alianzas' },
  social: [
    { name: 'instagram',   url: '#' },
    { name: 'facebook-f',  url: '#' },
    { name: 'linkedin-in', url: '#' },
  ],
  companyCol: 'Empresa', productCol: 'Producto', contactCol: 'Contacto',
  legalCol:  'Legal',
  legalLinks: {
    terms:       'Términos y condiciones',
    privacy:     'Política de privacidad',
    complaints:  'Libro de reclamaciones',
  },
  legal:    `© ${new Date().getFullYear()} Bugie. Todos los derechos reservados.`,
  legalSub: 'InteliaDevs S.A.C. · Trujillo, Perú',
};

export default function Footer() {
  const [d, setD] = useState(FALLBACK);

  useEffect(() => {
    fetch(`${LANDING_API}?lang=es`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.sections) setD(parse(data.sections, 'footer', FALLBACK));
      })
      .catch(() => {});
  }, []);

  const legalLinks = d.legalLinks ?? FALLBACK.legalLinks;

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
              {(d.social ?? []).map((s: any) => (
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

          {/* Empresa */}
          <div className="col-6 col-md-3 col-lg-2">
            <div className="fw-bold mb-3">{d.companyCol}</div>
            <div className="d-flex flex-column gap-2 small">
              {(d.links ?? []).map((l: any) => (
                <Link key={l.href} to={l.href}>{l.label}</Link>
              ))}
            </div>
          </div>

          {/* Producto */}
          <div className="col-6 col-md-3 col-lg-2">
            <div className="fw-bold mb-3">{d.productCol}</div>
            <div className="d-flex flex-column gap-2 small">
              {(d.productLinks ?? []).map((l: any) =>
                l.external
                  ? <a key={l.href} href={l.href} target="_blank" rel="noreferrer">{l.label}</a>
                  : <Link key={l.href} to={l.href}>{l.label}</Link>
              )}
            </div>
          </div>

          {/* Legal */}
          <div className="col-6 col-md-3 col-lg-2">
            <div className="fw-bold mb-3">{d.legalCol ?? 'Legal'}</div>
            <div className="d-flex flex-column gap-2 small">
              <Link to="/terminos">{legalLinks.terms}</Link>
              <Link to="/privacidad">{legalLinks.privacy}</Link>
              <a
                href="/libro-reclamaciones"
                target="_blank"
                rel="noopener noreferrer"
                className="d-inline-flex align-items-center gap-2"
              >
                <i className="fa-solid fa-book" style={{ color: '#dc3545' }} />
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
        <div
          className="d-flex flex-column flex-md-row justify-content-between gap-2 mt-4 pt-3 border-top small bugie-muted"
          style={{ borderColor: 'var(--bugie-border)' }}
        >
          <div>{d.legal}</div>
          <div>{d.legalSub}</div>
        </div>
      </div>
    </footer>
  );
}