import { useLocation } from 'react-router-dom';
import { SEO, ROUTE_META } from '../../content/landing/seo';
import { SITE_NAME, OG_IMAGE, siteUrl } from '../../content/landing/site';
import { fillCity, useCity } from '../../hooks/useCity';
import { companyLogoUrl, useCompany, DEFAULT_LEGAL_NAME } from '../../hooks/useCompany';
import { useDocumentMeta, useJsonLd } from './useDocumentMeta';

/** SEO de las páginas bajo PublicLayout: elige título/descripción según la
    ruta (content/landing/seo.ts) y publica el JSON-LD de la empresa con los
    datos de /landing/company y la ciudad configurada. No pinta nada. */
export default function LandingSeo() {
  const { pathname } = useLocation();
  const city = useCity();
  const company = useCompany();

  const path = pathname.replace(/\/+$/, '') || '/';
  const meta = fillCity(SEO[ROUTE_META[path] ?? 'home'], city);
  useDocumentMeta({ ...meta, path: ROUTE_META[path] ? path : '/' });

  useJsonLd('bugie-org-jsonld', buildOrganization(company, city));
  return null;
}

type Company = ReturnType<typeof useCompany>;

/** LocalBusiness con razón social, contacto y dirección. Solo incluye los
    campos que de verdad están configurados. */
function buildOrganization(company: Company, city: string | null): object {
  const logo = companyLogoUrl(company?.logoUrl) || siteUrl(OG_IMAGE);
  const address: Record<string, string> = { '@type': 'PostalAddress', addressCountry: 'PE' };
  if (company?.address) address.streetAddress = company.address;
  if (city) address.addressLocality = city;

  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: SITE_NAME,
    legalName: company?.legalName || DEFAULT_LEGAL_NAME,
    url: siteUrl('/'),
    logo,
    image: logo,
    address,
  };
  if (company?.ruc) data.taxID = company.ruc;
  if (company?.supportPhone) data.telephone = company.supportPhone;
  if (company?.supportEmail) data.email = company.supportEmail;
  if (city) data.areaServed = { '@type': 'City', name: city };
  return data;
}
