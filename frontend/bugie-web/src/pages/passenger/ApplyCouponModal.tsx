import { useEffect, useState } from 'react';
import { ApiError } from '../../state/api';
import { rewardsApi, Redemption } from '../../state/rewards';

/* ──────────────────────────────────────────────────────────────────────────
   Elegir un cupón para este viaje.

   Solo se ofrecen los que descuentan sobre una tarifa. Los premios físicos o
   los bonos se entregan aparte: mostrarlos aquí solo para que el backend los
   rechace sería hacerle perder el tiempo al pasajero.

   El descuento definitivo lo calcula el backend, que puede aplicar menos de
   lo que vale el cupón si supera la comisión. Por eso aquí dice «hasta».
   ────────────────────────────────────────────────────────────────────────── */

const APLICABLES = ['discount_amount', 'free_trip', 'discount_period'];

export interface CouponApplied {
  tripId: string;
  code: string;
  itemName: string;
  fareBeforeDiscount: number;
  discountAmount: number;
  amountToPay: number;
  warning: string | null;
}

export default function ApplyCouponModal({ tripId, fare, onClose, onApplied }: {
  tripId: string;
  fare: number;
  onClose: () => void;
  onApplied: (r: CouponApplied) => void;
}) {
  const [cupones,  setCupones]  = useState<Redemption[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [aplicando, setAplicando] = useState<string | null>(null);

  useEffect(() => {
    rewardsApi.myCoupons('active', 1, 50)
      .then(p => setCupones(p.items.filter(c => APLICABLES.includes(c.rewardType))))
      .catch(e => setError(e instanceof ApiError ? e.message : 'No se pudieron cargar tus cupones.'))
      .finally(() => setLoading(false));
  }, []);

  async function aplicar(c: Redemption) {
    setAplicando(c.code); setError(null);
    try {
      const r = await rewardsApi.applyCouponToTrip(tripId, c.code);
      onApplied(r);
    } catch (e) {
      // El backend dice por qué no se puede: vencido, de otra persona, o la
      // función todavía no está activada. Se muestra tal cual.
      setError(e instanceof ApiError ? e.message : 'No se pudo aplicar el cupón.');
      setAplicando(null);
    }
  }

  /// Lo que descontaría, como estimación. El valor real lo decide el backend.
  function estimado(c: Redemption): string {
    const d = c.rewardType === 'discount_period'
      ? fare * (c.percentage ?? 0) / 100
      : Math.min(c.amountSoles ?? 0, fare);
    return `hasta S/ ${d.toFixed(2)} menos`;
  }

  return (
    <div className="modal d-block" style={{ background: 'rgba(0,0,0,.45)' }}
         role="dialog" onClick={onClose}>
      <div className="modal-dialog modal-dialog-centered" onClick={e => e.stopPropagation()}>
        <div className="modal-content" style={{ borderRadius: 18 }}>
          <div className="modal-header">
            <h5 className="modal-title">Usar un cupón</h5>
            <button type="button" className="btn-close" onClick={onClose} aria-label="Cerrar" />
          </div>

          <div className="modal-body">
            <div className="small bugie-muted mb-3">
              Tarifa de este viaje: <strong>S/ {fare.toFixed(2)}</strong>
            </div>

            {error && <div className="alert alert-danger small py-2">{error}</div>}

            {loading ? (
              <div className="d-flex justify-content-center py-4">
                <span className="spinner-border spinner-border-sm" />
              </div>
            ) : cupones.length === 0 ? (
              <div className="text-center py-4">
                <i className="fa-solid fa-tag fa-2x d-block mb-3" style={{ opacity: .3 }} />
                <div className="small bugie-muted">
                  No tienes cupones de descuento vigentes.
                  <br />Cánjealos con tus puntos desde <strong>Mis puntos</strong>.
                </div>
              </div>
            ) : (
              <div className="d-grid gap-2">
                {cupones.map(c => {
                  const dias = Math.ceil(
                    (new Date(c.expiresAt).getTime() - Date.now()) / 86400000);
                  return (
                    <button key={c.id} type="button"
                            className="d-flex align-items-center gap-3 p-3 text-start w-100"
                            style={{
                              background: 'transparent', color: 'inherit',
                              border: '1px solid var(--bugie-border)', borderRadius: 12,
                            }}
                            disabled={aplicando !== null}
                            onClick={() => aplicar(c)}>
                      <i className="fa-solid fa-tag"
                         style={{ color: 'var(--bugie-primary)', width: 18 }} />
                      <div className="flex-grow-1" style={{ minWidth: 0 }}>
                        <div className="fw-semibold small">{c.itemName}</div>
                        <div className="small" style={{ color: '#0d6e4a', fontWeight: 600 }}>
                          {estimado(c)}
                        </div>
                        <div className="small bugie-muted">
                          {c.code} · {dias <= 0 ? 'vence hoy' : `vence en ${dias} día${dias === 1 ? '' : 's'}`}
                        </div>
                      </div>
                      {aplicando === c.code
                        ? <span className="spinner-border spinner-border-sm" />
                        : <i className="fa-solid fa-chevron-right bugie-muted" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="modal-footer">
            <div className="small bugie-muted me-auto">
              Si cancelas el viaje, el cupón vuelve a estar disponible.
            </div>
            <button type="button" className="btn btn-bugie-outline rounded-pill"
                    onClick={onClose}>Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
