import { apiFetch, API } from './api';
import { PERMS } from './permissions';

/* ──────────────────────────────────────────────────────────────────────────
   Configuración del Centro de avisos del panel.

   Se guarda en landing.SystemSettings (una clave por tipo: admin_notify_<tipo>,
   valor JSON) y los umbrales de vencimiento en doc_expiry_alert_days ("6,3,0").
   La edita la página Sistema > Avisos y la usa NotificationCenter.
   ────────────────────────────────────────────────────────────────────────── */

/** Colores disponibles: los tonos del tema (bx-tone-*). */
export type NoticeColor = 'primary' | 'ok' | 'warn' | 'bad' | 'info' | 'neutral';

export const NOTICE_COLORS: { value: NoticeColor; label: string }[] = [
  { value: 'primary', label: 'Morado' },
  { value: 'info',    label: 'Azul' },
  { value: 'ok',      label: 'Verde' },
  { value: 'warn',    label: 'Ámbar' },
  { value: 'bad',     label: 'Rojo' },
  { value: 'neutral', label: 'Gris' },
];

/** Avisos en tiempo real (llegan por SignalR). */
export type LiveType = 'sos' | 'deviation' | 'no_signal' | 'long_stop' | 'trip_delayed'
  | 'contact_message' | 'complaint' | 'driver_review' | 'passenger_review';
/** Recordatorios periódicos (conteos del resumen). */
export type ReminderType = 'document_expiring' | 'pending_messages' | 'pending_complaints' | 'pending_registrations';
export type NoticeType = LiveType | ReminderType;

/** none = solo al iniciar sesión (si onLogin), interval = cada N horas, fixed = horas fijas (hora Perú). */
export type ScheduleMode = 'none' | 'interval' | 'fixed';

export interface NoticeConfig {
  enabled: boolean;
  color: NoticeColor;
  /** Segundos en pantalla. */
  duration: number;
  // Solo recordatorios:
  onLogin: boolean;
  mode: ScheduleMode;
  everyHours: number;
  /** "HH:mm" en hora Perú. */
  times: string[];
}

export interface NoticeTypeMeta {
  type: NoticeType;
  kind: 'live' | 'reminder';
  label: string;
  description: string;
  icon: string;
}

export const NOTICE_TYPES: NoticeTypeMeta[] = [
  { type: 'sos',               kind: 'live', icon: 'fa-triangle-exclamation', label: 'Alerta SOS', description: 'Un pasajero o conductor activó el botón SOS durante un viaje.' },
  { type: 'deviation',         kind: 'live', icon: 'fa-route',          label: 'Desvío de ruta',           description: 'Un conductor se salió de la ruta planificada.' },
  { type: 'no_signal',         kind: 'live', icon: 'fa-satellite-dish', label: 'Viaje sin señal',          description: 'Un conductor con viaje en curso dejó de enviar su GPS.' },
  { type: 'long_stop',         kind: 'live', icon: 'fa-circle-pause',   label: 'Conductor detenido',       description: 'Un conductor con viaje en curso está detenido más de lo normal.' },
  { type: 'trip_delayed',      kind: 'live', icon: 'fa-stopwatch',      label: 'Viaje demorado',           description: 'Un viaje está tardando bastante más de lo estimado.' },
  { type: 'contact_message',   kind: 'live', icon: 'fa-envelope',       label: 'Mensaje de contacto',      description: 'Llegó un mensaje nuevo desde el sitio web.' },
  { type: 'complaint',         kind: 'live', icon: 'fa-book',           label: 'Reclamación nueva',        description: 'Alguien registró una reclamación en el libro.' },
  { type: 'driver_review',     kind: 'live', icon: 'fa-id-card',        label: 'Conductor por revisar',    description: 'Un conductor envió sus documentos a revisión o pidió revisar su suspensión o rechazo.' },
  { type: 'passenger_review',  kind: 'live', icon: 'fa-user-check',     label: 'Pasajero por aprobar',     description: 'Un pasajero subió su DNI.' },
  { type: 'document_expiring',     kind: 'reminder', icon: 'fa-calendar-xmark', label: 'Documentos por vencer',      description: 'Conductores con documentos que vencen pronto.' },
  { type: 'pending_messages',      kind: 'reminder', icon: 'fa-envelope-open',  label: 'Mensajes sin atender',       description: 'Mensajes de contacto todavía sin respuesta.' },
  { type: 'pending_complaints',    kind: 'reminder', icon: 'fa-book-open',      label: 'Reclamaciones sin atender',  description: 'Reclamaciones pendientes o fuera de plazo.' },
  { type: 'pending_registrations', kind: 'reminder', icon: 'fa-user-clock',     label: 'Registros sin revisar',      description: 'Conductores y pasajeros esperando revisión, y solicitudes de revisión de conductores.' },
];

const base = { enabled: true, duration: 6, onLogin: false, mode: 'none' as ScheduleMode, everyHours: 6, times: [] as string[] };

/** Valores por defecto (los mismos que inserta el script SQL). */
export const DEFAULT_CONFIG: Record<NoticeType, NoticeConfig> = {
  sos:                   { ...base, color: 'bad', duration: 10 },
  deviation:             { ...base, color: 'bad' },
  no_signal:             { ...base, color: 'warn', duration: 8 },
  long_stop:             { ...base, color: 'warn', duration: 8 },
  trip_delayed:          { ...base, color: 'warn', duration: 8 },
  contact_message:       { ...base, color: 'info' },
  complaint:             { ...base, color: 'warn' },
  driver_review:         { ...base, color: 'primary' },
  passenger_review:      { ...base, color: 'primary' },
  document_expiring:     { ...base, color: 'warn',    onLogin: true,  mode: 'interval', everyHours: 6 },
  pending_messages:      { ...base, color: 'info',    onLogin: false, mode: 'fixed', times: ['10:00', '16:00'] },
  pending_complaints:    { ...base, color: 'warn',    onLogin: false, mode: 'fixed', times: ['10:00', '16:00'] },
  pending_registrations: { ...base, color: 'primary', onLogin: true,  mode: 'interval', everyHours: 4 },
};

export const DEFAULT_DOC_DAYS = [6, 3, 0];
export const DOC_DAYS_KEY = 'doc_expiry_alert_days';
export const settingKey = (t: NoticeType) => `admin_notify_${t}`;
export const isNotifySetting = (key: string) => key.startsWith('admin_notify_') || key === DOC_DAYS_KEY;

/** Permiso que hace falta para ver cada recordatorio. */
export const REMINDER_PERMS: Record<Exclude<ReminderType, 'pending_registrations'>, string> = {
  document_expiring:  PERMS.ViewDrivers,
  pending_messages:   PERMS.ViewMessages,
  pending_complaints: PERMS.ViewComplaints,
};

const COLORS = new Set(NOTICE_COLORS.map(c => c.value));
const MODES = new Set<ScheduleMode>(['none', 'interval', 'fixed']);
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Lee el JSON guardado; cualquier campo inválido o ausente toma el valor por defecto. */
export function parseConfig(type: NoticeType, raw: string | undefined): NoticeConfig {
  const def = DEFAULT_CONFIG[type];
  let v: Partial<NoticeConfig> = {};
  try { v = raw ? JSON.parse(raw) : {}; } catch { v = {}; }
  const num = (x: unknown, min: number, max: number, d: number) =>
    typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max ? x : d;
  return {
    enabled:    typeof v.enabled === 'boolean' ? v.enabled : def.enabled,
    color:      v.color && COLORS.has(v.color) ? v.color : def.color,
    duration:   num(v.duration, 2, 120, def.duration),
    onLogin:    typeof v.onLogin === 'boolean' ? v.onLogin : def.onLogin,
    mode:       v.mode && MODES.has(v.mode) ? v.mode : def.mode,
    everyHours: num(v.everyHours, 1, 48, def.everyHours),
    times:      Array.isArray(v.times) ? v.times.filter(t => typeof t === 'string' && TIME_RE.test(t)).sort() : def.times,
  };
}

export function serializeConfig(type: NoticeType, c: NoticeConfig): string {
  const live = NOTICE_TYPES.find(t => t.type === type)?.kind === 'live';
  const out = live
    ? { enabled: c.enabled, color: c.color, duration: c.duration }
    : c;
  return JSON.stringify(out);
}

/** "6,3,0" → [6, 3, 0] (sin repetidos, de mayor a menor). */
export function parseDocDays(raw: string | undefined): number[] {
  const days = (raw ?? '').split(',').map(s => Number(s.trim()))
    .filter(n => Number.isInteger(n) && n >= 0 && n <= 365);
  const uniq = [...new Set(days)].sort((a, b) => b - a);
  return uniq.length ? uniq : DEFAULT_DOC_DAYS;
}

export interface NotifySettings {
  config: Record<NoticeType, NoticeConfig>;
  docDays: number[];
}

interface SettingRow { settingKey: string; value: string }

/** Convierte las filas de /landing/settings en la configuración de avisos. */
export function settingsFromRows(rows: SettingRow[]): NotifySettings {
  const map = new Map(rows.map(r => [r.settingKey, r.value]));
  const config = {} as Record<NoticeType, NoticeConfig>;
  NOTICE_TYPES.forEach(t => { config[t.type] = parseConfig(t.type, map.get(settingKey(t.type))); });
  return { config, docDays: parseDocDays(map.get(DOC_DAYS_KEY)) };
}

export function defaultSettings(): NotifySettings {
  return { config: { ...DEFAULT_CONFIG }, docDays: DEFAULT_DOC_DAYS };
}

/** Carga la configuración. Si Landing no responde, usa los valores por defecto. */
export async function loadNotifySettings(): Promise<NotifySettings> {
  try {
    const rows = await apiFetch<SettingRow[]>(`${API.landing}/landing/settings`);
    return settingsFromRows(rows ?? []);
  } catch {
    return defaultSettings();
  }
}

/** Avisa a NotificationCenter que la configuración cambió (misma pestaña). */
export const NOTIFY_CONFIG_EVENT = 'bugie:notify-config';

/** Muestra un aviso de prueba con la configuración indicada (página Avisos). */
export const NOTIFY_PREVIEW_EVENT = 'bugie:notify-preview';
export interface NotifyPreview { type: NoticeType; config: NoticeConfig; title: string; message: string }

/* ── Recordatorios: cuándo toca mostrarlos ───────────────────────────── */

/** Marca de inicio de sesión (la pone Login). */
export const LOGIN_AT_KEY = 'bugie_login_at';
/** Última vez que se mostró (o revisó) cada recordatorio: { tipo: ms }. */
export const LAST_SHOWN_KEY = 'bugie_notify_last';

const PERU_OFFSET_MS = -5 * 60 * 60 * 1000;

/** Instante (ms UTC) de la última "hora fija" ya pasada, en hora Perú. null si no hay horas. */
export function lastFixedSlot(times: string[], now: number): number | null {
  if (times.length === 0) return null;
  const peruNow = new Date(now + PERU_OFFSET_MS);          // campos UTC = hora Perú
  const y = peruNow.getUTCFullYear(), m = peruNow.getUTCMonth(), d = peruNow.getUTCDate();
  let best: number | null = null;
  for (const dayOffset of [0, -1]) {
    for (const t of times) {
      const [hh, mm] = t.split(':').map(Number);
      const slot = Date.UTC(y, m, d + dayOffset, hh, mm) - PERU_OFFSET_MS;
      if (slot <= now && (best === null || slot > best)) best = slot;
    }
  }
  return best;
}

/** ¿Toca mostrar este recordatorio ahora? */
export function isReminderDue(c: NoticeConfig, last: number | undefined, loginAt: number | undefined, now: number): boolean {
  if (!c.enabled) return false;
  if (c.onLogin && loginAt && (!last || last < loginAt)) return true;
  if (c.mode === 'interval') return !last || now - last >= c.everyHours * 3600_000;
  if (c.mode === 'fixed') {
    const slot = lastFixedSlot(c.times, now);
    return slot !== null && (!last || last < slot);
  }
  return false;
}
