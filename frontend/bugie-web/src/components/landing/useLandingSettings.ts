import { useEffect, useState } from 'react';
import { API } from '../../state/api';

/* Configuración pública de la plataforma (GET /landing/settings) como un
   mapa clave -> valor. Una sola petición compartida por la landing
   (botón de ayuda, enlaces de las tiendas). Si falla, mapa vacío. */

export type LandingSettings = Record<string, string>;

let _promise: Promise<LandingSettings> | null = null;

export function loadLandingSettings(): Promise<LandingSettings> {
  if (!_promise) {
    _promise = fetch(`${API.landing}/landing/settings`)
      .then(r => (r.ok ? r.json() as Promise<{ settingKey: string; value: string }[]> : []))
      .then(list => {
        const map: LandingSettings = {};
        (list ?? []).forEach(s => { map[s.settingKey] = (s.value ?? '').trim(); });
        return map;
      })
      .catch(() => ({}));
  }
  return _promise;
}

/** null mientras carga. */
export function useLandingSettings(): LandingSettings | null {
  const [settings, setSettings] = useState<LandingSettings | null>(null);
  useEffect(() => {
    let alive = true;
    loadLandingSettings().then(s => { if (alive) setSettings(s); });
    return () => { alive = false; };
  }, []);
  return settings;
}
