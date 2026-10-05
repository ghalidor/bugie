import { authHeaders, clearSession, getToken, setLogoutMessage } from './session';

export const API = {
  auth:     import.meta.env.VITE_API_AUTH,
  trips:    import.meta.env.VITE_API_TRIPS,
  drivers:  import.meta.env.VITE_API_DRIVERS,
  payments: import.meta.env.VITE_API_PAYMENTS,
  landing:  import.meta.env.VITE_API_LANDING,
  rewards:  import.meta.env.VITE_API_REWARDS,
} as const;

/// true si el token guardado ya vencio, segun su propio campo "exp".
/// No valida la firma: eso lo hace el backend. Solo sirve para distinguir
/// "tu sesion vencio" de "un servicio esta mal configurado".
function tokenExpired(): boolean {
  const token = getToken();
  if (!token) return true;
  try {
    const part    = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(part));
    return typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now();
  } catch {
    return true;   // token ilegible: tratarlo como vencido
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/// Codigos del 401 de sesion cerrada (backend: Security/SessionState.cs).
export const SESSION_CLOSED_CODES = ['session_revoked', 'account_deactivated', 'account_deleted'];
export const isSessionClosedCode = (code: unknown) =>
  typeof code === 'string' && SESSION_CLOSED_CODES.includes(code);

export async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...authHeaders(), ...(options?.headers as Record<string, string> | undefined) };
  // Con FormData (subida de archivos) el navegador pone el Content-Type multipart.
  if (options?.body instanceof FormData) delete headers['Content-Type'];
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    const body = await res.json().catch(() => ({}));

    // En la pantalla de login, 401 = contrasena incorrecta. No recargamos,
    // para que el usuario pueda leer el mensaje.
    if (window.location.pathname.startsWith('/auth/')) {
      throw new ApiError(401, (body as any).error ?? 'Credenciales inválidas.');
    }

    // Sesion cerrada por el backend (sello cambiado, cuenta desactivada o
    // eliminada): cualquiera de las 6 APIs lo responde con un "code". Se cierra
    // la sesion y el login muestra el mensaje.
    if (isSessionClosedCode((body as any).code)) {
      const message: string = (body as any).error ?? 'Tu sesión se cerró. Vuelve a iniciar sesión.';
      clearSession();
      setLogoutMessage(message);
      window.location.href = '/auth/login';
      throw new ApiError(401, message);
    }

    // Cerramos sesion solo si la sesion de verdad no sirve:
    //   - el token ya vencio, o
    //   - el que lo rechaza es Auth, que es quien emite los tokens.
    // Si el token esta vigente y lo rechaza OTRO servicio, el problema es la
    // configuracion Jwt de ese servicio. Expulsar al usuario no lo arregla y
    // ademas esconde la causa: mostramos el error en la pantalla.
    if (tokenExpired() || url.startsWith(API.auth)) {
      clearSession();
      window.location.href = '/auth/login';
      throw new ApiError(401, 'Sesión expirada');
    }

    // Detalle técnico solo en la consola (para el equipo técnico): la
    // configuración Jwt (Key, Issuer, Audience) de ese servicio no coincide con la de Auth.
    const service = new URL(url, window.location.origin).host;
    console.warn(`[Bugie] ${service} rechazó un token vigente: revisa Jwt:Key/Issuer/Audience de ese servicio.`);
    throw new ApiError(401,
      'Una parte del sistema no reconoció tu sesión. Vuelve a intentarlo; si sigue pasando, avisa al equipo técnico.');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as any).error ?? `Error ${res.status}`);
  }
  return res.json() as Promise<T>;
}
