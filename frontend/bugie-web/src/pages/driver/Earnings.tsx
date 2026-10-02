import { useEffect, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import { API, apiFetch } from '../../state/api';

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

  useEffect(() => {
    apiFetch<Earnings>(`${API.payments}/payments/earnings`)
      .then(setData)
      .catch(() => setError('No se pudo cargar las ganancias.'))
      .finally(() => setLoading(false));
    // Pagos que Bugie le hizo (si falla no bloquea la pantalla)
    apiFetch<PayoutReport>(`${API.payments}/payments/payouts/me`)
      .then(setPayouts)
      .catch(() => setPayouts({ items: [], total: 0, totalAmount: 0 }));
  }, []);

  if (loading) return <div className="d-flex justify-content-center py-5"><span className="spinner-border" /></div>;

  return (
    <>
      <PageHeader title="Ganancias" subtitle="Resumen de ingresos y comisiones." icon="fa-solid fa-wallet" />
      {error && <div className="alert alert-danger small mb-3">{error}</div>}

      <div className="row g-3 mb-3">
        {[
          ['Total ganado',       `S/ ${data?.totalEarnings.toFixed(2) ?? '0.00'}`],
          ['Este mes',           `S/ ${data?.earningsThisMonth.toFixed(2) ?? '0.00'}`],
          ['Viajes completados', String(data?.totalTrips ?? 0)],
        ].map(([label, value]) => (
          <div className="col-md-4" key={label}>
            <div className="bugie-kpi">
              <div className="label">{label}</div>
              <div className="value">{value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Pagos recibidos de Bugie */}
      <div className="bugie-card mb-3">
        <div className="bugie-card-header d-flex justify-content-between align-items-center">
          <span><i className="fa-solid fa-money-bill-transfer me-2" />Pagos recibidos de Bugie</span>
          {payouts && payouts.total > 0 && (
            <span className="fw-bold">S/ {payouts.totalAmount.toFixed(2)}</span>
          )}
        </div>
        <div className="bugie-card-body">
          {!payouts ? (
            <div className="text-center py-2"><span className="spinner-border spinner-border-sm" /></div>
          ) : payouts.items.length === 0 ? (
            <div className="small bugie-muted text-center py-2">
              Aún no recibiste pagos. Aquí verás los bonos que canjees con tus puntos y los premios de sorteos.
            </div>
          ) : (
            <div className="d-flex flex-column gap-2">
              {payouts.items.map(p => {
                const m = PAYOUT_METHOD[p.method] ?? { label: p.method, icon: 'fa-coins' };
                return (
                  <div key={p.id} className="bugie-list-item">
                    <div className="bugie-mini-icon"><i className={`fa-solid ${m.icon}`} /></div>
                    <div className="flex-grow-1">
                      <div className="fw-semibold">{PAYOUT_SOURCE[p.sourceType] ?? 'Pago'}</div>
                      <div className="small bugie-muted">
                        {m.label}{p.operationNumber && <> · op {p.operationNumber}</>}
                        {p.paidAt && <> · {new Date(p.paidAt).toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</>}
                      </div>
                      {p.note && <div className="small bugie-muted">{p.note}</div>}
                    </div>
                    <div className="fw-bold text-nowrap">S/ {p.amount.toFixed(2)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="bugie-card">
        <div className="bugie-card-header">Métodos de cobro disponibles</div>
        <div className="bugie-card-body">
          {[
            ['fa-money-bill-wave', 'Efectivo',   'Cobras directamente al pasajero.'],
            ['fa-mobile-screen',   'Yape / Plin','Transferencia digital inmediata.'],
          ].map(([icon, title, desc]) => (
            <div key={title} className="bugie-list-item mb-2">
              <div className="bugie-mini-icon"><i className={`fa-solid ${icon}`} /></div>
              <div>
                <div className="fw-semibold">{title}</div>
                <div className="small bugie-muted">{desc}</div>
              </div>
            </div>
          ))}
          <div className="alert alert-info small mt-3 mb-0">
            <i className="fa-solid fa-circle-info me-1" />
            Los bonos que canjeas con tus puntos y los premios de sorteos te los paga Bugie
            por Yape, Plin o transferencia. Los verás en «Pagos recibidos».
          </div>
        </div>
      </div>
    </>
  );
}
