import { useEffect, useState } from 'react';
import { API } from '../state/api';
import { loadCompany } from './useCompany';

/* ──────────────────────────────────────────────────────────────────────────
   Ciudad de operación de la plataforma.

   La empresa es de Trujillo, pero el sistema puede llevarse a otra ciudad,
   así que los textos públicos no escriben la ciudad a mano: usan la
   plantilla {city} (o {cityCountry}) y se rellena aquí.

   Fuente única:
     1. setting default_city (GET /landing/settings): la ciudad de operación.
     2. Si está vacía, la ciudad de "Datos de la empresa" (/landing/company).
     3. Si ninguna responde, un texto neutro sin ciudad ("tu ciudad").

   Una sola petición compartida. Mientras carga se muestra el texto neutro.
   ────────────────────────────────────────────────────────────────────────── */

/** Texto que reemplaza a {city} cuando no hay ciudad configurada. */
export const NEUTRAL_CITY = 'tu ciudad';
const COUNTRY = 'Perú';

/** "tacna" -> "Tacna", "SAN MARTÍN" -> "San Martín". */
function titleCase(s: string): string {
  return s.trim().toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

let _city: string | null | undefined;          // undefined = sin cargar, null = sin ciudad
let _promise: Promise<string | null> | null = null;

export function loadCity(): Promise<string | null> {
  if (!_promise) {
    _promise = fetch(`${API.landing}/landing/settings`)
      .then(r => (r.ok ? r.json() as Promise<{ settingKey: string; value: string }[]> : []))
      .then(list => (list.find(s => s.settingKey === 'default_city')?.value ?? '').trim())
      .catch(() => '')
      .then(async city => city || ((await loadCompany())?.city ?? '').trim())
      .then(city => (_city = city ? titleCase(city) : null));
  }
  return _promise;
}

/** Ciudad configurada; null mientras carga o si no hay ninguna. */
export function useCity(): string | null {
  const [city, setCity] = useState<string | null>(_city ?? null);
  useEffect(() => {
    let alive = true;
    loadCity().then(c => { if (alive) setCity(c); });
    return () => { alive = false; };
  }, []);
  return city;
}

/**
 * Rellena las plantillas de ciudad en un texto o en cualquier objeto/array
 * de contenido (recorre todo):
 *   {city}        -> "Tacna"        | "tu ciudad"
 *   {cityCountry} -> "Tacna, Perú"  | "Perú"
 */
export function fillCity<T>(value: T, city: string | null): T {
  if (typeof value === 'string') {
    if (!value.includes('{city')) return value;
    return value
      .split('{cityCountry}').join(city ? `${city}, ${COUNTRY}` : COUNTRY)
      .split('{city}').join(city ?? NEUTRAL_CITY) as T;
  }
  if (Array.isArray(value)) return value.map(v => fillCity(v, city)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = fillCity(v, city);
    return out as T;
  }
  return value;
}
