import { useEffect, useRef, useState } from 'react';
import PayoutFields, { PayoutDraft, validatePayout } from '../../components/PayoutFields';
import { API, ApiError, apiFetch } from '../../state/api';
import { PAYOUT_METHOD, PayoutMethod, nowLocalInput, fmtSoles } from '../../state/payouts';
import {
  Column, DataTable, Drawer, EmptyState, FilterBar, Page, Pagination, SectionCard, Skeleton,
  StatCard, StatGrid, StatusBadge, Tabs, useConfirm, useDebouncedValue, useTabParam, useToast,
} from '../../components/ui';
import { DriverLink } from '../../components/EntityLinks';
import { TripLinkButton, useTripDetail } from '../../components/useTripDetail';
import './ops.scss';
import './cobros.scss';

// ─────────────────────────────────────────────────────────────
// Comisiones de conductores (Bugie.Payments.Api /payments/admin/wallets)
// El conductor cobra todo en mano; cada viaje genera una comision que
// le debe a Bugie. Aqui se ve quien debe y se registran sus pagos.
// ─────────────────────────────────────────────────────────────

interface WalletSummary {
  driverId:            string;
  driverName:          string | null;
  totalEarned:         number;
  totalCommission:     number;
  totalCommissionPaid: number;
  pendingDebt:         number;
  balance:             number;
  updatedAt:           string;
}

interface WalletsReport {
  items: WalletSummary[]; total: number; page: number; pageSize: number;
  totalDebt: number; driversWithDebt: number;
}

interface WalletMovement {
  id: number; type: 'comision' | 'pago_comision'; amount: number; balanceAfter: number;
  tripId: string | null; tripAmount: number | null; method: string | null;
  operationNumber: string | null; note: string | null; paidAt: string | null;
  adminName: string | null; createdAt: string;
}

interface DriverWallet {
  summary: WalletSummary; currentFeePercent: number;
  movements: WalletMovement[]; total: number; page: number; pageSize: number;
}

interface CommissionPayment {
  id: number; driverId: string; driverName: string | null; amount: number; balanceAfter: number;
  method: string | null; operationNumber: string | null; note: string | null;
  paidAt: string | null; adminName: string | null; createdAt: string;
}

interface CommissionPaymentsReport {
  items: CommissionPayment[]; total: number; page: number; pageSize: number; totalAmount: number;
}

const base = () => `${API.payments}/payments/admin/wallets`;
const PAGE_SIZE = 25;
const MOVES_PAGE_SIZE = 15;

const fmtFecha = (s: string) =>
  new Date(s).toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const methodLabel = (m: string | null) => (m ? PAYOUT_METHOD[m as PayoutMethod]?.label ?? m : '');

/// Saldo de la billetera con el mismo signo en todo el panel: negativo = el
/// conductor le debe a Bugie; positivo = tiene saldo a favor.
function BalanceText({ balance, prefix }: { balance: number; prefix?: string }) {
  if (balance < -0.004) return <span className="ops-muted ops-nowrap">{prefix}Debe {fmtSoles(-balance)}</span>;
  if (balance > 0.004)  return <span className="ops-muted ops-nowrap">{prefix}A favor {fmtSoles(balance)}</span>;
  return <span className="ops-muted ops-nowrap">{prefix}Al día</span>;
}

/// Comisiones que los conductores le deben a Bugie y los pagos recibidos.
export default function DriverCommissions() {
  const [tab] = useTabParam(['deudas', 'pagos']);
  const [selected,  setSelected]  = useState<WalletSummary | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <Page
      title="Comisiones"
      subtitle="Lo que cada conductor le debe a Bugie por sus viajes y los pagos de comisión recibidos."
      helpKey="commissions"
    >
      <div data-tour="commissions-tabs">
        <Tabs items={[
          { value: 'deudas', label: 'Conductores',     icon: 'fa-scale-unbalanced' },
          { value: 'pagos',  label: 'Pagos recibidos', icon: 'fa-hand-holding-dollar' },
        ]} />
      </div>

      {/* reloadKey vuelve a pedir los datos sin desmontar: se conservan búsqueda, filtro y página. */}
      {tab === 'deudas'
        ? <WalletsList reloadKey={reloadKey} onSelect={setSelected} />
        : <CommissionPaymentsList reloadKey={reloadKey} />}

      <WalletDrawer
        driver={selected}
        onClose={() => setSelected(null)}
        onChanged={() => setReloadKey(k => k + 1)}
      />
    </Page>
  );
}

// ── Listado de billeteras ─────────────────────────────────────
function WalletsList({ onSelect, reloadKey }: { onSelect: (w: WalletSummary) => void; reloadKey: number }) {
  const [search,   setSearch]   = useState('');
  const q = useDebouncedValue(search.trim(), 350);
  const [onlyDebt, setOnlyDebt] = useState(true);
  const [page,     setPage]     = useState(1);
  const [data,     setData]     = useState<WalletsReport | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  // Cambiar un filtro vuelve a la página 1 (sin pedir dos veces).
  const filterKey = `${q}|${onlyDebt}`;
  const lastKey = useRef(filterKey);
  const reqId = useRef(0);

  useEffect(() => {
    if (lastKey.current !== filterKey) {
      lastKey.current = filterKey;
      if (page !== 1) { setPage(1); return; }
    }
    const id = ++reqId.current;
    setLoading(true); setError(null);
    const qs = new URLSearchParams({ onlyDebt: String(onlyDebt), page: String(page), pageSize: String(PAGE_SIZE) });
    if (q) qs.set('search', q);
    apiFetch<WalletsReport>(`${base()}?${qs}`)
      .then(d => { if (id === reqId.current) setData(d); })
      .catch(err => { if (id === reqId.current) setError(err instanceof ApiError ? err.message : 'No se pudieron cargar las comisiones.'); })
      .finally(() => { if (id === reqId.current) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, page, reloadKey]);

  const columns: Column<WalletSummary>[] = [
    { key: 'driver', header: 'Conductor', priority: 1, width: '28%', render: w => <span className="fw-semibold"><DriverLink userId={w.driverId}>{w.driverName ?? 'Conductor'}</DriverLink></span> },
    { key: 'commission', header: 'Comisión generada', priority: 2, align: 'right', render: w => <span className="ops-amount">{fmtSoles(w.totalCommission)}</span> },
    { key: 'paid', header: 'Comisión pagada', priority: 2, align: 'right', render: w => <span className="ops-amount ok">{fmtSoles(w.totalCommissionPaid)}</span> },
    { key: 'earned', header: 'Ganancia neta', priority: 3, align: 'right', render: w => <span className="ops-amount">{fmtSoles(w.totalEarned)}</span> },
    {
      key: 'debt', header: 'Deuda', priority: 1, align: 'right',
      render: w => w.pendingDebt > 0
        ? <span className="ops-amount bad">{fmtSoles(w.pendingDebt)}</span>
        : <StatusBadge tone="ok" icon="fa-check" size="sm">Al día</StatusBadge>,
    },
  ];

  return (
    <>
      <StatGrid min={180} tourId="commissions-stats">
        <StatCard label="Deuda total por cobrar" value={data ? fmtSoles(data.totalDebt) : '—'} icon="fa-scale-unbalanced"
                  tone={data && data.totalDebt > 0 ? 'bad' : 'ok'} loading={!data && loading} />
        <StatCard label="Conductores con deuda" value={data?.driversWithDebt ?? '—'} icon="fa-user-clock"
                  tone={data && data.driversWithDebt > 0 ? 'warn' : 'ok'} loading={!data && loading} />
      </StatGrid>

      <SectionCard flush tourId="commissions-list">
        <div className="p-3">
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Nombre del conductor"
            chips={[{ value: 'debt', label: 'Solo con deuda' }, { value: 'all', label: 'Todos' }]}
            chip={onlyDebt ? 'debt' : 'all'}
            onChipChange={v => setOnlyDebt(v === 'debt')}
          />
        </div>

        {error && <div className="alert alert-danger small mx-3">{error}</div>}

        <DataTable
          columns={columns}
          rows={data?.items ?? []}
          rowKey={w => w.driverId}
          loading={loading}
          onRowClick={onSelect}
          caption="Comisiones por conductor"
          mobileSubtitle={w => <>Comisión {fmtSoles(w.totalCommission)} · pagado {fmtSoles(w.totalCommissionPaid)}</>}
          actions={w => [{ label: 'Ver movimientos y registrar pago', icon: 'fa-receipt', onClick: () => onSelect(w) }]}
          empty={onlyDebt
            ? { title: 'Nadie debe comisión', text: 'Todos los conductores están al día.', variant: 'done' }
            : { title: 'Sin resultados', text: 'No hay billeteras con este filtro.' }}
        />
        <div className="px-3">
          <Pagination page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPageChange={setPage} />
        </div>
      </SectionCard>
    </>
  );
}

// ── Detalle de un conductor (un solo Drawer con pestañas) ─────
type DrawerTab = 'movimientos' | 'pago';

const newDraft = (debt: number): PayoutDraft => ({
  method: 'yape', operationNumber: '', amount: debt > 0 ? debt.toFixed(2) : '', paidAt: nowLocalInput(), note: '',
});

/** Valida el pago de comisión: monto > 0 y no mayor a la deuda actual (se permite pago parcial). */
function validateCommission(d: PayoutDraft, debt: number): string | null {
  const amount = Number(d.amount);
  if (!Number.isFinite(amount) || amount <= 0) return 'El monto debe ser mayor a 0.';
  if (amount > debt + 0.001) return `El monto no puede ser mayor a la deuda actual (${fmtSoles(debt)}). Si pagó una parte, escribe solo esa parte.`;
  return validatePayout(d);
}

function WalletDrawer({ driver, onClose, onChanged }: { driver: WalletSummary | null; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const trip = useTripDetail();
  const [tab,    setTab]    = useState<DrawerTab>('movimientos');
  const [page,   setPage]   = useState(1);
  const [data,   setData]   = useState<DriverWallet | null>(null);
  const [error,  setError]  = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [draft,  setDraft]  = useState<PayoutDraft>(() => newDraft(0));
  const [busy,   setBusy]   = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const driverId = driver?.driverId;
  // Se conserva el último conductor para que el Drawer no quede vacío mientras se cierra.
  const lastDriver = useRef<WalletSummary | null>(null);
  if (driver) lastDriver.current = driver;
  const shown = driver ?? lastDriver.current;

  // Nuevo conductor: empezar de cero.
  useEffect(() => {
    setTab('movimientos'); setPage(1); setData(null); setFormError(null); setBusy(false);
    setDraft(newDraft(driver?.pendingDebt ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverId]);

  useEffect(() => {
    if (!driverId) return;
    let cancelled = false;
    setError(null);
    apiFetch<DriverWallet>(`${base()}/${driverId}?page=${page}&pageSize=${MOVES_PAGE_SIZE}`)
      .then(d => { if (!cancelled) setData(d); })
      .catch(err => { if (!cancelled) setError(err instanceof ApiError ? err.message : 'No se pudo cargar la billetera.'); });
    return () => { cancelled = true; };
  }, [driverId, page, reload]);

  const s = data?.summary ?? shown;
  const debt = s?.pendingDebt ?? 0;

  function openPayment() {
    setDraft(newDraft(debt)); setFormError(null); setTab('pago');
  }

  async function save() {
    if (!driverId) return;
    setFormError(null);
    const invalid = validateCommission(draft, debt);
    if (invalid) { setFormError(invalid); return; }
    const amount = Number(draft.amount);
    const rest = debt - amount;
    const ok = await confirm({
      title: '¿Registrar el pago de comisión?',
      message: `Vas a registrar que ${s?.driverName ?? 'el conductor'} pagó ${fmtSoles(amount)} de comisión por ${methodLabel(draft.method) || 'el método elegido'}`
        + `${draft.operationNumber.trim() ? ` (op. ${draft.operationNumber.trim()})` : ''}. `
        + (rest < 0.005 ? 'Con este pago queda al día.' : `Seguirá debiendo ${fmtSoles(rest)}.`),
      confirmText: 'Registrar pago',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await apiFetch(`${base()}/commission-payments`, {
        method: 'POST',
        body: JSON.stringify({
          driverId,
          amount: Number(draft.amount),
          method: draft.method,
          operationNumber: draft.operationNumber.trim() || null,
          paidAt: draft.paidAt,
          note: draft.note.trim() || null,
        }),
      });
      const parcial = Number(draft.amount) < debt - 0.001;
      toast.success(parcial ? 'Pago parcial de comisión registrado.' : 'Pago de comisión registrado. El conductor quedó al día.');
      setTab('movimientos'); setPage(1); setReload(r => r + 1); onChanged();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'No se pudo registrar el pago.');
    } finally {
      setBusy(false);
    }
  }

  const amountNum = Number(draft.amount);
  const remaining = Number.isFinite(amountNum) && amountNum > 0 && amountNum <= debt ? debt - amountNum : null;

  return (
    <Drawer
      open={!!driver}
      onClose={onClose}
      busy={busy}
      dirty={tab === 'pago' ? 'auto' : false}

      size="lg"
      title={s?.driverName ?? shown?.driverName ?? 'Conductor'}
      description={data ? `Comisión vigente: ${data.currentFeePercent}%` : 'Movimientos de comisión del conductor.'}
      footer={s && (tab === 'movimientos' ? (
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cerrar</button>
          <button type="button" className="btn btn-bugie" onClick={openPayment} disabled={debt <= 0}
                  title={debt <= 0 ? 'El conductor no tiene deuda pendiente' : undefined}>
            <i className="fa-solid fa-plus me-1" aria-hidden="true" />Registrar pago
          </button>
        </>
      ) : (
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={() => setTab('movimientos')} disabled={busy}>Cancelar</button>
          <button type="button" className="btn btn-bugie" onClick={save} disabled={busy || debt <= 0}>
            {busy && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}Registrar pago
          </button>
        </>
      ))}
    >
      {s && (
        <div className="d-grid gap-3">
          <div className={`cb-debt ${debt > 0 ? 'has-debt' : ''}`} role="status">
            <div>
              <div className="label">Deuda actual</div>
              <div className={`value ${debt > 0 ? 'text-danger' : ''}`}>{fmtSoles(debt)}</div>
            </div>
            {debt > 0
              ? <span className="ops-muted">Comisión generada {fmtSoles(s.totalCommission)} · pagada {fmtSoles(s.totalCommissionPaid)}</span>
              : <StatusBadge tone="ok" icon="fa-check">Al día</StatusBadge>}
          </div>

          <Tabs
            value={tab}
            onChange={v => (v === 'pago' ? openPayment() : setTab('movimientos'))}
            ariaLabel="Detalle de comisiones"
            items={[
              { value: 'movimientos', label: 'Movimientos', icon: 'fa-list', count: data?.total },
              { value: 'pago', label: 'Registrar pago', icon: 'fa-hand-holding-dollar', disabled: debt <= 0 },
            ]}
          />

          {tab === 'movimientos' ? (
            <>
              <StatGrid min={140}>
                <StatCard label="Comisión generada" value={fmtSoles(s.totalCommission)}     icon="fa-receipt"      tone="neutral" />
                <StatCard label="Comisión pagada"   value={fmtSoles(s.totalCommissionPaid)} icon="fa-circle-check" tone="ok" />
                <StatCard label="Ganancia neta"     value={fmtSoles(s.totalEarned)}         icon="fa-wallet"       tone="info" />
              </StatGrid>

              {error && <div className="alert alert-danger small mb-0">{error}</div>}

              <SectionCard flush>
                {!data && !error ? (
                  <div className="p-3 d-grid gap-2"><Skeleton height={44} radius={10} count={3} /></div>
                ) : data && data.movements.length === 0 ? (
                  <EmptyState compact title="Sin movimientos todavía" text="Cada viaje completado genera una comisión aquí." />
                ) : data && (
                  <>
                    <div className="bx-inbox">
                      {data.movements.map(m => {
                        const comision = m.type === 'comision';
                        return (
                          <div key={m.id} className="bx-inbox-item">
                            <span className={`bx-stat-icon bx-tone-${comision ? 'bad' : 'ok'}`} aria-hidden="true">
                              <i className={`fa-solid ${comision ? 'fa-receipt' : 'fa-circle-check'}`} />
                            </span>
                            <span className="text">
                              <span className="title d-block">{comision ? 'Comisión de viaje' : 'Pago de comisión'}</span>
                              <span className="sub d-block">
                                {comision && m.tripAmount != null && <>Viaje {fmtSoles(m.tripAmount)} · </>}
                                {comision && m.tripId && <><TripLinkButton tripId={m.tripId} opener={trip}>Ver viaje</TripLinkButton> · </>}
                                {!comision && <>{methodLabel(m.method)}{m.operationNumber && <> · op <span className="fw-semibold">{m.operationNumber}</span></>} · </>}
                                {fmtFecha(m.paidAt ?? m.createdAt)}
                                {m.adminName && <> · por {m.adminName}</>}
                              </span>
                              {m.note && <span className="sub d-block">Nota: {m.note}</span>}
                            </span>
                            <span className="text-end">
                              <span className={`ops-amount d-block ${comision ? 'bad' : 'ok'}`}>{comision ? '−' : '+'} {fmtSoles(m.amount)}</span>
                              <span className="d-block"><BalanceText balance={m.balanceAfter} prefix="Luego: " /></span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="px-3">
                      <Pagination page={page} pageSize={MOVES_PAGE_SIZE} total={data.total} onPageChange={setPage} />
                    </div>
                  </>
                )}
              </SectionCard>
            </>
          ) : (
            <form className="d-grid gap-3" onSubmit={e => { e.preventDefault(); save(); }}>
              <div className="ops-note">
                <i className="fa-solid fa-circle-info me-1" aria-hidden="true" />
                El monto viene con la deuda completa. Si el conductor pagó solo una parte, cámbialo: se permite pago parcial hasta {fmtSoles(debt)}.
              </div>
              <PayoutFields value={draft} onChange={setDraft} amountMax={debt} />
              {remaining !== null && (
                <p className="ops-muted mb-0">
                  {remaining < 0.005 ? 'Con este pago el conductor queda al día.' : `Después de este pago seguirá debiendo ${fmtSoles(remaining)}.`}
                </p>
              )}
              {formError && <div className="alert alert-danger small mb-0" role="alert">{formError}</div>}
              <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
            </form>
          )}
        </div>
      )}
      {trip.modal}
    </Drawer>
  );
}

// ── Pagos de comisión recibidos (todos los conductores) ───────
function CommissionPaymentsList({ reloadKey }: { reloadKey: number }) {
  const [page,    setPage]    = useState(1);
  const [data,    setData]    = useState<CommissionPaymentsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    setLoading(true); setError(null);
    apiFetch<CommissionPaymentsReport>(`${base()}/commission-payments?page=${page}&pageSize=${PAGE_SIZE}`)
      .then(setData)
      .catch(err => setError(err instanceof ApiError ? err.message : 'No se pudieron cargar los pagos.'))
      .finally(() => setLoading(false));
  }, [page, reloadKey]);

  const columns: Column<CommissionPayment>[] = [
    { key: 'driver', header: 'Conductor', priority: 1, width: '26%', render: p => <span className="fw-semibold"><DriverLink userId={p.driverId}>{p.driverName ?? 'Conductor'}</DriverLink></span> },
    {
      key: 'method', header: 'Método', priority: 2,
      render: p => (
        <div className="small">
          <div className="ops-nowrap"><i className={`fa-solid ${PAYOUT_METHOD[p.method as PayoutMethod]?.icon ?? 'fa-coins'} me-1 bugie-muted`} aria-hidden="true" />{methodLabel(p.method) || '—'}</div>
          {p.operationNumber && <div className="ops-muted">op <span className="fw-semibold">{p.operationNumber}</span></div>}
        </div>
      ),
    },
    {
      key: 'date', header: 'Fecha', priority: 1,
      render: p => (
        <div className="small">
          <div className="ops-nowrap">{fmtFecha(p.paidAt ?? p.createdAt)}</div>
          {p.adminName && <div className="ops-muted">por {p.adminName}</div>}
        </div>
      ),
    },
    { key: 'after', header: 'Saldo tras el pago', priority: 2, align: 'right', render: p => <BalanceText balance={p.balanceAfter} /> },
    { key: 'note', header: 'Nota', priority: 3, render: p => <span className="ops-muted">{p.note || '—'}</span> },
    { key: 'amount', header: 'Monto', priority: 1, align: 'right', render: p => <span className="ops-amount ok">{fmtSoles(p.amount)}</span> },
  ];

  return (
    <>
      <StatGrid min={180} tourId="commissions-paid-stats">
        <StatCard label="Total cobrado" value={data ? fmtSoles(data.totalAmount) : '—'} icon="fa-hand-holding-dollar" tone="ok"
                  loading={!data && loading} hint={data ? `${data.total} pago${data.total === 1 ? '' : 's'}` : undefined} />
      </StatGrid>

      <SectionCard flush tourId="commissions-paid-list">
        {error && <div className="alert alert-danger small m-3">{error}</div>}
        <DataTable
          columns={columns}
          rows={data?.items ?? []}
          rowKey={p => String(p.id)}
          loading={loading}
          caption="Pagos de comisión recibidos"
          mobileSubtitle={p => methodLabel(p.method)}
          empty={{ title: 'Aún no hay pagos de comisión', text: 'Cuando registres el pago de un conductor aparecerá aquí.' }}
        />
        <div className="px-3">
          <Pagination page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPageChange={setPage} />
        </div>
      </SectionCard>
    </>
  );
}
