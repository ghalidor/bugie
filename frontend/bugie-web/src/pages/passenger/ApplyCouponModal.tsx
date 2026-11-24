import { useEffect, useState } from 'react';
import { ApiError } from '../../state/api';
import { rewardsApi, Redemption } from '../../state/rewards';
import { EmptyState, Modal, Notice, Skeleton } from '../../components/ui';
import { money } from '../../components/tripFormat';

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
  /** Cupón de monto que vale más que la tarifa: lo que sobra y sus puntos (0 si nada). */
  leftoverSoles?: number;
  leftoverPoints?: number;
  /** Texto del servidor para el pasajero cuando hay sobrante. */
  notice?: string | null;
}

/**
 * Aviso cuando un cupón de monto vale más que la tarifa: el viaje sale gratis
 * y lo que sobra vuelve en puntos al terminar. points null = tasa desconocida.
 */
export function couponLeftoverNotice(soles: number, points: number | null): string {
  if (points === 0) return 'Este viaje te sale gratis.';
  const pts = points == null ? '' : ` (${points} pts)`;
  return `Este viaje te sale gratis. Te devolvemos ${money(soles)} en puntos${pts} al terminar.`;
}

/** Sobrante de un cupón de monto sobre la tarifa (mismo cálculo que el servidor). */
function sobrante(c: Redemption, fare: number): number {
  if (c.rewardType !== 'discount_amount' && c.rewardType !== 'free_trip') return 0;
  const s = Math.round(((c.amountSoles ?? 0) - fare) * 100);
  return s > 0 ? s / 100 : 0;
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
  // Puntos por S/ 1.00: para anticipar el sobrante. null = no se pudo leer.
  const [pointsPerSol, setPointsPerSol] = useState<number | null>(null);

  useEffect(() => {
    rewardsApi.me()
      .then(p => setPointsPerSol(p.pointsPerSol ?? 0))
      .catch(() => { /* el aviso sale sin los puntos */ });
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
    return `hasta ${money(d)} menos`;
  }

  function puntosDe(soles: number): number | null {
    if (pointsPerSol == null) return null;
    if (pointsPerSol <= 0) return 0;
    return Math.floor(soles * pointsPerSol + 1e-9);
  }

  return (
    <Modal
      open
      onClose={onClose}
      busy={!!aplicando}

      title="Usar un cupón"
      description={<>Tarifa de este viaje: <strong>{money(fare)}</strong></>}
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
              const sobra = sobrante(c, fare);
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
                    {sobra > 0 && (
                      <span className="d-block small bx-text-ok">{couponLeftoverNotice(sobra, puntosDe(sobra))}</span>
                    )}
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
