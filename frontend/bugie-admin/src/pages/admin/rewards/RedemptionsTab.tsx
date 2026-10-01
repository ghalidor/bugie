import { useEffect, useState } from 'react';
import { ApiError } from '../../../state/api';
import {
  rewardsAdminApi, Redemption,
  STATUS_LABEL, STATUS_COLOR, USER_TYPE_LABEL, describeReward, fmtPoints, fmtDate,
} from '../../../state/rewards';

const PAGE_SIZE = 20;

const STATUSES: { key: string | null; label: string }[] = [
  { key: 'active',    label: 'Pendientes' },
  { key: 'used',      label: 'Entregados' },
  { key: 'expired',   label: 'Vencidos' },
  { key: 'cancelled', label: 'Anulados' },
  { key: null,        label: 'Todos' },
];

/// Tipos que el equipo entrega a mano y luego marca como entregados.
const MANUAL_TYPES = new Set(['wallet_bonus', 'physical', 'partner_benefit']);

export default function RedemptionsTab() {
  const [status,   setStatus]   = useState<string | null>('active');
  const [userType, setUserType] = useState<string | null>(null);
  const [page,     setPage]     = useState(1);
  const [items,    setItems]    = useState<Redemption[]>([]);
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  function load() {
    setLoading(true); setError(null);
    rewardsAdminApi.redemptions(status, userType, page, PAGE_SIZE)
      .then(d => { setItems(d.items); setTotal(d.total); })
      .catch(err => setError(err instanceof ApiError ? err.message : 'No se pudieron cargar los canjes.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, userType, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
        {STATUSES.map(s => (
          <button key={s.label} type="button" onClick={() => { setStatus(s.key); setPage(1); }}
                  className={`btn btn-sm rounded-pill ${status === s.key ? 'btn-bugie' : 'btn-bugie-outline'}`}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <span className="small bugie-muted">Mostrar:</span>
        {[null, 'passenger', 'driver'].map(t => (
          <button key={t ?? 'all'} type="button" onClick={() => { setUserType(t); setPage(1); }}
                  className={`btn btn-sm rounded-pill ${userType === t ? 'btn-bugie' : 'btn-bugie-outline'}`}>
            {t ? USER_TYPE_LABEL[t] : 'Todos'}
          </button>
        ))}
      </div>

      {error && <div className="alert alert-danger small mb-3">{error}</div>}

      {loading ? (
        <div className="d-flex justify-content-center py-5"><span className="spinner-border" /></div>
      ) : error ? null : items.length === 0 ? (
        <div className="bugie-card"><div className="bugie-card-body text-center py-4 bugie-muted">
          {status === 'active' ? 'No hay canjes pendientes de entregar.' : 'No hay canjes con este filtro.'}
        </div></div>
      ) : (
        <>
          <div className="d-flex flex-column gap-2">
            {items.map(r => <RedemptionRow key={r.id} r={r} onChanged={load} />)}
          </div>

          <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mt-3">
            <div className="small bugie-muted">
              {total.toLocaleString('es-PE')} canje{total === 1 ? '' : 's'}
            </div>
            <div className="d-flex align-items-center gap-2">
              <button type="button" className="btn btn-sm btn-bugie-outline rounded-pill"
                      onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                      aria-label="Página anterior">
                <i className="fa-solid fa-chevron-left" />
              </button>
              <span className="small fw-semibold mx-2">Página {page} de {totalPages}</span>
              <button type="button" className="btn btn-sm btn-bugie-outline rounded-pill"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                      aria-label="Página siguiente">
                <i className="fa-solid fa-chevron-right" />
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function RedemptionRow({ r, onChanged }: { r: Redemption; onChanged: () => void }) {
  const [action, setAction] = useState<'use' | 'cancel' | null>(null);
  const [note,   setNote]   = useState('');
  const [busy,   setBusy]   = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const color  = STATUS_COLOR[r.status] ?? '#94a3b8';
  const manual = MANUAL_TYPES.has(r.rewardType);

  async function confirm() {
    if (!action) return;
    setBusy(true); setError(null);
    try {
      if (action === 'use') await rewardsAdminApi.markUsed(r.code, note);
      else                  await rewardsAdminApi.cancel(r.code, note);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo completar la acción.');
      setBusy(false);
    }
  }

  return (
    <div className="bugie-card" style={{ overflow: 'hidden' }}>
      <div style={{ height: 3, background: color }} />
      <div className="p-3">
        <div className="d-flex flex-wrap align-items-center gap-3">
          <div className="flex-grow-1" style={{ minWidth: 220 }}>
            <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
              <span className="fw-bold" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', letterSpacing: '.05em' }}>
                {r.code}
              </span>
              <span className="badge rounded-pill" style={{ background: color + '22', color, fontSize: '0.72rem' }}>
                {STATUS_LABEL[r.status] ?? r.status}
              </span>
              {manual && r.status === 'active' && (
                <span className="badge rounded-pill" style={{ background: '#f59e0b22', color: '#f59e0b', fontSize: '0.72rem' }}>
                  Entrega manual
                </span>
              )}
            </div>
            <div className="fw-semibold">{r.itemName}</div>
            <div className="small bugie-muted">
              {describeReward(r)} · {fmtPoints(r.pointsSpent)} pts · canjeado {fmtDate(r.createdAt, true)}
            </div>
            {r.status === 'active' && (
              <div className="small bugie-muted">Vence el {fmtDate(r.expiresAt)}</div>
            )}
            {r.usedNote && r.status !== 'active' && (
              <div className="small bugie-muted">Nota: {r.usedNote}</div>
            )}
          </div>

          {r.status === 'active' && action === null && (
            <div className="d-flex gap-2">
              <button type="button" onClick={() => setAction('use')} className="btn btn-sm btn-bugie rounded-pill">
                <i className="fa-solid fa-check me-1" />Marcar entregado
              </button>
              <button type="button" onClick={() => setAction('cancel')} className="btn btn-sm btn-bugie-outline rounded-pill">
                Anular
              </button>
            </div>
          )}
        </div>

        {action && (
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--bugie-border)' }}>
            <div className="small mb-2">
              {action === 'use'
                ? 'Se marcará como entregado y el usuario ya no podrá usarlo.'
                : `Se anulará el cupón y se devolverán ${fmtPoints(r.pointsSpent)} puntos al usuario.`}
            </div>
            <input className="form-control form-control-sm mb-2" value={note}
                   placeholder={action === 'use' ? 'Nota opcional, ej: pagado por Yape el 12/10' : 'Motivo de la anulación'}
                   onChange={e => setNote(e.target.value)} />
            {error && <div className="alert alert-danger small mb-2">{error}</div>}
            <div className="d-flex gap-2">
              <button type="button" onClick={confirm} disabled={busy}
                      className={`btn btn-sm rounded-pill ${action === 'use' ? 'btn-bugie' : 'btn-danger'}`}>
                {busy
                  ? <span className="spinner-border spinner-border-sm" />
                  : action === 'use' ? 'Confirmar entrega' : 'Confirmar anulación'}
              </button>
              <button type="button" onClick={() => { setAction(null); setNote(''); setError(null); }}
                      disabled={busy} className="btn btn-sm btn-bugie-outline rounded-pill">
                Volver
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
