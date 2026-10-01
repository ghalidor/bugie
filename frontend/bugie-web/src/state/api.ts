import { authHeaders, clearSession, getToken } from './session';

export const API = {
  auth:     import.meta.env.VITE_API_AUTH,
  trips:    import.meta.env.VITE_API_TRIPS,
  drivers:  import.meta.env.VITE_API_DRIVERS,
  payments: import.meta.env.VITE_API_PAYMENTS,
  landing:  import.meta.env.VITE_API_LANDING,
  rewards:  import.meta.env.VITE_API_REWARDS,
} as const;

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { ...authHeaders(), ...options?.headers },
  });

  // 204 No Content — respuesta vacía válida
  if (res.status === 204) return null as T;

  if (res.status === 401) {
    const onAuthPage = window.location.pathname.startsWith('/auth/');
    if (!onAuthPage && getToken()) {
      clearSession();
      window.location.href = '/auth/login';
    }
    const body = await res.json().catch(() => ({}));
    throw new ApiError(401, (body as any).error ?? (body as any).message ?? 'No autorizado');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as any).error ?? (body as any).message ?? `Error ${res.status}`);
  }

  const text = await res.text();
  if (!text || text === 'null') return null as T;
  return JSON.parse(text) as T;
}