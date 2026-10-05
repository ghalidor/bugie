import { ReactNode } from 'react';
import { usePlatformConfig } from '../hooks/usePlatformConfig';
import { SectionCard } from './ui';

/* ──────────────────────────────────────────────────────────────────────────
   Panel derecho de ayuda. Solo se muestra en pantallas grandes (>= 1400 px,
   ver .bx-aside en app.scss) y solo en las paginas donde aporta algo. En las
   pantallas con mapa (pedir viaje, seguimiento) no se muestra para que el
   mapa tenga todo el ancho.
   ────────────────────────────────────────────────────────────────────────── */

type Tip = [icon: string, title: string, desc?: string];

function Tips({ items }: { items: Tip[] }) {
  return (
    <ul className="bx-tip-list">
      {items.map(([icon, title, desc]) => (
        <li key={title}>
          <i className={`fa-solid ${icon}`} aria-hidden="true" />
          <div style={{ minWidth: 0 }}>
            <div className="t">{title}</div>
            {desc && <div className="d">{desc}</div>}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** true si la ruta tiene panel derecho. */
export function hasRightPanel(path: string): boolean {
  return /\/app\/pasajero\/(inicio|pagos|sos|perfil|verificacion)$/.test(path)
      || /\/app\/conductor\/(inicio|viajes|ganancias|documentos|sos)$/.test(path);
}

export default function RightPanel({ path }: { path: string }) {
  // El tiempo objetivo del SOS sale de la configuracion del admin.
  const { sosResponseMin } = usePlatformConfig();
  const sosTexto = `Respuesta en menos de ${sosResponseMin} ${sosResponseMin === 1 ? 'minuto' : 'minutos'}`;

  const isDriver = path.startsWith('/app/conductor');
  let content: ReactNode = null;

  if (!isDriver) {
    if (path.endsWith('/sos')) {
      content = (
        <SectionCard title="Cómo funciona el SOS" icon="fa-circle-question">
          <Tips items={[
            ['fa-1', 'Pulsa el botón rojo', 'Solo durante un viaje activo.'],
            ['fa-2', 'Llega tu ubicación', 'El centro de monitoreo la recibe al instante.'],
            ['fa-3', sosTexto],
            ['fa-4', 'Atención', 'Los administradores reciben la alerta y atienden el caso; tu contacto de emergencia recibe un correo.'],
          ]} />
        </SectionCard>
      );
    } else if (path.endsWith('/pagos')) {
      content = (
        <SectionCard title="Sobre tus pagos" icon="fa-circle-info">
          <Tips items={[
            ['fa-receipt', 'Registro automático', 'Cada pago se registra al completar el viaje.'],
            ['fa-money-bill-wave', 'Efectivo', 'Pagas al llegar a tu destino.'],
            ['fa-mobile-screen', 'Yape o Plin', 'Transferencia digital inmediata.'],
          ]} />
        </SectionCard>
      );
    } else if (path.endsWith('/verificacion')) {
      content = (
        <SectionCard title="Consejos para tu DNI" icon="fa-lightbulb">
          <Tips items={[
            ['fa-sun', 'Buena luz', 'Sin reflejos ni sombras sobre el documento.'],
            ['fa-crop-simple', 'Documento completo', 'Que se vean las 4 esquinas.'],
            ['fa-file-image', 'Formatos', 'JPG, PNG, WEBP o PDF de hasta 10 MB.'],
          ]} />
        </SectionCard>
      );
    } else {
      content = (
        <SectionCard title="Seguridad Bugie" icon="fa-shield-halved">
          <Tips items={[
            ['fa-id-card', 'Conductores verificados', 'Documentos y antecedentes revisados.'],
            ['fa-fingerprint', 'Face ID diario', 'Identidad confirmada cada jornada.'],
            ['fa-location-dot', 'Seguimiento en tiempo real', 'Tu ruta es monitoreada activamente.'],
            ['fa-triangle-exclamation', 'Botón SOS', sosTexto],
          ]} />
        </SectionCard>
      );
    }
  } else if (path.endsWith('/viajes')) {
    content = (
      <SectionCard title="Tu historial" icon="fa-circle-info">
        <Tips items={[
          ['fa-route', 'Recorrido real', 'Abre un viaje para ver su recorrido en el mapa.'],
          ['fa-flag', 'Incidencias', 'Reporta si algo salió mal en un viaje.'],
        ]} />
      </SectionCard>
    );
  } else if (path.endsWith('/ganancias')) {
    content = (
      <SectionCard title="Cómo cobras" icon="fa-circle-info">
        <Tips items={[
          ['fa-hand-holding-dollar', 'Cobras en mano', 'El pasajero te paga en efectivo, Yape o Plin.'],
          ['fa-receipt', 'Comisión Bugie', 'Por cada viaje se genera una comisión que pagas a Bugie.'],
          ['fa-gift', 'Bonos y premios', 'Te los paga Bugie y los ves en «Pagos recibidos».'],
        ]} />
      </SectionCard>
    );
  } else if (path.endsWith('/documentos')) {
    content = (
      <SectionCard title="Antes de subir" icon="fa-lightbulb">
        <Tips items={[
          ['fa-calendar-day', 'Fecha de caducidad', 'Licencia, SOAT y revisión técnica la necesitan.'],
          ['fa-file-image', 'Formatos', 'JPG, PNG, WEBP o PDF de hasta 10 MB.'],
          ['fa-clock', 'Revisión', 'El equipo de Bugie revisa en 24 a 48 horas.'],
        ]} />
      </SectionCard>
    );
  } else if (path.endsWith('/sos')) {
    content = (
      <SectionCard title="Cómo funciona el SOS" icon="fa-circle-question">
        <Tips items={[
          ['fa-1', 'Activa la alerta', 'Durante un viaje activo.'],
          ['fa-2', 'Llega tu ubicación', 'El centro de monitoreo la recibe al instante.'],
          ['fa-3', sosTexto],
        ]} />
      </SectionCard>
    );
  } else {
    content = (
      <SectionCard title="Tu operación" icon="fa-circle-info">
        <Tips items={[
          ['fa-mobile-screen', 'Usa la app Bugie', 'Para conectarte y recibir solicitudes.'],
          ['fa-id-card', 'Documentos al día', 'Evita que tu cuenta pase a revisión.'],
          ['fa-wallet', 'Revisa tu billetera', 'Mantente al día con la comisión.'],
        ]} />
      </SectionCard>
    );
  }

  return <>{content}<SupportCard /></>;
}

/** Contacto de soporte configurado en el admin. No se muestra si no hay ninguno. */
function SupportCard() {
  const { supportEmail, supportPhone } = usePlatformConfig();
  if (!supportEmail && !supportPhone) return null;
  const tel = supportPhone.replace(/[^\d+]/g, '');
  return (
    <SectionCard title="¿Necesitas ayuda?" icon="fa-headset" className="mt-3">
      <ul className="bx-tip-list">
        {supportPhone && (
          <li>
            <i className="fa-solid fa-phone" aria-hidden="true" />
            <div style={{ minWidth: 0 }}>
              <div className="t"><a href={`tel:${tel}`}>{supportPhone}</a></div>
              <div className="d">Llámanos</div>
            </div>
          </li>
        )}
        {supportEmail && (
          <li>
            <i className="fa-solid fa-envelope" aria-hidden="true" />
            <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
              <div className="t"><a href={`mailto:${supportEmail}`}>{supportEmail}</a></div>
              <div className="d">Escríbenos</div>
            </div>
          </li>
        )}
      </ul>
    </SectionCard>
  );
}
