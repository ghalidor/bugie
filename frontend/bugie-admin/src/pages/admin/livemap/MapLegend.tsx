import { useId, useState } from 'react';
import { SCENE_COLORS } from './tripScene';

/** Muestra de auto (círculo de color). */
const Car = ({ color }: { color: string }) => (
  <span className="lm-lg-car" style={{ background: color }} aria-hidden="true"><i className="fa-solid fa-car-side" /></span>
);

/** Muestra de línea (sólida, punteada o fina gris). */
const Line = ({ color, kind }: { color: string; kind: 'solid' | 'dashed' | 'thin' }) => (
  <span className={`lm-lg-line ${kind}`} style={{ color }} aria-hidden="true" />
);

/**
 * Leyenda flotante del mapa de Monitoreo: qué significa cada pin y cada línea.
 * Se puede plegar para despejar el mapa.
 */
export default function MapLegend({ defaultOpen }: { defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className={`lm-legend ${open ? 'is-open' : ''}`} data-tour="monitor-legend">
      <button type="button" className="lm-legend-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(v => !v)}>
        <i className="fa-solid fa-circle-info" aria-hidden="true" />Leyenda
        <i className={`fa-solid ${open ? 'fa-chevron-down' : 'fa-chevron-up'} ms-auto`} aria-hidden="true" />
      </button>
      {open && (
        <ul id={id} className="lm-legend-list">
          <li><Car color={SCENE_COLORS.available} />Disponible</li>
          <li><Car color={SCENE_COLORS.enRoute} />En camino al recojo</li>
          <li><Car color={SCENE_COLORS.inTrip} />En viaje (pasajero a bordo)</li>
          <li><Car color={SCENE_COLORS.deviated} />Desviado de la ruta</li>
          <li><Car color={SCENE_COLORS.sos} />SOS</li>
          <li>
            <span className="lm-lg-car lm-lg-warn" style={{ background: SCENE_COLORS.inTrip, boxShadow: `0 0 0 3px ${SCENE_COLORS.alert}` }} aria-hidden="true"><i className="fa-solid fa-car-side" /></span>
            Borde ámbar: sin señal, detenido o demorado
          </li>
          <li>
            <span className="lm-lg-car" style={{ background: SCENE_COLORS.passenger }} aria-hidden="true"><i className="fa-solid fa-person" /></span>
            Pasajero esperando en el recojo
          </li>
          <li><span className="lm-lg-flag" aria-hidden="true"><i className="fa-solid fa-flag" /></span>Destino del viaje</li>
          <li><Line color={SCENE_COLORS.inTrip} kind="solid" />Recorrido desde el recojo</li>
          <li><Line color={SCENE_COLORS.inTrip} kind="dashed" />Por recorrer</li>
          <li><Line color={SCENE_COLORS.traveled} kind="thin" />Ya recorrido camino al recojo</li>
          <li><span className="lm-lg-cluster" aria-hidden="true">5</span>Grupo: acerca o tócalo para separarlo</li>
        </ul>
      )}
    </div>
  );
}
