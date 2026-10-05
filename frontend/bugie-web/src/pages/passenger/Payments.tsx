import { useEffect, useMemo, useState } from 'react';
import { API, apiFetch, ApiError } from '../../state/api';
import {
  CountUp, EmptyState, Notice, Page, PageLoading, Pagination, SectionCard, StatCard, StatGrid, StatusBadge, Tone, useClientPage,
} from '../../components/ui';
import { fmtDateTime, fmtTime, money, payMethod } from '../../components/tripFormat';

interface Payment {
  id: string; tripId: string; amount: number;
  method: string; status: string; reference: string | null;
  createdAt: string; paidAt: string | null;
}

const STATUS_CFG: Record<string, { label: string; tone: Tone; icon: string }> = {
  pending:   { label: 'Pendiente',   tone: 'warn', icon: 'fa-clock'        },
  completed: { label: 'Completado',  tone: 'ok',   icon: 'fa-circle-check' },
  refunded:  { label: 'Reembolsado', tone: 'info', icon: 'fa-rotate-left'  },
  failed:    { label: 'Fallido',     tone: 'bad',  icon: 'fa-circle-xmark' },
};

type Filter = 'all' | 'completed' | 'pending' | 'other';
const PAGE_SIZE = 10;

export default function PassengerPayments() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [filter,   setFilter]   = useState<Filter>('all');

  useEffect(() => {
    apiFetch<Payment[]>(`${API.payments}/payments/my-payments`)
      .then(data => setPayments(data ?? []))
      .catch(err => setError(err instanceof ApiError ? err.message : 'No se pudo cargar el historial de pagos.'))
      .finally(() => setLoading(false));
  }, []);

  const completed    = payments.filter(p => p.status === 'completed');
  const totalGastado = completed.reduce((s, p) => s + p.amount, 0);
  const pendientes   = payments.filter(p => p.status === 'pending').length;

  const filtered = useMemo(() => payments.filter(p =>
    filter === 'all' ? true
      : filter === 'other' ? p.status !== 'completed' && p.status !== 'pending'
      : p.status === filter), [payments, filter]);
  const { page, setPage, items } = useClientPage(filtered, PAGE_SIZE, filter);

  if (loading) return <PageLoading />;

  const chips: { key: Filter; label: string; count: number }[] = [
    { key: 'all',       label: 'Todos',       count: payments.length },
    { key: 'completed', label: 'Completados', count: completed.length },
    { key: 'pending',   label: 'Pendientes',  count: pendientes },
    { key: 'other',     label: 'Otros',       count: payments.length - completed.length - pendientes },
  ];

  return (
    <Page title="Mis pagos" subtitle="Lo que pagaste en cada viaje y su estado." icon="fa-credit-card">
      {error && <Notice tone="bad">{error}</Notice>}

      <StatGrid min={170}>
        <StatCard label="Total gastado" value={<CountUp value={totalGastado} format={money} decimals={2} />} icon="fa-wallet" />
        <StatCard label="Viajes pagados" value={<CountUp value={completed.length} />} icon="fa-circle-check" tone="ok" />
        <StatCard label="Pendientes" value={<CountUp value={pendientes} />} icon="fa-clock" tone={pendientes > 0 ? 'warn' : 'neutral'} />
      </StatGrid>

      <SectionCard
        title="Historial"
        icon="fa-receipt"
        description="Los pagos se registran solos cuando completas un viaje."
        flush
      >
        {payments.length === 0 ? (
          <EmptyState
            icon="fa-credit-card"
            title="Sin pagos aún"
            text="Los pagos se registran automáticamente cuando completas un viaje."
          />
        ) : (
          <>
            <div className="px-3 pt-3">
              <div className="bx-chips" role="group" aria-label="Filtrar pagos">
                {chips.filter(c => c.key === 'all' || c.count > 0).map(c => (
                  <button key={c.key} type="button" className="bx-chip" aria-pressed={filter === c.key} onClick={() => setFilter(c.key)}>
                    {c.label} <span className="count">{c.count}</span>
                  </button>
                ))}
              </div>
            </div>
            {filtered.length === 0 ? (
              <EmptyState compact title="No hay pagos con este filtro" />
            ) : (
              <ul className="bx-list mt-2">
                {items.map(p => {
                  const s   = STATUS_CFG[p.status] ?? { label: p.status, tone: 'neutral' as Tone, icon: 'fa-circle' };
                  const pay = payMethod(p.method);
                  return (
                    <li key={p.id} className="bx-list-item">
                      <span className={`bx-list-icon bx-tone-${s.tone}`} aria-hidden="true">
                        <i className={`fa-solid ${pay.icon}`} />
                      </span>
                      <span className="bx-list-text">
                        <span className="bx-list-title">
                          {pay.label}
                          <StatusBadge tone={s.tone} icon={s.icon} size="sm">{s.label}</StatusBadge>
                        </span>
                        <span className="bx-list-sub d-block">
                          {fmtDateTime(p.createdAt)}
                          {p.reference && <> · Ref: <strong>{p.reference}</strong></>}
                        </span>
                      </span>
                      <span className="bx-list-end d-block">
                        <span className="amount d-block">{money(p.amount)}</span>
                        {p.paidAt && <span className="bx-list-sub d-block">Pagado {fmtTime(p.paidAt)}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="px-3">
              <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
            </div>
          </>
        )}
      </SectionCard>
    </Page>
  );
}
