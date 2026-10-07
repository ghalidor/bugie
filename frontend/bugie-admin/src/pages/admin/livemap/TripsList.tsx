import { EmptyState, StatusBadge } from '../../../components/ui';
import { fmtHour, LivePassenger, liveTripStatus } from './types';

interface Props {
  passengers: LivePassenger[];
  /** Hay filtros activos (cambia el mensaje cuando la lista queda vacía). */
  filtered: boolean;
  /** Viajes con SOS (del pasajero, del conductor o status SOS). */
  isSos: (p: LivePassenger) => boolean;
  /** Viaje que se está siguiendo en el mapa. */
  followedTripId: string | null;
  /** Seguir el viaje en el mapa. */
  onFollow: (p: LivePassenger) => void;
  /** Abrir el detalle del viaje. */
  onOpen: (p: LivePassenger) => void;
}

/** Viajes activos (un pasajero por viaje) del panel de monitoreo. */
export default function TripsList({ passengers, filtered, isSos, followedTripId, onFollow, onOpen }: Props) {
  if (passengers.length === 0) {
    return filtered
      ? <EmptyState compact title="Sin coincidencias" text="Ningún viaje activo coincide con los filtros elegidos." />
      : <EmptyState compact icon="fa-person" title="Sin viajes activos" text="Nadie tiene un viaje en curso ahora." />;
  }

  return (
    <ul className="lm-list">
      {passengers.map(p => {
        const st       = liveTripStatus(p.status);
        const followed = followedTripId === p.tripId;
        const inSos    = isSos(p);
        const name     = p.passengerName || 'Pasajero';
        return (
          <li key={p.tripId} className="d-flex align-items-stretch">
            <button
              type="button"
              className={`lm-item ${followed ? 'is-selected' : ''} ${inSos ? 'lm-flash-bad' : ''}`}
              onClick={() => onOpen(p)}
              title="Ver detalle del viaje"
            >
              <span className={`lm-avatar bx-tone-${inSos ? 'bad' : 'warn'} ${followed ? 'ring' : ''}`} aria-hidden="true">
                <i className={`fa-solid ${p.serviceType === 1 ? 'fa-box' : 'fa-person'}`} />
              </span>
              <span className="main">
                <span className="name d-block">{name}</span>
                <span className="sub d-block">
                  <i className="fa-solid fa-id-badge me-1" aria-hidden="true" />{p.driverName ?? 'Sin conductor todavía'}
                </span>
                <span className="meta">
                  <StatusBadge tone={inSos ? 'bad' : st.tone} size="sm">{st.text}</StatusBadge>
                  {p.updatedAt && <span><i className="fa-regular fa-clock me-1" aria-hidden="true" />{fmtHour(p.updatedAt)}</span>}
                  {followed && <span className="lm-following"><i className="fa-solid fa-location-arrow me-1" aria-hidden="true" />Siguiendo</span>}
                </span>
              </span>
              <span className="end" aria-hidden="true"><i className="fa-solid fa-chevron-right" /></span>
            </button>
            <button
              type="button"
              className={`lm-item lm-locate ${followed ? 'is-selected' : ''}`}
              onClick={() => onFollow(p)}
              aria-pressed={followed}
              aria-label={`Seguir el viaje de ${name} en el mapa`}
              title="Seguir en el mapa"
            >
              <i className={`fa-solid fa-location-arrow ${followed ? '' : 'bugie-muted'}`} aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
