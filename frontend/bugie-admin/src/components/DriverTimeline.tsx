import { useEffect, useState } from 'react';
import { API, apiFetch, ApiError } from '../state/api';
import { EmptyState, SectionCard, Skeleton, StatusBadge, Tone } from './ui';
import { fmtDateTime } from '../pages/admin/people/PeopleShared';
import { AUDIT_META, AccountAuditItem, AuditChange, auditActor, fetchAccountAudit } from '../pages/admin/people/AccountShared';

/// Línea de tiempo de la cuenta del conductor (GET /api/drivers/admin/{driverId}/timeline),
/// más reciente primero. Incluye aprobaciones, rechazos, suspensiones,
/// reactivaciones y solicitudes de revisión.
export interface DriverTimelineItem {
  id: string;
  at: string;
  action: string;
  actorName: string;
  actorRole: 'admin' | 'system' | 'driver' | string;
  reason: string | null;
  details: string | null;
  fromStatus: number | null;
  toStatus: number | null;
}

const ACTION_META: Record<string, { label: string; icon: string; tone: Tone }> = {
  approved:              { label: 'Aprobado',                          icon: 'fa-circle-check',         tone: 'ok' },
  approved_with_pending: { label: 'Aprobado por excepción',            icon: 'fa-triangle-exclamation', tone: 'warn' },
  documents_completed:   { label: 'Completó documentos',               icon: 'fa-file-circle-check',    tone: 'info' },
  auto_deactivated:      { label: 'Desactivado automáticamente',       icon: 'fa-user-slash',           tone: 'bad' },
  rejected:              { label: 'Registro rechazado',                icon: 'fa-circle-xmark',         tone: 'bad' },
  suspended:             { label: 'Cuenta suspendida',                 icon: 'fa-ban',                  tone: 'bad' },
  reactivated:           { label: 'Cuenta reactivada',                 icon: 'fa-rotate-left',          tone: 'ok' },
  auto_reactivated:      { label: 'Reactivado al terminar la suspensión', icon: 'fa-clock-rotate-left', tone: 'ok' },
  review_requested:      { label: 'Solicitó revisión',                 icon: 'fa-envelope-open-text',   tone: 'warn' },
  review_kept:           { label: 'Se mantuvo la decisión',            icon: 'fa-gavel',                tone: 'neutral' },
  expired:               { label: 'Documentos vencidos',               icon: 'fa-calendar-xmark',       tone: 'bad' },
};

const ROLE_LABEL: Record<string, string> = { admin: 'Administrador', system: 'Automático', driver: 'Conductor' };
const ROLE_ICON: Record<string, string>  = { admin: 'fa-user-shield', system: 'fa-gears', driver: 'fa-id-card' };

/// Fila unificada: estado del conductor (Drivers) o cuenta de usuario (Auth).
type Row = { kind: 'driver'; at: string; item: DriverTimelineItem } | { kind: 'account'; at: string; item: AccountAuditItem };

/// `reloadKey` cambia cuando el padre hace una acción, para recargar.
/// Con `userId` mezcla también el historial de cuenta (documento, nombres,
/// eliminación y restauración), ordenado por fecha.
export default function DriverTimeline({ driverId, userId, reloadKey }: { driverId: string; userId?: string; reloadKey: number }) {
  const [items, setItems]     = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [retry, setRetry]     = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    Promise.all([
      apiFetch<DriverTimelineItem[]>(`${API.drivers}/drivers/admin/${driverId}/timeline`),
      userId ? fetchAccountAudit(userId) : Promise.resolve([] as AccountAuditItem[]),
    ])
      .then(([timeline, audit]) => {
        if (!alive) return;
        const rows: Row[] = [
          ...(timeline ?? []).map(item => ({ kind: 'driver' as const, at: item.at, item })),
          ...(audit ?? []).map(item => ({ kind: 'account' as const, at: item.createdAt, item })),
        ];
        // Más reciente primero.
        setItems(rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()));
      })
      .catch(e => { if (alive) setError(e instanceof ApiError ? e.message : 'No se pudo cargar el historial.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [driverId, userId, reloadKey, retry]);

  return (
    <SectionCard
      title="Historial de la cuenta"
      icon="fa-clock-rotate-left"
      description="Quién cambió el estado del conductor o corrigió sus datos, cuándo y con qué motivo."
      actions={!loading && !error && <StatusBadge tone="neutral">{items.length} registro{items.length === 1 ? '' : 's'}</StatusBadge>}
    >
      {loading ? (
        <Skeleton count={3} height={64} radius={10} />
      ) : error ? (
        <EmptyState compact variant="error" title="No se pudo cargar el historial" text={error}
          action={<button className="btn btn-sm btn-bugie" onClick={() => setRetry(r => r + 1)}>Reintentar</button>} />
      ) : items.length === 0 ? (
        <EmptyState compact title="Sin movimientos" text="Aún no hay cambios de estado registrados." icon="fa-clock-rotate-left" />
      ) : (
        <ol className="list-unstyled mb-0">
          {items.map((row, i) => {
            const last = i === items.length - 1;
            if (row.kind === 'account') return <AccountRow key={`acc-${row.item.id}`} a={row.item} last={last} />;
            const a = row.item;
            const meta = ACTION_META[a.action] ?? { label: a.action, icon: 'fa-circle-info', tone: 'neutral' as Tone };
            return (
              <li key={a.id} className="d-flex gap-3">
                {/* Riel: ícono + línea vertical hasta el siguiente */}
                <div className="d-flex flex-column align-items-center" style={{ flex: '0 0 auto' }}>
                  <span className={`bx-stat-icon bx-tone-${meta.tone}`} aria-hidden="true"><i className={`fa-solid ${meta.icon}`} /></span>
                  {!last && <span aria-hidden="true" style={{ flex: '1 1 auto', width: 2, minHeight: 12, background: 'var(--bugie-border)', margin: '4px 0' }} />}
                </div>
                <div className={`small flex-grow-1 ${last ? '' : 'pb-3'}`} style={{ minWidth: 0 }}>
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <span className="fw-semibold">{meta.label}</span>
                    <span className="ms-auto bugie-muted">{fmtDateTime(a.at)}</span>
                  </div>
                  <div className="bugie-muted mt-1">
                    <i className={`fa-solid ${ROLE_ICON[a.actorRole] ?? 'fa-user'} me-1`} aria-hidden="true" />
                    {a.actorName}{a.actorRole !== 'system' && ROLE_LABEL[a.actorRole] ? ` · ${ROLE_LABEL[a.actorRole]}` : ''}
                  </div>
                  {a.reason && (
                    <div className="mt-1" style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-line' }}>
                      <span className="bugie-muted">{a.action === 'review_requested' ? 'Mensaje:' : 'Motivo:'}</span> {a.reason}
                    </div>
                  )}
                  {a.details && <div className="mt-1 bugie-muted">{a.details}</div>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </SectionCard>
  );
}

/// Evento de la cuenta de usuario (Auth) dentro del historial del conductor.
function AccountRow({ a, last }: { a: AccountAuditItem; last: boolean }) {
  const meta = AUDIT_META[a.action] ?? { icon: 'fa-circle-info', tone: 'neutral' as Tone };
  return (
    <li className="d-flex gap-3">
      <div className="d-flex flex-column align-items-center" style={{ flex: '0 0 auto' }}>
        <span className={`bx-stat-icon bx-tone-${meta.tone}`} aria-hidden="true"><i className={`fa-solid ${meta.icon}`} /></span>
        {!last && <span aria-hidden="true" style={{ flex: '1 1 auto', width: 2, minHeight: 12, background: 'var(--bugie-border)', margin: '4px 0' }} />}
      </div>
      <div className={`small flex-grow-1 ${last ? '' : 'pb-3'}`} style={{ minWidth: 0 }}>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <span className="fw-semibold">{a.actionLabel}</span>
          <StatusBadge tone="neutral" size="sm" icon="fa-id-card">Cuenta</StatusBadge>
          <span className="ms-auto bugie-muted">{fmtDateTime(a.createdAt)}</span>
        </div>
        <div className="bugie-muted mt-1">
          <i className={`fa-solid ${a.actorRole === 'admin' ? 'fa-user-shield' : 'fa-id-card'} me-1`} aria-hidden="true" />{auditActor(a)}
        </div>
        {a.reason && (
          <div className="mt-1" style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-line' }}>
            <span className="bugie-muted">Motivo:</span> {a.reason}
          </div>
        )}
        <AuditChange oldValue={a.oldValue} newValue={a.newValue} />
      </div>
    </li>
  );
}
