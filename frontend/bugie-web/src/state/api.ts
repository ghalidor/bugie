import { authHeaders, clearSession, getToken, setLogoutMessage } from './session';

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

/** Códigos del 401 de sesión cerrada (backend: Security/SessionState.cs). */
export const SESSION_CLOSED_CODES = ['session_revoked', 'account_deactivated', 'account_deleted'];
export const isSessionClosedCode = (code: unknown) =>
  typeof code === 'string' && SESSION_CLOSED_CODES.includes(code);

/** 401 de una cuenta eliminada ("Esta cuenta fue eliminada..."). */
export function isDeletedAccountMessage(message: string): boolean {
  return message.toLowerCase().includes('cuenta fue eliminada');
}

export async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { ...authHeaders(), ...options?.headers },
  });

  // 204 No Content — respuesta vacía válida
  if (res.status === 204) return null as T;

  if (res.status === 401) {
    const body = await res.json().catch(() => ({}));
    const message: string = (body as any).error ?? (body as any).message ?? 'No autorizado';
    const onAuthPage = window.location.pathname.startsWith('/auth/');
    if (!onAuthPage && getToken()) {
      clearSession();
      // Sesión cerrada por el backend (sesiones cerradas, cuenta desactivada o
      // eliminada): el login muestra el mensaje del backend.
      if (isSessionClosedCode((body as any).code) || isDeletedAccountMessage(message)) setLogoutMessage(message);
      window.location.href = '/auth/login';
    }
    throw new ApiError(401, message);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as any).error ?? (body as any).message ?? `Error ${res.status}`);
  }

  const text = await res.text();
  if (!text || text === 'null') return null as T;
  return JSON.parse(text) as T;
}
// Las fotos que guarda la API de Trips vienen con URL relativa (/uploads/...).
// Se sirven desde el ORIGEN de esa API (sin el /api). Si ya es absoluta, va tal cual.
export function tripsFileUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  try {
    return new URL(url, new URL(API.trips).origin).toString();
  } catch {
    return url;
  }
}

// Igual que tripsFileUrl, pero para los archivos de la API de Drivers
// (documentos y fotos de vehículos: /uploads/...). Son archivos públicos
// servidos como estáticos, no necesitan token.
export function driversFileUrl(url?: string | null): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  try {
    return new URL(url, new URL(API.drivers).origin).toString();
  } catch {
    return url;
  }
}

// Igual que tripsFileUrl, pero para los archivos de la API de Auth
// (foto de perfil del usuario: /uploads/profiles/{userId}/...).
export function authFileUrl(url?: string | null): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  try {
    return new URL(url, new URL(API.auth).origin).toString();
  } catch {
    return url;
  }
}

// Foto de una persona que puede venir de Drivers (/uploads/drivers/...) o de
// Auth (/uploads/profiles/...), por ejemplo driverPhotoUrl de Trips.
export function personPhotoUrl(url?: string | null): string {
  if (!url) return '';
  return /^\/?uploads\/profiles\//i.test(url) ? authFileUrl(url) : driversFileUrl(url);
}
