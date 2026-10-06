import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BugieMap from '../../components/BugieMap';
import ServiceIcon from '../../components/ServiceIcon';
import { API, apiFetch, ApiError } from '../../state/api';
import { getToken } from '../../state/session';
import { useDefaultLocation } from '../../hooks/useDefaultLocation';
import { usePlatformConfig, calcularTarifa, createFareError } from '../../hooks/usePlatformConfig';
import { Checkbox, Field, IconButton, Notice, Page, SectionCard, Select } from '../../components/ui';

const NOMINATIM = 'https://nominatim.openstreetmap.org';

interface LatLng    { lat: number; lng: number; }
interface GeoResult { display_name: string; lat: string; lon: string; }
interface Waypoint  { address: string; coord: LatLng | null; }

/**
 * Busca direcciones en Perú dando prioridad a las cercanas a `near`
 * (la ubicación del dispositivo o, sin GPS, la ciudad configurada).
 * viewbox ~25 km alrededor + bounded=0: prioriza lo cercano sin excluir lo demás.
 */
async function geocode(address: string, near: LatLng): Promise<GeoResult[]> {
  const q = encodeURIComponent(address);
  const d = 0.25; // grados (~25 km)
  const viewbox = `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`;
  const r = await fetch(
    `${NOMINATIM}/search?q=${q}&format=json&limit=5&countrycodes=pe&viewbox=${viewbox}&bounded=0`,
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

// ── Programar: hora de Perú (UTC-5, sin horario de verano) ────────────────
// El backend toma una fecha sin zona como hora de Perú, así que se envía
// "AAAA-MM-DDTHH:mm:00" y se valida con la hora de Perú (no la del navegador).
const PERU_OFFSET_MS = 5 * 3600 * 1000;
const SCHEDULE_MIN_MINUTES = 30;
const SCHEDULE_MAX_DAYS = 7;
const pad2 = (n: number) => String(n).padStart(2, '0');

/** Fecha y hora de Perú (yyyy-mm-dd y HH:mm) de un instante. */
function peruParts(ms: number) {
  const d = new Date(ms - PERU_OFFSET_MS);
  return {
    date: `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`,
    time: `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`,
  };
}

/** Instante (ms) de una fecha y hora de Perú; null si no es válida. */
function peruToMs(date: string, time: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m || !t) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +t[1], +t[2]) + PERU_OFFSET_MS;
}

/** Propuesta inicial: dentro de 1 hora, redondeada a los 15 min siguientes. */
function defaultSchedule() {
  const step = 15 * 60 * 1000;
  return peruParts(Math.ceil((Date.now() + 60 * 60 * 1000) / step) * step);
}

/** Error de la hora programada, o null si está bien. */
function scheduleError(date: string, time: string): string | null {
  const ms = peruToMs(date, time);
  if (ms === null) return 'Elige la fecha y la hora.';
  if (ms < Date.now() + SCHEDULE_MIN_MINUTES * 60 * 1000) return `Programa con al menos ${SCHEDULE_MIN_MINUTES} minutos de anticipación.`;
  if (ms > Date.now() + SCHEDULE_MAX_DAYS * 24 * 3600 * 1000) return `Solo puedes programar hasta ${SCHEDULE_MAX_DAYS} días adelante.`;
  return null;
}

/** "sáb 04 oct, 10:30" a partir de fecha y hora de Perú. */
function scheduleLabel(date: string, time: string): string {
  const ms = peruToMs(date, time);
  if (ms === null) return '';
  return new Date(ms - PERU_OFFSET_MS).toLocaleString('es-PE', {
    timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

// Fotos del paquete: obligatorias, igual que en la app
const MAX_PKG_PHOTOS = 5;

/**
 * Crea el envío con sus fotos en UNA sola petición (POST /trips/delivery).
 * Si faltan fotos o alguna no es válida, el backend no crea nada.
 * Lanza ApiError con el mensaje del backend si falla.
 */
async function createDelivery(data: object, files: File[]): Promise<{ id: string }> {
  const fd = new FormData();
  fd.append('data', JSON.stringify(data));
  files.forEach(f => fd.append('files', f));
  const token = getToken();
  // Sin Content-Type: el navegador arma el multipart con su boundary
  const res = await fetch(`${API.trips}/trips/delivery`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: fd,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as any).error ?? (body as any).message ?? `Error ${res.status}`);
  }
  return res.json();
}

/** Campo de dirección con sugerencias (teclado: flechas, Enter y Esc). */
function AddressInput({ id, label, dot, value, coord, suggestions, showSugg, onChange, onSelect, onFocus, onBlur, onClose, trailing }: {
  id: string; label: string; dot: 'origin' | 'stop' | 'dest'; value: string;
  coord: LatLng | null; suggestions: GeoResult[]; showSugg: boolean;
  onChange: (v: string) => void; onSelect: (r: GeoResult) => void;
  onFocus: () => void; onBlur?: () => void; onClose: () => void;
  trailing?: React.ReactNode;
}) {
  const [hi, setHi] = useState(-1);
  const open = showSugg && suggestions.length > 0;
  useEffect(() => { setHi(-1); }, [suggestions]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter' && hi >= 0) { e.preventDefault(); onSelect(suggestions[hi]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  }

  return (
    <div className="bx-field">
      <label className="bx-field-label" htmlFor={id}>
        <span className={`bx-dot ${dot === 'origin' ? '' : dot}`} aria-hidden="true" />
        {label}
      </label>
      <div className="bx-addr-row">
        <div className="bx-suggest">
          <input
            id={id}
            className={`form-control ${coord ? 'is-valid' : ''}`}
            placeholder="Escribe una dirección o toca el mapa"
            value={value}
            onChange={e => onChange(e.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-controls={`${id}-list`}
            aria-autocomplete="list"
            aria-activedescendant={open && hi >= 0 ? `${id}-opt-${hi}` : undefined}
          />
          {open && (
            <ul className="bx-suggest-list" id={`${id}-list`} role="listbox">
              {suggestions.map((r, i) => (
                <li key={i} role="option" id={`${id}-opt-${i}`} aria-selected={hi === i}>
                  <button
                    type="button"
                    tabIndex={-1}
                    className={hi === i ? 'is-active' : ''}
                    onMouseDown={e => { e.preventDefault(); onSelect(r); }}
                  >
                    <span className={`bx-dot ${dot === 'origin' ? '' : dot}`} aria-hidden="true" />
                    <span style={{ minWidth: 0 }}>{r.display_name.split(',').slice(0, 3).join(',')}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {trailing}
      </div>
      {coord && <p className="bx-field-help bx-text-ok mb-0"><i className="fa-solid fa-check me-1" aria-hidden="true" />Punto marcado en el mapa</p>}
    </div>
  );
}

export default function PassengerRequestRide() {
  const navigate   = useNavigate();
  const defaultLoc = useDefaultLocation();

  // Ubicación del dispositivo: el mapa arranca ahí y el buscador prioriza
  // direcciones cercanas. Sin GPS (permiso negado, PC sin ubicación) se usa
  // la ciudad configurada por el admin.
  // Con permiso, además el ORIGEN se llena solo con la ubicación actual
  // (dirección por reverse geocoding) si todavía está vacío; se puede cambiar.
  const [myPos, setMyPos] = useState<LatLng | null>(null);
  const originTouched = useRef(false);
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    let alive = true;
    navigator.geolocation.getCurrentPosition(
      async p => {
        if (!alive) return;
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
        setMyPos(pos);
        if (originTouched.current) return;
        const addr = await reverseGeocode(pos);
        if (!alive || originTouched.current) return;
        setOriginText(addr); setOriginCoord(pos); setOriginSugg([]);
        setActive('dest');
      },
      () => { /* sin permiso: se queda la ciudad configurada */ },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const searchNear: LatLng = myPos ?? defaultLoc;

  const [originText,  setOriginText]  = useState('');
  const [destText,    setDestText]    = useState('');
  const [originCoord, setOriginCoord] = useState<LatLng | null>(null);
  const [destCoord,   setDestCoord]   = useState<LatLng | null>(null);
  const [waypoints,   setWaypoints]   = useState<Waypoint[]>([]);
  const [payMethod,   setPayMethod]   = useState<'cash'|'yape'|'plin'>('cash');

  // Viaje o envio de paquete
  const [service,     setService]     = useState<'ride'|'delivery'>('ride');
  const [pkgDesc,     setPkgDesc]     = useState('');
  const [pkgWeight,   setPkgWeight]   = useState('');
  const [pkgFragile,  setPkgFragile]  = useState(false);
  const [pkgDetails,  setPkgDetails]  = useState('');
  const [rcpName,     setRcpName]     = useState('');
  const [rcpPhone,    setRcpPhone]    = useState('');
  const [pkgPhotos,   setPkgPhotos]   = useState<File[]>([]);
  const [photoError,  setPhotoError]  = useState<string | null>(null);
  const isDelivery = service === 'delivery';

  // Cuándo: ahora o programado (fecha y hora de Perú)
  const [when,      setWhen]      = useState<'now'|'scheduled'>('now');
  const [schedDate, setSchedDate] = useState('');
  const [schedTime, setSchedTime] = useState('');
  const isScheduled = when === 'scheduled';
  const schedError  = isScheduled ? scheduleError(schedDate, schedTime) : null;
  function chooseWhen(v: 'now'|'scheduled') {
    setWhen(v);
    if (v === 'scheduled' && !schedDate) {
      const d = defaultSchedule();
      setSchedDate(d.date); setSchedTime(d.time);
    }
  }
  const schedMinDate = peruParts(Date.now()).date;
  const schedMaxDate = peruParts(Date.now() + SCHEDULE_MAX_DAYS * 24 * 3600 * 1000).date;

  function onPickPhotos(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (files.some(f => !f.type.startsWith('image/'))) {
      setPhotoError('Solo se aceptan imágenes.'); setPkgPhotos([]); return;
    }
    if (files.length > MAX_PKG_PHOTOS) {
      setPhotoError(`Máximo ${MAX_PKG_PHOTOS} fotos.`); setPkgPhotos([]); return;
    }
    setPhotoError(null);
    setPkgPhotos(files);
  }
  function removePhoto(i: number) {
    setPkgPhotos(prev => prev.filter((_, idx) => idx !== i));
  }

  // Miniaturas de las fotos elegidas (se liberan al cambiar)
  const photoUrls = useMemo(() => pkgPhotos.map(f => URL.createObjectURL(f)), [pkgPhotos]);
  useEffect(() => () => { photoUrls.forEach(u => URL.revokeObjectURL(u)); }, [photoUrls]);

  const [originSugg, setOriginSugg] = useState<GeoResult[]>([]);
  const [destSugg,   setDestSugg]   = useState<GeoResult[]>([]);
  const [wpSugg,     setWpSugg]     = useState<GeoResult[][]>([]);
  const [focusId,    setFocusId]    = useState<'origin'|'dest'|number|null>(null);
  const [activeInput, setActiveInput] = useState<'origin'|'dest'|number>('origin');
  const activeRef = useRef<'origin'|'dest'|number>('origin');

  // routeInfo viene del mapa via callback onRouteInfo
  const [routeInfo, setRouteInfo] = useState<{ km: number; mins: number; isFallback: boolean } | null>(null);

  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
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
    originTouched.current = true;
    setOriginText(v); setOriginCoord(null);
    if (v.length < 3) { setOriginSugg([]); return; }
    debounce('origin', async () => setOriginSugg(await geocode(v, searchNear).catch(() => [])));
  }
  function onDestChange(v: string) {
    setDestText(v); setDestCoord(null);
    if (v.length < 3) { setDestSugg([]); return; }
    debounce('dest', async () => setDestSugg(await geocode(v, searchNear).catch(() => [])));
  }
  function onWpChange(i: number, v: string) {
    setWaypoints(prev => { const u = [...prev]; u[i] = { address: v, coord: null }; return u; });
    if (v.length < 3) {
      setWpSugg(prev => { const s = [...prev]; s[i] = []; return s; }); return;
    }
    debounce(`wp${i}`, async () => {
      const res = await geocode(v, searchNear).catch(() => []);
      setWpSugg(prev => { const s = [...prev]; s[i] = res; return s; });
    });
  }

  function selectOrigin(r: GeoResult) {
    originTouched.current = true;
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

  /** Usa la ubicación del GPS como origen (misma lógica que tocar el mapa). */
  async function useMyLocation() {
    if (!myPos) return;
    originTouched.current = true;
    setLocating(true);
    const addr = await reverseGeocode(myPos);
    setOriginText(addr); setOriginCoord(myPos); setOriginSugg([]);
    setActive('dest');
    setLocating(false);
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
      originTouched.current = true;
      setOriginText(addr); setOriginCoord(pos); setOriginSugg([]);
      setActive('dest');
    }
  }

  const allCoords = [originCoord, ...waypoints.map(w => w.coord), destCoord].filter(Boolean) as LatLng[];
  // La tarifa sale de la configuracion del admin, no de numeros escritos aqui.
  const fareConfig = usePlatformConfig();
  const fare = routeInfo ? calcularTarifa(routeInfo.km, fareConfig) : null;

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

  // Mínimo permitido: la tarifa base del admin (igual que el backend).
  const minFare = fareConfig.minFare;
  const proposedFareNum = parseFloat(proposedFare);
  const proposedFareError = proposedFare === '' ? null
    : isNaN(proposedFareNum) || proposedFareNum <= 0 ? 'Ingresa un monto válido.'
    : createFareError(proposedFareNum, fareConfig);
  const proposedFareInvalid = proposedFareError !== null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!originCoord || !destCoord) { setError('Selecciona origen y destino.'); return; }

    // Validar la tarifa propuesta
    const fareToSend = parseFloat(proposedFare);
    if (isNaN(fareToSend) || fareToSend <= 0) {
      setError('Ingresa un monto válido.');
      return;
    }
    const minError = createFareError(fareToSend, fareConfig);
    if (minError) { setError(minError); return; }

    if (isDelivery) {
      if (!pkgDesc.trim()) { setError('Describe qué vas a enviar.'); return; }
      if (!rcpName.trim() || !rcpPhone.trim()) { setError('Indica el nombre y teléfono de quien recibe.'); return; }
      if (pkgPhotos.length === 0) { setError('Agrega al menos 1 foto del paquete.'); return; }
      if (pkgPhotos.length > MAX_PKG_PHOTOS) { setError(`Máximo ${MAX_PKG_PHOTOS} fotos del paquete.`); return; }
    }
    if (schedError) { setError(schedError); return; }

    setLoading(true); setError(null);
    try {
      const body = {
          originAddress: originText, originLat: originCoord.lat, originLng: originCoord.lng,
          destAddress:   destText,   destLat:   destCoord.lat,   destLng:   destCoord.lng,
          estimatedFare: fareToSend,
          paymentMethod: payMethod,
          waypoints: waypoints.filter(w => w.coord).map(w => ({
            address: w.address, lat: w.coord!.lat, lng: w.coord!.lng,
          })),
          ...(isDelivery ? {
            serviceType: 1,
            packageDescription: pkgDesc.trim(),
            packageWeightKg: pkgWeight ? Number(pkgWeight) : null,
            packageIsFragile: pkgFragile,
            packageDetails: pkgDetails.trim() || null,
            recipientName: rcpName.trim(),
            recipientPhone: rcpPhone.trim(),
          } : {}),
          // Programado: hora de Perú sin zona. Sin esto, es "ahora".
          ...(isScheduled ? { scheduledAt: `${schedDate}T${schedTime}:00` } : {}),
      };

      // Envío: datos + fotos juntos (sin fotos no se crea la solicitud).
      // Viaje: JSON normal.
      const created = isDelivery
        ? await createDelivery(body, pkgPhotos)
        : await apiFetch<{ id: string }>(`${API.trips}/trips`, { method: 'POST', body: JSON.stringify(body) });
      // Un programado todavía no es el viaje activo: se sigue por su id.
      navigate(isScheduled && created?.id
        ? `/app/pasajero/seguimiento?trip=${created.id}`
        : '/app/pasajero/seguimiento');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : isDelivery ? 'Error al crear el envío.' : 'Error al crear el viaje.');
    } finally { setLoading(false); }
  }

  const markers = [
    ...(originCoord ? [{ ...originCoord, label: 'Origen',  type: 'origin'      as const }] : []),
    ...waypoints.filter(w => w.coord).map((w, i) => ({ ...w.coord!, label: `Parada ${i+1}`, type: 'default' as const })),
    ...(destCoord   ? [{ ...destCoord,   label: 'Destino', type: 'destination' as const }] : []),
  ];

  const stopsMarked = waypoints.filter(w => w.coord).length;
  const activeLabel = typeof activeInput === 'number' ? `Parada ${activeInput + 1}` : activeInput === 'origin' ? 'Origen' : 'Destino';
  const submitDisabled = loading || !originCoord || !destCoord || proposedFareInvalid || proposedFare === ''
    || (isDelivery && pkgPhotos.length === 0) || !!schedError;
  // Por qué todavía no se puede enviar (ayuda corta junto al botón)
  const pendingHint = !originCoord ? 'Marca el origen'
    : !destCoord ? 'Marca el destino'
    : isDelivery && pkgPhotos.length === 0 ? 'Agrega al menos 1 foto del paquete'
    : proposedFareError ? proposedFareError
    : schedError ? schedError
    : null;

  return (
    <Page
      title={isDelivery ? 'Pedir envío' : 'Pedir viaje'}
      subtitle={isDelivery
        ? 'Indica dónde recoger y dónde entregar tu paquete. Escribe la dirección o toca el mapa.'
        : 'Escribe la dirección o toca el mapa para marcar los puntos.'}
      icon={isDelivery ? 'fa-box' : 'fa-car'}
      extra={<ServiceIcon delivery={isDelivery} />}
    >
      <form onSubmit={onSubmit} className="bx-request" noValidate>

        {/* 1. Servicio y recorrido */}
        <SectionCard className="bx-request-route" title="¿A dónde vamos?" icon="fa-route">
          <div className="bx-form">
            <div className="bx-seg" role="group" aria-label="Tipo de servicio">
              <button type="button" aria-pressed={!isDelivery} onClick={() => setService('ride')}>
                <i className="fa-solid fa-car" aria-hidden="true" />Viaje
              </button>
              <button type="button" aria-pressed={isDelivery} onClick={() => setService('delivery')}>
                <i className="fa-solid fa-box" aria-hidden="true" />Envío
              </button>
            </div>

            <AddressInput id="addr-origin" label={isDelivery ? 'Dónde recoger' : 'Origen'} dot="origin"
              value={originText} coord={originCoord}
              suggestions={originSugg} showSugg={focusId === 'origin'}
              onChange={onOriginChange} onSelect={selectOrigin}
              onFocus={() => { setFocusId('origin'); setActive('origin'); }}
              onBlur={() => setTimeout(() => setFocusId(null), 150)}
              onClose={() => setFocusId(null)}
              trailing={myPos && (
                <IconButton
                  icon={locating ? 'fa-spinner fa-spin' : 'fa-location-crosshairs'}
                  label="Usar mi ubicación actual"
                  onClick={useMyLocation}
                  disabled={locating}
                />
              )} />

            {waypoints.map((wp, i) => (
              <AddressInput key={i} id={`addr-wp-${i}`} label={`Parada ${i + 1}`} dot="stop"
                value={wp.address} coord={wp.coord}
                suggestions={wpSugg[i] ?? []} showSugg={focusId === i}
                onChange={v => onWpChange(i, v)} onSelect={r => selectWp(i, r)}
                onFocus={() => { setFocusId(i); setActive(i); }}
                onBlur={() => setTimeout(() => setFocusId(null), 150)}
                onClose={() => setFocusId(null)}
                trailing={<IconButton icon="fa-xmark" label={`Quitar parada ${i + 1}`} variant="danger" onClick={() => removeWaypoint(i)} />} />
            ))}

            <div>
              <button type="button" className="btn btn-sm btn-bugie-outline" onClick={addWaypoint}>
                <i className="fa-solid fa-plus" aria-hidden="true" />Agregar parada
              </button>
            </div>

            <AddressInput id="addr-dest" label={isDelivery ? 'Dónde entregar' : 'Destino'} dot="dest"
              value={destText} coord={destCoord}
              suggestions={destSugg} showSugg={focusId === 'dest'}
              onChange={onDestChange} onSelect={selectDest}
              onFocus={() => { setFocusId('dest'); setActive('dest'); }}
              onBlur={() => setTimeout(() => setFocusId(null), 150)}
              onClose={() => setFocusId(null)} />
          </div>
        </SectionCard>

        {/* Mapa: tocar marca el punto activo */}
        <SectionCard className="bx-request-map" flush>
          <div className="p-2">
            <div className="bx-request-mapbox bx-map">
              <BugieMap
                // El mapa toma el centro al crearse: al llegar el GPS se vuelve
                // a crear para arrancar en la ubicación del dispositivo.
                key={myPos ? 'gps' : 'config'}
                height="100%"
                markers={markers}
                showRoute={allCoords.length >= 2}
                origin={originCoord ?? undefined}
                destination={destCoord ?? undefined}
                waypoints={waypoints.filter(w => w.coord).map(w => w.coord!)}
                onMapClick={handleMapClick}
                onRouteInfo={setRouteInfo}
                center={searchNear}
                zoom={myPos ? 15 : defaultLoc.zoom}
              />
            </div>
          </div>
          <div className="bx-map-hint px-3 pb-3 mt-0">
            <span><i className="fa-solid fa-hand-pointer me-1" aria-hidden="true" />Al tocar el mapa marcas: <strong>{activeLabel}</strong></span>
            <div className="bx-pin-chips" role="group" aria-label="Qué punto marcar en el mapa">
              <button type="button" className="bx-pin-chip" aria-pressed={activeInput === 'origin'} onClick={() => setActive('origin')}>
                <span className="bx-dot" aria-hidden="true" />Origen
              </button>
              {waypoints.map((_, i) => (
                <button key={i} type="button" className="bx-pin-chip" aria-pressed={activeInput === i} onClick={() => setActive(i)}>
                  <span className="bx-dot stop" aria-hidden="true" />P{i + 1}
                </button>
              ))}
              <button type="button" className="bx-pin-chip" aria-pressed={activeInput === 'dest'} onClick={() => setActive('dest')}>
                <span className="bx-dot dest" aria-hidden="true" />Destino
              </button>
            </div>
          </div>
        </SectionCard>

        <div className="bx-request-details bx-stack">
          {/* 2. Datos del envío */}
          {isDelivery && (
            <SectionCard title="Tu paquete" icon="fa-box" description="El conductor lo verá antes de aceptar.">
              <div className="bx-form">
                <Field label="¿Qué envías?" required>
                  <input className="form-control" maxLength={200} placeholder="Ej. documentos, una caja"
                         value={pkgDesc} onChange={e => setPkgDesc(e.target.value)} />
                </Field>
                <div className="bx-form-grid">
                  <Field label="Peso aproximado (kg)" optional>
                    <input className="form-control" type="number" min="0" step="0.1" inputMode="decimal" placeholder="Ej. 2.5"
                           value={pkgWeight} onChange={e => setPkgWeight(e.target.value)} />
                  </Field>
                  <div className="bx-field">
                    <span className="bx-field-label">Cuidado</span>
                    <div className="bx-control-box">
                      <Checkbox id="pkgFragile" checked={pkgFragile} onChange={setPkgFragile} label="Es frágil" />
                    </div>
                  </div>
                </div>
                <Field label="Detalles" optional help="Ej. tocar el timbre del 2.º piso.">
                  <input className="form-control" maxLength={300}
                         value={pkgDetails} onChange={e => setPkgDetails(e.target.value)} />
                </Field>

                <div className="bx-field">
                  <span className="bx-field-label">
                    Fotos del paquete <span className="bx-field-req" aria-hidden="true">*</span>
                    <span className="bx-field-opt">(de 1 a {MAX_PKG_PHOTOS})</span>
                  </span>
                  <label className={`bx-upload position-relative ${photoError ? 'has-error' : ''}`} htmlFor="pkgPhotos">
                    <span className="ico" aria-hidden="true"><i className="fa-solid fa-camera" /></span>
                    <span className="txt">
                      <strong>{pkgPhotos.length > 0 ? 'Cambiar fotos' : 'Elegir fotos'}</strong>
                      {pkgPhotos.length > 0
                        ? `${pkgPhotos.length} foto${pkgPhotos.length > 1 ? 's' : ''} seleccionada${pkgPhotos.length > 1 ? 's' : ''}`
                        : 'Obligatorio: sin fotos no se crea el envío.'}
                    </span>
                    <input id="pkgPhotos" type="file" accept="image/*" multiple
                           aria-describedby="pkgPhotos-help"
                           onChange={e => { onPickPhotos(e.target.files); e.target.value = ''; }} />
                  </label>
                  {photoError
                    ? <p id="pkgPhotos-help" className="bx-field-error" role="alert"><i className="fa-solid fa-circle-exclamation" aria-hidden="true" />{photoError}</p>
                    : <p id="pkgPhotos-help" className="bx-field-help">Puedes elegir varias a la vez. Solo imágenes.</p>}
                  {pkgPhotos.length > 0 && (
                    <div className="bx-thumbs mt-1">
                      {pkgPhotos.map((f, i) => (
                        <figure key={`${f.name}-${i}`}>
                          <img src={photoUrls[i]} alt={`Foto ${i + 1} del paquete`} />
                          <span className="position-absolute" style={{ top: 4, right: 4 }}>
                            <IconButton icon="fa-xmark" label={`Quitar foto ${i + 1}`} size="sm" onClick={() => removePhoto(i)} />
                          </span>
                          <figcaption>{f.name}</figcaption>
                        </figure>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </SectionCard>
          )}

          {isDelivery && (
            <SectionCard title="Quién recibe" icon="fa-user" description="Le entregaremos el paquete a esta persona.">
              <div className="bx-form-grid">
                <Field label="Nombre" required>
                  <input className="form-control" maxLength={120} autoComplete="off"
                         value={rcpName} onChange={e => setRcpName(e.target.value)} />
                </Field>
                <Field label="Teléfono" required>
                  <input className="form-control" type="tel" inputMode="tel" maxLength={20} autoComplete="off" placeholder="+51 999 999 999"
                         value={rcpPhone} onChange={e => setRcpPhone(e.target.value)} />
                </Field>
              </div>
            </SectionCard>
          )}

          {/* Cuándo: ahora o programado */}
          <SectionCard title="¿Cuándo?" icon="fa-clock"
            description={isScheduled
              ? `Desde ${SCHEDULE_MIN_MINUTES} minutos hasta ${SCHEDULE_MAX_DAYS} días adelante (hora de Perú).`
              : undefined}>
            <div className="bx-form">
              <div className="bx-seg" role="group" aria-label="Cuándo">
                <button type="button" aria-pressed={!isScheduled} onClick={() => chooseWhen('now')}>
                  <i className="fa-solid fa-bolt" aria-hidden="true" />Ahora
                </button>
                <button type="button" aria-pressed={isScheduled} onClick={() => chooseWhen('scheduled')}>
                  <i className="fa-solid fa-calendar-days" aria-hidden="true" />Programar
                </button>
              </div>
              {isScheduled && (
                <>
                  <div className="bx-form-grid">
                    <Field label="Fecha" required>
                      <input className="form-control" type="date" min={schedMinDate} max={schedMaxDate}
                             value={schedDate} onChange={e => setSchedDate(e.target.value)} />
                    </Field>
                    <Field label="Hora" required>
                      <input className="form-control" type="time" step={300}
                             value={schedTime} onChange={e => setSchedTime(e.target.value)} />
                    </Field>
                  </div>
                  {schedError
                    ? <p className="bx-field-error mb-0" role="alert"><i className="fa-solid fa-circle-exclamation" aria-hidden="true" />{schedError}</p>
                    : <p className="bx-field-help mb-0">
                        <i className="fa-solid fa-calendar-check me-1" aria-hidden="true" />
                        {isDelivery ? 'Recojo' : 'Te recogemos'} el <strong>{scheduleLabel(schedDate, schedTime)}</strong>.
                        Los conductores negocian desde ahora; te recordaremos 30 y 10 minutos antes.
                      </p>}
                </>
              )}
            </div>
          </SectionCard>

          {/* 3. Pago y tarifa */}
          <SectionCard title="Pago y tarifa" icon="fa-wallet">
            <div className="bx-form">
              <Field label="Método de pago">
                <Select
                  value={payMethod}
                  onChange={setPayMethod}
                  options={[
                    { value: 'cash', label: 'Efectivo', icon: 'fa-money-bill-wave' },
                    { value: 'yape', label: 'Yape', icon: 'fa-mobile-screen' },
                    { value: 'plin', label: 'Plin', icon: 'fa-mobile-screen' },
                  ]}
                />

              </Field>

              {fare ? (
                <>
                  <div className="bx-box">
                    <div className="bx-kv"><span>Tarifa sugerida</span><span>S/ {fare.toFixed(2)}</span></div>
                    <div className="bx-kv"><span>Distancia</span><span>{routeInfo!.km.toFixed(1)} km</span></div>
                    <div className="bx-kv"><span>Tiempo estimado</span><span>{routeInfo!.mins} min</span></div>
                    {stopsMarked > 0 && (
                      <div className="bx-kv"><span>Paradas</span><span>{stopsMarked}</span></div>
                    )}
                    {routeInfo?.isFallback && (
                      <p className="small bx-text-warn mb-0 mt-1">
                        <i className="fa-solid fa-triangle-exclamation me-1" aria-hidden="true" />Distancia aproximada
                      </p>
                    )}
                  </div>
                  <Field
                    label="Tu propuesta (S/)"
                    required
                    error={proposedFareError ?? undefined}
                    help={minFare !== null
                      ? `Mínimo S/ ${minFare.toFixed(2)}. Los conductores pueden aceptarla o contraofertar.`
                      : 'Los conductores pueden aceptarla o contraofertar.'}
                  >
                    <input
                      type="number" step="0.10" min="0" inputMode="decimal"
                      className={`form-control ${proposedFareInvalid ? 'is-invalid' : ''}`}
                      value={proposedFare}
                      onChange={e => setProposedFare(e.target.value)}
                      placeholder={fare.toFixed(2)}
                    />
                  </Field>
                </>
              ) : (
                <p className="small bx-muted mb-0">
                  <i className="fa-solid fa-route me-1" aria-hidden="true" />Marca origen y destino para ver la tarifa sugerida.
                </p>
              )}
            </div>
          </SectionCard>

          {error && <Notice tone="bad">{error}</Notice>}

          <div className="bx-submit-bar">
            <div className="sum">
              <div className="v">{proposedFare && !proposedFareInvalid ? `S/ ${parseFloat(proposedFare).toFixed(2)}` : '—'}</div>
              <div className="l">{pendingHint ?? (isScheduled
                ? `Programado: ${scheduleLabel(schedDate, schedTime)}`
                : isDelivery ? 'Tu propuesta para el envío' : 'Tu propuesta para el viaje')}</div>
            </div>
            <button className="btn btn-bugie" type="submit" disabled={submitDisabled}>
              {loading
                ? <><span className="spinner-border spinner-border-sm" aria-hidden="true" />{isScheduled ? 'Programando…' : isDelivery ? 'Enviando…' : 'Buscando conductor…'}</>
                : isScheduled
                  ? <><i className="fa-solid fa-calendar-check" aria-hidden="true" />{isDelivery ? 'Programar envío' : 'Programar viaje'}</>
                  : isDelivery
                    ? <><i className="fa-solid fa-box" aria-hidden="true" />Solicitar envío</>
                    : <><i className="fa-solid fa-car" aria-hidden="true" />Solicitar viaje</>}
            </button>
          </div>
        </div>
      </form>
    </Page>
  );
}
