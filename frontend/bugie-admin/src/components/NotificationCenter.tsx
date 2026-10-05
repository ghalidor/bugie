import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useMonitorHub, AdminEvent } from '../hooks/useMonitorHub';
import { apiFetch, API } from '../state/api';
import { PERMS, usePermissions } from '../state/permissions';
import {
  DEFAULT_CONFIG, LAST_SHOWN_KEY, LOGIN_AT_KEY, NOTICE_TYPES, NOTIFY_CONFIG_EVENT, NOTIFY_PREVIEW_EVENT,
  NoticeColor, NoticeType, NotifyPreview, NotifySettings, ReminderType, REMINDER_PERMS,
  defaultSettings, isReminderDue, loadNotifySettings,
} from '../state/adminNotify';
import { adminInbox } from '../state/adminInbox';
import { storage, usePrefersReducedMotion } from './ui';
import './notificationCenter.scss';

/* ──────────────────────────────────────────────────────────────────────────
   Centro de avisos del panel (arriba a la derecha).

   - Avisos en vivo por SignalR: "admin:event" (mensajes de contacto,
     reclamaciones, conductores y pasajeros por revisar), el desvío de ruta
     ("deviation:new"), que se muestra aunque estés en Monitoreo, y la alerta
     SOS ("sos:new", solo con permiso del Centro SOS o del Monitoreo).
   - Recordatorios periódicos (solo conteos): consulta el resumen de Trips al
     iniciar sesión y según la periodicidad de cada tipo (Sistema > Avisos).
     La última vez mostrada por tipo se guarda en localStorage.
   - Solo muestra avisos cuyo permiso tiene el admin.
   - Máximo 4 a la vista; el resto espera su turno.
   ────────────────────────────────────────────────────────────────────────── */

interface Notice {
  id: number;
  type: string;
  title: string;
  message: string;
  link: string;
  /** Id del aviso en el historial: al abrirlo se marca leído. */
  notificationId?: string | null;
  icon: string;
  color: NoticeColor;
  /** ms en pantalla. */
  duration: number;
  leaving?: boolean;
}

interface Summary {
  documentsExpiring: { count: number; thresholdDays: number[] } | null;
  driversToReview: number | null;
  unattendedMessages: number | null;
  complaints: { pending: number; overdue: number } | null;
  passengersToApprove: number | null;
  /** Solicitudes de revisión abiertas de conductores suspendidos/rechazados.
   *  Drivers ya lo devuelve; Trips aún no lo agrega al resumen (queda undefined). */
  openReviewRequests?: number | null;
}

const MAX_VISIBLE = 4;
const CHECK_EVERY_MS = 60_000;
const CONFIG_REFRESH_MS = 10 * 60_000;
const RETRY_AFTER_ERROR_MS = 5 * 60_000;
const REMINDERS: ReminderType[] = ['document_expiring', 'pending_messages', 'pending_complaints', 'pending_registrations'];

let seq = 0;

/** "1 conductor" / "3 conductores". */
const plural = (n: number, one: string, many: string) => `${n.toLocaleString('es-PE')} ${n === 1 ? one : many}`;

function readLastShown(): Record<string, number> {
  try { return JSON.parse(storage.get(LAST_SHOWN_KEY) ?? '{}') ?? {}; } catch { return {}; }
}

export default function NotificationCenter() {
  const { has, loading: permsLoading } = usePermissions();
  const [settings, setSettings] = useState<NotifySettings>(defaultSettings);
  const [loaded, setLoaded] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);

  // Refs para usar siempre lo último dentro de callbacks de SignalR e intervalos.
  const settingsRef = useRef(settings);
  const hasRef = useRef(has);
  useEffect(() => { settingsRef.current = settings; adminInbox.setSettings(settings); }, [settings]);
  useEffect(() => { hasRef.current = has; }, [has]);

  /* ── Configuración ─────────────────────────────────────────────── */
  useEffect(() => {
    let alive = true;
    const load = () => loadNotifySettings().then(s => { if (alive) { setSettings(s); setLoaded(true); } });
    load();
    const t = setInterval(load, CONFIG_REFRESH_MS);
    // La página de Avisos avisa al guardar, así los cambios se ven al instante.
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<NotifySettings>).detail;
      if (detail) setSettings(detail); else load();
    };
    window.addEventListener(NOTIFY_CONFIG_EVENT, onChange);
    return () => { alive = false; clearInterval(t); window.removeEventListener(NOTIFY_CONFIG_EVENT, onChange); };
  }, []);

  /* ── Mostrar / cerrar ──────────────────────────────────────────── */
  const push = useCallback((n: { type: string; title: string; message: string; link: string; permission?: string; notificationId?: string | null }) => {
    if (n.permission && !hasRef.current(n.permission)) return;
    const cfg = settingsRef.current.config[n.type as NoticeType] ?? DEFAULT_CONFIG.contact_message;
    if (!cfg.enabled) return;
    const meta = NOTICE_TYPES.find(t => t.type === n.type);
    setNotices(list => [...list, {
      id: ++seq,
      type: n.type,
      title: n.title,
      message: n.message,
      link: n.link,
      notificationId: n.notificationId ?? null,
      icon: meta?.icon ?? 'fa-bell',
      color: cfg.color,
      duration: Math.max(2, cfg.duration) * 1000,
    }]);
  }, []);

  // Aviso de prueba desde Sistema > Avisos (usa la configuración aún sin guardar).
  useEffect(() => {
    const onPreview = (e: Event) => {
      const p = (e as CustomEvent<NotifyPreview>).detail;
      if (!p) return;
      const meta = NOTICE_TYPES.find(t => t.type === p.type);
      setNotices(list => [...list, {
        id: ++seq, type: p.type, title: p.title, message: p.message, link: '',
        icon: meta?.icon ?? 'fa-bell', color: p.config.color,
        duration: Math.max(2, p.config.duration) * 1000,
      }]);
    };
    window.addEventListener(NOTIFY_PREVIEW_EVENT, onPreview);
    return () => window.removeEventListener(NOTIFY_PREVIEW_EVENT, onPreview);
  }, []);

  const close = useCallback((id: number) => {
    setNotices(list => list.map(n => (n.id === id ? { ...n, leaving: true } : n)));
    setTimeout(() => setNotices(list => list.filter(n => n.id !== id)), 200);
  }, []);

  /* ── Avisos en vivo ────────────────────────────────────────────── */
  useMonitorHub({
    onSos: s => {
      // Mismo criterio que el Centro SOS: basta uno de los dos permisos.
      if (!hasRef.current(PERMS.ViewSosCenter) && !hasRef.current(PERMS.ViewLiveMap)) return;
      if (s.notificationId) adminInbox.notifyLive();
      push({
        notificationId: s.notificationId ?? null,
        type: 'sos',
        title: s.title || 'Alerta SOS',
        message: s.message || `${s.userRole === 'driver' ? 'Un conductor' : 'Un pasajero'} activó el botón SOS.`,
        link: '/admin/sos',
      });
    },
    onAdminEvent: (e: AdminEvent) => {
      // Lo guardado en el historial actualiza la campana.
      if (e.notificationId) adminInbox.notifyLive();
      push(e);
    },
    onDeviation: (kind, d) => {
      if (kind !== 'new') return;
      if (d.notificationId) adminInbox.notifyLive();
      push({
        notificationId: d.notificationId ?? null,
        type: 'deviation',
        title: 'Un conductor se desvió de la ruta',
        message: `Se alejó ${Math.round(d.distanceM).toLocaleString('es-PE')} m de la ruta planificada.`,
        link: '/admin/monitoreo',
        permission: PERMS.ViewLiveMap,
      });
    },
  });

  /* ── Recordatorios periódicos ──────────────────────────────────── */
  const checking = useRef(false);
  const retryAt = useRef(0);

  const checkReminders = useCallback(async () => {
    if (checking.current) return;
    const now = Date.now();
    if (now < retryAt.current) return;

    const { config, docDays } = settingsRef.current;
    const can = hasRef.current;
    const canSee = (t: ReminderType) => t === 'pending_registrations'
      ? can(PERMS.ViewVerification) || can(PERMS.ViewPassengers)
      : can(REMINDER_PERMS[t]);

    const last = readLastShown();
    const loginAt = Number(storage.get(LOGIN_AT_KEY)) || undefined;
    const due = REMINDERS.filter(t => canSee(t) && isReminderDue(config[t], last[t], loginAt, now));
    if (due.length === 0) return;

    checking.current = true;
    try {
      const s = await apiFetch<Summary>(`${API.trips}/trips/admin/notifications/summary`);
      const show = (type: ReminderType, title: string, message: string, link: string, permission?: string) =>
        push({ type, title, message, link, permission });

      for (const t of due) {
        if (t === 'document_expiring' && s.documentsExpiring && s.documentsExpiring.count > 0) {
          const max = Math.max(...(s.documentsExpiring.thresholdDays.length ? s.documentsExpiring.thresholdDays : docDays));
          show(t, `Hay ${plural(s.documentsExpiring.count, 'conductor', 'conductores')} con documentos por vencer`,
            max > 0 ? `Vencen en los próximos ${plural(max, 'día', 'días')} o ya vencieron.` : 'Vencen hoy o ya vencieron.',
            '/admin/conductores?filtro=expiring_soon');
        }
        if (t === 'pending_messages' && (s.unattendedMessages ?? 0) > 0) {
          const n = s.unattendedMessages!;
          show(t, `Hay ${plural(n, 'mensaje', 'mensajes')} sin atender`,
            'Mensajes de contacto que todavía no tienen respuesta.', '/admin/mensajes');
        }
        if (t === 'pending_complaints' && s.complaints && s.complaints.pending > 0) {
          const { pending, overdue } = s.complaints;
          show(t, `Hay ${plural(pending, 'reclamación pendiente', 'reclamaciones pendientes')}`,
            overdue > 0 ? `${plural(overdue, 'está fuera de plazo', 'están fuera de plazo')}.` : 'Respóndelas dentro del plazo legal.',
            '/admin/reclamaciones');
        }
        if (t === 'pending_registrations') {
          if ((s.driversToReview ?? 0) > 0) {
            show(t, `Hay ${plural(s.driversToReview!, 'conductor', 'conductores')} por revisar`,
              'Enviaron sus documentos y esperan tu revisión.', '/admin/verificacion', PERMS.ViewVerification);
          }
          if ((s.openReviewRequests ?? 0) > 0) {
            show(t, `Hay ${plural(s.openReviewRequests!, 'solicitud de revisión', 'solicitudes de revisión')} de conductores`,
              'Conductores suspendidos o rechazados piden revisar su caso.', '/admin/conductores?filtro=open_review', PERMS.ViewDrivers);
          }
          if ((s.passengersToApprove ?? 0) > 0) {
            show(t, `Hay ${plural(s.passengersToApprove!, 'pasajero', 'pasajeros')} por aprobar`,
              'Subieron su DNI y esperan aprobación.', '/admin/pasajeros', PERMS.ViewPassengers);
          }
        }
      }
      // Se marca aunque el conteo sea 0: así se respeta la periodicidad.
      const next = { ...readLastShown() };
      due.forEach(t => { next[t] = now; });
      storage.set(LAST_SHOWN_KEY, JSON.stringify(next));
    } catch {
      retryAt.current = now + RETRY_AFTER_ERROR_MS;
    } finally {
      checking.current = false;
    }
  }, [push]);

  useEffect(() => {
    if (permsLoading || !loaded) return;
    checkReminders();
    const t = setInterval(checkReminders, CHECK_EVERY_MS);
    return () => clearInterval(t);
  }, [permsLoading, loaded, checkReminders]);

  const visible = notices.slice(0, MAX_VISIBLE);
  const waiting = notices.length - visible.length;

  return createPortal(
    <div className="bx-notices" aria-live="polite" aria-label="Avisos">
      {visible.map(n => <NoticeCard key={n.id} notice={n} onClose={close} />)}
      {waiting > 0 && (
        <div className="bx-notices-more" aria-hidden="true">+{waiting} {waiting === 1 ? 'aviso más' : 'avisos más'}</div>
      )}
    </div>,
    document.body,
  );
}

/* ── Tarjeta de aviso ───────────────────────────────────────────────── */

function NoticeCard({ notice, onClose }: { notice: Notice; onClose: (id: number) => void }) {
  const navigate = useNavigate();
  const reduced = usePrefersReducedMotion();
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);

  // El tiempo corre solo con la tarjeta a la vista y sin el mouse/foco encima.
  // Con "menos movimiento" la barra avanza a saltos de 1 s (sin animación).
  useEffect(() => {
    if (paused || notice.leaving) return;
    const step = reduced ? 1000 : 100;
    const t = setInterval(() => setElapsed(e => e + step), step);
    return () => clearInterval(t);
  }, [paused, reduced, notice.leaving]);

  useEffect(() => {
    if (elapsed >= notice.duration && !notice.leaving) onClose(notice.id);
  }, [elapsed, notice.duration, notice.id, notice.leaving, onClose]);

  const remaining = Math.max(0, 1 - elapsed / notice.duration);

  function open() {
    onClose(notice.id);
    if (notice.notificationId) adminInbox.markRead(notice.notificationId).catch(() => {});
    if (notice.link.startsWith('/')) navigate(notice.link);
  }

  return (
    <div
      role="status"
      className={`bx-notice bx-tone-${notice.color} ${notice.leaving ? 'is-leaving' : ''}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <button type="button" className="bx-notice-body" onClick={open}
              aria-label={`${notice.title}. ${notice.message}${notice.link ? ' Abrir.' : ''}`}>
        <span className="bx-notice-icon" aria-hidden="true"><i className={`fa-solid ${notice.icon}`} /></span>
        <span className="bx-notice-text">
          <span className="bx-notice-title">{notice.title}</span>
          {notice.message && <span className="bx-notice-msg">{notice.message}</span>}
        </span>
      </button>
      <button type="button" className="bx-icon-btn sm ghost bx-notice-close" onClick={() => onClose(notice.id)} aria-label="Cerrar aviso">
        <i className="fa-solid fa-xmark" aria-hidden="true" />
      </button>
      <span className="bx-notice-progress" aria-hidden="true">
        <span style={{ transform: `scaleX(${remaining})` }} />
      </span>
    </div>
  );
}
