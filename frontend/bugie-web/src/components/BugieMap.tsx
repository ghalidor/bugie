import { useEffect, useRef, useState } from 'react';
import { useMapConfig } from '../hooks/useMapConfig';

export interface LatLng    { lat: number; lng: number; }
export interface MapMarker extends LatLng { label?: string; type?: 'origin'|'destination'|'driver'|'default'; }

interface BugieMapProps {
  center?:      LatLng;
  zoom?:        number;
  markers?:     MapMarker[];
  height?:      number | string;
  className?:   string;
  showRoute?:   boolean;
  origin?:      LatLng;
  destination?: LatLng;
  waypoints?:   LatLng[];
  onMapClick?:  (pos: LatLng) => void;
  onRouteInfo?: (info: { km: number; mins: number; isFallback: boolean } | null) => void;
}

const DEFAULT_CENTER: LatLng = { lat: -8.109052, lng: -79.021534 };

const COLORS = {
  origin:      '#7C6AF7',
  destination: '#C060C0',
  waypoint:    '#f59e0b',
  driver:      '#22c55e',
  default:     '#7C6AF7',
};

function makeIcon(color: string, size = 32): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${Math.round(size*1.3)}" viewBox="0 0 32 42">
    <circle cx="16" cy="16" r="15" fill="${color}" opacity="0.2"/>
    <circle cx="16" cy="16" r="10" fill="${color}"/>
    <circle cx="16" cy="16" r="5"  fill="#fff"/>
    <line x1="16" y1="26" x2="16" y2="40" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
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

export default function BugieMap({
  center, zoom,
  markers = [], height = 320, className = '',
  showRoute = false, origin, destination,
  waypoints = [], onMapClick, onRouteInfo,
}: BugieMapProps) {
  // Si el padre no pasa center/zoom, usar la configuración del admin
  const cfg = useMapConfig();
  const finalCenter: LatLng = center ?? { lat: cfg.lat, lng: cfg.lng };
  const finalZoom: number   = zoom   ?? cfg.zoom;

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<any>(null);
  // Observa el cambio de tema para invertir las teselas en oscuro.
  const themeObserverRef = useRef<MutationObserver | null>(null);
  const layersRef    = useRef<any[]>([]);
  const onClickRef   = useRef(onMapClick);
  const onInfoRef    = useRef(onRouteInfo);
  const [loading, setLoading] = useState(false);

  useEffect(() => { onClickRef.current  = onMapClick;  }, [onMapClick]);
  useEffect(() => { onInfoRef.current   = onRouteInfo; }, [onRouteInfo]);

  // Inicializar mapa
  useEffect(() => {
    const L = (window as any).L;
    if (!L || !containerRef.current || mapRef.current) return;
    mapRef.current = L.map(containerRef.current, { center: [finalCenter.lat, finalCenter.lng], zoom: finalZoom });
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
    mapRef.current.on('click', (e: any) => {
      onClickRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
    return () => { mapRef.current?.remove(); mapRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Observa cambios de tamaño del contenedor y avisa al mapa.
  // Necesario cuando algún elemento de afuera (sidebar, panel lateral, etc.)
  // se colapsa o expande: sin esto, Leaflet queda con un tamaño "muerto"
  // y se ven áreas en blanco.
  useEffect(() => {
    if (!containerRef.current || !mapRef.current) return;

    const ro = new ResizeObserver(() => {
      // Pequeño delay para esperar a que termine la animación CSS (~300ms)
      // y así Leaflet calcula el tamaño final, no intermedio.
      setTimeout(() => { mapRef.current?.invalidateSize?.(); }, 50);
    });
    ro.observe(containerRef.current);

    // Además, escuchar resize de la ventana (zoom del navegador, etc.)
    const onWindowResize = () => mapRef.current?.invalidateSize?.();
    window.addEventListener('resize', onWindowResize);

    return () => {

      themeObserverRef.current?.disconnect();

      themeObserverRef.current = null;
      ro.disconnect();
      window.removeEventListener('resize', onWindowResize);
    };
  }, []);

  // Re-centrar (también reacciona si cambia la configuración del admin)
  useEffect(() => {
    if (mapRef.current) mapRef.current.setView([finalCenter.lat, finalCenter.lng], finalZoom);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalCenter.lat, finalCenter.lng, finalZoom]);

  // Dibujar
  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapRef.current) return;
    const map = mapRef.current;

    layersRef.current.forEach(l => { try { map.removeLayer(l); } catch {} });
    layersRef.current = [];

    function addPin(pos: LatLng, color: string, label: string, size = 32) {
      const icon = L.icon({
        iconUrl:     makeIcon(color, size),
        iconSize:    [size, Math.round(size * 1.3)],
        iconAnchor:  [size / 2, Math.round(size * 1.3)],
        popupAnchor: [0, -Math.round(size * 1.3)],
      });
      const m = L.marker([pos.lat, pos.lng], { icon }).addTo(map)
        .bindPopup(`<b style="color:#fff;background:#1a1730;padding:4px 8px;border-radius:6px">${label}</b>`);
      layersRef.current.push(m);
    }

    // Sin ruta — solo markers
    if (!showRoute || !origin || !destination) {
      markers.forEach(m => addPin(m, COLORS[m.type ?? 'default'] ?? COLORS.default, m.label ?? ''));
      if (markers.length > 1) {
        try {
          const g = L.featureGroup(layersRef.current);
          map.fitBounds(g.getBounds(), { padding: [40, 40] });
        } catch {}
      }
      return;
    }

    // Con ruta — pines primero
    addPin(origin,      COLORS.origin,      'Origen');
    waypoints.forEach((wp, i) => addPin(wp, COLORS.waypoint, `Parada ${i + 1}`, 26));
    addPin(destination, COLORS.destination, 'Destino');

    const allPoints = [origin, ...waypoints, destination];
    const hasWp     = waypoints.length > 0;

    function fitAll() {
      try {
        const g = L.featureGroup(layersRef.current);
        map.fitBounds(g.getBounds(), { padding: [60, 60] });
      } catch {}
    }

    function drawLine(coords: number[][], color: string, dashed: boolean, popupText: string) {
      const latlngs = coords.map(([lng, lat]: number[]) => [lat, lng]);
      const line = L.polyline(latlngs, {
        color, weight: dashed ? 3 : 5,
        opacity: dashed ? 0.5 : 0.95,
        dashArray: dashed ? '8 5' : undefined,
        lineCap: 'round', lineJoin: 'round',
      }).addTo(map);
      line.bindPopup(`<div style="color:#fff;background:#1a1730;padding:6px 10px;border-radius:8px">${popupText}</div>`);
      layersRef.current.push(line);
      return line;
    }

    function drawFallbackLines() {
      // Dibujar segmentos en orden: origen → p1 → p2 → destino
      for (let i = 0; i < allPoints.length - 1; i++) {
        const a = allPoints[i];
        const b = allPoints[i + 1];
        // drawLine espera [lng,lat] y convierte internamente a [lat,lng]
        drawLine([[a.lng, a.lat], [b.lng, b.lat]], COLORS.origin, true, `Segmento ${i + 1}`);
      }
      fitAll();
    }

    setLoading(true);

    const url = hasWp
      ? `${import.meta.env.VITE_API_TRIPS}/trips/route/waypoints`
      : `${import.meta.env.VITE_API_TRIPS}/trips/route?olat=${origin.lat}&olng=${origin.lng}&dlat=${destination.lat}&dlng=${destination.lng}`;

    const fetchOpts = hasWp
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ points: allPoints.map(p => ({ lat: p.lat, lng: p.lng })) }) }
      : undefined;

    fetch(url, fetchOpts)
      .then(r => r.json())
      .then((d: { distanceKm: number; durationMinutes: number; options?: { distanceKm: number; durationMinutes: number; coordinates: number[][] }[]; isFallback?: boolean }) => {
        if (!d.options?.length) { drawFallbackLines(); return; }

        d.options.forEach((opt, idx) => {
          const isMain = idx === 0;
          const label  = isMain
            ? `${d.isFallback ? '📐 Distancia estimada' : '🛣 Ruta por calles'} · ${opt.distanceKm.toFixed(1)} km · ${Math.round(opt.durationMinutes)} min`
            : `↩ Alternativa · ${opt.distanceKm.toFixed(1)} km`;
          // Si es fallback con waypoints, dibujar segmentos pasando por los puntos en orden
          if (d.isFallback && allPoints.length > 2) {
            // Dibujar línea que pasa por todos los puntos en orden
            const orderedCoords = allPoints.map(p => [p.lng, p.lat]);
            drawLine(orderedCoords, COLORS.origin, true, label);
          } else {
            drawLine(opt.coordinates, isMain ? COLORS.origin : '#6b7280', !isMain, label);
          }
        });

        fitAll();

        // Notificar info de la ruta al padre
        onInfoRef.current?.({
          km:         d.options[0].distanceKm,
          mins:       Math.round(d.options[0].durationMinutes),
          isFallback: d.isFallback ?? false,
        });
      })
      .catch(() => {
        drawFallbackLines();
        onInfoRef.current?.(null);
      })
      .finally(() => setLoading(false));

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRoute, origin?.lat, origin?.lng, destination?.lat, destination?.lng, JSON.stringify(waypoints), JSON.stringify(markers)]);

  return (
    <div style={{ position: 'relative', height, width: '100%' }}>
      <div
        ref={containerRef}
        className={className}
        style={{ height: '100%', width: '100%', borderRadius: 12, overflow: 'hidden', zIndex: 0 }}
      />
      {/* Spinner mientras carga la ruta */}
      {loading && (
        <div style={{
          position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(26,23,48,0.85)', color: '#fff',
          padding: '6px 14px', borderRadius: 20, fontSize: '0.75rem',
          display: 'flex', alignItems: 'center', gap: 8, zIndex: 999,
          backdropFilter: 'blur(6px)',
        }}>
          <span className="spinner-border spinner-border-sm" style={{ width: 12, height: 12, borderWidth: 2 }} />
          Calculando ruta…
        </div>
      )}
    </div>
  );
}