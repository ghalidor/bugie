import { Link } from 'react-router-dom';

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bugie-card mb-3">
      <div className="bugie-card-header">{title}</div>
      <div className="bugie-card-body">{children}</div>
    </div>
  );
}

function CheckItem({ text, done = true }: { text: string; done?: boolean }) {
  return (
    <div className="d-flex align-items-center gap-2 small">
      <i className={`fa-solid fa-circle-${done ? 'check text-success' : 'xmark text-secondary'}`} />
      <span>{text}</span>
    </div>
  );
}

export default function RightPanel({ path }: { path: string }) {
  const isDriver = path.startsWith('/app/conductor');

  // ── Pasajero ────────────────────────────────────────────────────────────────
  if (!isDriver) {
    if (path.includes('/solicitar')) {
      return (
        <>
          <Card title="Cómo solicitar un viaje">
            <div className="d-grid gap-2 small bugie-muted">
              <CheckItem text="Escribe tu dirección de origen" />
              <CheckItem text="Escribe tu destino" />
              <CheckItem text="Elige cómo vas a pagar" />
              <CheckItem text="Pulsa Solicitar y espera al conductor" />
            </div>
          </Card>
          <Card title="Métodos de pago">
            <div className="d-grid gap-2 small">
              {[
                ['fa-money-bill-wave', 'Efectivo', 'Pagas al llegar al destino'],
                ['fa-mobile-screen',  'Yape',     'Transferencia digital inmediata'],
                ['fa-mobile-screen',  'Plin',     'Transferencia digital inmediata'],
              ].map(([icon, name, desc]) => (
                <div key={name} className="d-flex gap-2 align-items-start">
                  <i className={`fa-solid ${icon} text-bugie-accent mt-1`} style={{ width: 16 }} />
                  <div>
                    <div className="fw-semibold">{name}</div>
                    <div className="bugie-muted">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      );
    }

    if (path.includes('/seguimiento')) {
      return (
        <Card title="Tu viaje en tiempo real">
          <div className="d-grid gap-2 small bugie-muted">
            <CheckItem text="Conductor asignado y en camino" />
            <CheckItem text="Ruta visible en el mapa" />
            <CheckItem text="Botón SOS disponible en todo momento" />
            <CheckItem text="Puedes cancelar antes de que inicie" />
          </div>
        </Card>
      );
    }

    if (path.includes('/sos')) {
      return (
        <Card title="Cómo funciona el SOS">
          <div className="d-grid gap-2 small bugie-muted">
            <div className="d-flex gap-2"><i className="fa-solid fa-1 text-bugie-accent mt-1" style={{ width: 16 }} /><span>Pulsa el botón rojo SOS</span></div>
            <div className="d-flex gap-2"><i className="fa-solid fa-2 text-bugie-accent mt-1" style={{ width: 16 }} /><span>El centro de monitoreo recibe tu ubicación</span></div>
            <div className="d-flex gap-2"><i className="fa-solid fa-3 text-bugie-accent mt-1" style={{ width: 16 }} /><span>Respuesta en menos de 2 minutos</span></div>
            <div className="d-flex gap-2"><i className="fa-solid fa-4 text-bugie-accent mt-1" style={{ width: 16 }} /><span>Policía Nacional es notificada si es necesario</span></div>
          </div>
        </Card>
      );
    }

    if (path.includes('/pagos')) {
      return (
        <Card title="Sobre tus pagos">
          <div className="small bugie-muted d-grid gap-2">
            <span>Los pagos se registran automáticamente al completar cada viaje.</span>
            <span>Puedes ver el historial completo y el monto de cada transacción aquí.</span>
          </div>
        </Card>
      );
    }

    // Default pasajero
    return (
      <Card title="Seguridad Bugie">
        <div className="d-grid gap-2 small">
          {[
            ['fa-id-card',             'Conductores verificados',  'Documentos y antecedentes revisados'],
            ['fa-fingerprint',         'Face ID diario',           'Identidad confirmada cada jornada'],
            ['fa-location-dot',        'Tracking en tiempo real',  'Tu ruta es monitoreada activamente'],
            ['fa-triangle-exclamation','Botón SOS',                'Respuesta en menos de 2 minutos'],
          ].map(([icon, title, desc]) => (
            <div key={title} className="d-flex gap-2 align-items-start">
              <i className={`fa-solid ${icon} text-bugie-accent mt-1`} style={{ width: 16 }} />
              <div>
                <div className="fw-semibold">{title}</div>
                <div className="bugie-muted">{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  // ── Conductor ───────────────────────────────────────────────────────────────
  if (path.includes('/en-linea')) {
    return (
      <Card title="Antes de conectarte">
        <div className="d-grid gap-2 small bugie-muted">
          <CheckItem text="Verifica que tu vehículo activo es correcto" />
          <CheckItem text="Activa la ubicación del dispositivo" />
          <CheckItem text="Revisa que tienes batería suficiente" />
        </div>
      </Card>
    );
  }

  if (path.includes('/solicitudes')) {
    return (
      <Card title="Cómo aceptar un viaje">
        <div className="d-grid gap-2 small bugie-muted">
          <CheckItem text="Revisa origen y destino antes de aceptar" />
          <CheckItem text="Verifica el método de pago del pasajero" />
          <CheckItem text="Acepta solo si puedes llegar al origen" />
        </div>
      </Card>
    );
  }

  if (path.includes('/viaje')) {
    return (
      <Card title="Durante el viaje">
        <div className="d-grid gap-2 small bugie-muted">
          <CheckItem text="Pulsa 'Pasajero a bordo' al recogerlo" />
          <CheckItem text="Sigue la ruta del mapa" />
          <CheckItem text="Pulsa 'Completar' al llegar al destino" />
          <CheckItem text="Botón SOS disponible en todo momento" />
        </div>
      </Card>
    );
  }

  // Default conductor
  return (
    <Card title="Tu estado">
      <div className="d-grid gap-2 small bugie-muted">
        <CheckItem text="Conectarte para recibir solicitudes" />
        <CheckItem text="Mantener documentos al día" />
        <CheckItem text="Revisar ganancias diariamente" />
      </div>
    </Card>
  );
}
