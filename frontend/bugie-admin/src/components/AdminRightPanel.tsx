function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bugie-card mb-3">
      <div className="bugie-card-header">{title}</div>
      <div className="bugie-card-body">{children}</div>
    </div>
  );
}

export default function AdminRightPanel() {
  return (
    <>
      <Card title="Estado operativo">
        <div className="d-grid gap-2">
          <div className="bugie-list-item">
            <div className="bugie-mini-icon"><i className="fa-solid fa-tower-broadcast" /></div>
            <div>
              <div className="fw-semibold">Monitoreo activo</div>
              <div className="small bugie-muted">Seguimiento de viajes, unidades y alertas.</div>
            </div>
          </div>
          <div className="bugie-list-item">
            <div className="bugie-mini-icon"><i className="fa-solid fa-shield-heart" /></div>
            <div>
              <div className="fw-semibold">Control de seguridad</div>
              <div className="small bugie-muted">Gestión visible de incidentes, verificación y SOS.</div>
            </div>
          </div>
        </div>
      </Card>
      <Card title="Pendientes">
        <div className="d-grid gap-2 small">
          {['Aprobar conductores', 'Revisar pagos observados', 'Atender incidencias SOS'].map((item) => (
            <div className="d-flex align-items-center gap-2" key={item}>
              <i className="fa-solid fa-circle-check text-success" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}
