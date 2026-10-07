import { useEffect, useState } from 'react';
import { IconButton, StatusBadge, Switch, Tone, useToast } from '../../../components/ui';
import { DriverLink, PassengerLink } from '../../../components/EntityLinks';
import { fileUrl } from '../people/PeopleShared';
import { LivePassenger, MonitorAlert, monitorAlertMeta, monitorAlertText, OnlineDriver, PAX_AT_PICKUP_TEXT, paxLocationUnknown, VehicleBulk } from './types';
import { NO_SIGNAL_MS } from './monitorFilters';
import { etaMinutes, fmtKm } from './tripScene';
import PersonAvatar from './PersonAvatar';

/** "hace 12 s", "hace 3 min", "hace 2 h". */
function agoText(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `hace ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  return `hace ${Math.floor(m / 60)} h`;
}

/** Número de teléfono con botón de llamar (tel:) y de copiar. */
function PhoneRow({ label, phone, icon }: { label: string; phone: string | null | undefined; icon: string }) {
  const toast = useToast();
  if (!phone) {
    return (
      <div className="lm-follow-phone is-empty">
        <i className={`fa-solid ${icon}`} aria-hidden="true" />
        <span className="t">{label}: sin teléfono en el monitoreo</span>
      </div>
    );
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(phone!);
      toast.success(`Número ${phone} copiado.`);
    } catch {
      toast.error('No se pudo copiar el número. Cópialo a mano.');
    }
  }
  return (
    <div className="lm-follow-phone">
      <a className="btn btn-sm btn-outline-primary" href={`tel:${phone}`}>
        <i className="fa-solid fa-phone me-1" aria-hidden="true" />{label}
      </a>
      <span className="num" translate="no">{phone}</span>
      <IconButton icon="fa-copy" size="sm" variant="ghost" label={`Copiar el número ${phone}`} onClick={copy} />
    </div>
  );
}

export interface FollowPanelProps {
  driver: OnlineDriver | null;
  trip: LivePassenger | null;
  vehicle?: VehicleBulk;
  state: { label: string; tone: Tone; icon?: string };
  deviated: boolean;
  sos: boolean;
  /** Hora (ms) de la última posición conocida. */
  lastSeenMs: number | null;
  speedKmh: number | null;
  /** Distancia en línea recta al recojo o al destino. */
  distance: { km: number; to: 'pickup' | 'destination' } | null;
  paused: boolean;
  hideOthers: boolean;
  onHideOthersChange: (v: boolean) => void;
  onResume: () => void;
  onExit: () => void;
  onOpenTrip: (() => void) | null;
  /** Alertas de seguimiento abiertas de la unidad (sin señal, detenido, demorado). */
  monitorAlerts?: MonitorAlert[];
}

/** Panel "Siguiendo a X": datos en vivo de la unidad seguida y acciones rápidas. */
export default function FollowPanel(p: FollowPanelProps) {
  const { driver, trip, vehicle } = p;
  // Reloj propio (cada 1 s) para "hace X s": no re-renderiza todo el monitoreo.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const name = driver?.fullName || trip?.driverName || trip?.passengerName || 'Unidad';
  const isDriverUnit = !!(driver || trip?.driverId);
  const ago = p.lastSeenMs !== null ? now - p.lastSeenMs : null;
  const stale = ago !== null && ago > NO_SIGNAL_MS;
  const eta = p.distance ? etaMinutes(p.distance.km, p.speedKmh) : null;

  return (
    <section className={`lm-follow ${p.sos ? 'is-sos' : ''}`} aria-label={`Siguiendo a ${name}`} data-tour="monitor-follow">
      <header className="lm-follow-head">
        <span className="lm-follow-title">
          <i className="fa-solid fa-location-arrow me-1" aria-hidden="true" />
          Siguiendo a <strong>{name}</strong>
        </span>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={p.onExit}>
          <i className="fa-solid fa-expand me-1" aria-hidden="true" />Ver todos
        </button>
      </header>

      {p.paused && (
        <div className="lm-follow-paused" role="status">
          <span>Moviste el mapa: seguimiento en pausa.</span>
          <button type="button" className="btn btn-sm btn-bugie" onClick={p.onResume}>
            <i className="fa-solid fa-location-crosshairs me-1" aria-hidden="true" />Volver a seguir
          </button>
        </div>
      )}

      <div className="lm-follow-body">
        <div className="d-flex align-items-start gap-2">
          <PersonAvatar
            size="md"
            url={isDriverUnit ? fileUrl('drivers', driver?.profilePhotoUrl) : fileUrl('auth', trip?.passengerPhotoUrl)}
            icon={isDriverUnit ? 'fa-id-card' : 'fa-person'}
            tone={p.sos ? 'bad' : p.state.tone}
          />
          <div className="flex-grow-1" style={{ minWidth: 0 }}>
            {vehicle && (
              <div className="small text-truncate">
                <i className="fa-solid fa-car-side me-1 bugie-muted" aria-hidden="true" />
                {[vehicle.brand, vehicle.model, vehicle.color].filter(Boolean).join(' ')}
                {vehicle.plate && <> · <span className="lm-plate">{vehicle.plate}</span></>}
              </div>
            )}
            <div className="d-flex gap-1 flex-wrap mt-1">
              <StatusBadge tone={p.state.tone} icon={p.state.icon} size="sm">{p.state.label}</StatusBadge>
              {p.deviated && <StatusBadge tone="bad" icon="fa-route" size="sm">Desviado</StatusBadge>}
              {p.sos && <StatusBadge tone="bad" icon="fa-triangle-exclamation" size="sm">SOS</StatusBadge>}
              {(p.monitorAlerts ?? []).map(a => (
                <StatusBadge key={a.id} tone={monitorAlertMeta(a.type).tone} icon={monitorAlertMeta(a.type).icon} size="sm">
                  {monitorAlertText(a, now)}
                </StatusBadge>
              ))}
            </div>
          </div>
        </div>

        <dl className="lm-follow-facts">
          {trip && isDriverUnit && (
            <div><dt>Pasajero</dt><dd className="text-truncate">{trip.passengerName || '—'}</dd></div>
          )}
          {trip && paxLocationUnknown(trip) && (
            <div className="lm-follow-paxloc">
              <dt className="visually-hidden">Pasajero</dt>
              <dd><i className="fa-solid fa-location-dot me-1 bugie-muted" aria-hidden="true" />{PAX_AT_PICKUP_TEXT}</dd>
            </div>
          )}
          {isDriverUnit && (
            <div><dt>Velocidad</dt><dd>{typeof p.speedKmh === 'number' ? `${Math.round(p.speedKmh)} km/h` : 'Sin dato'}</dd></div>
          )}
          <div>
            <dt>Última posición</dt>
            <dd className={stale ? 'is-stale' : ''}>
              {ago === null ? 'Sin dato' : agoText(ago)}
              {stale && <> <i className="fa-solid fa-signal ms-1" aria-hidden="true" /> sin señal</>}
            </dd>
          </div>
          {p.distance && eta && (
            <div>
              <dt>{p.distance.to === 'pickup' ? 'Al recojo' : 'Al destino'}</dt>
              <dd>
                {fmtKm(p.distance.km)} · ≈ {eta.minutes} min
                <span className="bugie-muted small d-block">
                  En línea recta{eta.usedAverage ? ', a 22 km/h promedio' : ', a la velocidad actual'}
                </span>
              </dd>
            </div>
          )}
        </dl>

        <div className="lm-follow-actions">
          {isDriverUnit && <PhoneRow label="Llamar al conductor" icon="fa-id-card" phone={trip?.driverPhone || driver?.phone} />}
          {trip && <PhoneRow label="Llamar al pasajero" icon="fa-person" phone={trip.passengerPhone} />}
          <div className="lm-follow-links">
            {p.onOpenTrip && (
              <button type="button" className="btn btn-sm btn-bugie" onClick={p.onOpenTrip}>
                <i className="fa-solid fa-route me-1" aria-hidden="true" />Ver viaje
              </button>
            )}
            {(driver?.userId || trip?.driverId) && (
              <DriverLink userId={(driver?.userId || trip?.driverId)!}>Ficha del conductor</DriverLink>
            )}
            {trip && <PassengerLink userId={trip.passengerId}>Ficha del pasajero</PassengerLink>}
          </div>
        </div>

        <Switch checked={p.hideOthers} onChange={p.onHideOthersChange} label="Ocultar las demás unidades"
                description={p.hideOthers ? 'Solo se ve esta unidad.' : 'Las demás se ven atenuadas.'} />
      </div>
    </section>
  );
}
