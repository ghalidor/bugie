// Gestión de sesión del panel admin

export function getToken(): string | null {
  return localStorage.getItem('bugie_token');
}

export function authHeaders(): Record<string, string> {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function clearSession() {
  localStorage.removeItem('bugie_token');
  localStorage.removeItem('bugie_admin_user');
}

// ── Mensaje para mostrar en el login tras cerrar la sesión ──
// (p. ej. "Tu sesión se cerró..." o "Tu cuenta fue desactivada..."). Se lee una sola vez.
const KEY_LOGOUT_MSG = 'bugie_admin_logout_msg';

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
