import { useEffect, useState } from 'react';
import { ApiError } from '../../state/api';
import { rewardsApi, Redemption } from '../../state/rewards';
import { EmptyState, Modal, Notice, Skeleton } from '../../components/ui';

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
    <Modal
      open
      onClose={onClose}
      busy={!!aplicando}

      title="Usar un cupón"
      description={<>Tarifa de este viaje: <strong>S/ {fare.toFixed(2)}</strong></>}
      footer={
        <>
          <span className="small bx-muted me-auto">Si cancelas el viaje, el cupón vuelve a estar disponible.</span>
          <button type="button" className="btn btn-bugie-outline" onClick={onClose} disabled={!!aplicando}>Cerrar</button>
        </>
      }
    >
      <div className="bx-stack">
        {error && <Notice tone="bad">{error}</Notice>}

        {loading ? (
          <Skeleton height={56} count={3} />
        ) : cupones.length === 0 ? (
          <EmptyState
            compact
            icon="fa-tag"
            title="No tienes cupones de descuento vigentes"
            text={<>Cánjealos con tus puntos desde <strong>Mis puntos</strong>.</>}
          />
        ) : (
          <div className="bx-rows" role="list">
            {cupones.map(c => {
              const dias = Math.ceil((new Date(c.expiresAt).getTime() - Date.now()) / 86400000);
              return (
                <button
                  key={c.id}
                  type="button"
                  role="listitem"
                  className="bx-row"
                  disabled={aplicando !== null}
                  onClick={() => aplicar(c)}
                >
                  <span className="bx-list-icon" aria-hidden="true"><i className="fa-solid fa-tag" /></span>
                  <span className="bx-list-text">
                    <span className="bx-list-title">{c.itemName}</span>
                    <span className="d-block small fw-semibold bx-text-ok">{estimado(c)}</span>
                    <span className="bx-list-sub d-block">
                      {c.code} · {dias <= 0 ? 'vence hoy' : `vence en ${dias} día${dias === 1 ? '' : 's'}`}
                    </span>
                  </span>
                  {aplicando === c.code
                    ? <span className="spinner-border spinner-border-sm" aria-label="Aplicando" />
                    : <i className="fa-solid fa-chevron-right bx-muted" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
