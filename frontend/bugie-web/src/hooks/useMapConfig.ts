import { useEffect, useState } from 'react';
import { API, apiFetch } from '../state/api';

interface MapConfig {
  lat:  number;
  lng:  number;
  zoom: number;
}

const DEFAULT: MapConfig = { lat: -8.109052, lng: -79.021534, zoom: 14 };

let _cache: MapConfig | null = null;
const _subscribers = new Set<(cfg: MapConfig) => void>();

function fetchAndSet() {
  return apiFetch<{ settingKey: string; value: string }[]>(
    `${API.landing}/landing/settings`
  ).then(settings => {
    const get = (key: string, fallback: number) =>
      parseFloat(settings.find(s => s.settingKey === key)?.value ?? '') || fallback;

    const cfg: MapConfig = {
      lat:  get('default_lat',  DEFAULT.lat),
      lng:  get('default_lng',  DEFAULT.lng),
      zoom: get('default_zoom', DEFAULT.zoom),
    };
    _cache = cfg;
    _subscribers.forEach(cb => cb(cfg));
    return cfg;
  }).catch(() => DEFAULT);
}

export function useMapConfig(): MapConfig {
  const [config, setConfig] = useState<MapConfig>(_cache ?? DEFAULT);

  useEffect(() => {
    _subscribers.add(setConfig);
    if (!_cache) {
      fetchAndSet().then(cfg => setConfig(cfg));
    }
    return () => {
      _subscribers.delete(setConfig);
    };
  }, []);

  return config;
}