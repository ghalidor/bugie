import { EmptyState, StatusBadge, Tone } from '../../../components/ui';
import { OnlineDriver, VehicleBulk } from './types';

/** Estado visible de un conductor en el monitoreo. */
export function driverState(d: OnlineDriver, inSos: boolean, deviated: boolean): { label: string; tone: Tone; icon: string } {
  if (inSos)           return { label: 'SOS',        tone: 'bad',     icon: 'fa-triangle-exclamation' };
  if (deviated)        return { label: 'Desviado',   tone: 'bad',     icon: 'fa-route' };
  if (d.hasActiveTrip) return { label: 'En viaje',   tone: 'primary', icon: 'fa-car' };
  return                      { label: 'Disponible', tone: 'ok',      icon: 'fa-circle-check' };
}

interface Props {
  /** Ya filtrados por búsqueda y ordenados (SOS → desviado → en viaje → disponible). */
  drivers: OnlineDriver[];
  search: string;
  vehicleByUser: Record<string, VehicleBulk>;
  deviatedByUserId: Record<string, boolean>;
  sosDriverUserIds: Set<string>;
  selectedId: string | null;
  onClick: (d: OnlineDriver) => void;
}

/** Lista de conductores en línea del panel de monitoreo. */
export default function DriversList({ drivers, search, vehicleByUser, deviatedByUserId, sosDriverUserIds, selectedId, onClick }: Props) {
  if (drivers.length === 0) {
    return search
      ? <EmptyState compact title="Sin coincidencias" text={`Ningún conductor en línea se llama «${search}».`} />
      : <EmptyState compact icon="fa-car" title="Sin conductores en línea" text="Cuando un conductor se conecte aparecerá aquí y en el mapa." />;
  }

  return (
    <ul className="lm-list">
      {drivers.map(d => {
        const inSos    = sosDriverUserIds.has(d.userId);
        const deviated = deviatedByUserId[d.userId] === true;
        const st       = driverState(d, inSos, deviated);
        const selected = selectedId === d.id;
        const hasPos   = !!(d.currentLat && d.currentLng);
        const v        = vehicleByUser[d.userId];
        return (
          <li key={d.id}>
            <button
              type="button"
              className={`lm-item ${selected ? 'is-selected' : ''} ${inSos ? 'lm-flash-bad' : ''}`}
              onClick={() => onClick(d)}
              disabled={!hasPos}
              aria-pressed={selected}
              title={hasPos ? (d.hasActiveTrip ? 'Ver detalle del viaje' : 'Ubicar en el mapa') : 'Sin ubicación GPS todavía'}
            >
              <span className={`lm-avatar bx-tone-${st.tone} ${selected ? 'ring' : ''}`} aria-hidden="true">
                <i className="fa-solid fa-car-side" />
              </span>
              <span className="main">
                <span className="name d-block">{d.fullName || 'Sin nombre'}</span>
                <span className="sub d-block">
                  {v
                    ? <>{[v.brand, v.model].filter(Boolean).join(' ')}{v.plate && <> · <span className="lm-plate">{v.plate}</span></>}</>
                    : 'Sin vehículo registrado'}
                </span>
                <span className="meta">
                  <StatusBadge tone={st.tone} icon={st.icon} size="sm">{st.label}</StatusBadge>
                  <span><i className="fa-solid fa-star me-1" aria-hidden="true" />{(d.rating ?? 0).toFixed(1)}</span>
                </span>
              </span>
              <span className="end" aria-hidden="true">
                <i className={`fa-solid ${hasPos ? (d.hasActiveTrip ? 'fa-chevron-right' : 'fa-crosshairs') : 'fa-location-slash'}`} />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
