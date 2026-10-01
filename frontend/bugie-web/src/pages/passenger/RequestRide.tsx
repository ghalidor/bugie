import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import BugieMap from '../../components/BugieMap';
import { API, apiFetch, ApiError } from '../../state/api';
import { useDefaultLocation } from '../../hooks/useDefaultLocation';

const NOMINATIM = 'https://nominatim.openstreetmap.org';

interface LatLng    { lat: number; lng: number; }
interface GeoResult { display_name: string; lat: string; lon: string; }
interface Waypoint  { address: string; coord: LatLng | null; }

async function geocode(address: string): Promise<GeoResult[]> {
  const q = encodeURIComponent(`${address}, Trujillo, Peru`);
  const r = await fetch(
    `${NOMINATIM}/search?q=${q}&format=json&limit=5&viewbox=-79.12,-8.05,-78.95,-8.18&bounded=1`,
    { headers: { 'Accept-Language': 'es' } }
  );
  return r.json();
}

async function reverseGeocode(pos: LatLng): Promise<string> {
  try {
    const r = await fetch(
      `${NOMINATIM}/reverse?lat=${pos.lat}&lon=${pos.lng}&format=json`,
      { headers: { 'Accept-Language': 'es' } }
    );
    const d = await r.json();
    return d.display_name
      ? d.display_name.split(',').slice(0, 2).join(',').trim()
      : `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`;
  } catch {
    return `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`;
  }
}

function shortAddr(full: string) { return full.split(',').slice(0, 2).join(',').trim(); }

function AddressInput({ label, color, value, coord, suggestions, showSugg, onChange, onSelect, onFocus, onBlur }: {
  label: string; color: string; value: string;
  coord: LatLng | null; suggestions: GeoResult[]; showSugg: boolean;
  onChange: (v: string) => void; onSelect: (r: GeoResult) => void;
  onFocus: () => void; onBlur?: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      {label && (
        <label className="form-label d-flex align-items-center gap-2" style={{ fontSize: '0.82rem' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block' }} />
          {label}
        </label>
      )}
      <input ref={ref}
        className={`form-control form-control-sm ${coord ? 'is-valid' : ''}`}
        placeholder="Escribe una dirección..."
        value={value} onChange={e => onChange(e.target.value)}
        onFocus={onFocus} onBlur={onBlur} autoComplete="off" />
      {coord && <div className="valid-feedback d-block" style={{ fontSize: '0.72rem' }}><i className="fa-solid fa-check me-1" />Pin marcado</div>}
      {showSugg && suggestions.length > 0 && (
        <div style={{
          position: 'fixed',
          top:   (() => { const r = ref.current?.getBoundingClientRect(); return r ? r.bottom + 4 : 200; })(),
          left:  (() => { const r = ref.current?.getBoundingClientRect(); return r ? r.left   : 0;   })(),
          width: (() => { const r = ref.current?.getBoundingClientRect(); return r ? r.width  : 300; })(),
          zIndex: 99999, background: 'var(--bugie-bg)',
          border: '1px solid var(--bugie-border)', borderRadius: 8,
          maxHeight: 220, overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          {suggestions.map((r, i) => (
            <button key={i} type="button"
              onMouseDown={e => { e.preventDefault(); onSelect(r); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: 'transparent', color: 'var(--bugie-text)', fontSize: '0.82rem', cursor: 'pointer', borderBottom: i < suggestions.length - 1 ? '1px solid var(--bugie-border)' : 'none' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bugie-bg-2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <i className="fa-solid fa-location-dot me-2" style={{ color }} />
              {r.display_name.split(',').slice(0, 3).join(',')}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PassengerRequestRide() {
  const navigate   = useNavigate();
  const defaultLoc = useDefaultLocation();

  const [originText,  setOriginText]  = useState('');
  const [destText,    setDestText]    = useState('');
  const [originCoord, setOriginCoord] = useState<LatLng | null>(null);
  const [destCoord,   setDestCoord]   = useState<LatLng | null>(null);
  const [waypoints,   setWaypoints]   = useState<Waypoint[]>([]);
  const [payMethod,   setPayMethod]   = useState<'cash'|'yape'|'plin'>('cash');

  const [originSugg, setOriginSugg] = useState<GeoResult[]>([]);
  const [destSugg,   setDestSugg]   = useState<GeoResult[]>([]);
  const [wpSugg,     setWpSugg]     = useState<GeoResult[][]>([]);
  const [focusId,    setFocusId]    = useState<'origin'|'dest'|number|null>(null);
  const [activeInput, setActiveInput] = useState<'origin'|'dest'|number>('origin');
  const activeRef = useRef<'origin'|'dest'|number>('origin');

  // routeInfo viene del mapa via callback onRouteInfo
  const [routeInfo, setRouteInfo] = useState<{ km: number; mins: number; isFallback: boolean } | null>(null);

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // Tarifa que propone el pasajero. Se inicializa con la sugerida del sistema,
  // pero el usuario puede editarla. Es la que se envía al backend.
  const [proposedFare, setProposedFare] = useState<string>('');

  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  function debounce(key: string, fn: () => void) {
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(fn, 400);
  }

  function setActive(v: 'origin'|'dest'|number) {
    activeRef.current = v;
    setActiveInput(v);
  }

  // Autocomplete
  function onOriginChange(v: string) {
    setOriginText(v); setOriginCoord(null);
    if (v.length < 3) { setOriginSugg([]); return; }
    debounce('origin', async () => setOriginSugg(await geocode(v).catch(() => [])));
  }
  function onDestChange(v: string) {
    setDestText(v); setDestCoord(null);
    if (v.length < 3) { setDestSugg([]); return; }
    debounce('dest', async () => setDestSugg(await geocode(v).catch(() => [])));
  }
  function onWpChange(i: number, v: string) {
    setWaypoints(prev => { const u = [...prev]; u[i] = { address: v, coord: null }; return u; });
    if (v.length < 3) {
      setWpSugg(prev => { const s = [...prev]; s[i] = []; return s; }); return;
    }
    debounce(`wp${i}`, async () => {
      const res = await geocode(v).catch(() => []);
      setWpSugg(prev => { const s = [...prev]; s[i] = res; return s; });
    });
  }

  function selectOrigin(r: GeoResult) {
    setOriginText(shortAddr(r.display_name));
    setOriginCoord({ lat: parseFloat(r.lat), lng: parseFloat(r.lon) });
    setOriginSugg([]); setFocusId(null); setActive('dest');
  }
  function selectDest(r: GeoResult) {
    setDestText(shortAddr(r.display_name));
    setDestCoord({ lat: parseFloat(r.lat), lng: parseFloat(r.lon) });
    setDestSugg([]); setFocusId(null);
  }
  function selectWp(i: number, r: GeoResult) {
    setWaypoints(prev => { const u = [...prev]; u[i] = { address: shortAddr(r.display_name), coord: { lat: parseFloat(r.lat), lng: parseFloat(r.lon) } }; return u; });
    setWpSugg(prev => { const s = [...prev]; s[i] = []; return s; });
    setFocusId(null);
  }

  function addWaypoint() {
    const i = waypoints.length;
    setWaypoints(prev => [...prev, { address: '', coord: null }]);
    setWpSugg(prev => [...prev, []]);
    setTimeout(() => setActive(i), 50);
  }
  function removeWaypoint(i: number) {
    setWaypoints(prev => prev.filter((_, idx) => idx !== i));
    setWpSugg(prev => prev.filter((_, idx) => idx !== i));
    if (activeRef.current === i) setActive('dest');
  }

  async function handleMapClick(pos: LatLng) {
    const addr = await reverseGeocode(pos);
    const cur  = activeRef.current;
    if (cur === 'dest') {
      setDestText(addr); setDestCoord(pos); setDestSugg([]);
    } else if (typeof cur === 'number') {
      setWaypoints(prev => { const u = [...prev]; u[cur] = { address: addr, coord: pos }; return u; });
    } else {
      setOriginText(addr); setOriginCoord(pos); setOriginSugg([]);
      setActive('dest');
    }
  }

  const allCoords = [originCoord, ...waypoints.map(w => w.coord), destCoord].filter(Boolean) as LatLng[];
  const fare = routeInfo ? Math.max(5, Math.round(routeInfo.km * 1.5 * 10) / 10) : null;

  // Cuando cambia la ruta (y por tanto el fare sugerido), pre-llenamos el input.
  // Si el usuario ya editó manualmente, no sobreescribimos.
  const lastSuggestedFareRef = useRef<number | null>(null);
  useEffect(() => {
    if (fare === null) return;
    const userEdited = proposedFare !== ''
                    && lastSuggestedFareRef.current !== null
                    && parseFloat(proposedFare) !== lastSuggestedFareRef.current;
    if (!userEdited) {
      setProposedFare(fare.toFixed(2));
    }
    lastSuggestedFareRef.current = fare;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fare]);

  // Mínimo permitido: 50% del estimado del sistema
  const minFare = fare !== null ? Math.round(fare * 0.5 * 100) / 100 : null;
  const proposedFareNum = parseFloat(proposedFare);
  const proposedFareInvalid =
    proposedFare !== '' && (isNaN(proposedFareNum) || (minFare !== null && proposedFareNum < minFare));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!originCoord || !destCoord) { setError('Selecciona origen y destino.'); return; }

    // Validar la tarifa propuesta
    const fareToSend = parseFloat(proposedFare);
    if (isNaN(fareToSend) || fareToSend <= 0) {
      setError('Ingresa una tarifa válida.');
      return;
    }
    if (minFare !== null && fareToSend < minFare) {
      setError(`La tarifa mínima permitida es S/ ${minFare.toFixed(2)}.`);
      return;
    }

    setLoading(true); setError(null);
    try {
      await apiFetch(`${API.trips}/trips`, {
        method: 'POST',
        body: JSON.stringify({
          originAddress: originText, originLat: originCoord.lat, originLng: originCoord.lng,
          destAddress:   destText,   destLat:   destCoord.lat,   destLng:   destCoord.lng,
          estimatedFare: fareToSend,
          paymentMethod: payMethod,
          waypoints: waypoints.filter(w => w.coord).map(w => ({
            address: w.address, lat: w.coord!.lat, lng: w.coord!.lng,
          })),
        }),
      });
      navigate('/app/pasajero/seguimiento');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al crear el viaje.');
    } finally { setLoading(false); }
  }

  const markers = [
    ...(originCoord ? [{ ...originCoord, label: 'Origen',  type: 'origin'      as const }] : []),
    ...waypoints.filter(w => w.coord).map((w, i) => ({ ...w.coord!, label: `Parada ${i+1}`, type: 'default' as const })),
    ...(destCoord   ? [{ ...destCoord,   label: 'Destino', type: 'destination' as const }] : []),
  ];

  return (
    <>
      <PageHeader title="Solicitar viaje" subtitle="Escribe la dirección o haz click en el mapa." icon="fa-solid fa-map-pin" />
      {error && <div className="alert alert-danger small mb-3">{error}</div>}

      <div className="row g-3">
        <div className="col-lg-4">
          <form onSubmit={onSubmit} className="bugie-card p-3 d-grid gap-3">

            <AddressInput label="Origen" color="#7C6AF7"
              value={originText} coord={originCoord}
              suggestions={originSugg} showSugg={focusId === 'origin'}
              onChange={onOriginChange} onSelect={selectOrigin}
              onFocus={() => { setFocusId('origin'); setActive('origin'); }}
              onBlur={() => setTimeout(() => setFocusId(null), 150)} />

            {waypoints.map((wp, i) => (
              <div key={i}>
                <div className="d-flex align-items-center gap-2 mb-1">
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
                  <span style={{ fontSize: '0.82rem' }} className="flex-grow-1">Parada {i + 1}</span>
                  <button type="button" className="btn btn-sm p-0" style={{ color: 'var(--bugie-muted)' }}
                    onClick={() => removeWaypoint(i)}>
                    <i className="fa-solid fa-xmark" />
                  </button>
                </div>
                <AddressInput label="" color="#f59e0b"
                  value={wp.address} coord={wp.coord}
                  suggestions={wpSugg[i] ?? []} showSugg={focusId === i}
                  onChange={v => onWpChange(i, v)} onSelect={r => selectWp(i, r)}
                  onFocus={() => { setFocusId(i); setActive(i); }}
                  onBlur={() => setTimeout(() => setFocusId(null), 150)} />
              </div>
            ))}

            <button type="button" className="btn btn-bugie-outline btn-sm rounded-pill" onClick={addWaypoint}>
              <i className="fa-solid fa-plus me-2" />Agregar parada
            </button>

            <AddressInput label="Destino" color="#C060C0"
              value={destText} coord={destCoord}
              suggestions={destSugg} showSugg={focusId === 'dest'}
              onChange={onDestChange} onSelect={selectDest}
              onFocus={() => { setFocusId('dest'); setActive('dest'); }}
              onBlur={() => setTimeout(() => setFocusId(null), 150)} />

            <div>
              <label className="form-label" style={{ fontSize: '0.82rem' }}>Método de pago</label>
              <select className="form-select form-select-sm" value={payMethod}
                onChange={e => setPayMethod(e.target.value as any)}>
                <option value="cash">Efectivo</option>
                <option value="yape">Yape</option>
                <option value="plin">Plin</option>
              </select>
            </div>

            {/* Tarifa */}
            <div className="bugie-card p-3" style={{ background: 'var(--bugie-bg-2)' }}>
              {fare ? (
                <>
                  {/* Sugerencia del sistema (solo referencia) */}
                  <div className="d-flex justify-content-between align-items-start mb-3">
                    <div>
                      <div className="small bugie-muted">Tarifa sugerida</div>
                      <div className="fw-bold fs-6">S/ {fare.toFixed(2)}</div>
                      {routeInfo?.isFallback && (
                        <div className="small" style={{ color: '#f59e0b', fontSize: '0.7rem' }}>
                          <i className="fa-solid fa-triangle-exclamation me-1" />Distancia aproximada
                        </div>
                      )}
                    </div>
                    <div className="text-end">
                      <div className="small bugie-muted">{routeInfo!.km.toFixed(1)} km</div>
                      <div className="small fw-semibold">{routeInfo!.mins} min</div>
                      {waypoints.filter(w => w.coord).length > 0 && (
                        <div className="small bugie-muted">{waypoints.filter(w => w.coord).length} parada{waypoints.filter(w => w.coord).length > 1 ? 's' : ''}</div>
                      )}
                    </div>
                  </div>

                  {/* Input editable: lo que propone el pasajero */}
                  <div>
                    <label className="form-label small fw-semibold mb-1">
                      Tu propuesta <span className="text-danger">*</span>
                    </label>
                    <div className="input-group input-group-sm">
                      <span className="input-group-text" style={{
                        background: 'var(--bugie-surface-2)',
                        border: '1px solid var(--bugie-border)',
                        color: 'var(--bugie-muted)',
                      }}>
                        S/
                      </span>
                      <input
                        type="number" step="0.10" min="0"
                        className={`form-control ${proposedFareInvalid ? 'is-invalid' : ''}`}
                        value={proposedFare}
                        onChange={e => setProposedFare(e.target.value)}
                        placeholder={fare.toFixed(2)}
                      />
                    </div>
                    {minFare !== null && (
                      <div className="small bugie-muted mt-1" style={{ fontSize: '0.72rem' }}>
                        <i className="fa-solid fa-circle-info me-1" />
                        Mínimo permitido: S/ {minFare.toFixed(2)}
                      </div>
                    )}
                    {proposedFareInvalid && (
                      <div className="small text-danger mt-1" style={{ fontSize: '0.72rem' }}>
                        <i className="fa-solid fa-triangle-exclamation me-1" />
                        La tarifa debe ser de al menos S/ {minFare?.toFixed(2)}
                      </div>
                    )}
                    <div className="small bugie-muted mt-2" style={{ fontSize: '0.72rem' }}>
                      Los conductores podrán aceptar tu propuesta o enviarte una contrapropuesta.
                    </div>
                  </div>
                </>
              ) : (
                <div className="small bugie-muted text-center">
                  <i className="fa-solid fa-route me-1" />Marca origen y destino para ver la tarifa
                </div>
              )}
            </div>

            <button className="btn btn-bugie text-white rounded-pill py-2"
              type="submit" disabled={loading || !originCoord || !destCoord || proposedFareInvalid || proposedFare === ''}>
              {loading
                ? <><span className="spinner-border spinner-border-sm me-2" />Buscando conductor…</>
                : <><i className="fa-solid fa-car me-2" />Solicitar viaje</>}
            </button>
          </form>
        </div>

        <div className="col-lg-8">
          <div style={{ height: 500 }}>
            <BugieMap
              height="100%"
              markers={markers}
              showRoute={allCoords.length >= 2}
              origin={originCoord ?? undefined}
              destination={destCoord ?? undefined}
              waypoints={waypoints.filter(w => w.coord).map(w => w.coord!)}
              onMapClick={handleMapClick}
              onRouteInfo={setRouteInfo}
              center={defaultLoc}
              zoom={defaultLoc.zoom}
            />
          </div>
          <div className="d-flex justify-content-between align-items-center mt-2 px-1">
            <div className="small bugie-muted" style={{ fontSize: '0.75rem' }}>
              <i className="fa-solid fa-hand-pointer me-1" />
              Click →
              {typeof activeInput === 'number' ? ` Parada ${activeInput + 1}` : activeInput === 'origin' ? ' Origen' : ' Destino'}
            </div>
            <div className="d-flex gap-2 flex-wrap">
              <button type="button" onClick={() => setActive('origin')} className="btn btn-sm py-0 px-2"
                style={{ fontSize: '0.72rem', background: activeInput === 'origin' ? '#7C6AF7' : 'transparent', color: activeInput === 'origin' ? '#fff' : 'var(--bugie-muted)', border: '1px solid #7C6AF7', borderRadius: 6 }}>
                ● Origen
              </button>
              {waypoints.map((_, i) => (
                <button key={i} type="button" onClick={() => setActive(i)} className="btn btn-sm py-0 px-2"
                  style={{ fontSize: '0.72rem', background: activeInput === i ? '#f59e0b' : 'transparent', color: activeInput === i ? '#fff' : 'var(--bugie-muted)', border: '1px solid #f59e0b', borderRadius: 6 }}>
                  P{i + 1}
                </button>
              ))}
              <button type="button" onClick={() => setActive('dest')} className="btn btn-sm py-0 px-2"
                style={{ fontSize: '0.72rem', background: activeInput === 'dest' ? '#C060C0' : 'transparent', color: activeInput === 'dest' ? '#fff' : 'var(--bugie-muted)', border: '1px solid #C060C0', borderRadius: 6 }}>
                ● Destino
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}