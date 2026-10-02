import { apiFetch, API, ApiError } from '../../state/api';
import { useEffect, useState } from 'react';
import PageHeader from '../../components/PageHeader';

interface Payment {
  id: string; tripId: string;
  passengerId: string; driverId: string;
  amount: number; platformFee: number; driverAmount: number;
  /** % de comision con el que se cobro este pago (config del sistema). */
  platformFeeRate?: number | null;
  passengerName?: string | null;
  driverName?: string | null;
  method: string; status: string; reference: string | null;
  createdAt: string; paidAt: string | null;
}

interface PaymentsPagedResponse {
  items: Payment[];
  page: number;
  pageSize: number;
  total: number;
}

interface PaymentsStatsResponse {
  totalAmount: number;
  totalFee: number;
  totalDriver: number;
  pendingCount: number;
  completedCount: number;
}

const METHOD: Record<string, { label: string; icon: string }> = {
  cash: { label: 'Efectivo', icon: 'fa-money-bill-wave' },
  yape: { label: 'Yape',     icon: 'fa-mobile-screen'   },
  plin: { label: 'Plin',     icon: 'fa-mobile-screen'   },
};

const STATUS_CFG: Record<string, { label: string; color: string; icon: string }> = {
  pending:   { label: 'Pendiente',    color: '#f59e0b', icon: 'fa-clock'        },
  completed: { label: 'Completado',   color: '#34d399', icon: 'fa-circle-check' },
  refunded:  { label: 'Reembolsado',  color: '#38bdf8', icon: 'fa-rotate-left'  },
  failed:    { label: 'Fallido',      color: '#f87171', icon: 'fa-circle-xmark' },
};

const PAGE_SIZE = 25;

export default function Payments() {
  const [payments,     setPayments]     = useState<Payment[]>([]);
  const [total,        setTotal]        = useState(0);
  const [page,         setPage]         = useState(1);
  const [stats,        setStats]        = useState<PaymentsStatsResponse>({
    totalAmount: 0, totalFee: 0, totalDriver: 0, pendingCount: 0, completedCount: 0,
  });
  const [loading,      setLoading]      = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [error,        setError]        = useState<string | null>(null);

  useEffect(() => { setPage(1); }, [statusFilter]);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, statusFilter]);
  // Stats globales — NO se filtran por statusFilter para que los totales
  // monetarios siempre muestren el panorama completo (recaudado total).
  useEffect(() => { loadStats(); }, []);

  async function load() {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const data = await apiFetch<PaymentsPagedResponse>(
        `${API.payments}/payments/paged?${params.toString()}`);
      setPayments(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar los pagos.');
    } finally { setLoading(false); }
  }

  async function loadStats() {
    try {
      // Stats siempre globales (sin filtro de status). Si en el futuro se quiere
      // que se filtren, se puede pasar statusFilter aquí.
      const data = await apiFetch<PaymentsStatsResponse>(
        `${API.payments}/payments/stats`);
      setStats(data ?? { totalAmount: 0, totalFee: 0, totalDriver: 0, pendingCount: 0, completedCount: 0 });
    } catch {}
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const fromIdx = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const toIdx   = Math.min(page * PAGE_SIZE, total);

  return (
    <>
      <PageHeader
        title="Pagos"
        subtitle="Conciliación y estado de todas las transacciones."
        icon="fa-solid fa-credit-card"
      />

      {error && <div className="alert alert-warning small mb-3"><i className="fa-solid fa-triangle-exclamation me-2" />{error}</div>}

      {/* KPIs calculados en BD (globales). */}
      <div className="row g-3 mb-4">
        {[
          { label: 'Total recaudado', value: `S/ ${stats.totalAmount.toFixed(2)}`,  color: '#34d399', icon: 'fa-wallet'       },
          { label: 'Comisión Bugie',  value: `S/ ${stats.totalFee.toFixed(2)}`,     color: '#818cf8', icon: 'fa-building'     },
          { label: 'A conductores',   value: `S/ ${stats.totalDriver.toFixed(2)}`,  color: '#38bdf8', icon: 'fa-car-side'     },
          { label: 'Pendientes',      value: String(stats.pendingCount),            color: '#f59e0b', icon: 'fa-clock'        },
        ].map(k => (
          <div className="col-6 col-xl-3" key={k.label}>
            <div className="bugie-card p-3">
              <div className="d-flex align-items-center gap-3">
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: k.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className={`fa-solid ${k.icon}`} style={{ color: k.color }} />
                </div>
                <div>
                  <div className="small bugie-muted">{k.label}</div>
                  <div className="fw-bold fs-5" style={{ color: k.color, lineHeight: 1.2 }}>{k.value}</div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
        {[
          { key: 'all',       label: 'Todos'        },
          { key: 'pending',   label: 'Pendientes'   },
          { key: 'completed', label: 'Completados'  },
          { key: 'refunded',  label: 'Reembolsados' },
        ].map(f => (
          <button key={f.key}
            className={`btn btn-sm rounded-pill ${statusFilter === f.key ? 'btn-bugie text-white' : 'btn-bugie-outline'}`}
            onClick={() => setStatusFilter(f.key)}>
            {f.label}
          </button>
        ))}
        <button className="btn btn-sm btn-bugie-outline rounded-pill ms-auto"
                onClick={() => { load(); loadStats(); }}>
          <i className="fa-solid fa-rotate-right me-1" />Actualizar
        </button>
      </div>

      {loading ? (
        <div className="d-flex justify-content-center py-5"><span className="spinner-border" /></div>
      ) : payments.length === 0 ? (
        <div className="bugie-card p-5 text-center">
          <div className="bugie-mini-icon mx-auto mb-3" style={{ width: 56, height: 56, fontSize: '1.5rem' }}>
            <i className="fa-solid fa-credit-card" />
          </div>
          <div className="fw-semibold mb-1">Sin pagos</div>
          <div className="small bugie-muted">No hay transacciones en esta categoría.</div>
        </div>
      ) : (
        <>
          <div className="d-flex flex-column gap-2">
            {payments.map(p => {
              const s   = STATUS_CFG[p.status] ?? { label: p.status, color: '#94a3b8', icon: 'fa-circle' };
              const pay = METHOD[p.method] ?? { label: p.method, icon: 'fa-credit-card' };
              const date = new Date(p.createdAt);

              return (
                <div key={p.id} className="bugie-card" style={{ overflow: 'hidden' }}>
                  <div style={{ height: 3, background: s.color }} />
                  <div className="p-3">
                    <div className="d-flex align-items-center gap-3">

                      <div style={{ width: 44, height: 44, borderRadius: '50%', background: s.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <i className={`fa-solid ${pay.icon}`} style={{ color: s.color }} />
                      </div>

                      <div className="flex-grow-1 min-w-0">
                        <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                          <span className="badge rounded-pill" style={{ background: s.color + '22', color: s.color, fontSize: '0.72rem' }}>
                            <i className={`fa-solid ${s.icon} me-1`} style={{ fontSize: '0.65rem' }} />
                            {s.label}
                          </span>
                          <span className="badge rounded-pill" style={{ background: '#33415522', color: 'var(--bugie-muted)', fontSize: '0.72rem' }}>
                            <i className={`fa-solid ${pay.icon} me-1`} style={{ fontSize: '0.65rem' }} />
                            {pay.label}
                          </span>
                          <span className="small bugie-muted">
                            {date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}
                            {' · '}
                            {date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        <div className="small mb-1">
                          <i className="fa-solid fa-user me-1 bugie-muted" />{p.passengerName ?? 'Pasajero'}
                          <i className="fa-solid fa-arrow-right mx-2 bugie-muted" style={{ fontSize: '0.7rem' }} />
                          <i className="fa-solid fa-car me-1 bugie-muted" />{p.driverName ?? 'Conductor'}
                        </div>
                        <div className="d-flex gap-3 flex-wrap" style={{ fontSize: '0.78rem' }}>
                          <span className="bugie-muted">
                            Comisión{p.platformFeeRate != null ? ` (${p.platformFeeRate}%)` : ''}: <span style={{ color: '#f87171' }}>S/ {(p.platformFee ?? 0).toFixed(2)}</span>
                          </span>
                          <span className="bugie-muted">
                            Conductor: <span style={{ color: '#34d399' }}>S/ {(p.driverAmount ?? 0).toFixed(2)}</span>
                          </span>
                          {p.reference && (
                            <span className="bugie-muted">
                              Ref: <span className="fw-semibold">{p.reference}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-end flex-shrink-0">
                        <div className="fw-bold fs-5">S/ {p.amount.toFixed(2)}</div>
                        {p.paidAt && (
                          <div className="small bugie-muted" style={{ fontSize: '0.72rem' }}>
                            Pagado {new Date(p.paidAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Paginación */}
          <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mt-3">
            <div className="small bugie-muted">
              Mostrando <strong>{fromIdx}–{toIdx}</strong> de <strong>{total.toLocaleString('es-PE')}</strong>
            </div>
            <div className="d-flex align-items-center gap-2">
              <button className="btn btn-sm btn-bugie-outline rounded-pill"
                onClick={() => setPage(1)} disabled={page === 1}>
                <i className="fa-solid fa-angles-left" />
              </button>
              <button className="btn btn-sm btn-bugie-outline rounded-pill"
                onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                <i className="fa-solid fa-chevron-left" />
              </button>
              <span className="small fw-semibold mx-2">
                Página {page} de {totalPages}
              </span>
              <button className="btn btn-sm btn-bugie-outline rounded-pill"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                <i className="fa-solid fa-chevron-right" />
              </button>
              <button className="btn btn-sm btn-bugie-outline rounded-pill"
                onClick={() => setPage(totalPages)} disabled={page >= totalPages}>
                <i className="fa-solid fa-angles-right" />
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
