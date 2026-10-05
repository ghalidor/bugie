import { useSyncExternalStore } from 'react';
import { apiFetch, API } from './api';
import { authHeaders } from './session';
import { DEFAULT_CONFIG, NOTICE_TYPES, NoticeColor, NoticeType, NotifySettings, defaultSettings } from './adminNotify';

/* ──────────────────────────────────────────────────────────────────────────
   Historial de avisos del admin (campana de la barra superior y la página
   Sistema > Avisos > Historial).

   Pequeño store compartido:
   - unread: conteo de no leídos (GET .../history/unread-count).
   - version: sube cuando llega un aviso en vivo o se marcan leídos, para que
     las listas abiertas (panel, página) se recarguen.
   - settings: configuración de colores del Centro de avisos (la publica
     NotificationCenter, que ya la carga).
   ────────────────────────────────────────────────────────────────────────── */

const BASE = () => `${API.trips}/trips/admin/notifications/history`;

export interface InboxItem {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string;
  data: Record<string, unknown> | null;
  /** Hora Perú sin zona. */
  createdAt: string;
  read: boolean;
  readAt: string | null;
}

export interface InboxPage {
  items: InboxItem[];
  total: number;
  page: number;
  pageSize: number;
  unread: number;
}

export interface InboxQuery {
  page?: number;
  pageSize?: number;
  type?: string;
  from?: string;
  to?: string;
  unreadOnly?: boolean;
}

interface State { unread: number; version: number; settings: NotifySettings }

let state: State = { unread: 0, version: 0, settings: defaultSettings() };
const listeners = new Set<() => void>();

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach(l => l());
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function useInboxUnread(): number {
  return useSyncExternalStore(subscribe, () => state.unread);
}
export function useInboxVersion(): number {
  return useSyncExternalStore(subscribe, () => state.version);
}
export function useInboxSettings(): NotifySettings {
  return useSyncExternalStore(subscribe, () => state.settings);
}

let counting: Promise<void> | null = null;

export const adminInbox = {
  /** Vuelve a pedir el conteo de no leídos (sin duplicar pedidos en curso). */
  refreshCount(): Promise<void> {
    if (counting) return counting;
    counting = apiFetch<{ unread: number }>(`${BASE()}/unread-count`)
      .then(r => set({ unread: Math.max(0, r?.unread ?? 0) }))
      .catch(() => { /* se reintenta en el siguiente ciclo */ })
      .finally(() => { counting = null; });
    return counting;
  },

  setUnread(n: number) { set({ unread: Math.max(0, n) }); },

  /** Llegó un aviso en vivo: refresca conteo y listas abiertas. */
  notifyLive() {
    set({ version: state.version + 1 });
    adminInbox.refreshCount();
  },

  list(q: InboxQuery): Promise<InboxPage> {
    const p = new URLSearchParams();
    p.set('page', String(q.page ?? 1));
    p.set('pageSize', String(q.pageSize ?? 20));
    if (q.type) p.set('type', q.type);
    if (q.from) p.set('from', q.from);
    if (q.to) p.set('to', q.to);
    if (q.unreadOnly) p.set('unreadOnly', 'true');
    return apiFetch<InboxPage>(`${BASE()}?${p.toString()}`);
  },

  /** Marca un aviso como leído. Optimista: baja el conteo al instante. */
  async markRead(id: string, wasUnread = true): Promise<void> {
    if (wasUnread) set({ unread: Math.max(0, state.unread - 1) });
    const res = await fetchNoBody(`${BASE()}/${encodeURIComponent(id)}/read`);
    // 404 = no existe o no lo puedes ver: no es un error para el usuario.
    if (!res.ok && res.status !== 404) {
      adminInbox.refreshCount();
      throw new Error(`Error ${res.status}`);
    }
    // Confirma el conteo real (otro admin u otra pestaña pudo cambiarlo).
    adminInbox.refreshCount();
  },

  /** Marca todos como leídos. Devuelve cuántos se marcaron. */
  async markAll(): Promise<number> {
    const r = await apiFetch<{ updated: number }>(`${BASE()}/read-all`, { method: 'POST' });
    set({ unread: 0, version: state.version + 1 });
    return r?.updated ?? 0;
  },

  setSettings(s: NotifySettings) { set({ settings: s }); },
};

/** POST que responde 204 (apiFetch espera JSON). */
function fetchNoBody(url: string): Promise<Response> {
  return fetch(url, { method: 'POST', headers: { ...authHeaders() } });
}

/* ── Presentación ──────────────────────────────────────────────────── */

/** Ícono y color de un tipo de aviso según el Centro de avisos. */
export function noticeStyle(type: string, settings: NotifySettings): { icon: string; color: NoticeColor; label: string } {
  const meta = NOTICE_TYPES.find(t => t.type === type);
  const cfg = settings.config[type as NoticeType] ?? DEFAULT_CONFIG[type as NoticeType];
  return { icon: meta?.icon ?? 'fa-bell', color: cfg?.color ?? 'neutral', label: meta?.label ?? 'Aviso' };
}

/** Tipos que se guardan en el historial (los en vivo). */
export const HISTORY_TYPES = NOTICE_TYPES.filter(t => t.kind === 'live');

/** Fecha del backend: si no trae zona, es hora Perú (UTC−5). */
export function parsePeru(s: string | null | undefined): Date | null {
  if (!s) return null;
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(s);
  const d = new Date(hasZone ? s : `${s}-05:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "ahora", "hace 5 min", "hace 3 h", "ayer", "hace 4 días" o la fecha. */
export function timeAgo(s: string | null | undefined, now = Date.now()): string {
  const d = parsePeru(s);
  if (!d) return '';
  const diff = Math.max(0, now - d.getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const days = Math.floor(h / 24);
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: days > 300 ? 'numeric' : undefined });
}

/** Fecha y hora completas (hora Perú). */
export function fmtPeru(s: string | null | undefined): string {
  const d = parsePeru(s);
  return d ? d.toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
}
