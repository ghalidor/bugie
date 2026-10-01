export default function PageHeader({ title, subtitle, actions, icon }: { title: string; subtitle?: string; actions?: React.ReactNode; icon?: string }) {
  return (
    <div className="bugie-shell-hero mb-3">
      <div className="d-flex flex-wrap align-items-start justify-content-between gap-3">
        <div className="d-flex gap-3 align-items-start">
          {icon ? <div className="bugie-mini-icon" style={{ background: 'rgba(255,255,255,.12)', color: 'white', borderColor: 'rgba(255,255,255,.15)' }}><i className={icon} /></div> : null}
          <div>
            <div className="subtitle small text-uppercase fw-bold mb-1">Vista principal</div>
            <div className="h3 mb-2 fw-bold" style={{ letterSpacing: '-.04em' }}>{title}</div>
            {subtitle ? <div className="description mb-0">{subtitle}</div> : null}
          </div>
        </div>
        {actions ? <div className="d-flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
