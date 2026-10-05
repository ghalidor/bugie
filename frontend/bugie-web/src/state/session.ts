export type UserRole = 'passenger' | 'driver' | 'admin';

export interface SessionUser {
  userId:   string;
  fullName: string;
  email:    string;
  role:     UserRole;
}

const KEY_TOKEN = 'bugie_token';
const KEY_USER  = 'bugie_user';

// ── Guardar sesión tras login exitoso ─────────────────────
export function saveSession(token: string, user: SessionUser) {
  localStorage.setItem(KEY_TOKEN, token);
  localStorage.setItem(KEY_USER,  JSON.stringify(user));
}

// ── Leer sesión ───────────────────────────────────────────
export function getToken(): string | null {
  return localStorage.getItem(KEY_TOKEN);
}

export function getUser(): SessionUser | null {
  const raw = localStorage.getItem(KEY_USER);
  if (!raw) return null;
  try { return JSON.parse(raw) as SessionUser; }
  catch { return null; }
}

export function getRole(): UserRole | null {
  return getUser()?.role ?? null;
}

// ── Cerrar sesión ─────────────────────────────────────────
export function clearSession() {
  localStorage.removeItem(KEY_TOKEN);
  localStorage.removeItem(KEY_USER);
}

// ── Mensaje para mostrar en el login tras cerrar la sesión ──
// (por ejemplo, "Esta cuenta fue eliminada..."). Se lee una sola vez.
const KEY_LOGOUT_MSG = 'bugie_logout_msg';

export function setLogoutMessage(message: string) {
  try { sessionStorage.setItem(KEY_LOGOUT_MSG, message); } catch { /* sin almacenamiento */ }
}

export function takeLogoutMessage(): string | null {
  try {
    const msg = sessionStorage.getItem(KEY_LOGOUT_MSG);
    sessionStorage.removeItem(KEY_LOGOUT_MSG);
    return msg;
  } catch { return null; }
}

// ── Helper: headers con JWT para fetch ────────────────────
export function authHeaders(): HeadersInit {
  const token = getToken();
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
}
