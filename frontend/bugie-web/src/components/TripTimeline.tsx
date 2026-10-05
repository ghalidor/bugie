/**
 * Linea de tiempo del viaje o envio, armada con el estado que ya trae el
 * seguimiento (no consulta nada). Barra que avanza y check animado al
 * completar cada paso.
 *
 * Estados del viaje: 1 pendiente, 7 negociando, 2 aceptado, 3 en curso,
 * 4 completado, 6 SOS activo (se muestra como "en curso").
 */
interface TripTimelineProps {
  status: number;
  delivery?: boolean;
  /** El conductor aviso que llego al punto de recojo. */
  arrived?: boolean;
  /** Envio: paquete recogido y verificado. */
  pickedUp?: boolean;
  /** Envio: entrega confirmada. */
  delivered?: boolean;
  /** Programado con conductor asignado que aun no sale. */
  scheduledWaiting?: boolean;
}

export default function TripTimeline({ status, delivery, arrived, pickedUp, delivered, scheduledWaiting }: TripTimelineProps) {
  const steps = delivery
    ? ['Buscando conductor', scheduledWaiting ? 'Conductor asignado' : 'En camino a recoger', 'Llegó', 'Recogido', 'Entregado']
    : ['Buscando conductor', scheduledWaiting ? 'Conductor asignado' : 'Conductor en camino', 'Llegó', 'En viaje', 'Completado'];

  // Etapa actual (las anteriores quedan completas). steps.length = todo completo.
  let current = 0;                                     // 1 / 7: buscando
  if (status === 2) current = !arrived ? 1 : 2;        // en camino / llegó
  if (delivery && pickedUp) current = 3;               // envío: recogido (yendo a entregar)
  if (status === 3 || status === 6) current = 3;       // en viaje / recogido
  if (status === 4 || (delivery && delivered)) current = steps.length;

  const last = steps.length - 1;
  const progress = Math.min(current, last) / last;

  return (
    <div className="bx-tl" style={{ ['--tl-p' as string]: progress, ['--tl-n' as string]: steps.length }}>
      <div className="bx-tl-track" aria-hidden="true"><span className="bx-tl-fill" /></div>
      <ol className="bx-tl-steps" aria-label={delivery ? 'Progreso del envío' : 'Progreso del viaje'}>
        {steps.map((label, i) => {
          const state = i < current ? 'done' : i === current ? 'current' : 'todo';
          return (
            <li key={i} className={`bx-tl-step is-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
              <span className="bx-tl-dot" aria-hidden="true">
                {state === 'done' && <i className="fa-solid fa-check" />}
              </span>
              <span className="bx-tl-label">
                {label}
                <span className="visually-hidden">
                  {state === 'done' ? ' (completado)' : state === 'current' ? ' (en curso)' : ' (pendiente)'}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
