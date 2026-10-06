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
  /**
   * Monto mínimo para pedir, ofertar o contraofertar: la tarifa base que el
   * admin configuró (base_fare). null si no la configuró (el backend tampoco
   * exige mínimo en ese caso).
   */
  minFare: number | null;
  /** Máximo para ofertar/contraofertar = tarifa pedida × este valor (fare_max_multiplier). */
  fareMaxMultiplier: number;
}

/** Los valores que estaban escritos a mano. Se usan si la config no carga. */
const DEFAULT: PlatformConfig = {
  baseFare: 5, farePerKm: 1.5, sosResponseMin: 2, supportEmail: '', supportPhone: '',
  minFare: null, fareMaxMultiplier: 3,
};

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

    // Mismo criterio que el backend: un multiplicador menor que 1 no vale.
    const maxMult = get('fare_max_multiplier', DEFAULT.fareMaxMultiplier);

    const cfg: PlatformConfig = {
      baseFare:       get('base_fare',       DEFAULT.baseFare),
      farePerKm:      get('fare_per_km',     DEFAULT.farePerKm),
      sosResponseMin: get('sos_response_min', DEFAULT.sosResponseMin),
      supportEmail:   text('support_email'),
      supportPhone:   text('support_phone'),
      minFare:        get('base_fare', 0) || null,
      fareMaxMultiplier: maxMult >= 1 ? maxMult : DEFAULT.fareMaxMultiplier,
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

/** "S/ 12.50" (igual que los mensajes del backend). */
const soles = (n: number) => `S/ ${n.toFixed(2)}`;

/**
 * Rango permitido para ofertar o contraofertar en un viaje (igual que el
 * backend): mínimo = base_fare; máximo = tarifa pedida × fare_max_multiplier
 * (nunca menor que el mínimo).
 */
export function fareRange(suggestedFare: number, cfg: PlatformConfig): { min: number; max: number } {
  const min = cfg.minFare ?? 0.01;
  const max = Math.round(suggestedFare * cfg.fareMaxMultiplier * 100) / 100;
  return { min, max: Math.max(min, max) };
}

/** "Entre S/ X y S/ Y" (se muestra junto al campo del monto). */
export function fareRangeHint(r: { min: number; max: number }): string {
  return `Entre ${soles(r.min)} y ${soles(r.max)}`;
}

/** Mensaje si el monto está fuera del rango (mismo texto que el backend); null si es válido. */
export function fareRangeError(amount: number, r: { min: number; max: number }): string | null {
  return amount < r.min || amount > r.max
    ? `El monto debe estar entre ${soles(r.min)} y ${soles(r.max)}.`
    : null;
}

/** Al crear un viaje o envío solo aplica el mínimo (mismo texto que el backend). */
export function createFareError(amount: number, cfg: PlatformConfig): string | null {
  return cfg.minFare != null && amount < cfg.minFare
    ? `El monto debe ser al menos ${soles(cfg.minFare)}.`
    : null;
}
