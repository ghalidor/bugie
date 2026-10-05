import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../../state/api';
import {
  rewardsAdminApi, Redemption,
  STATUS_LABEL, STATUS_TONE, USER_TYPE_LABEL, describeReward, fmtPoints, fmtDate,
} from '../../../state/rewards';
import { payoutsApi, PAYOUT_METHOD, nowLocalInput, fmtSoles } from '../../../state/payouts';
import PayoutFields, { PayoutDraft, validatePayout } from '../../../components/PayoutFields';
import {
  ActionItem, Column, DataTable, Drawer, FilterBar, Pagination, SectionCard, StatusBadge,
  useConfirm, useToast,
} from '../../../components/ui';
import { errMsg, LoadError } from './common';

const PAGE_SIZE = 20;

const STATUS_CHIPS = [
  { value: 'active',    label: 'Pendientes' },
  { value: 'used',      label: 'Entregados' },
  { value: 'expired',   label: 'Vencidos' },
  { value: 'cancelled', label: 'Anulados' },
  { value: 'all',       label: 'Todos' },
];

const TYPE_CHIPS = [
  { value: 'all',       label: 'Todos' },
  { value: 'passenger', label: 'Pasajeros' },
  { value: 'driver',    label: 'Conductores' },
];

/// Tipos que el equipo entrega a mano y luego marca como entregados.
const MANUAL_TYPES = new Set(['wallet_bonus', 'physical', 'partner_benefit']);

/** Los bonos en dinero se pagan al conductor: se registra el pago (método, operación, fecha). */
const isMoney = (r: Redemption) => r.rewardType === 'wallet_bonus' && !!r.userId;

/** Cupones y viajes gratis del nivel del pasajero: no cuestan puntos. */
const isLevelBenefit = (r: Redemption) => r.pointsSpent === 0;

export default function RedemptionsTab() {
  const confirm = useConfirm();
  const toast = useToast();
  const [status,   setStatus]   = useState('active');
  const [userType, setUserType] = useState('all');
  const [page,     setPage]     = useState(1);
  const [items,    setItems]    = useState<Redemption[]>([]);
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [paying,   setPaying]   = useState<Redemption | null>(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    rewardsAdminApi.redemptions(status === 'all' ? null : status, userType === 'all' ? null : userType, page, PAGE_SIZE)
      .then(d => { setItems(d.items); setTotal(d.total); })
      .catch(err => setError(errMsg(err, 'No se pudieron cargar los canjes.')))
      .finally(() => setLoading(false));
  }, [status, userType, page]);

  useEffect(load, [load]);

  async function deliver(r: Redemption) {
    const res = await confirm({
      title: `¿Marcar ${r.code} como entregado?`,
      message: `${r.itemName}${r.userName ? ` para ${r.userName}` : ''}. El usuario ya no podrá usarlo.`,
      confirmText: 'Marcar entregado',
      reason: 'optional',
      reasonLabel: 'Nota de la entrega',
      reasonPlaceholder: 'Ej. entregado en oficina',
    });
    if (!res) return;
    try {
      await rewardsAdminApi.markUsed(r.code, res.reason);
      toast.success(`${r.code} quedó como entregado.`);
      load();
    } catch (err) {
      toast.error(errMsg(err, 'No se pudo marcar como entregado.'));
    }
  }

  async function cancel(r: Redemption) {
    const res = await confirm({
      title: `¿Anular ${r.code}?`,
      message: isLevelBenefit(r)
        ? 'Se anulará el cupón. Es un beneficio de nivel, así que no hay puntos que devolver.'
        : `Se anulará el cupón y se devolverán ${fmtPoints(r.pointsSpent)} puntos al usuario.`,
      tone: 'danger',
      confirmText: 'Anular canje',
      reason: 'required',
      reasonLabel: 'Motivo de la anulación',
    });
    if (!res) return;
    try {
      await rewardsAdminApi.cancel(r.code, res.reason);
      toast.success(isLevelBenefit(r)
        ? `${r.code} anulado.`
        : `${r.code} anulado. Se devolvieron ${fmtPoints(r.pointsSpent)} puntos.`);
      load();
    } catch (err) {
      toast.error(errMsg(err, 'No se pudo anular.'));
    }
  }

  const columns: Column<Redemption>[] = [
    { key: 'code', header: 'Canje', priority: 1, render: r => (
      <div style={{ minWidth: 0 }}>
        <div className="rw-mono">{r.code}</div>
        <div className="rw-cell-sub text-truncate">{r.itemName}</div>
      </div>
    ) },
    { key: 'user', header: 'Usuario', priority: 1, render: r => r.userName
      ? <span>{r.userName}{r.userRole && <span className="rw-cell-sub"> · {USER_TYPE_LABEL[r.userRole] ?? r.userRole}</span>}</span>
      : '—' },
    { key: 'reward', header: 'Recompensa', priority: 2, render: r => (
      <div>
        <div>{describeReward(r)}</div>
        <div className="rw-cell-sub">{isLevelBenefit(r) ? 'Beneficio de nivel' : `${fmtPoints(r.pointsSpent)} pts`}</div>
      </div>
    ) },
    { key: 'status', header: 'Estado', priority: 1, render: r => (
      <span className="rw-badges">
        <StatusBadge tone={STATUS_TONE[r.status] ?? 'neutral'} size="sm">{STATUS_LABEL[r.status] ?? r.status}</StatusBadge>
        {isLevelBenefit(r) && <StatusBadge tone="info" size="sm" icon="fa-medal">Beneficio de nivel</StatusBadge>}
        {MANUAL_TYPES.has(r.rewardType) && r.status === 'active' && <StatusBadge tone="info" size="sm" icon="fa-hand-holding">Entrega manual</StatusBadge>}
      </span>
    ) },
    { key: 'created', header: 'Canjeado', priority: 2, render: r => fmtDate(r.createdAt, true) },
    { key: 'expires', header: 'Vence / nota', priority: 3, render: r => r.status === 'active'
      ? fmtDate(r.expiresAt)
      : <span className="rw-cell-sub">{r.usedNote ?? '—'}</span> },
  ];

  const actions = (r: Redemption): ActionItem[] => r.status !== 'active' ? [] : [
    isMoney(r)
      ? { label: 'Registrar pago', icon: 'fa-money-bill-transfer', onClick: () => setPaying(r) }
      : { label: 'Marcar entregado', icon: 'fa-check', onClick: () => deliver(r) },
    { label: 'Anular', icon: 'fa-ban', danger: true, onClick: () => cancel(r) },
  ];

  return (
    <SectionCard flush tourId="rw-red-list">
      <div className="p-3 pb-0">
        <FilterBar
          chips={STATUS_CHIPS}
          chip={status}
          onChipChange={v => { setStatus(v); setPage(1); }}
          activeCount={userType === 'all' ? 0 : 1}
          onClear={() => { setUserType('all'); setPage(1); }}
        >
          <div className="rw-chips" role="group" aria-label="Tipo de usuario">
            {TYPE_CHIPS.map(c => (
              <button key={c.value} type="button" className="bx-chip" aria-pressed={userType === c.value}
                      onClick={() => { setUserType(c.value); setPage(1); }}>
                {c.label}
              </button>
            ))}
          </div>
        </FilterBar>
      </div>

      {error ? <LoadError text={error} onRetry={load} /> : (
        <DataTable
          columns={columns}
          rows={items}
          rowKey={r => r.id}
          loading={loading}
          actions={actions}
          inlineActions
          maxHeight="none"
          mobileSubtitle={r => r.itemName}
          empty={status === 'active'
            ? { title: 'No hay canjes pendientes', text: 'Todo lo canjeado ya se entregó.', variant: 'done' }
            : { title: 'No hay canjes con este filtro' }}
        />
      )}

      <div className="px-3">
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
      </div>

      <PayoutDrawer redemption={paying} onClose={() => setPaying(null)} onDone={() => { setPaying(null); load(); }} />
    </SectionCard>
  );
}

/** Registrar el pago de un bono en dinero y cerrar el canje. */
function PayoutDrawer({ redemption: r, onClose, onDone }: {
  redemption: Redemption | null; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [payout, setPayout] = useState<PayoutDraft | null>(null);
  const [busy,   setBusy]   = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  useEffect(() => {
    if (!r) return;
    setError(null); setBusy(false);
    setPayout({ method: 'yape', operationNumber: '', amount: r.amountSoles ? String(r.amountSoles) : '', paidAt: nowLocalInput(), note: '' });
  }, [r]);

  async function submit() {
    if (!r || !payout) return;
    const invalid = validatePayout(payout);
    if (invalid) { setError(invalid); return; }
    const op0 = payout.operationNumber.trim();
    const ok = await confirm({
      title: '¿Registrar el pago del canje?',
      message: `Vas a pagar ${fmtSoles(Number(payout.amount))} a ${r.userName ?? 'el conductor'} por ${PAYOUT_METHOD[payout.method].label}${op0 ? ` (op. ${op0})` : ''}. El canje ${r.code} quedará entregado.`,
      confirmText: 'Registrar pago',
    });
    if (!ok) return;
    setBusy(true); setError(null);
    try {
      try {
        await payoutsApi.register({
          driverId: r.userId!, driverName: r.userName ?? null,
          amount: Number(payout.amount), method: payout.method,
          operationNumber: payout.operationNumber.trim() || null,
          paidAt: payout.paidAt, note: payout.note.trim() || null,
          sourceType: 'reward_redemption', sourceRef: r.code,
        });
      } catch (err) {
        // 409 = ese canje ya tenía su pago registrado: solo falta cerrarlo.
        if (!(err instanceof ApiError && err.status === 409)) throw err;
      }
      const op = payout.operationNumber.trim();
      const resumen = `Pagado por ${PAYOUT_METHOD[payout.method].label}${op ? ` · op ${op}` : ''} · ${fmtSoles(Number(payout.amount))}`;
      await rewardsAdminApi.markUsed(r.code, payout.note.trim() ? `${resumen} · ${payout.note.trim()}` : resumen);
      toast.success(`Pago registrado y ${r.code} entregado.`);
      onDone();
    } catch (err) {
      setError(errMsg(err, 'No se pudo completar la acción.'));
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={!!r}
      onClose={onClose}
      busy={busy}
      dirty="auto"
      title="Registrar pago del bono"
      description={r ? `${r.code} · ${r.itemName}` : undefined}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className="btn btn-bugie" onClick={submit} disabled={busy}>
            {busy && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}Registrar pago
          </button>
        </>
      }
    >
      {r && payout && (
        <div className="rw-stack">
          <p className="small mb-0">
            Registra el pago hecho a <strong>{r.userName ?? 'el conductor'}</strong>. Queda en el reporte de pagos y el bono se marca como entregado.
          </p>
          <PayoutFields value={payout} onChange={setPayout} />
          {error && <div className="alert alert-danger small mb-0" role="alert">{error}</div>}
        </div>
      )}
    </Drawer>
  );
}
