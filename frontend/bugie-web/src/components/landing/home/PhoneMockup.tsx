import type { PhoneContent } from '../../../content/landing/home';

/** Teléfono de ejemplo de la portada con un viaje activo. Es decorativo. */
export default function PhoneMockup({ phone }: { phone: PhoneContent }) {
  return (
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
            <PhoneValue label={phone.etaLabel}  value={phone.etaValue} />
            <PhoneValue label={phone.fareLabel} value={phone.fareValue} />
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
  );
}

/** Recuadro con un dato del viaje (tiempo estimado, tarifa). */
function PhoneValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="col-6">
      <div className="bugie-phone-widget h-100">
        <div className="small text-secondary">{label}</div>
        <div className="fw-bold fs-4">{value}</div>
      </div>
    </div>
  );
}
