import { COMPLAINTS } from '../../content/landing/complaints';
import { companyLogoUrl, useCompany } from '../../hooks/useCompany';
import { fillCity, useCity } from '../../hooks/useCity';

/** Cabecera de la Hoja de Reclamación: logo, fecha, razón social, RUC y dirección.
    Los datos salen de "Datos de la empresa"; si no cargan, el texto de siempre. */
export default function ComplaintSheetHeader({ date, number }: { date: string; number?: string }) {
  const company = useCompany();
  const city = useCity();
  const logo = companyLogoUrl(company?.logoUrl);
  const name = company?.legalName || COMPLAINTS.company;

  return (
    <div className="row align-items-center mb-4">
      <div className="col-md-3 text-center mb-3 mb-md-0">
        {logo ? (
          <img src={logo} alt={name} className="bugie-complaints-logo bugie-complaints-logo-img mx-auto d-block" />
        ) : (
          <div className="bugie-brand bugie-complaints-logo mx-auto d-flex align-items-center justify-content-center">
            {COMPLAINTS.brand}
          </div>
        )}
      </div>
      <div className="col-md-9">
        <h1 className="bugie-h2 mb-1">{COMPLAINTS.title}</h1>
        <p className="fw-semibold mb-2">
          {COMPLAINTS.sheetTitle}{' '}
          <span className={number ? '' : 'bugie-muted small fw-normal'}>
            {number ? `N° ${number}` : `(${COMPLAINTS.sheetNumberPending})`}
          </span>
        </p>
        <p className="small bugie-muted mb-1">{COMPLAINTS.dateLabel}: {date}</p>
        <p className="small mb-0"><strong>{name}</strong></p>
        {company?.ruc && <p className="small bugie-muted mb-0">{COMPLAINTS.rucLabel}: {company.ruc}</p>}
        <p className="small bugie-muted mb-0">{company?.address || fillCity(COMPLAINTS.city, city)}</p>
      </div>
    </div>
  );
}
