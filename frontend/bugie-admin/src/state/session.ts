// Gestión de sesión del panel admin

export function getToken(): string | null {
  return localStorage.getItem('bugie_token');
}

export function getAdminUser() {
  const raw = localStorage.getItem('bugie_admin_user');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
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

export function isAuthenticated(): boolean {
  return !!getToken();
}
