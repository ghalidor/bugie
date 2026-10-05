import { MutableRefObject, useEffect, useRef } from 'react';
import { useMapConfig } from '../hooks/useMapConfig';

export interface LatLng  { lat: number; lng: number; }
export interface MapMarker extends LatLng {
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
  const layersRef    = useRef<any[]>([]);
  const didFitOnce   = useRef<boolean>(false);
  // Polylines de la prop `lines` (entran en el encuadre).
  const lineLayersRef = useRef<any[]>([]);
  // Si las líneas llegan después del primer encuadre, se reencuadra una vez.
  const didFitLines  = useRef<boolean>(false);
  const fitLayers = () => [
    ...layersRef.current.filter(l => typeof l.getLatLng === 'function'),
    ...lineLayersRef.current,
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

  // Dibujar/actualizar markers
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

      // Limpiar capas previas
      layersRef.current.forEach(l => { try { map.removeLayer(l); } catch {} });
      layersRef.current = [];
      lineLayersRef.current = [];

      markers.forEach(m => {
        const isDriver    = m.type === 'driver';
        const isPassenger = m.type === 'passenger';
        const isOrigin    = m.type === 'origin';
        const isDest      = m.type === 'destination' && !m.label?.includes('SOS');
        const isSos       = m.label?.includes('SOS');
        const inSos       = m.sosActive === true;

        // Si el usuario tiene SOS activo, su ícono se reemplaza por el de SOS
        // (rojo + emoji 🚨) sin importar si era conductor o pasajero. Es la
        // forma de mostrar emergencia sin agregar un pin extra encima.
        let iconUrl: string;
        if (inSos) {
          iconUrl = makeSosIcon();
        } else if (isDriver) {
          iconUrl = makeDriverIcon(m.extra?.hasActiveTrip ?? false, m.deviated ?? false);
        } else if (isPassenger) {
          iconUrl = makePassengerIcon();
        } else if (isSos) {
          iconUrl = makeSosIcon();
        } else if (isOrigin) {
          iconUrl = makeOriginIcon();
        } else if (isDest) {
          iconUrl = makeDestinationIcon();
        } else {
          iconUrl = makeDriverIcon(false, false);
        }

        const icon = L.icon({ iconUrl, iconSize: [36, 44], iconAnchor: [18, 44], popupAnchor: [0, -44] });

        // Popup
        let popupHtml = '';
        if (inSos) {
          // Popup unificado de SOS — cualquier rol con alerta activa
          const who = isDriver
            ? (m.extra?.fullName || m.label || 'Conductor')
            : (m.label || 'Pasajero');
          popupHtml = `
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
        } else if (isDriver && m.extra) {
          const status = m.deviated
            ? '<span style="color:#dc2626;font-weight:700">⚠️ Fuera de la ruta</span>'
            : m.extra.hasActiveTrip
              ? '<span style="color:#818cf8;font-weight:600">🚗 En viaje</span>'
              : '<span style="color:#34d399;font-weight:600">✅ Disponible</span>';
          popupHtml = `
            <div style="font-family:sans-serif;min-width:160px;padding:4px">
              <div style="font-size:0.95rem;font-weight:700;margin-bottom:4px;color:#1a1730">
                ${m.extra.fullName || 'Conductor'}
              </div>
              <div style="font-size:0.82rem;margin-bottom:4px">${status}</div>
              <div style="font-size:0.82rem;color:#555">⭐ ${m.extra.rating?.toFixed(1) ?? '—'}</div>
            </div>`;
        } else if (isPassenger) {
          const labelMap: Record<number, string> = {
            1: '⏳ Buscando conductor',
            2: '🚗 Conductor en camino',
            3: '🚦 Viaje en curso',
            6: '🚨 SOS activo',
            7: '💬 Negociando tarifa',
          };
          const status = labelMap[m.extra?.tripStatus ?? 0] ?? 'En viaje';
          popupHtml = `
            <div style="font-family:sans-serif;min-width:160px;padding:4px">
              <div style="font-size:0.95rem;font-weight:700;margin-bottom:4px;color:#1a1730">
                ${m.label || 'Pasajero'}
              </div>
              <div style="font-size:0.82rem;color:#f97316;font-weight:600">${status}</div>
            </div>`;
        } else {
          popupHtml = `<div style="font-family:sans-serif;padding:4px;font-weight:600;color:#1a1730">${m.label ?? ''}</div>`;
        }

        const marker = L.marker([m.lat, m.lng], { icon }).addTo(map);
        marker.bindPopup(popupHtml);
        if (onMarkerClick) {
          marker.on('click', () => onMarkerClick(m));
        }
        layersRef.current.push(marker);

        // Anillo de SOS: círculo rojo grande alrededor del marker. Más
        // ancho que el de "desviado" para que se note claramente que es
        // una emergencia, no un desvío. Tiene prioridad sobre el de desvío.
        if (inSos) {
          const sosRing = L.circle([m.lat, m.lng], {
            radius: 120,
            color: '#dc2626',
            fillColor: '#dc2626',
            fillOpacity: 0.18,
            weight: 3,
          }).addTo(map);
          layersRef.current.push(sosRing);
        } else if (isDriver && m.deviated) {
          // Solo dibujamos el círculo de desvío si NO está en SOS (SOS gana).
          const circle = L.circle([m.lat, m.lng], {
            radius: 80,
            color: '#dc2626',
            fillColor: '#dc2626',
            fillOpacity: 0.15,
            weight: 2,
          }).addTo(map);
          layersRef.current.push(circle);
        }

        // Anillo dorado de selección. Se dibuja ADEMÁS del de SOS/desvío
        // (no compite con ellos), para que un pin pueda estar en SOS Y
        // seleccionado al mismo tiempo y se vea ambos estados.
        if (m.highlighted) {
          const ring = L.circle([m.lat, m.lng], {
            radius: 60,
            color: '#fbbf24',
            fillColor: '#fbbf24',
            fillOpacity: 0.18,
            weight: 4,
          }).addTo(map);
          layersRef.current.push(ring);
        }
      });

      // Si el padre pasa la ruta REAL calculada por GraphHopper (coordenadas
      // siguiendo las calles), la dibujamos. Sin esto NO dibujamos nada entre
      // origen y destino, porque una línea recta pasaría sobre edificios y
      // no representa el viaje. routeCoordinates viene como [[lng,lat], ...]
      // (convención GraphHopper), por eso invertimos para Leaflet ([lat,lng]).
      if (routeCoordinates && routeCoordinates.length >= 2) {
        const latlngs = routeCoordinates.map(c => [c[1], c[0]] as [number, number]);
        const line = L.polyline(latlngs, {
          color: '#3b82f6',
          weight: 5,
          opacity: 0.85,
        }).addTo(map);
        layersRef.current.push(line);
      }

      // Líneas con estilo, en orden (la última encima).
      (lines ?? []).forEach(ln => {
        if (!ln.points || ln.points.length < 2) return;
        const pl = L.polyline(ln.points, {
          color: ln.color,
          weight: ln.weight ?? 4,
          opacity: ln.opacity ?? 0.9,
          dashArray: ln.dashArray,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(map);
        layersRef.current.push(pl);
        lineLayersRef.current.push(pl);
      });

      // Fit inicial (solo primera vez con markers o líneas)
      const hasLines = lineLayersRef.current.length > 0;
      if ((!didFitOnce.current && (markers.length >= 1 || hasLines)) || (hasLines && !didFitLines.current)) {
        if (hasLines) didFitLines.current = true;
        const doFit = () => {
          if (cancelled || !mapRef.current) return;
          try {
            map.invalidateSize();
            if (markers.length === 1 && lineLayersRef.current.length === 0) {
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
    try { mapRef.current?.remove(); } catch {}
    mapRef.current = null;
    layersRef.current = [];
    lineLayersRef.current = [];
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
