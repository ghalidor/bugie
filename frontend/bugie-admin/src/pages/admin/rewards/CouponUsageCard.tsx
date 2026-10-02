import { useEffect, useState } from 'react';
import { ApiError } from '../../../state/api';
import { rewardsAdminApi, CouponUsageReport, fmtDate } from '../../../state/rewards';

/* ──────────────────────────────────────────────────────────────────────────
   Cupones aplicados a viajes.

   Mientras el interruptor esté apagado esto no crece, y la tarjeta lo dice:
   una tabla vacía sin explicación parece que algo se rompió.

   El dato que importa es «se le debe al conductor». Solo deja de ser cero si
   se apagó el límite a la comisión, y entonces es dinero real que alguien
   tiene que pagar.
   ────────────────────────────────────────────────────────────────────────── */

const soles = (n: number) => `S/ ${n.toFixed(2)}`;

const ESTADO: Record<string, { label: string; color: string }> = {
  completed:   { label: 'Completado', color: 'var(--bugie-ok)' },
  cancelled:   { label: 'Cancelado',  color: 'var(--bugie-neutral)' },
  in_progress: { label: 'En curso',   color: 'var(--bugie-primary-soft)' },
};

export default function CouponUsageCard() {
  const [data,    setData]    = useState<CouponUsageReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    rewardsAdminApi.couponUsage()
      .then(setData)
      .catch((e: unknown) => {
        if (!(e instanceof ApiError)) return;
        setData(null);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bugie-card">
        <div className="bugie-card-body d-flex justify-content-center py-4">
          <span className="spinner-border spinner-border-sm" />
        </div>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="bugie-card">
      <div className="bugie-card-header d-flex align-items-center">
        <i className="fa-solid fa-tag me-2" />
        <span>Cupones aplicados a viajes</span>
        {!data.featureEnabled && (
          <span className="badge rounded-pill ms-auto"
                style={{ background: 'var(--bugie-warn)22', color: 'var(--bugie-warn)',
                         fontSize: '.68rem' }}>
            Función apagada
          </span>
        )}
      </div>

      <div className="bugie-card-body">
        {!data.featureEnabled && (
          <div className="alert alert-warning small py-2">
            Los cupones todavía no descuentan del precio de los viajes. Se enciende
            en <strong>Configuración → Cupones sobre la tarifa</strong>.
            {data.trips > 0 && ' Lo que ves abajo es de cuando estuvo encendida.'}
          </div>
        )}

        {data.trips === 0 ? (
          <div className="text-center py-4 bugie-muted small">
            Todavía ningún viaje usó un cupón.
          </div>
        ) : (
          <>
            <div className="row g-3 mb-3">
              {[
                ['Viajes con cupón', String(data.trips),
                 `${data.tripsCompleted} completados, ${data.tripsCancelled} cancelados`],
                ['Descontado en total', soles(data.totalDiscount),
                 'Lo que dejaron de pagar los pasajeros'],
                ['Promedio por viaje', soles(data.averageDiscount), ''],
                ['Se debe a conductores', soles(data.totalOwed),
                 data.totalOwed > 0 ? 'Dinero real pendiente de pagar'
                                    : 'El descuento salió de tu comisión'],
              ].map(([label, value, help]) => (
                <div className="col-6 col-xl-3" key={label}>
                  <div className="bugie-kpi h-100">
                    <div className="label">{label}</div>
                    <div className="value">{value}</div>
                    {help && (
                      <div className="small bugie-muted mt-1" style={{ fontSize: '.72rem' }}>
                        {help}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {data.totalOwed > 0 && (
              <div className="alert alert-warning small py-2">
                <i className="fa-solid fa-triangle-exclamation me-1" />
                Hay <strong>{soles(data.totalOwed)}</strong> que la plataforma le
                debe a conductores: cobraron menos de lo que les tocaba. Ocurre
                cuando el descuento supera tu comisión y el límite está apagado.
              </div>
            )}

            <div className="table-responsive">
              <table className="table table-sm align-middle mb-0">
                <thead>
                  <tr className="small bugie-muted">
                    <th>Cupón</th><th>Pasajero</th><th>Conductor</th>
                    <th className="text-end">Tarifa</th>
                    <th className="text-end">Descuento</th>
                    <th className="text-end">Pagó</th>
                    <th>Estado</th><th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map(r => {
                    const e = ESTADO[r.status] ?? ESTADO.in_progress;
                    return (
                      <tr key={r.tripId} className="small">
                        <td>
                          <span style={{ fontFamily: 'ui-monospace, Menlo, monospace',
                                         fontWeight: 600 }}>
                            {r.couponCode}
                          </span>
                          {r.itemName && (
                            <div className="bugie-muted" style={{ fontSize: '.72rem' }}>
                              {r.itemName}
                            </div>
                          )}
                        </td>
                        <td className="text-truncate" style={{ maxWidth: 140 }}>
                          {r.passengerName ?? '—'}
                        </td>
                        <td className="text-truncate" style={{ maxWidth: 140 }}>
                          {r.driverName ?? '—'}
                        </td>
                        <td className="text-end bugie-muted">
                          {soles(r.fareBeforeDiscount)}
                        </td>
                        <td className="text-end fw-bold" style={{ color: 'var(--bugie-bad)' }}>
                          −{soles(r.discountAmount)}
                        </td>
                        <td className="text-end fw-bold">{soles(r.amountPaid)}</td>
                        <td>
                          <span style={{ color: e.color }}>{e.label}</span>
                          {r.platformOwesDriver > 0 && (
                            <div style={{ fontSize: '.7rem', color: 'var(--bugie-warn)' }}>
                              debes {soles(r.platformOwesDriver)}
                            </div>
                          )}
                        </td>
                        <td className="bugie-muted" style={{ fontSize: '.74rem' }}>
                          {fmtDate(r.completedAt ?? r.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="small bugie-muted mt-3">
              Un viaje cancelado con cupón aplicado no lo consume: el cupón vuelve
              a quedar disponible para su dueño.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
