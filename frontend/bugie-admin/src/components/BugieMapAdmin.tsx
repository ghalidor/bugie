import { MutableRefObject, useEffect, useRef } from 'react';
import { useMapConfig } from '../hooks/useMapConfig';

export interface LatLng  { lat: number; lng: number; }
export interface MapMarker extends LatLng {
  /// Identificador estable del pin. Con id el mapa ACTUALIZA el pin existente
  /// (lo mueve con animación suave) en vez de borrarlo y crearlo de nuevo.
  /// Sin id se usa tipo + etiqueta como clave.
  id?: string;
  label?: string;
  type?:  'origin' | 'destination' | 'driver' | 'passenger' | 'default';
  /// Si true, el conductor se pinta rojo y se le agrega circunferencia roja.
  deviated?: boolean;
  /// Si true, el usuario (conductor o pasajero) tiene una alerta SOS activa.
  /// El marker se pinta con un anillo rojo pulsante (CSS animado) para
  /// que sea imposible de pasar por alto en el mapa. Tiene PRIORIDAD sobre
  /// 'deviated' (un usuario con SOS no se ve como "desviado" sino como SOS).
  sosActive?: boolean;
  /// Si true, el marker fue seleccionado desde la lista lateral. Se le pinta
  /// un anillo dorado destacado para que el admin lo identifique fácil entre
  /// los demás pines del mapa.
  highlighted?: boolean;
  extra?: {
    fullName?:      string;
    rating?:        number;
    hasActiveTrip?: boolean;
    tripStatus?:    number;
    vehiclePlate?:  string;
    vehicleBrand?:  string;
    vehicleModel?:  string;
    vehicleColor?:  string;
  };
}

interface BugieMapAdminProps {
  center?:  LatLng;
  zoom?:    number;
  markers?: MapMarker[];
  height?:  number | string;
  onFocusRef?: MutableRefObject<((lat: number, lng: number, label?: string) => void) | null>;
  /// Ref opcional para que el padre pueda pedirle al mapa que se reajuste
  /// para mostrar TODOS los markers en pantalla (fitBounds). Sin animación
  /// para evitar tiles rotos. Útil para botones de "autofoco".
  onFitBoundsRef?: MutableRefObject<(() => void) | null>;
  onMarkerClick?: (marker: MapMarker) => void;
  /// Polyline a dibujar sobre el mapa, en formato GraphHopper:
  /// array de [lng, lat]. Si está presente, se dibuja con un trazo grueso
  /// azul que sigue las calles reales (en lugar de línea recta).
  /// Útil en el modal de detalle del viaje para mostrar la ruta planificada.
  routeCoordinates?: number[][];
  /// Varias líneas con estilo propio (color, punteado, grosor), en orden de
  /// dibujo: la última queda encima. Puntos en formato Leaflet [lat, lng].
  /// Se suman a routeCoordinates (no lo reemplazan) y entran en el encuadre.
  /// Con `id` estable, la línea se actualiza en sitio (setLatLngs) cuando
  /// cambian sus puntos; las demás no se tocan.
  lines?: MapLine[];
}

/// Línea con estilo para el mapa (ruta del sistema, recorrido real, etc.).
export interface MapLine {
  id?: string;
  /// [[lat, lng], ...]
  points: [number, number][];
  color: string;
  weight?: number;
  opacity?: number;
  /// Patrón de punteado de Leaflet/SVG, p. ej. '8 8'. Sin valor = continua.
  dashArray?: string;
}

/// Colores de las líneas de un viaje (mapa y leyenda usan los mismos).
export const ROUTE_COLORS = {
  planned: '#3b82f6',  // ruta del sistema (azul)
  real:    '#10b981',  // recorrido real (verde)
  pickup:  '#94a3b8',  // tramo de recogida (gris tenue)
} as const;

/// Duración del movimiento suave de un pin entre dos posiciones GPS.
const MOVE_ANIM_MS = 1000;
/// Si el salto es mayor a esto (m), el pin se mueve de golpe (no tiene
/// sentido "deslizar" un auto 5 km por un GPS atrasado).
const MOVE_ANIM_MAX_M = 3000;

// ── Iconos ─────────────────────────────────────────────────────────────

function makeDriverIcon(hasActiveTrip: boolean, deviated: boolean): string {
  const color = deviated ? '#dc2626' : (hasActiveTrip ? '#818cf8' : '#34d399');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
    <circle cx="18" cy="18" r="17" fill="${color}" opacity="0.2"/>
    <circle cx="18" cy="18" r="13" fill="${color}"/>
    <text x="18" y="23" text-anchor="middle" font-size="13" fill="#fff">🚗</text>
    <line x1="18" y1="31" x2="18" y2="42" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function makeSosIcon(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
    <circle cx="18" cy="18" r="17" fill="#f87171" opacity="0.25"/>
    <circle cx="18" cy="18" r="13" fill="#f87171"/>
    <text x="18" y="23" text-anchor="middle" font-size="14" fill="#fff">🚨</text>
    <line x1="18" y1="31" x2="18" y2="42" stroke="#f87171" stroke-width="3" stroke-linecap="round"/>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function makePassengerIcon(): string {
  const color = '#f97316';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
    <circle cx="18" cy="18" r="17" fill="${color}" opacity="0.2"/>
    <circle cx="18" cy="18" r="13" fill="${color}"/>
    <text x="18" y="23" text-anchor="middle" font-size="13" fill="#fff">🧍</text>
    <line x1="18" y1="31" x2="18" y2="42" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/// Pin verde para "Origen" del viaje (punto de recogida).
function makeOriginIcon(): string {
  const color = '#10b981';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
    <circle cx="18" cy="18" r="17" fill="${color}" opacity="0.2"/>
    <circle cx="18" cy="18" r="13" fill="${color}"/>
    <text x="18" y="23" text-anchor="middle" font-size="13" fill="#fff" font-weight="bold">A</text>
    <line x1="18" y1="31" x2="18" y2="42" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/// Pin rojo oscuro para "Destino" del viaje (a dónde se va).
function makeDestinationIcon(): string {
  const color = '#1e293b';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
    <circle cx="18" cy="18" r="17" fill="${color}" opacity="0.2"/>
    <circle cx="18" cy="18" r="13" fill="${color}"/>
    <text x="18" y="23" text-anchor="middle" font-size="13" fill="#fff" font-weight="bold">B</text>
    <line x1="18" y1="31" x2="18" y2="42" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/// URL del ícono según tipo y estado del pin.
function iconUrlFor(m: MapMarker): string {
  const isDriver    = m.type === 'driver';
  const isPassenger = m.type === 'passenger';
  const isOrigin    = m.type === 'origin';
  const isDest      = m.type === 'destination' && !m.label?.includes('SOS');
  const isSosLabel  = m.label?.includes('SOS');

  // Si el usuario tiene SOS activo, su ícono se reemplaza por el de SOS
  // (rojo + emoji 🚨) sin importar si era conductor o pasajero. Es la
  // forma de mostrar emergencia sin agregar un pin extra encima.
  if (m.sosActive)  return makeSosIcon();
  if (isDriver)     return makeDriverIcon(m.extra?.hasActiveTrip ?? false, m.deviated ?? false);
  if (isPassenger)  return makePassengerIcon();
  if (isSosLabel)   return makeSosIcon();
  if (isOrigin)     return makeOriginIcon();
  if (isDest)       return makeDestinationIcon();
  return makeDriverIcon(false, false);
}

/// HTML del popup del pin.
function popupHtmlFor(m: MapMarker): string {
  const isDriver    = m.type === 'driver';
  const isPassenger = m.type === 'passenger';
  if (m.sosActive) {
    // Popup unificado de SOS — cualquier rol con alerta activa
    const who = isDriver
      ? (m.extra?.fullName || m.label || 'Conductor')
      : (m.label || 'Pasajero');
    return `
      <div style="font-family:sans-serif;min-width:170px;padding:4px">
        <div style="font-size:0.95rem;font-weight:700;margin-bottom:4px;color:#dc2626">
          🚨 SOS ACTIVO
        </div>
        <div style="font-size:0.86rem;font-weight:600;color:#1a1730;margin-bottom:2px">
          ${who}
        </div>
        <div style="font-size:0.78rem;color:#555">
          ${isDriver ? 'Conductor en emergencia' : 'Pasajero en emergencia'}
        </div>
      </div>`;
  }
  if (isDriver && m.extra) {
    const status = m.deviated
      ? '<span style="color:#dc2626;font-weight:700">⚠️ Fuera de la ruta</span>'
      : m.extra.hasActiveTrip
        ? '<span style="color:#818cf8;font-weight:600">🚗 En viaje</span>'
        : '<span style="color:#34d399;font-weight:600">✅ Disponible</span>';
    return `
      <div style="font-family:sans-serif;min-width:160px;padding:4px">
        <div style="font-size:0.95rem;font-weight:700;margin-bottom:4px;color:#1a1730">
          ${m.extra.fullName || 'Conductor'}
        </div>
        <div style="font-size:0.82rem;margin-bottom:4px">${status}</div>
        <div style="font-size:0.82rem;color:#555">⭐ ${m.extra.rating?.toFixed(1) ?? '—'}</div>
      </div>`;
  }
  if (isPassenger) {
    const labelMap: Record<number, string> = {
      1: '⏳ Buscando conductor',
      2: '🚗 Conductor en camino',
      3: '🚦 Viaje en curso',
      6: '🚨 SOS activo',
      7: '💬 Negociando tarifa',
    };
    const status = labelMap[m.extra?.tripStatus ?? 0] ?? 'En viaje';
    return `
      <div style="font-family:sans-serif;min-width:160px;padding:4px">
        <div style="font-size:0.95rem;font-weight:700;margin-bottom:4px;color:#1a1730">
          ${m.label || 'Pasajero'}
        </div>
        <div style="font-size:0.82rem;color:#f97316;font-weight:600">${status}</div>
      </div>`;
  }
  return `<div style="font-family:sans-serif;padding:4px;font-weight:600;color:#1a1730">${m.label ?? ''}</div>`;
}

/* Teselas del mapa.
   Se usa OpenStreetMap estándar, que NO pide clave. Antes se usaba
   basemaps.cartocdn.com, que empezó a exigirla y devolvía imágenes con el
   aviso "API key required" dentro del propio mapa.

   OSM solo tiene versión clara, así que para el tema oscuro se invierten los
   colores con un filtro CSS. Es el truco habitual y evita depender de un
   proveedor con clave.

   Para producción con tráfico real conviene un proveedor propio (MapTiler,
   Stadia) o teselas auto-alojadas: la política de uso de OSM desaconseja
   volúmenes altos. */
const TILE_URL  = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/* Filtro que convierte el mapa claro en oscuro. Se aplica solo a las teselas,
   nunca a los marcadores, para que los pines conserven su color. */
const DARK_TILE_FILTER = 'invert(1) hue-rotate(180deg) brightness(.92) contrast(.95) saturate(.75)';

// ── Estado interno por pin / línea (capas Leaflet vivas) ───────────────

/// Anillos alrededor de un pin: SOS (rojo grande), desvío (rojo) y selección (dorado).
type RingKind = 'sos' | 'dev' | 'hl';
const RING_STYLE: Record<RingKind, { radius: number; color: string; fillOpacity: number; weight: number }> = {
  // Anillo de SOS: más ancho que el de "desviado" para que se note que es
  // una emergencia, no un desvío. Tiene prioridad sobre el de desvío.
  sos: { radius: 120, color: '#dc2626', fillOpacity: 0.18, weight: 3 },
  dev: { radius: 80,  color: '#dc2626', fillOpacity: 0.15, weight: 2 },
  // Anillo dorado de selección. Se dibuja ADEMÁS del de SOS/desvío para que
  // un pin pueda estar en SOS Y seleccionado y se vean ambos estados.
  hl:  { radius: 60,  color: '#fbbf24', fillOpacity: 0.18, weight: 4 },
};

interface MarkerEntry {
  data: MapMarker;
  marker: any;
  iconUrl: string;
  popupHtml: string;
  rings: Partial<Record<RingKind, any>>;
  /// requestAnimationFrame activo del movimiento suave (0 = ninguno).
  raf: number;
}

interface LineEntry {
  layer: any;
  points: [number, number][];
  style: string;
}

const lineStyleKey = (ln: MapLine) => `${ln.color}|${ln.weight ?? 4}|${ln.opacity ?? 0.9}|${ln.dashArray ?? ''}`;

function samePoints(a: [number, number][], b: [number, number][]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) return false;
  return true;
}

/// Distancia aproximada (m) entre dos coordenadas (suficiente para decidir si animar).
function distanceM(a: LatLng, b: LatLng): number {
  const R = 6371000, rad = (d: number) => d * Math.PI / 180;
  const x = rad(b.lng - a.lng) * Math.cos(rad((a.lat + b.lat) / 2));
  const y = rad(b.lat - a.lat);
  return Math.sqrt(x * x + y * y) * R;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function BugieMapAdmin({
  center, zoom,
  markers = [], height = 320,
  onFocusRef,
  onFitBoundsRef,
  onMarkerClick,
  routeCoordinates,
  lines,
}: BugieMapAdminProps) {
  const config = useMapConfig();
  const finalCenter: LatLng = center ?? { lat: config.lat, lng: config.lng };
  const finalZoom: number   = zoom   ?? config.zoom;

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<any>(null);
  // Observa el cambio de tema para invertir las teselas en oscuro.
  const themeObserverRef = useRef<MutationObserver | null>(null);
  // Pines y líneas vivos, por clave. Se actualizan en sitio: solo se toca lo que cambió.
  const markerEntries = useRef<Map<string, MarkerEntry>>(new Map());
  const lineEntries   = useRef<Map<string, LineEntry>>(new Map());
  const didFitOnce   = useRef<boolean>(false);
  // Si las líneas llegan después del primer encuadre, se reencuadra una vez.
  const didFitLines  = useRef<boolean>(false);
  // El click usa siempre el handler más reciente sin recrear los pines.
  const onMarkerClickRef = useRef(onMarkerClick);
  onMarkerClickRef.current = onMarkerClick;

  const fitLayers = () => [
    ...Array.from(markerEntries.current.values()).map(e => e.marker),
    ...Array.from(lineEntries.current.values()).map(e => e.layer),
  ];

  // ResizeObserver para invalidateSize cuando cambia tamaño del contenedor.
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      setTimeout(() => { mapRef.current?.invalidateSize?.(); }, 50);
    });
    ro.observe(containerRef.current);
    const onWindowResize = () => mapRef.current?.invalidateSize?.();
    window.addEventListener('resize', onWindowResize);
    return () => {
      themeObserverRef.current?.disconnect();
      themeObserverRef.current = null;
      ro.disconnect();
      window.removeEventListener('resize', onWindowResize);
    };
  }, []);

  // Exponer función de foco al padre (centrar sin cambiar zoom drásticamente).
  // Sin animación: la animación de Leaflet en modales con tamaño variable
  // puede dejar tiles a medio cargar / pines en posiciones raras.
  useEffect(() => {
    if (!onFocusRef) return;
    onFocusRef.current = (lat: number, lng: number) => {
      const m = mapRef.current;
      if (!m) return;
      // Forzar recálculo de tamaño ANTES de mover, por si el contenedor cambió
      m.invalidateSize();
      const currentZoom = m.getZoom();
      const targetZoom = currentZoom < 14 ? 15 : currentZoom;
      m.setView([lat, lng], targetZoom, { animate: false });
    };
    return () => { if (onFocusRef) onFocusRef.current = null; };
  }, [onFocusRef]);

  // Exponer fitBounds al padre. Reencaja todos los markers visibles en el
  // mapa con padding. Útil para botón "autofoco" que vuelve a mostrar todo.
  useEffect(() => {
    if (!onFitBoundsRef) return;
    onFitBoundsRef.current = () => {
      const m = mapRef.current;
      if (!m) return;
      const L = (window as any).L;
      if (!L) return;
      try {
        // Forzar recálculo de tamaño antes (modal/columna pudo cambiar tamaño)
        m.invalidateSize();
        // Markers (getLatLng) y las líneas de `lines` (no círculos).
        const ll = fitLayers();
        if (ll.length === 0) return;
        if (ll.length === 1 && typeof ll[0].getLatLng === 'function') {
          // Un solo marker: setView sin animar
          const p = ll[0].getLatLng();
          m.setView([p.lat, p.lng], 15, { animate: false });
        } else {
          const g = L.featureGroup(ll);
          // animate: false para evitar el bug de tiles rotos dentro del modal
          m.fitBounds(g.getBounds(), { padding: [40, 40], animate: false });
        }
      } catch {}
    };
    return () => { if (onFitBoundsRef) onFitBoundsRef.current = null; };
  }, [onFitBoundsRef]);

  // Dibujar/actualizar markers y líneas (incremental: solo lo que cambió).
  useEffect(() => {
    const L = (window as any).L;
    if (!L) return;

    // Espera a que el container tenga tamaño real antes de inicializar
    // Leaflet. Crítico para evitar el bug del modal con tamaño 0.
    let cancelled = false;
    const ensureSizeAndDraw = (attempt = 0) => {
      if (cancelled) return;
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        if (attempt < 30) {
          setTimeout(() => ensureSizeAndDraw(attempt + 1), 50);
        }
        return;
      }
      drawMap();
    };

    /// Mueve el pin (y sus anillos) a la nueva posición. Conductores y
    /// pasajeros se deslizan ~1 s entre GPS y GPS; el resto salta.
    const moveEntry = (e: MarkerEntry, to: LatLng, animate: boolean) => {
      if (e.raf) { cancelAnimationFrame(e.raf); e.raf = 0; }
      const setAll = (lat: number, lng: number) => {
        e.marker.setLatLng([lat, lng]);
        Object.values(e.rings).forEach(r => r?.setLatLng([lat, lng]));
      };
      const from = e.marker.getLatLng() as LatLng;
      const dist = distanceM(from, to);
      if (!animate || dist < 0.5 || dist > MOVE_ANIM_MAX_M || prefersReducedMotion()) { setAll(to.lat, to.lng); return; }
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / MOVE_ANIM_MS);
        const k = 1 - (1 - t) * (1 - t); // ease-out
        setAll(from.lat + (to.lat - from.lat) * k, from.lng + (to.lng - from.lng) * k);
        e.raf = t < 1 ? requestAnimationFrame(step) : 0;
      };
      e.raf = requestAnimationFrame(step);
    };

    const removeEntry = (map: any, e: MarkerEntry) => {
      if (e.raf) cancelAnimationFrame(e.raf);
      try { map.removeLayer(e.marker); } catch {}
      Object.values(e.rings).forEach(r => { try { map.removeLayer(r); } catch {} });
    };

    const syncRing = (map: any, e: MarkerEntry, kind: RingKind, wanted: boolean, at: LatLng) => {
      const cur = e.rings[kind];
      if (wanted && !cur) {
        const s = RING_STYLE[kind];
        e.rings[kind] = L.circle([at.lat, at.lng], { radius: s.radius, color: s.color, fillColor: s.color, fillOpacity: s.fillOpacity, weight: s.weight }).addTo(map);
      } else if (!wanted && cur) {
        try { map.removeLayer(cur); } catch {}
        delete e.rings[kind];
      }
    };

    const syncMarkers = (map: any) => {
      const entries = markerEntries.current;
      const wanted = new Map<string, MapMarker>();
      const seen: Record<string, number> = {};
      markers.forEach(m => {
        const base = m.id ?? `${m.type ?? 'default'}:${m.label ?? ''}`;
        const n = seen[base] ?? 0; seen[base] = n + 1;
        wanted.set(n === 0 ? base : `${base}#${n}`, m);
      });

      // Pines que ya no están
      entries.forEach((e, key) => { if (!wanted.has(key)) { removeEntry(map, e); entries.delete(key); } });

      wanted.forEach((m, key) => {
        const iconUrl = iconUrlFor(m);
        const popupHtml = popupHtmlFor(m);
        const makeIcon = () => L.icon({ iconUrl, iconSize: [36, 44], iconAnchor: [18, 44], popupAnchor: [0, -44] });
        let e = entries.get(key);
        if (!e) {
          const marker = L.marker([m.lat, m.lng], { icon: makeIcon() }).addTo(map);
          marker.bindPopup(popupHtml);
          const entry: MarkerEntry = { data: m, marker, iconUrl, popupHtml, rings: {}, raf: 0 };
          marker.on('click', () => onMarkerClickRef.current?.(entry.data));
          entries.set(key, entry);
          e = entry;
        } else {
          if (e.iconUrl !== iconUrl) { e.marker.setIcon(makeIcon()); e.iconUrl = iconUrl; }
          if (e.popupHtml !== popupHtml) { e.marker.setPopupContent(popupHtml); e.popupHtml = popupHtml; }
          // Se compara contra la última posición pedida (no la visual, que
          // puede estar a mitad de animación).
          if (e.data.lat !== m.lat || e.data.lng !== m.lng) {
            moveEntry(e, { lat: m.lat, lng: m.lng }, m.type === 'driver' || m.type === 'passenger');
          }
          e.data = m;
        }

        const at = e.raf ? (e.marker.getLatLng() as LatLng) : { lat: m.lat, lng: m.lng };
        const inSos = m.sosActive === true;
        syncRing(map, e, 'sos', inSos, at);
        // Solo dibujamos el círculo de desvío si NO está en SOS (SOS gana).
        syncRing(map, e, 'dev', !inSos && m.type === 'driver' && m.deviated === true, at);
        syncRing(map, e, 'hl', m.highlighted === true, at);
      });
    };

    const syncLines = (map: any) => {
      const entries = lineEntries.current;
      const wanted: Array<{ key: string; ln: MapLine }> = [];
      // Si el padre pasa la ruta REAL calculada por GraphHopper (coordenadas
      // siguiendo las calles), la dibujamos. Sin esto NO dibujamos nada entre
      // origen y destino, porque una línea recta pasaría sobre edificios y
      // no representa el viaje. routeCoordinates viene como [[lng,lat], ...]
      // (convención GraphHopper), por eso invertimos para Leaflet ([lat,lng]).
      if (routeCoordinates && routeCoordinates.length >= 2) {
        wanted.push({ key: '__route', ln: { points: routeCoordinates.map(c => [c[1], c[0]] as [number, number]), color: '#3b82f6', weight: 5, opacity: 0.85 } });
      }
      (lines ?? []).forEach((ln, i) => {
        if (!ln.points || ln.points.length < 2) return;
        wanted.push({ key: ln.id ?? `line#${i}`, ln });
      });
      const wantedKeys = new Set(wanted.map(w => w.key));
      entries.forEach((e, key) => { if (!wantedKeys.has(key)) { try { map.removeLayer(e.layer); } catch {} entries.delete(key); } });

      let added = false;
      wanted.forEach(({ key, ln }) => {
        const style = lineStyleKey(ln);
        const e = entries.get(key);
        if (!e) {
          const layer = L.polyline(ln.points, {
            color: ln.color, weight: ln.weight ?? 4, opacity: ln.opacity ?? 0.9, dashArray: ln.dashArray,
            lineCap: 'round', lineJoin: 'round',
          }).addTo(map);
          entries.set(key, { layer, points: ln.points, style });
          added = true;
          return;
        }
        if (e.style !== style) {
          e.layer.setStyle({ color: ln.color, weight: ln.weight ?? 4, opacity: ln.opacity ?? 0.9, dashArray: ln.dashArray ?? null });
          e.style = style;
        }
        if (!samePoints(e.points, ln.points)) { e.layer.setLatLngs(ln.points); e.points = ln.points; }
      });
      // Con líneas nuevas se respeta el orden de dibujo pedido (la última encima).
      if (added) wanted.forEach(({ key }) => { try { entries.get(key)?.layer.bringToFront(); } catch {} });
    };

    const drawMap = () => {
      const isFirstMount = !mapRef.current;

      if (isFirstMount) {
        mapRef.current = L.map(containerRef.current, {
          center: [finalCenter.lat, finalCenter.lng],
          zoom: finalZoom,
        });
        {
          const layer = L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19 });
          layer.addTo(mapRef.current);

          // La tesela de OSM es clara. En tema oscuro se invierte con un filtro
          // CSS aplicado SOLO al contenedor de teselas, nunca a los marcadores.
          const paneEl = mapRef.current.getPane('tilePane');
          const applyFilter = () => {
            if (!paneEl) return;
            const dark = document.body.getAttribute('data-theme') === 'dark';
            paneEl.style.filter = dark ? DARK_TILE_FILTER : '';
          };
          applyFilter();

          // El usuario puede cambiar de tema con el mapa ya abierto.
          const observer = new MutationObserver(applyFilter);
          observer.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
          themeObserverRef.current = observer;
        }
        // Por si el container tenía tamaño justo en el borde de detección
        setTimeout(() => mapRef.current?.invalidateSize(), 100);
      }

      const map = mapRef.current;
      syncMarkers(map);
      syncLines(map);

      // Fit inicial (solo primera vez con markers o líneas)
      const hasLines = lineEntries.current.size > 0;
      if ((!didFitOnce.current && (markers.length >= 1 || hasLines)) || (hasLines && !didFitLines.current)) {
        if (hasLines) didFitLines.current = true;
        const doFit = () => {
          if (cancelled || !mapRef.current) return;
          try {
            map.invalidateSize();
            if (markers.length === 1 && lineEntries.current.size === 0) {
              map.setView([markers[0].lat, markers[0].lng], 15);
            } else {
              const ll = fitLayers();
              if (ll.length >= 1) {
                const g = L.featureGroup(ll);
                map.fitBounds(g.getBounds(), { padding: [40, 40] });
              }
            }
            didFitOnce.current = true;
          } catch {}
        };
        setTimeout(doFit, 150);
        setTimeout(doFit, 400);
      }
    };

    ensureSizeAndDraw();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, routeCoordinates, lines]);

  // Cleanup al desmontar
  useEffect(() => () => {
    markerEntries.current.forEach(e => { if (e.raf) cancelAnimationFrame(e.raf); });
    try { mapRef.current?.remove(); } catch {}
    mapRef.current = null;
    markerEntries.current = new Map();
    lineEntries.current = new Map();
    didFitOnce.current = false;
    didFitLines.current = false;
  }, []);

  // Re-centrar si cambia configuración global Y no hay center explícito
  useEffect(() => {
    if (mapRef.current && center === undefined) {
      mapRef.current.setView([finalCenter.lat, finalCenter.lng], finalZoom);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.lat, config.lng, config.zoom]);

  return (
    <div
      ref={containerRef}
      style={{ height, width: '100%', borderRadius: 12, overflow: 'hidden', zIndex: 0 }}
    />
  );
}
