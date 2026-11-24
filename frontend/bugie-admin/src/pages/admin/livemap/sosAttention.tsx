import { useCallback, useEffect, useRef, useState } from 'react';
import { API, ApiError, apiFetch } from '../../../state/api';
import { StatusBadge, useToast } from '../../../components/ui';
import type { SosUpdatedEvent } from '../../../hooks/useMonitorHub';
import { SOS_GOAL_FALLBACK_MIN, useSosGoal } from '../../../hooks/useSosGoal';
import { fmtHour, minutesAgo } from './types';

/* ──────────────────────────────────────────────────────────────────────────
   Atención de alertas SOS (Centro SOS y Monitoreo).

   - "Visto": se registra solo, la primera vez que un admin abre la alerta
     (PUT sos/admin/{id}/seen). Solo con la pestaña visible.
   - "Atendiendo": botón (PUT sos/admin/{id}/attending). Si ya la tomó otro
     admin, el backend responde 409 con su nombre.
   - Las marcas valen para todas las alertas activas del viaje y llegan en vivo
     a los demás admins por SignalR ("sos:updated").
   - Tiempo de respuesta = lo primero entre visto y atendiendo, menos la
     activación (meta: Configuración → sos_response_min, ver useSosGoal).
   ────────────────────────────────────────────────────────────────────────── */

/** Marcas de atención de una alerta (vienen en GET sos/admin/active y /history). */
export interface SosAttention {
  id: string;
  tripId: string;
  createdAt: string;
  resolved?: boolean;
  resolvedAt?: string | null;
  resolvedByName?: string | null;
  firstSeenAt?: string | null;
  firstSeenByName?: string | null;
  attendingAt?: string | null;
  attendingBy?: string | null;
  attendingByName?: string | null;
  /** Minutos de respuesta calculados por el backend (null si nadie la vio aún). */
  responseMinutes?: number | null;
  /** Se resolvió sin registrar visto ni atendiendo. */
  attentionUnregistered?: boolean;
}

/** Marcas que trae "sos:updated" o la respuesta de seen/attending. */
type AttentionMarks = Pick<SosUpdatedEvent, 'tripId'> & Partial<Pick<SosUpdatedEvent,
  'firstSeenAt' | 'firstSeenByName' | 'attendingAt' | 'attendingBy' | 'attendingByName'>>;

/** UserId del admin con sesión (se guarda al iniciar sesión). */
export function currentAdminId(): string | null {
  try {
    const raw = localStorage.getItem('bugie_admin_user');
    return raw ? (JSON.parse(raw).userId ?? null) : null;
  } catch { return null; }
}

/** Minutos entre dos horas (nunca negativo). */
export const minutesBetween = (from: string, to: string) =>
  Math.max(0, (new Date(to).getTime() - new Date(from).getTime()) / 60000);

/** "40 s", "3,5 min", "1 h 05 min". */
export function fmtElapsed(min?: number | null): string {
  if (min == null || !Number.isFinite(min)) return '—';
  if (min < 1) return `${Math.max(0, Math.round(min * 60))} s`;
  if (min < 60) return `${(Math.round(min * 10) / 10).toLocaleString('es-PE')} min`;
  const m = Math.round(min);
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

/**
 * Aplica las marcas de atención a las alertas ACTIVAS del mismo viaje que aún
 * no las tenían (las existentes nunca se pisan, como en el backend).
 * Devuelve la misma lista si no cambió nada.
 */
export function applySosAttention<T extends Omit<SosAttention, 'createdAt' | 'id'>>(list: T[], m: AttentionMarks): T[] {
  let changed = false;
  const next = list.map(a => {
    if (a.tripId !== m.tripId || a.resolved) return a;
    const seen = !a.firstSeenAt && m.firstSeenAt;
    const attending = !a.attendingAt && m.attendingAt;
    if (!seen && !attending) return a;
    changed = true;
    return {
      ...a,
      ...(seen ? { firstSeenAt: m.firstSeenAt, firstSeenByName: m.firstSeenByName ?? null } : {}),
      ...(attending ? { attendingAt: m.attendingAt, attendingBy: m.attendingBy ?? null, attendingByName: m.attendingByName ?? null } : {}),
    };
  });
  return changed ? next : list;
}

// Alertas ya enviadas como "vistas" en esta pestaña (no se repite la llamada).
const seenSent = new Set<string>();

/**
 * Registra "visto" de las alertas indicadas (activas y sin visto) cuando la
 * pestaña está visible; si está en segundo plano, espera a que se vea.
 * onMarked recibe la alerta con sus marcas (para mostrarlas al instante).
 */
export function useMarkSosSeen(alertIds: string[], onMarked?: (row: AttentionMarks) => void) {
  const cb = useRef(onMarked);
  useEffect(() => { cb.current = onMarked; }, [onMarked]);
  const key = alertIds.filter(id => !seenSent.has(id)).join(',');

  useEffect(() => {
    if (!key) return;
    const ids = key.split(',');
    const send = () => {
      if (document.visibilityState !== 'visible') return false;
      ids.forEach(id => {
        if (seenSent.has(id)) return;
        seenSent.add(id);
        apiFetch<AttentionMarks>(`${API.trips}/sos/admin/${id}/seen`, { method: 'PUT' })
          .then(row => cb.current?.(row))
          .catch(() => seenSent.delete(id)); // se reintenta la próxima vez que se abra
      });
      return true;
    };
    if (send()) return;
    const onVisible = () => { if (send()) document.removeEventListener('visibilitychange', onVisible); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [key]);
}

/** Marca "Atendiendo". Devuelve la alerta con sus marcas, o null si no se pudo (p. ej. ya la tomó otro). */
export function useAttendSos() {
  const toast = useToast();
  return useCallback(async (alertId: string): Promise<AttentionMarks | null> => {
    try {
      const row = await apiFetch<AttentionMarks>(`${API.trips}/sos/admin/${alertId}/attending`, { method: 'PUT' });
      toast.success('Quedaste a cargo de esta alerta.');
      return row;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) toast.warning(err.message);
      else toast.error(`No se pudo marcar como atendiendo: ${err instanceof Error ? err.message : 'error desconocido'}`);
      return null;
    }
  }, [toast]);
}

/** Re-render cada 30 s para que "hace N min" no quede congelado. */
function useTick(ms = 30000) {
  const [, setT] = useState(0);
  useEffect(() => { const t = setInterval(() => setT(x => x + 1), ms); return () => clearInterval(t); }, [ms]);
}

/**
 * "Atendiendo": botón si nadie la tomó; si ya la tomó alguien, indicador
 * "Atendiendo: Nombre · hace 2 min". Solo para alertas activas.
 */
export function SosAttendControl({ alert, onAttend, size = 'md', block }: {
  alert: SosAttention;
  onAttend: (a: SosAttention) => Promise<unknown> | void;
  size?: 'sm' | 'md';
  block?: boolean;
}) {
  useTick();
  const [busy, setBusy] = useState(false);
  if (alert.resolved) return null;

  if (alert.attendingAt) {
    const mine = !!alert.attendingBy && alert.attendingBy === currentAdminId();
    return (
      <StatusBadge tone="info" icon="fa-headset" size={size === 'sm' ? 'sm' : undefined}
                   title={`Desde las ${fmtHour(alert.attendingAt)}`}>
        Atendiendo: {mine ? 'tú' : (alert.attendingByName || 'otro administrador')} · {minutesAgo(alert.attendingAt)}
      </StatusBadge>
    );
  }

  return (
    <button
      type="button"
      className={`btn ${size === 'sm' ? 'btn-sm' : ''} btn-outline-primary ${block ? 'w-100' : ''}`}
      disabled={busy}
      onClick={async e => {
        e.stopPropagation();
        setBusy(true);
        try { await onAttend(alert); } finally { setBusy(false); }
      }}
    >
      <i className={`fa-solid ${busy ? 'fa-spinner fa-spin' : 'fa-headset'} me-1`} aria-hidden="true" />Atendiendo
    </button>
  );
}

/**
 * Línea de tiempo de la alerta: Activado → Visto (por) → Atendiendo (por) →
 * Resuelto (por), con los minutos desde la activación.
 */
export function SosTimeline({ alert }: { alert: SosAttention }) {
  const since = (iso?: string | null) => (iso ? `+${fmtElapsed(minutesBetween(alert.createdAt, iso))}` : null);
  const steps = [
    { icon: 'fa-bell', label: 'Activado', at: alert.createdAt, who: null as string | null, extra: null as string | null },
    { icon: 'fa-eye', label: 'Visto', at: alert.firstSeenAt ?? null, who: alert.firstSeenByName ?? null, extra: since(alert.firstSeenAt) },
    { icon: 'fa-headset', label: 'Atendiendo', at: alert.attendingAt ?? null, who: alert.attendingByName ?? null, extra: since(alert.attendingAt) },
    { icon: 'fa-circle-check', label: 'Resuelto', at: alert.resolvedAt ?? null, who: alert.resolvedByName ?? null, extra: since(alert.resolvedAt) },
  ];
  return (
    <div className="d-grid gap-2">
      <ol className="ops-timeline" aria-label="Línea de tiempo de la alerta">
        {steps.map(s => (
          <li key={s.label} className={s.at ? '' : 'off'}>
            <i className={`fa-solid ${s.icon}`} aria-hidden="true" />
            <span>
              <strong>{s.label}</strong>
              {s.at && s.who && <span className="bugie-muted"> por {s.who}</span>}
              {!s.at && <span className="bugie-muted"> · pendiente</span>}
            </span>
            {s.at && <span className="when">{fmtHour(s.at)}{s.extra ? ` (${s.extra})` : ''}</span>}
          </li>
        ))}
      </ol>
      <SosResponseLine alert={alert} />
    </div>
  );
}

/** "Respuesta: 1,2 min · cumple la meta" o "Atención no registrada". */
export function SosResponseLine({ alert }: { alert: SosAttention }) {
  const goal = useSosGoal() ?? SOS_GOAL_FALLBACK_MIN;
  if (alert.attentionUnregistered) {
    return (
      <div className="small">
        <StatusBadge tone="neutral" size="sm" icon="fa-circle-question">Atención no registrada</StatusBadge>{' '}
        <span className="bugie-muted">Se resolvió sin marcar visto ni atendiendo: se toma la hora de resolución.</span>
      </div>
    );
  }
  // Lo primero entre visto y atendiendo (el backend ya lo trae calculado al cargar).
  const marks = [alert.firstSeenAt, alert.attendingAt].filter((x): x is string => !!x)
    .map(iso => minutesBetween(alert.createdAt, iso));
  const min = alert.responseMinutes ?? (marks.length ? Math.min(...marks) : null);
  if (min == null) return <div className="small bugie-muted">Respuesta: pendiente (nadie la abrió todavía).</div>;
  const ok = min < goal;
  return (
    <div className="small d-flex align-items-center gap-2 flex-wrap">
      <span>Respuesta: <strong>{fmtElapsed(min)}</strong></span>
      <StatusBadge tone={ok ? 'ok' : 'warn'} size="sm" icon={ok ? 'fa-check' : 'fa-triangle-exclamation'}>
        {ok ? 'Cumple' : 'No cumple'} la meta &lt; {goal} min
      </StatusBadge>
    </div>
  );
}
