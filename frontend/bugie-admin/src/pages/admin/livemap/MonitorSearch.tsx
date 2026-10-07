import { Fragment, KeyboardEvent, useId, useMemo, useRef, useState } from 'react';
import { useClickOutside } from '../../../components/ui';
import { LivePassenger, liveTripStatus, OnlineDriver, VehicleBulk } from './types';

/** A quién seguir en el mapa. */
export type FollowTarget = { kind: 'driver'; userId: string } | { kind: 'trip'; tripId: string };

type Group = 'drivers' | 'trips' | 'passengers';
const GROUP_LABEL: Record<Group, string> = { drivers: 'Conductores', trips: 'Viajes', passengers: 'Pasajeros' };
const MAX_PER_GROUP = 5;

interface Result {
  key: string;
  group: Group;
  title: string;
  sub: string;
  icon: string;
  target: FollowTarget;
}

/** Minúsculas y sin tildes. */
const norm = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');
const compact = (s: string | null | undefined) => norm(s).replace(/[\s-]/g, '');

interface Props {
  drivers: OnlineDriver[];
  passengers: LivePassenger[];
  vehicleByUser: Record<string, VehicleBulk>;
  /** Viaje con conductor asignado por userId del conductor. */
  tripByDriver: Record<string, LivePassenger>;
  onPick: (target: FollowTarget) => void;
}

/**
 * Buscador único del Monitoreo: conductor o pasajero (nombre o celular),
 * placa o los primeros caracteres del id del viaje. Busca en los datos ya
 * cargados y al elegir un resultado lo sigue en el mapa.
 */
export default function MonitorSearch({ drivers, passengers, vehicleByUser, tripByDriver, onPick }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const inputId = useId();
  useClickOutside([boxRef], open, () => setOpen(false));

  const results = useMemo<Result[]>(() => {
    const q = norm(query.trim());
    if (q.length < 2) return [];
    const qDigits = digits(q);
    const qCompact = compact(q);
    const phoneHit = (phone: string | null | undefined) => qDigits.length >= 3 && qDigits.length === q.replace(/[\s+-]/g, '').length && digits(phone).includes(qDigits);
    const out: Result[] = [];

    // Conductores: nombre, placa o celular (si tiene viaje).
    let n = 0;
    for (const d of drivers) {
      if (n >= MAX_PER_GROUP) break;
      const v = vehicleByUser[d.userId];
      const trip = tripByDriver[d.userId];
      if (norm(d.fullName).includes(q) || (qCompact.length >= 2 && compact(v?.plate).includes(qCompact)) || phoneHit(trip?.driverPhone)) {
        out.push({
          key: `d:${d.id}`, group: 'drivers', icon: 'fa-car-side',
          title: d.fullName || 'Conductor',
          sub: [v?.plate, v ? [v.brand, v.model].filter(Boolean).join(' ') : null, trip ? liveTripStatus(trip.status).text : d.hasActiveTrip ? 'En viaje' : 'Disponible'].filter(Boolean).join(' · '),
          target: { kind: 'driver', userId: d.userId },
        });
        n++;
      }
    }

    // Viajes: primeros caracteres del id.
    if (/^[0-9a-f-]+$/.test(q)) {
      n = 0;
      for (const p of passengers) {
        if (n >= MAX_PER_GROUP) break;
        if (p.tripId.toLowerCase().replace(/-/g, '').startsWith(q.replace(/-/g, ''))) {
          out.push({
            key: `t:${p.tripId}`, group: 'trips', icon: 'fa-route',
            title: `Viaje ${p.tripId.slice(0, 8)}`,
            sub: [liveTripStatus(p.status).text, p.passengerName, p.driverName].filter(Boolean).join(' · '),
            target: { kind: 'trip', tripId: p.tripId },
          });
          n++;
        }
      }
    }

    // Pasajeros: nombre o celular.
    n = 0;
    for (const p of passengers) {
      if (n >= MAX_PER_GROUP) break;
      if (norm(p.passengerName).includes(q) || phoneHit(p.passengerPhone)) {
        out.push({
          key: `p:${p.tripId}`, group: 'passengers', icon: 'fa-person',
          title: p.passengerName || 'Pasajero',
          sub: [p.passengerPhone, liveTripStatus(p.status).text].filter(Boolean).join(' · '),
          target: { kind: 'trip', tripId: p.tripId },
        });
        n++;
      }
    }
    return out;
  }, [query, drivers, passengers, vehicleByUser, tripByDriver]);

  const showList = open && query.trim().length >= 2;
  const activeIdx = Math.min(active, Math.max(0, results.length - 1));

  function pick(r: Result) {
    onPick(r.target);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { if (showList && results[activeIdx]) { e.preventDefault(); pick(results[activeIdx]); } }
    else if (e.key === 'Escape') { if (open) { e.preventDefault(); setOpen(false); } else setQuery(''); }
  }

  let lastGroup: Group | null = null;
  return (
    <div className="lm-search" ref={boxRef} data-tour="monitor-search">
      <div className="bx-search">
        <label htmlFor={inputId} className="bx-sr">Buscar y seguir en el mapa</label>
        <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          className="form-control form-control-sm"
          placeholder="Buscar conductor, pasajero, placa, celular o id de viaje…"
          autoComplete="off"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && results[activeIdx] ? `${listId}-${activeIdx}` : undefined}
          value={query}
          onChange={e => { setQuery(e.target.value); setActive(0); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {query && (
          <button type="button" className="bx-search-clear" onClick={() => { setQuery(''); inputRef.current?.focus(); }} aria-label="Borrar búsqueda">
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        )}
      </div>
      {showList && (
        <div className="lm-search-pop">
          <ul id={listId} role="listbox" aria-label="Resultados de la búsqueda" className="lm-search-list">
            {results.length === 0 && (
              <li className="lm-search-empty" role="presentation">Sin coincidencias en el mapa.</li>
            )}
            {results.map((r, i) => {
              const header = r.group !== lastGroup;
              lastGroup = r.group;
              return (
                <Fragment key={r.key}>
                  {header && <li className="lm-search-group" role="presentation">{GROUP_LABEL[r.group]}</li>}
                  <li
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === activeIdx}
                    className={`lm-search-opt ${i === activeIdx ? 'is-active' : ''}`}
                    onMouseDown={e => e.preventDefault()}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(r)}
                  >
                    <i className={`fa-solid ${r.icon}`} aria-hidden="true" />
                    <span className="t">
                      <span className="title">{r.title}</span>
                      {r.sub && <span className="sub">{r.sub}</span>}
                    </span>
                    <i className="fa-solid fa-location-arrow go" aria-hidden="true" />
                  </li>
                </Fragment>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
