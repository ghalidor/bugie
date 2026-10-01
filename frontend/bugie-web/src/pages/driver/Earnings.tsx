import { useEffect, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import { API, apiFetch } from '../../state/api';

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

  useEffect(() => {
    apiFetch<Earnings>(`${API.payments}/payments/earnings`)
      .then(setData)
      .catch(() => setError('No se pudo cargar las ganancias.'))
      .finally(() => setLoading(false));
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
            Los retiros bancarios estarán disponibles en la Fase 2 del proyecto.
          </div>
        </div>
      </div>
    </>
  );
}
