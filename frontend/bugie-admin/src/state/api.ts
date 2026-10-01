import { authHeaders, clearSession, getToken } from './session';

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

export async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { ...authHeaders(), ...options?.headers },
  });
  if (res.status === 401) {
    const body = await res.json().catch(() => ({}));

    // En la pantalla de login, 401 = contrasena incorrecta. No recargamos,
    // para que el usuario pueda leer el mensaje.
    if (window.location.pathname.startsWith('/auth/')) {
      throw new ApiError(401, (body as any).error ?? 'Credenciales inválidas.');
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

    const service = new URL(url, window.location.origin).host;
    throw new ApiError(401,
      `El servicio ${service} rechazó tu sesión. Revisa que su Jwt:Key, Jwt:Issuer ` +
      `y Jwt:Audience en appsettings.json sean idénticos a los de Auth.`);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as any).error ?? `Error ${res.status}`);
  }
  return res.json() as Promise<T>;
}
