import { useMapConfig } from './useMapConfig';

/**
 * Devuelve la ubicación por defecto del mapa configurada en Admin.
 * Internamente usa useMapConfig, así que se actualiza automáticamente
 * cuando el admin guarda nuevos valores en Settings.
 */
export function useDefaultLocation() {
  const cfg = useMapConfig();
  return { lat: cfg.lat, lng: cfg.lng, zoom: cfg.zoom };
}