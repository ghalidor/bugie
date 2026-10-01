interface Props {
  title:     string;
  subtitle?: string;
  actions?:  React.ReactNode;
  icon?:     string;   // ej: 'fa-solid fa-car'
}

export default function PageHeader({ title, subtitle, actions, icon }: Props) {
  return (
    <div className="bugie-shell-hero mb-3">
      <div className="d-flex flex-wrap align-items-start justify-content-between gap-3">
        <div className="d-flex align-items-start gap-3">
          {icon && (
            <div
              className="d-flex align-items-center justify-content-center flex-shrink-0"
              style={{
                width: 48, height: 48, borderRadius: 12,
                background: 'var(--bugie-primary)22',
                color: 'var(--bugie-primary)',
                fontSize: '1.3rem',
                marginTop: 4,
              }}
            >
              <i className={icon} />
            </div>
          )}
          <div>
            <div className="subtitle small text-uppercase fw-bold mb-1">Panel de operación</div>
            <div className="h3 mb-2 fw-bold" style={{ letterSpacing: '-.04em' }}>{title}</div>
            {subtitle ? <div className="description">{subtitle}</div> : null}
          </div>
        </div>
        {actions ? <div className="d-flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}