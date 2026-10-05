import { useEffect, useState } from 'react';
import { API, apiFetch, ApiError } from '../state/api';
import { EmptyState, SectionCard, Skeleton, StatusBadge, Tone } from './ui';

/// Registro de auditoría de aprobación del conductor
/// (GET /api/drivers/approval-audit/driver/{driverId}).
export interface ApprovalAuditItem {
  id: string;
  driverId: string;
  driverName: string | null;
  action: 'approved' | 'approved_exception' | 'documents_completed' | 'auto_deactivated';
  adminUserId: string | null;
  adminName: string | null;
  reason: string | null;
  missingDocs: string[];
  missingDocLabels: string[];
  deadline: string | null;
  createdAt: string;
}

const ACTION_META: Record<ApprovalAuditItem['action'], { label: string; icon: string; tone: Tone }> = {
  approved:            { label: 'Aprobado (documentos completos)', icon: 'fa-circle-check',         tone: 'ok' },
  approved_exception:  { label: 'Aprobado por excepción',          icon: 'fa-triangle-exclamation', tone: 'warn' },
  documents_completed: { label: 'Completó documentos',             icon: 'fa-file-circle-check',    tone: 'info' },
  auto_deactivated:    { label: 'Desactivado automáticamente',     icon: 'fa-user-slash',           tone: 'bad' },
};

const fmt = (iso: string) => new Date(iso).toLocaleString('es-PE', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

/// `reloadKey` cambia cuando el padre aprueba al conductor, para recargar.
export default function DriverApprovalAudit({ driverId, reloadKey }: { driverId: string; reloadKey: number }) {
  const [items, setItems]     = useState<ApprovalAuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    apiFetch<ApprovalAuditItem[]>(`${API.drivers}/drivers/approval-audit/driver/${driverId}`)
      .then(list => { if (alive) setItems(list); })
      .catch(e => { if (alive) setError(e instanceof ApiError ? e.message : 'No se pudo cargar la auditoría.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [driverId, reloadKey]);

  return (
    <SectionCard
      title="Auditoría de aprobación"
      icon="fa-clipboard-list"
      description="Quién aprobó, cuándo y con qué motivo."
      actions={!loading && <StatusBadge tone="neutral">{items.length} registro{items.length === 1 ? '' : 's'}</StatusBadge>}
    >
      {error && <div className="alert alert-danger small mb-2">{error}</div>}

      {loading ? (
        <Skeleton count={3} height={56} radius={10} />
      ) : items.length === 0 ? (
        <EmptyState compact title="Sin registros de aprobación" icon="fa-clipboard" />
      ) : (
        <ol className="list-unstyled d-grid gap-2 mb-0">
          {items.map(a => {
            const meta = ACTION_META[a.action] ?? { label: a.action, icon: 'fa-circle-info', tone: 'neutral' as Tone };
            return (
              <li key={a.id} className="p-3 rounded-3 small" style={{ background: 'var(--bugie-surface-2)' }}>
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <StatusBadge tone={meta.tone} icon={meta.icon}>{meta.label}</StatusBadge>
                  <span className="ms-auto bugie-muted">{fmt(a.createdAt)}</span>
                </div>
                <div className="bugie-muted mt-2">
                  <i className="fa-solid fa-user-shield me-1" aria-hidden="true" />
                  {a.adminName ?? (a.adminUserId ? `Admin ${a.adminUserId.slice(0, 8)}…` : 'Sistema (automático)')}
                </div>
                {a.reason && <div className="mt-1"><span className="bugie-muted">Motivo:</span> {a.reason}</div>}
                {a.missingDocLabels.length > 0 && (
                  <div className="mt-1"><span className="bugie-muted">Documentos faltantes:</span> {a.missingDocLabels.join(', ')}</div>
                )}
                {a.deadline && <div className="mt-1"><span className="bugie-muted">Plazo:</span> {fmt(a.deadline)}</div>}
              </li>
            );
          })}
        </ol>
      )}
    </SectionCard>
  );
}
