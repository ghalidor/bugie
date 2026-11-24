import { useEffect, useState } from 'react';
import { API, apiFetch } from '../state/api';

/* Meta de respuesta SOS en minutos: parámetro `sos_response_min`
   (Configuración, GET /landing/settings). Es el mismo valor que usa el backend
   en la auditoría y en el resumen de gestión. */

/** Respaldo si el parámetro no se puede leer o no es válido (acta: menos de 2 min). */
export const SOS_GOAL_FALLBACK_MIN = 2;

// Lectura compartida entre componentes; se vuelve a pedir pasado CACHE_MS
// para tomar los cambios hechos en Configuración.
const CACHE_MS = 60000;
let cache: { value: number | null; at: number } | null = null;
let pending: Promise<number | null> | null = null;

function loadSosGoal(): Promise<number | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return Promise.resolve(cache.value);
  if (!pending) {
    pending = apiFetch<{ settingKey: string; value: string }[]>(`${API.landing}/landing/settings`)
      .then(list => {
        const v = Number(list.find(s => s.settingKey === 'sos_response_min')?.value);
        return Number.isFinite(v) && v > 0 ? v : null;
      })
      .catch(() => null)
      .then(value => { cache = { value, at: Date.now() }; pending = null; return value; });
  }
  return pending;
}

/** Meta SOS (minutos) de Configuración. Null mientras carga o si no se pudo leer. */
export function useSosGoal(): number | null {
  const [goal, setGoal] = useState<number | null>(cache?.value ?? null);
  useEffect(() => {
    let alive = true;
    loadSosGoal().then(v => { if (alive) setGoal(v); });
    return () => { alive = false; };
  }, []);
  return goal;
}
