import { MutableRefObject, useEffect, useRef } from 'react';
import { useMapConfig } from '../hooks/useMapConfig';

export interface LatLng  { lat: number; lng: number; }
export interface MapMarker extends LatLng {
  /// Identificador estable del pin. Con id el mapa ACTUALIZA el pin existente
  /// (lo mueve con animación suave) en vez de borrarlo y crearlo de nuevo.
  /// Sin id se usa tipo + etiqueta como clave.
  id?: string;
  label?: string;
  /// 'flag' = bandera de destino de un viaje en curso (usa `color`).
  type?:  'origin' | 'destination' | 'driver' | 'passenger' | 'flag' | 'default';
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
  /// Pin atenuado (opacidad baja): p. ej. las demás unidades mientras se sigue a una.
  dimmed?: boolean;
  /// Alerta de seguimiento abierta (sin señal, detenido, demorado): anillo ámbar.
  /// SOS y desvío tienen prioridad.
  warned?: boolean;
  /// Color del pin cuando el tipo lo admite (bandera de destino).
  color?: string;
  /// Grupo de agrupación. Solo los pines con grupo se juntan en un círculo con
  /// el número al alejar el mapa (ver prop `cluster`). Sin grupo, siempre visible.
  clusterGroup?: string;
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

/// Agrupación de pines por cuadrícula en píxeles (sin librerías).
export interface MapClusterOptions {
  /// Tamaño de la celda en píxeles de pantalla (por defecto 64).
  gridPx?: number;
  /// Hasta este zoom se agrupa; más cerca se ven todos los pines (por defecto 15).
  maxZoom?: number;
  /// Texto accesible por grupo, en plural: { drivers: 'conductores disponibles' }.
  labels?: Record<string, string>;
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
  /// Ref para desplazar el mapa a un punto SIN cambiar el zoom (seguir una unidad).
  onPanToRef?: MutableRefObject<((lat: number, lng: number) => void) | null>;
  /// El usuario empezó a arrastrar el mapa con el mouse o el dedo.
  onUserDrag?: () => void;
  onMarkerClick?: (marker: MapMarker) => void;
  /// Agrupa los pines con `clusterGroup` al alejar el mapa.
  cluster?: MapClusterOptions;
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

/// Colores del pin del conductor según su estado (los usa también la leyenda).
export const DRIVER_COLORS = {
  available: '#34d399', // disponible
  enRoute:   '#0ea5e9', // en camino al recojo
  inTrip:    '#818cf8', // viaje en curso
  deviated:  '#dc2626', // fuera de la ruta
  sos:       '#f87171', // SOS
} as const;

/// Duración del movimiento suave de un pin entre dos posiciones GPS.
const MOVE_ANIM_MS = 1000;
/// Si el salto es mayor a esto (m), el pin se mueve de golpe (no tiene
/// sentido "deslizar" un auto 5 km por un GPS atrasado).
const MOVE_ANIM_MAX_M = 3000;
/// Opacidad de un pin atenuado.
const DIM_OPACITY = 0.25;

// ── Iconos ─────────────────────────────────────────────────────────────
// Se guardan en caché por variante: con cientos de pines y un GPS por
// segundo no se vuelve a armar el SVG de cada pin.

const iconCache = new Map<string, string>();
function cachedIcon(key: string, build: () => string): string {
  let url = iconCache.get(key);
  if (!url) { url = build(); iconCache.set(key, url); }
  return url;
}
const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

function makeDriverIcon(color: string): string {
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
    <circle cx="18" cy="18" r="17" fill="${color}" opacity="0.2"/>
    <circle cx="18" cy="18" r="13" fill="${color}"/>
    <text x="18" y="23" text-anchor="middle" font-size="13" fill="#fff">🚗</text>
    <line x1="18" y1="31" x2="18" y2="42" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
  </svg>`);
}

function makeSosIcon(): string {
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
    <circle cx="18" cy="18" r="17" fill="#f87171" opacity="0.25"/>
    <circle cx="18" cy="18" r="13" fill="#f87171"/>
    <text x="18" y="23" text-anchor="middle" font-size="14" fill="#fff">🚨</text>
    <line x1="18" y1="31" x2="18" y2="42" stroke="#f87171" stroke-width="3" stroke-linecap="round"/>
  </svg>`);
}

function makePassengerIcon(): string {
  const color = '#f97316';
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
    <circle cx="18" cy="18" r="17" fill="${color}" opacity="0.2"/>
    <circle cx="18" cy="18" r="13" fill="${color}"/>
    <text x="18" y="23" text-anchor="middle" font-size="13" fill="#fff">🧍</text>
    <line x1="18" y1="31" x2="18" y2="42" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
  </svg>`);
}

/// Pin verde para "Origen" del viaje (punto de recogida).
function makeOriginIcon(): string {
  const color = '#10b981';
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
    <circle cx="18" cy="18" r="17" fill="${color}" opacity="0.2"/>
    <circle cx="18" cy="18" r="13" fill="${color}"/>
    <text x="18" y="23" text-anchor="middle" font-size="13" fill="#fff" font-weight="bold">A</text>
    <line x1="18" y1="31" x2="18" y2="42" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
  </svg>`);
}

/// Pin rojo oscuro para "Destino" del viaje (a dónde se va).
function makeDestinationIcon(): string {
  const color = '#1e293b';
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
    <circle cx="18" cy="18" r="17" fill="${color}" opacity="0.2"/>
    <circle cx="18" cy="18" r="13" fill="${color}"/>
    <text x="18" y="23" text-anchor="middle" font-size="13" fill="#fff" font-weight="bold">B</text>
    <line x1="18" y1="31" x2="18" y2="42" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
  </svg>`);
}

/// Bandera de destino (mástil con borde blanco para que se vea en tema oscuro).
function makeFlagIcon(color: string): string {
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40">
    <ellipse cx="8" cy="37.5" rx="5" ry="2" fill="#000" opacity="0.25"/>
    <line x1="8" y1="37" x2="8" y2="4" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
    <line x1="8" y1="37" x2="8" y2="4" stroke="#1e293b" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M9 4 H27 L22.5 10.5 L27 17 H9 Z" fill="${color}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
  </svg>`);
}

/// Color del pin de un conductor según su estado.
function driverColor(m: MapMarker): string {
  if (m.deviated) return DRIVER_COLORS.deviated;
  if (m.extra?.tripStatus === 2) return DRIVER_COLORS.enRoute;
  return m.extra?.hasActiveTrip ? DRIVER_COLORS.inTrip : DRIVER_COLORS.available;
}

/// URL del ícono según tipo y estado del pin.
function iconUrlFor(m: MapMarker): string {
  const isDest     = m.type === 'destination' && !m.label?.includes('SOS');
  const isSosLabel = m.label?.includes('SOS');

  // Si el usuario tiene SOS activo, su ícono se reemplaza por el de SOS
  // (rojo + emoji 🚨) sin importar si era conductor o pasajero. Es la
  // forma de mostrar emergencia sin agregar un pin extra encima.
  if (m.sosActive)            return cachedIcon('sos', makeSosIcon);
  if (m.type === 'driver')    { const c = driverColor(m); return cachedIcon(`driver:${c}`, () => makeDriverIcon(c)); }
  if (m.type === 'passenger') return cachedIcon('passenger', makePassengerIcon);
  if (m.type === 'flag')      { const c = m.color ?? '#1e293b'; return cachedIcon(`flag:${c}`, () => makeFlagIcon(c)); }
  if (isSosLabel)             return cachedIcon('sos', makeSosIcon);
  if (m.type === 'origin')    return cachedIcon('origin', makeOriginIcon);
  if (isDest)                 return cachedIcon('destination', makeDestinationIcon);
  return cachedIcon(`driver:${DRIVER_COLORS.available}`, () => makeDriverIcon(DRIVER_COLORS.available));
}

/// Tamaño y ancla del ícono (la bandera se apoya en la base del mástil).
function iconGeometry(m: MapMarker) {
  if (m.type === 'flag' && !m.sosActive) return { iconSize: [30, 40], iconAnchor: [8, 38], popupAnchor: [6, -36] };
  return { iconSize: [36, 44], iconAnchor: [18, 44], popupAnchor: [0, -44] };
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
      : m.extra.tripStatus === 2
        ? '<span style="color:#0284c7;font-weight:600">🚗 En camino al recojo</span>'
        : m.extra.hasActiveTrip
          ? '<span style="color:#6366f1;font-weight:600">🚗 En viaje</span>'
          : '<span style="color:#059669;font-weight:600">✅ Disponible</span>';
    const plate = m.extra.vehiclePlate ? `<div style="font-size:0.8rem;color:#555;margin-bottom:2px">${m.extra.vehiclePlate}</div>` : '';
    return `
      <div style="font-family:sans-serif;min-width:160px;padding:4px">
        <div style="font-size:0.95rem;font-weight:700;margin-bottom:4px;color:#1a1730">
          ${m.extra.fullName || 'Conductor'}
        </div>
        ${plate}
        <div style="font-size:0.82rem;margin-bottom:4px">${status}</div>
        <div style="font-size:0.82rem;color:#555">⭐ ${m.extra.rating?.toFixed(1) ?? '—'}</div>
      </div>`;
  }
  if (isPassenger) {
    const labelMap: Record<number, string> = {
      1: '⏳ Buscando conductor',
      2: '🚗 Esperando al conductor',
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
        <div style="font-size:0.82rem;color:#c2410c;font-weight:600">${status}</div>
      </div>`;
  }
  return `<div style="font-family:sans-serif;padding:4px;font-weight:600;color:#1a1730">${m.label ?? ''}</div>`;
}

/// Firma de lo que cambia el aspecto de un pin (no la posición). Si no
/// cambia, el pin no se toca (solo se mueve si llegó otro GPS).
function markerSig(m: MapMarker): string {
  const x = m.extra;
  return [
    m.type, m.label, m.deviated ? 1 : 0, m.sosActive ? 1 : 0, m.highlighted ? 1 : 0, m.dimmed ? 1 : 0, m.warned ? 1 : 0, m.color, m.clusterGroup,
    x?.fullName, x?.rating, x?.hasActiveTrip ? 1 : 0, x?.tripStatus, x?.vehiclePlate,
  ].join('|');
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

/// Anillos alrededor de un pin: SOS (rojo grande), desvío (rojo), alerta de
/// seguimiento (ámbar) y selección (dorado).
type RingKind = 'sos' | 'dev' | 'warn' | 'hl';
const RING_STYLE: Record<RingKind, { radius: number; color: string; fillOpacity: number; weight: number }> = {
  // Anillo de SOS: más ancho que el de "desviado" para que se note que es
  // una emergencia, no un desvío. Tiene prioridad sobre el de desvío.
  sos: { radius: 120, color: '#dc2626', fillOpacity: 0.18, weight: 3 },
  dev: { radius: 80,  color: '#dc2626', fillOpacity: 0.15, weight: 2 },
  warn: { radius: 75, color: '#f59e0b', fillOpacity: 0.14, weight: 3 },
  // Anillo dorado de selección. Se dibuja ADEMÁS del de SOS/desvío para que
  // un pin pueda estar en SOS Y seleccionado y se vean ambos estados.
  hl:  { radius: 60,  color: '#fbbf24', fillOpacity: 0.18, weight: 4 },
};

interface MarkerEntry {
  data: MapMarker;
  marker: any;
  sig: string;
  iconUrl: string;
  popupHtml: string;
  rings: Partial<Record<RingKind, any>>;
  /// requestAnimationFrame activo del movimiento suave (0 = ninguno).
  raf: number;
  /// Fuera del mapa porque está dentro de un grupo (cluster).
  hidden: boolean;
  dimmed: boolean;
}

interface ClusterEntry {
  marker: any;
  count: number;
  dimmed: boolean;
  /// Claves de los pines que agrupa (para acercar al tocarlo).
  members: string[];
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

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export default function BugieMapAdmin({
  center, zoom,
  markers = [], height = 320,
  onFocusRef,
  onFitBoundsRef,
  onPanToRef,
  onUserDrag,
  onMarkerClick,
  cluster,
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
  const markerEntries  = useRef<Map<string, MarkerEntry>>(new Map());
  const clusterEntries = useRef<Map<string, ClusterEntry>>(new Map());
  const lineEntries    = useRef<Map<string, LineEntry>>(new Map());
  const didFitOnce   = useRef<boolean>(false);
  // Si las líneas llegan después del primer encuadre, se reencuadra una vez.
  const didFitLines  = useRef<boolean>(false);
  // El click usa siempre el handler más reciente sin recrear los pines.
  const onMarkerClickRef = useRef(onMarkerClick);
  onMarkerClickRef.current = onMarkerClick;
  const onUserDragRef = useRef(onUserDrag);
  onUserDragRef.current = onUserDrag;
  const clusterRef = useRef(cluster);
  clusterRef.current = cluster;

  const fitLayers = () => [
    ...Array.from(markerEntries.current.values()).map(e => e.marker),
    ...Array.from(lineEntries.current.values()).map(e => e.layer),
  ];

  // ── Visibilidad / atenuado de un pin (y sus anillos) ─────────────────
  const setHidden = (map: any, e: MarkerEntry, hidden: boolean) => {
    if (e.hidden === hidden) return;
    e.hidden = hidden;
    const layers = [e.marker, ...Object.values(e.rings)];
    layers.forEach(l => {
      if (!l) return;
      try { if (hidden) map.removeLayer(l); else l.addTo(map); } catch {}
    });
  };

  const setDimmed = (e: MarkerEntry, dimmed: boolean) => {
    if (e.dimmed === dimmed) return;
    e.dimmed = dimmed;
    try { e.marker.setOpacity(dimmed ? DIM_OPACITY : 1); } catch {}
    (Object.keys(e.rings) as RingKind[]).forEach(kind => {
      try { e.rings[kind]?.setStyle({ opacity: dimmed ? 0.25 : 1, fillOpacity: dimmed ? 0.04 : RING_STYLE[kind].fillOpacity }); } catch {}
    });
  };

  /// Agrupa por cuadrícula en píxeles los pines con `clusterGroup`. Se llama
  /// al cambiar los pines y al terminar un zoom (O(n), sin librerías).
  const applyClusters = () => {
    const map = mapRef.current;
    const L = (window as any).L;
    if (!map || !L) return;
    const opts = clusterRef.current;
    const z = map.getZoom();
    const enabled = !!opts && z <= (opts.maxZoom ?? 15);
    const grid = opts?.gridPx ?? 64;

    const groups = new Map<string, string[]>();
    markerEntries.current.forEach((e, key) => {
      const g = e.data.clusterGroup;
      if (!enabled || !g) { setHidden(map, e, false); return; }
      const p = map.project([e.data.lat, e.data.lng], z);
      const cell = `${g}|${Math.floor(p.x / grid)}|${Math.floor(p.y / grid)}`;
      const list = groups.get(cell);
      if (list) list.push(key); else groups.set(cell, [key]);
    });

    const wanted = new Set<string>();
    groups.forEach((keys, cell) => {
      const members = keys.map(k => markerEntries.current.get(k)!);
      if (members.length < 2) { setHidden(map, members[0], false); return; }
      members.forEach(e => setHidden(map, e, true));
      wanted.add(cell);

      const lat = members.reduce((s, e) => s + e.data.lat, 0) / members.length;
      const lng = members.reduce((s, e) => s + e.data.lng, 0) / members.length;
      const dimmed = members.every(e => e.data.dimmed);
      const group = cell.split('|')[0];
      const n = members.length;
      const label = `${n} ${opts?.labels?.[group] ?? 'pines'}. Toca para acercar.`;
      const cur = clusterEntries.current.get(cell);
      if (!cur) {
        const size = n < 10 ? 34 : n < 50 ? 40 : 46;
        const icon = L.divIcon({
          className: 'bx-map-cluster-icon',
          html: `<span class="bx-map-cluster is-${escapeHtml(group)}" style="width:${size}px;height:${size}px">${n}</span>`,
          iconSize: [size, size],
        });
        const marker = L.marker([lat, lng], { icon, keyboard: true, title: label, alt: label, zIndexOffset: -200 }).addTo(map);
        const entry: ClusterEntry = { marker, count: n, dimmed: false, members: keys };
        marker.on('click', () => zoomToMembers(entry.members));
        if (dimmed) { marker.setOpacity(DIM_OPACITY); entry.dimmed = true; }
        clusterEntries.current.set(cell, entry);
      } else {
        cur.members = keys;
        cur.marker.setLatLng([lat, lng]);
        if (cur.count !== n) {
          const size = n < 10 ? 34 : n < 50 ? 40 : 46;
          cur.marker.setIcon(L.divIcon({
            className: 'bx-map-cluster-icon',
            html: `<span class="bx-map-cluster is-${escapeHtml(group)}" style="width:${size}px;height:${size}px">${n}</span>`,
            iconSize: [size, size],
          }));
          const el = cur.marker.getElement?.();
          if (el) { el.setAttribute('title', label); el.setAttribute('aria-label', label); }
          cur.count = n;
        }
        if (cur.dimmed !== dimmed) { cur.marker.setOpacity(dimmed ? DIM_OPACITY : 1); cur.dimmed = dimmed; }
      }
    });
    clusterEntries.current.forEach((c, cell) => {
      if (!wanted.has(cell)) { try { map.removeLayer(c.marker); } catch {} clusterEntries.current.delete(cell); }
    });
  };

  /// Al tocar un grupo: acerca el mapa hasta que sus pines se separen.
  const zoomToMembers = (keys: string[]) => {
    const map = mapRef.current;
    const L = (window as any).L;
    if (!map || !L) return;
    const pts = keys.map(k => markerEntries.current.get(k)).filter(Boolean).map(e => [e!.data.lat, e!.data.lng]);
    if (pts.length === 0) return;
    const bounds = L.latLngBounds(pts);
    const maxZ = (clusterRef.current?.maxZoom ?? 15) + 1;
    const fitZ = map.getBoundsZoom(bounds, false, L.point(60, 60));
    const z = Math.min(Math.max(fitZ, map.getZoom() + 1), Math.max(maxZ, map.getZoom() + 1));
    map.setView(bounds.getCenter(), z, { animate: !prefersReducedMotion() });
  };

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

  // Exponer "desplazar a" (sin cambiar el zoom) para seguir una unidad.
  useEffect(() => {
    if (!onPanToRef) return;
    onPanToRef.current = (lat: number, lng: number) => {
      const m = mapRef.current;
      if (!m) return;
      const reduce = prefersReducedMotion();
      m.panTo([lat, lng], { animate: !reduce, duration: 0.6 });
    };
    return () => { if (onPanToRef) onPanToRef.current = null; };
  }, [onPanToRef]);

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
      if (!animate || e.hidden || dist < 0.5 || dist > MOVE_ANIM_MAX_M || prefersReducedMotion()) { setAll(to.lat, to.lng); return; }
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
        const ring = L.circle([at.lat, at.lng], {
          radius: s.radius, color: s.color, fillColor: s.color, weight: s.weight,
          fillOpacity: e.dimmed ? 0.04 : s.fillOpacity, opacity: e.dimmed ? 0.25 : 1,
        });
        if (!e.hidden) ring.addTo(map);
        e.rings[kind] = ring;
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
        const sig = markerSig(m);
        let e = entries.get(key);
        if (!e) {
          const iconUrl = iconUrlFor(m);
          const popupHtml = popupHtmlFor(m);
          const marker = L.marker([m.lat, m.lng], { icon: L.icon({ iconUrl, ...iconGeometry(m) }), alt: m.label ?? '' }).addTo(map);
          marker.bindPopup(popupHtml);
          const entry: MarkerEntry = { data: m, marker, sig, iconUrl, popupHtml, rings: {}, raf: 0, hidden: false, dimmed: false };
          marker.on('click', () => onMarkerClickRef.current?.(entry.data));
          entries.set(key, entry);
          e = entry;
        } else {
          const moved = e.data.lat !== m.lat || e.data.lng !== m.lng;
          // Mismo aspecto y misma posición: nada que hacer con este pin.
          if (!moved && e.sig === sig) { e.data = m; return; }
          if (e.sig !== sig) {
            const iconUrl = iconUrlFor(m);
            const popupHtml = popupHtmlFor(m);
            if (e.iconUrl !== iconUrl) { e.marker.setIcon(L.icon({ iconUrl, ...iconGeometry(m) })); e.iconUrl = iconUrl; }
            if (e.popupHtml !== popupHtml) { e.marker.setPopupContent(popupHtml); e.popupHtml = popupHtml; }
            e.sig = sig;
          }
          // Se compara contra la última posición pedida (no la visual, que
          // puede estar a mitad de animación).
          if (moved) moveEntry(e, { lat: m.lat, lng: m.lng }, m.type === 'driver' || m.type === 'passenger');
          e.data = m;
        }

        setDimmed(e, m.dimmed === true);
        const at = e.raf ? (e.marker.getLatLng() as LatLng) : { lat: m.lat, lng: m.lng };
        const inSos = m.sosActive === true;
        syncRing(map, e, 'sos', inSos, at);
        // Solo dibujamos el círculo de desvío si NO está en SOS (SOS gana).
        syncRing(map, e, 'dev', !inSos && m.type === 'driver' && m.deviated === true, at);
        syncRing(map, e, 'warn', !inSos && !(m.type === 'driver' && m.deviated === true) && m.warned === true, at);
        syncRing(map, e, 'hl', m.highlighted === true, at);
        // El pin seguido / seleccionado queda por encima de los demás.
        try { e.marker.setZIndexOffset(m.highlighted ? 1000 : m.sosActive ? 500 : 0); } catch {}
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
        // Reagrupar al cambiar el zoom; avisar cuando el usuario arrastra.
        mapRef.current.on('zoomend', () => applyClusters());
        mapRef.current.on('dragstart', () => onUserDragRef.current?.());
        // Por si el container tenía tamaño justo en el borde de detección
        setTimeout(() => mapRef.current?.invalidateSize(), 100);
      }

      const map = mapRef.current;
      syncMarkers(map);
      syncLines(map);
      applyClusters();

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
    clusterEntries.current = new Map();
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
