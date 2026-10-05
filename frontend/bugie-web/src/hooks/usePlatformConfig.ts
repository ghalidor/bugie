import { useEffect, useState } from 'react';
import { API, apiFetch } from '../state/api';

/* ──────────────────────────────────────────────────────────────────────────
   Parámetros de plataforma que el admin configura: tarifas, tiempo objetivo
   de respuesta del SOS y contacto de soporte.

   Antes estaban escritas a mano en RequestRide:
       Math.max(5, km * 1.5)

   Y al mismo tiempo el admin tenía los campos «Tarifa base mínima» y «Tarifa
   por kilómetro», que se podían editar y guardar sin que nada cambiara. Dos
   números que decían ser lo mismo, uno de ellos mentira.

   Sigue el mismo patrón que useMapConfig: una sola petición compartida entre
   todos los componentes, con los valores anteriores como respaldo si la
   configuración no responde.
   ────────────────────────────────────────────────────────────────────────── */

export interface PlatformConfig {
  /** Lo mínimo que cuesta un viaje, por corto que sea. */
  baseFare:  number;
  /** Lo que se suma por cada kilómetro. */
  farePerKm: number;
  /** Minutos objetivo de respuesta ante un SOS. */
  sosResponseMin: number;
  /** Correo de soporte (vacío si el admin no lo configuró). */
  supportEmail: string;
  /** Teléfono de soporte (vacío si el admin no lo configuró). */
  supportPhone: string;
}

/** Los valores que estaban escritos a mano. Se usan si la config no carga. */
const DEFAULT: PlatformConfig = { baseFare: 5, farePerKm: 1.5, sosResponseMin: 2, supportEmail: '', supportPhone: '' };

let _cache: PlatformConfig | null = null;
const _subscribers = new Set<(cfg: PlatformConfig) => void>();

function fetchAndSet() {
  return apiFetch<{ settingKey: string; value: string }[]>(
    `${API.landing}/landing/settings`
  ).then(settings => {
    const get = (key: string, fallback: number) => {
      const v = parseFloat(settings.find(s => s.settingKey === key)?.value ?? '');
      // Una tarifa de 0 o negativa no tiene sentido: si alguien la guarda así,
      // se usa el respaldo en vez de dejar los viajes en cero.
      return Number.isFinite(v) && v > 0 ? v : fallback;
    };
    const text = (key: string) => (settings.find(s => s.settingKey === key)?.value ?? '').trim();

    const cfg: PlatformConfig = {
      baseFare:       get('base_fare',       DEFAULT.baseFare),
      farePerKm:      get('fare_per_km',     DEFAULT.farePerKm),
      sosResponseMin: get('sos_response_min', DEFAULT.sosResponseMin),
      supportEmail:   text('support_email'),
      supportPhone:   text('support_phone'),
    };
    _cache = cfg;
    _subscribers.forEach(cb => cb(cfg));
    return cfg;
  }).catch(() => DEFAULT);
}

export function usePlatformConfig(): PlatformConfig {
  const [config, setConfig] = useState<PlatformConfig>(_cache ?? DEFAULT);

  useEffect(() => {
    _subscribers.add(setConfig);
    if (!_cache) fetchAndSet().then(setConfig);
    return () => { _subscribers.delete(setConfig); };
  }, []);

  return config;
}

/**
 * Calcula la tarifa sugerida de un viaje.
 *
 * Es la misma fórmula de siempre, solo que con los números del admin:
 * nunca menos que la tarifa base, y redondeada a un decimal.
 */
export function calcularTarifa(km: number, cfg: PlatformConfig): number {
  return Math.max(cfg.baseFare, Math.round(km * cfg.farePerKm * 10) / 10);
}
