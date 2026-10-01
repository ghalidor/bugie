import { useEffect, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import { API, apiFetch, ApiError } from '../../state/api';

interface Payment {
  id: string; tripId: string; amount: number;
  method: string; status: string; reference: string | null;
  createdAt: string; paidAt: string | null;
}

const METHOD: Record<string, { label: string; icon: string }> = {
  cash: { label: 'Efectivo', icon: 'fa-money-bill-wave' },
  yape: { label: 'Yape',     icon: 'fa-mobile-screen'   },
  plin: { label: 'Plin',     icon: 'fa-mobile-screen'   },
};

const STATUS_CFG: Record<string, { label: string; color: string; icon: string }> = {
  pending:   { label: 'Pendiente',   color: '#f59e0b', icon: 'fa-clock'        },
  completed: { label: 'Completado',  color: '#34d399', icon: 'fa-circle-check' },
  refunded:  { label: 'Reembolsado', color: '#38bdf8', icon: 'fa-rotate-left'  },
  failed:    { label: 'Fallido',     color: '#f87171', icon: 'fa-circle-xmark' },
};

export default function PassengerPayments() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Payment[]>(`${API.payments}/payments/my-payments`)
      .then(data => setPayments(data ?? []))
      .catch(err => setError(err instanceof ApiError ? err.message : 'No se pudo cargar el historial de pagos.'))
      .finally(() => setLoading(false));
  }, []);

  const completed   = payments.filter(p => p.status === 'completed');
  const totalGastado = completed.reduce((s, p) => s + p.amount, 0);
  const pendientes  = payments.filter(p => p.status === 'pending').length;

  if (loading) return (
    <div className="d-flex justify-content-center py-5">
      <span className="spinner-border" />
    </div>
  );

  return (
    <>
      <PageHeader title="Mis pagos" subtitle="Historial de transacciones y pagos." icon="fa-solid fa-credit-card" />
      {error && <div className="alert alert-danger small mb-3">{error}</div>}

      {/* KPIs */}
      <div className="row g-3 mb-4">
        {[
          { label: 'Total gastado',  value: `S/ ${totalGastado.toFixed(2)}`, color: '#818cf8', icon: 'fa-wallet'       },
          { label: 'Viajes pagados', value: String(completed.length),        color: '#34d399', icon: 'fa-circle-check' },
          { label: 'Pendientes',     value: String(pendientes),              color: '#f59e0b', icon: 'fa-clock'        },
        ].map(k => (
          <div className="col-4" key={k.label}>
            <div className="bugie-card p-3 text-center">
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: k.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
                <i className={`fa-solid ${k.icon}`} style={{ color: k.color }} />
              </div>
              <div className="fw-bold fs-5" style={{ color: k.color }}>{k.value}</div>
              <div className="small bugie-muted">{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {payments.length === 0 ? (
        <div className="bugie-card p-5 text-center">
          <div className="bugie-mini-icon mx-auto mb-3" style={{ width: 56, height: 56, fontSize: '1.5rem' }}>
            <i className="fa-solid fa-credit-card" />
          </div>
          <div className="fw-semibold mb-2">Sin pagos aún</div>
          <div className="small bugie-muted">
            Los pagos se registran automáticamente cuando completas un viaje.
          </div>
        </div>
      ) : (
        <div className="d-flex flex-column gap-2">
          {payments.map(p => {
            const s   = STATUS_CFG[p.status] ?? { label: p.status, color: '#94a3b8', icon: 'fa-circle' };
            const pay = METHOD[p.method]     ?? { label: p.method,  icon: 'fa-credit-card' };
            const date = new Date(p.createdAt);

            return (
              <div key={p.id} className="bugie-card" style={{ overflow: 'hidden' }}>
                <div style={{ height: 3, background: s.color }} />
                <div className="p-3 d-flex align-items-center gap-3">

                  {/* Ícono método */}
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: s.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <i className={`fa-solid ${pay.icon}`} style={{ color: s.color }} />
                  </div>

                  {/* Info */}
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
                    </div>
                    <div className="small bugie-muted">
                      {date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}
                      {' · '}
                      {date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    {p.reference && (
                      <div className="small bugie-muted mt-1">
                        Ref: <span className="fw-semibold">{p.reference}</span>
                      </div>
                    )}
                  </div>

                  {/* Monto */}
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
            );
          })}
        </div>
      )}
    </>
  );
}