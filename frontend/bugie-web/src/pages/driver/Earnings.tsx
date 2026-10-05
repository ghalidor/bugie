import { useEffect, useState } from 'react';
import { API, apiFetch } from '../../state/api';
import {
  CountUp, EmptyState, Notice, Page, PageLoading, Pagination, SectionCard, Skeleton, StatCard, StatGrid, useClientPage,
} from '../../components/ui';
import { money } from '../../components/tripFormat';

// Pago que Bugie le hizo al conductor (bono canjeado, premio, pago manual)
interface Payout {
  id: string; amount: number; method: string;
  operationNumber: string | null; paidAt: string | null;
  note: string | null; sourceType: string; sourceRef: string | null;
}
interface PayoutReport { items: Payout[]; total: number; totalAmount: number; }

const PAYOUT_METHOD: Record<string, { label: string; icon: string }> = {
  yape:          { label: 'Yape',          icon: 'fa-mobile-screen' },
  plin:          { label: 'Plin',          icon: 'fa-mobile-screen' },
  transferencia: { label: 'Transferencia', icon: 'fa-building-columns' },
  efectivo:      { label: 'Efectivo',      icon: 'fa-money-bill-wave' },
};
const PAYOUT_SOURCE: Record<string, string> = {
  reward_redemption: 'Bono canjeado con puntos',
  raffle_prize:      'Premio de sorteo',
  manual:            'Pago de Bugie',
};

// Billetera: el conductor cobra todo en mano y le debe la comision a Bugie
interface WalletMovement {
  id: number; type: 'comision' | 'pago_comision'; amount: number; balanceAfter: number;
  tripAmount: number | null; method: string | null; operationNumber: string | null;
  note: string | null; paidAt: string | null; createdAt: string;
}
interface Wallet {
  summary: {
    totalEarned: number; totalCommission: number; totalCommissionPaid: number;
    pendingDebt: number; balance: number;
  };
  currentFeePercent: number;
  movements: WalletMovement[];
  total: number; page: number; pageSize: number;
}
const WALLET_PAGE_SIZE = 20;
const PAYOUT_PAGE_SIZE = 8;
const fmtFecha = (s: string) =>
  new Date(s).toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

interface Earnings {
  driverId:           string;
  totalEarnings:      number;
  totalTrips:         number;
  earningsThisMonth:  number;
}

export default function DriverEarnings() {
  const [data,    setData]    = useState<Earnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [payouts, setPayouts] = useState<PayoutReport | null>(null);
  const [wallet,  setWallet]  = useState<Wallet | null>(null);
  const [walletError, setWalletError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  function loadMoreMovements() {
    if (!wallet) return;
    setLoadingMore(true);
    apiFetch<Wallet>(`${API.payments}/payments/wallet/me?page=${wallet.page + 1}&pageSize=${WALLET_PAGE_SIZE}`)
      .then(next => setWallet({ ...next, movements: [...wallet.movements, ...next.movements] }))
      .catch(() => setWalletError(true))
      .finally(() => setLoadingMore(false));
  }

  useEffect(() => {
    // Billetera (si falla no bloquea la pantalla)
    apiFetch<Wallet>(`${API.payments}/payments/wallet/me?page=1&pageSize=${WALLET_PAGE_SIZE}`)
      .then(setWallet)
      .catch(() => setWalletError(true));
    apiFetch<Earnings>(`${API.payments}/payments/earnings`)
      .then(setData)
      .catch(() => setError('No se pudo cargar las ganancias.'))
      .finally(() => setLoading(false));
    // Pagos que Bugie le hizo (si falla no bloquea la pantalla)
    apiFetch<PayoutReport>(`${API.payments}/payments/payouts/me`)
      .then(setPayouts)
      .catch(() => setPayouts({ items: [], total: 0, totalAmount: 0 }));
  }, []);

  const payoutPage = useClientPage(payouts?.items ?? [], PAYOUT_PAGE_SIZE);

  if (loading) return <PageLoading />;

  const debt = wallet?.summary.pendingDebt ?? 0;

  return (
    <Page title="Ganancias" subtitle="Tus ingresos, la comisión de Bugie y los pagos que recibiste." icon="fa-wallet">
      {error && <Notice tone="bad">{error}</Notice>}

      <StatGrid min={170}>
        <StatCard label="Total ganado" value={<CountUp value={data?.totalEarnings} format={money} decimals={2} />} icon="fa-sack-dollar" />
        <StatCard label="Este mes" value={<CountUp value={data?.earningsThisMonth} format={money} decimals={2} />} icon="fa-calendar" tone="info" />
        <StatCard label="Viajes completados" value={<CountUp value={data?.totalTrips ?? 0} />} icon="fa-route" tone="ok" />
        <StatCard
          label={debt > 0 ? 'Comisión por pagar' : 'Comisión al día'}
          value={wallet ? <CountUp value={debt} format={money} decimals={2} /> : '—'}
          icon={debt > 0 ? 'fa-receipt' : 'fa-circle-check'}
          tone={!wallet ? 'neutral' : debt > 0 ? 'bad' : 'ok'}
          loading={!wallet && !walletError}
        />
      </StatGrid>

      {/* Mi billetera: comisión que le debe a Bugie */}
      <SectionCard
        title="Mi billetera"
        icon="fa-wallet"
        description={wallet
          ? `Cobras todo en mano. Por cada viaje Bugie cobra una comisión (${wallet.currentFeePercent}%) que le pagas por Yape, Plin, transferencia o efectivo.`
          : 'Comisión de Bugie y tus pagos de comisión.'}
        flush
      >
        {!wallet ? (
          walletError
            ? <EmptyState compact variant="error" title="No se pudo cargar tu billetera" />
            : <div className="p-3"><Skeleton height={48} count={3} /></div>
        ) : (
          <>
            <div className="p-3">
              <div className="bx-mini-stats">
                <div className="bx-box">
                  <div className="l">{debt > 0 ? 'Comisión pendiente' : 'Estás al día con Bugie'}</div>
                  <div className={`v ${debt > 0 ? 'bx-text-bad' : 'bx-text-ok'}`}><CountUp value={debt} format={money} decimals={2} /></div>
                </div>
                <div className="bx-box"><div className="l">Ganancia neta</div><div className="v"><CountUp value={wallet.summary.totalEarned} format={money} decimals={2} /></div></div>
                <div className="bx-box"><div className="l">Comisión generada</div><div className="v"><CountUp value={wallet.summary.totalCommission} format={money} decimals={2} /></div></div>
                <div className="bx-box"><div className="l">Comisión pagada</div><div className="v"><CountUp value={wallet.summary.totalCommissionPaid} format={money} decimals={2} /></div></div>
              </div>
            </div>

            {wallet.movements.length === 0 ? (
              <EmptyState compact icon="fa-receipt" title="Aún no tienes movimientos" />
            ) : (
              <ul className="bx-list" style={{ borderTop: '1px solid var(--bugie-border)' }}>
                {wallet.movements.map(m => {
                  const comision = m.type === 'comision';
                  return (
                    <li key={m.id} className="bx-list-item">
                      <span className={`bx-list-icon bx-tone-${comision ? 'bad' : 'ok'}`} aria-hidden="true">
                        <i className={`fa-solid ${comision ? 'fa-receipt' : 'fa-circle-check'}`} />
                      </span>
                      <span className="bx-list-text">
                        <span className="bx-list-title">{comision ? 'Comisión de viaje' : 'Pago de comisión'}</span>
                        <span className="bx-list-sub d-block">
                          {comision && m.tripAmount != null && <>Viaje S/ {m.tripAmount.toFixed(2)} · </>}
                          {!comision && m.method && <>{PAYOUT_METHOD[m.method]?.label ?? m.method} · </>}
                          {m.operationNumber && <>op {m.operationNumber} · </>}
                          {fmtFecha(m.paidAt ?? m.createdAt)}
                        </span>
                        {m.note && <span className="bx-list-sub d-block">{m.note}</span>}
                      </span>
                      <span className={`bx-list-end amount ${comision ? 'bx-text-bad' : 'bx-text-ok'}`}>
                        {comision ? '−' : '+'} S/ {m.amount.toFixed(2)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {wallet.page * wallet.pageSize < wallet.total && (
              <div className="text-center p-3" style={{ borderTop: '1px solid var(--bugie-border)' }}>
                <button type="button" className="btn btn-sm btn-bugie-outline" onClick={loadMoreMovements} disabled={loadingMore}>
                  {loadingMore
                    ? <><span className="spinner-border spinner-border-sm" aria-hidden="true" />Cargando…</>
                    : `Ver más movimientos (${wallet.movements.length} de ${wallet.total})`}
                </button>
              </div>
            )}
          </>
        )}
      </SectionCard>

      <div className="bx-split">
        {/* Pagos recibidos de Bugie */}
        <SectionCard
          title="Pagos recibidos de Bugie"
          icon="fa-money-bill-transfer"
          actions={payouts && payouts.total > 0 && <span className="fw-bold">{money(payouts.totalAmount)}</span>}
          flush
        >
          {!payouts ? (
            <div className="p-3"><Skeleton height={48} count={2} /></div>
          ) : payouts.items.length === 0 ? (
            <EmptyState
              compact
              icon="fa-gift"
              title="Aún no recibiste pagos"
              text="Aquí verás los bonos que canjees con tus puntos y los premios de sorteos."
            />
          ) : (
            <>
              <ul className="bx-list">
                {payoutPage.items.map(p => {
                  const m = PAYOUT_METHOD[p.method] ?? { label: p.method, icon: 'fa-coins' };
                  return (
                    <li key={p.id} className="bx-list-item">
                      <span className="bx-list-icon bx-tone-ok" aria-hidden="true"><i className={`fa-solid ${m.icon}`} /></span>
                      <span className="bx-list-text">
                        <span className="bx-list-title">{PAYOUT_SOURCE[p.sourceType] ?? 'Pago'}</span>
                        <span className="bx-list-sub d-block">
                          {m.label}{p.operationNumber && <> · op {p.operationNumber}</>}
                          {p.paidAt && <> · {fmtFecha(p.paidAt)}</>}
                        </span>
                        {p.note && <span className="bx-list-sub d-block">{p.note}</span>}
                      </span>
                      <span className="bx-list-end amount">{money(p.amount)}</span>
                    </li>
                  );
                })}
              </ul>
              <div className="px-3">
                <Pagination page={payoutPage.page} pageSize={PAYOUT_PAGE_SIZE} total={payouts.items.length} onPageChange={payoutPage.setPage} />
              </div>
            </>
          )}
        </SectionCard>

        <SectionCard title="Métodos de cobro" icon="fa-hand-holding-dollar">
          <div className="bx-stack">
            <ul className="bx-tip-list">
              <li><i className="fa-solid fa-money-bill-wave" aria-hidden="true" /><div><div className="t">Efectivo</div><div className="d">Cobras directamente al pasajero.</div></div></li>
              <li><i className="fa-solid fa-mobile-screen" aria-hidden="true" /><div><div className="t">Yape / Plin</div><div className="d">Transferencia digital inmediata.</div></div></li>
            </ul>
            <Notice tone="info">
              Los bonos que canjeas con tus puntos y los premios de sorteos te los paga Bugie
              por Yape, Plin o transferencia. Los verás en «Pagos recibidos».
            </Notice>
          </div>
        </SectionCard>
      </div>
    </Page>
  );
}
