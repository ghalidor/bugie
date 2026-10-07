import { EmptyState, StatusBadge, Tone } from '../../../components/ui';
import { OnlineDriver, VehicleBulk } from './types';

/** Estado visible de un conductor en el monitoreo (tripStatus = status de su viaje, si tiene). */
export function driverState(d: OnlineDriver, inSos: boolean, deviated: boolean, tripStatus?: number): { label: string; tone: Tone; icon: string } {
  if (inSos)            return { label: 'SOS',        tone: 'bad',     icon: 'fa-triangle-exclamation' };
  if (deviated)         return { label: 'Desviado',   tone: 'bad',     icon: 'fa-route' };
  if (tripStatus === 2) return { label: 'En camino',  tone: 'info',    icon: 'fa-car-side' };
  if (d.hasActiveTrip || tripStatus) return { label: 'En viaje', tone: 'primary', icon: 'fa-car' };
  return                       { label: 'Disponible', tone: 'ok',      icon: 'fa-circle-check' };
}

interface Props {
  /** Ya filtrados y ordenados (SOS → desviado → en viaje → disponible). */
  drivers: OnlineDriver[];
  /** Hay filtros activos (cambia el mensaje cuando la lista queda vacía). */
  filtered: boolean;
  vehicleByUser: Record<string, VehicleBulk>;
  deviatedByUserId: Record<string, boolean>;
  sosDriverUserIds: Set<string>;
  /** Status del viaje activo por userId del conductor. */
  tripStatusByUser: Record<string, number>;
  /** Conductor que se está siguiendo en el mapa (userId). */
  followedUserId: string | null;
  onClick: (d: OnlineDriver) => void;
  onFollow: (d: OnlineDriver) => void;
}

/** Lista de conductores en línea del panel de monitoreo. */
export default function DriversList({ drivers, filtered, vehicleByUser, deviatedByUserId, sosDriverUserIds, tripStatusByUser, followedUserId, onClick, onFollow }: Props) {
  if (drivers.length === 0) {
    return filtered
      ? <EmptyState compact title="Sin coincidencias" text="Ningún conductor en línea coincide con los filtros elegidos." />
      : <EmptyState compact icon="fa-car" title="Sin conductores en línea" text="Cuando un conductor se conecte aparecerá aquí y en el mapa." />;
  }

  return (
    <ul className="lm-list">
      {drivers.map(d => {
        const inSos    = sosDriverUserIds.has(d.userId);
        const deviated = deviatedByUserId[d.userId] === true;
        const tripSt   = tripStatusByUser[d.userId];
        const st       = driverState(d, inSos, deviated, tripSt);
        const followed = followedUserId === d.userId;
        const hasPos   = !!(d.currentLat && d.currentLng);
        const hasTrip  = d.hasActiveTrip || !!tripSt;
        const v        = vehicleByUser[d.userId];
        const name     = d.fullName || 'Sin nombre';
        return (
          <li key={d.id} className="d-flex align-items-stretch">
            <button
              type="button"
              className={`lm-item ${followed ? 'is-selected' : ''} ${inSos ? 'lm-flash-bad' : ''}`}
              onClick={() => onClick(d)}
              disabled={!hasPos && !hasTrip}
              title={hasTrip ? 'Ver detalle del viaje' : hasPos ? 'Seguir en el mapa' : 'Sin ubicación GPS todavía'}
            >
              <span className={`lm-avatar bx-tone-${st.tone} ${followed ? 'ring' : ''}`} aria-hidden="true">
                <i className="fa-solid fa-car-side" />
              </span>
              <span className="main">
                <span className="name d-block">{name}</span>
                <span className="sub d-block">
                  {v
                    ? <>{[v.brand, v.model].filter(Boolean).join(' ')}{v.plate && <> · <span className="lm-plate">{v.plate}</span></>}</>
                    : 'Sin vehículo registrado'}
                </span>
                <span className="meta">
                  <StatusBadge tone={st.tone} icon={st.icon} size="sm">{st.label}</StatusBadge>
                  <span><i className="fa-solid fa-star me-1" aria-hidden="true" />{(d.rating ?? 0).toFixed(1)}</span>
                  {followed && <span className="lm-following"><i className="fa-solid fa-location-arrow me-1" aria-hidden="true" />Siguiendo</span>}
                </span>
              </span>
              <span className="end" aria-hidden="true">
                <i className={`fa-solid ${hasTrip ? 'fa-chevron-right' : hasPos ? 'fa-crosshairs' : 'fa-location-slash'}`} />
              </span>
            </button>
            <button
              type="button"
              className={`lm-item lm-locate ${followed ? 'is-selected' : ''}`}
              onClick={() => onFollow(d)}
              disabled={!hasPos}
              aria-pressed={followed}
              aria-label={hasPos ? `Seguir a ${name} en el mapa` : 'Sin ubicación GPS todavía'}
              title={hasPos ? 'Seguir en el mapa' : 'Sin ubicación GPS todavía'}
            >
              <i className={`fa-solid ${hasPos ? 'fa-location-arrow' : 'fa-location-slash'} ${followed ? '' : 'bugie-muted'}`} aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
