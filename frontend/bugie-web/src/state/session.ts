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

// ── Helper: headers con JWT para fetch ────────────────────
export function authHeaders(): HeadersInit {
  const token = getToken();
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
}
