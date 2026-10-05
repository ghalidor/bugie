import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Notice } from '../../components/ui';
import { rewardsApi } from '../../state/rewards';

/* ──────────────────────────────────────────────────────────────────────────
   Aviso en el viaje: «Tienes cupones de tu nivel disponibles».

   Aparece si el pasajero tiene cupones de nivel vigentes que descuentan sobre
   la tarifa (se aplican con el modal de siempre) o beneficios del mes sin
   reclamar (se reclaman en Mis puntos). Si algo falla, no se muestra: es un
   aviso, no debe estorbar el seguimiento del viaje.
   ────────────────────────────────────────────────────────────────────────── */

const APLICABLES = ['discount_amount', 'free_trip', 'discount_period'];

export default function LevelCouponHint({ tripId, onApply }: { tripId: string; onApply: () => void }) {
  const [ready,     setReady]     = useState(0);   // cupones de nivel listos para aplicar
  const [toClaim,   setToClaim]   = useState(0);   // beneficios del mes sin reclamar

  useEffect(() => {
    let alive = true;
    Promise.all([rewardsApi.levelBenefits(), rewardsApi.myCoupons('active', 1, 50)])
      .then(([b, c]) => {
        if (!alive || !b.eligible || !b.couponsApplyToFare) return;
        // Los cupones de nivel no cuestan puntos (pointsSpent 0).
        setReady(c.items.filter(x => x.pointsSpent === 0 && APLICABLES.includes(x.rewardType)).length);
        setToClaim(b.canClaim ? b.discountCoupons.available + b.freeTrips.available : 0);
      })
      .catch(() => { /* sin aviso */ });
    return () => { alive = false; };
  }, [tripId]);

  if (ready <= 0 && toClaim <= 0) return null;

  return (
    <Notice
      tone="primary"
      icon="fa-gift"
      title="Tienes cupones de tu nivel disponibles"
      action={
        <div className="d-flex flex-wrap gap-2">
          {ready > 0 && (
            <button type="button" className="btn btn-sm btn-bugie" onClick={onApply}>
              <i className="fa-solid fa-tag" aria-hidden="true" />Usar un cupón
            </button>
          )}
          {toClaim > 0 && (
            <Link to="/app/pasajero/puntos" className="btn btn-sm btn-bugie-outline">
              Reclamar en Mis puntos
            </Link>
          )}
        </div>
      }
    >
      {ready > 0
        ? `Tienes ${ready} cupón${ready === 1 ? '' : 'es'} de nivel listo${ready === 1 ? '' : 's'} para este viaje.`
        : `Te queda${toClaim === 1 ? '' : 'n'} ${toClaim} beneficio${toClaim === 1 ? '' : 's'} de nivel por reclamar este mes.`}
    </Notice>
  );
}
