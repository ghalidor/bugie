import { ReactNode, useEffect, useState } from 'react';
import { ApiError } from '../../state/api';
import { Modal, Notice, useConfirm, useToast } from '../../components/ui';
import { rewardsApi, LevelBenefits, Redemption, LEVEL_COLOR, fmtDate } from '../../state/rewards';

/* ──────────────────────────────────────────────────────────────────────────
   Beneficios del nivel de este mes (solo pasajeros).

   El backend dice cuántos cupones de descuento y viajes gratis le tocan a la
   persona este mes y cuántos le quedan. Reclamar uno crea un cupón BG- que se
   usa con «Usar un cupón» en el viaje. Si la cuenta no tiene beneficios (por
   ser conductor o por otro motivo) no se muestra nada.
   ────────────────────────────────────────────────────────────────────────── */

type ClaimType = 'discount' | 'free_trip';

export default function RewardsLevelBenefits({ onClaimed }: { onClaimed?: (coupon: Redemption) => void }) {
  const confirm = useConfirm();
  const toast   = useToast();
  const [benefits, setBenefits] = useState<LevelBenefits | null>(null);
  const [claiming, setClaiming] = useState<ClaimType | null>(null);
  const [claimed,  setClaimed]  = useState<Redemption | null>(null);

  useEffect(() => {
    // Si falla, la pantalla de puntos sigue funcionando sin este bloque.
    rewardsApi.levelBenefits().then(setBenefits).catch(() => setBenefits(null));
  }, []);

  if (!benefits || !benefits.eligible) return null;

  const { discountCoupons: dc, freeTrips: ft } = benefits;
  if (dc.total <= 0 && ft.total <= 0) return null;

  const color   = LEVEL_COLOR[benefits.level] ?? '#94a3b8';
  const endsAt  = fmtDate(benefits.periodEndsAt);
  const maxTrip = ft.maxAmount != null ? ft.maxAmount.toFixed(2) : null;

  async function claim(type: ClaimType) {
    const label = type === 'discount'
      ? `un cupón de ${benefits!.discountPercentage} % de descuento`
      : `un viaje gratis${maxTrip ? ` de hasta S/ ${maxTrip}` : ''}`;
    const ok = await confirm({
      title: type === 'discount' ? '¿Reclamar cupón?' : '¿Reclamar viaje gratis?',
      message: <>Vas a reclamar {label} de tu nivel {benefits!.levelName}. Vence el <strong>{endsAt}</strong>.</>,
      confirmText: 'Reclamar',
    });
    if (!ok) return;

    setClaiming(type);
    try {
      const r = await rewardsApi.claimLevelBenefit(type);
      setBenefits(r.benefits);
      setClaimed(r.coupon);
      onClaimed?.(r.coupon);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo reclamar el beneficio.');
    } finally {
      setClaiming(null);
    }
  }

  const canClaim = benefits.canClaim && claiming === null;

  return (
    <>
      <div className="bugie-card mb-3" style={{ borderLeft: `4px solid ${color}` }}>
        <div className="bugie-card-header">
          <i className="fa-solid fa-gift me-2" style={{ color }} />
          Beneficios de tu nivel este mes
        </div>
        <div className="bugie-card-body d-grid gap-3">
          {dc.total > 0 && (
            <BenefitLine
              icon="fa-percent"
              text={<>Cupones de {benefits.discountPercentage} %: te quedan <strong>{dc.available}</strong> de {dc.total}</>}
              button="Reclamar cupón"
              busy={claiming === 'discount'}
              disabled={!canClaim || dc.available <= 0}
              onClick={() => claim('discount')}
            />
          )}
          {ft.total > 0 && (
            <BenefitLine
              icon="fa-car-side"
              text={<>Viajes gratis{maxTrip ? ` (hasta S/ ${maxTrip})` : ''}: te quedan <strong>{ft.available}</strong> de {ft.total}</>}
              button="Reclamar viaje gratis"
              busy={claiming === 'free_trip'}
              disabled={!canClaim || ft.available <= 0}
              onClick={() => claim('free_trip')}
            />
          )}
          <div className="small bugie-muted">
            <i className="fa-regular fa-calendar me-1" aria-hidden="true" />
            Vencen a fin de mes: <strong>{endsAt}</strong>.
          </div>
          {!benefits.couponsApplyToFare && (
            <div className="small bugie-muted">
              <i className="fa-solid fa-circle-info me-1" aria-hidden="true" />
              Por ahora los cupones todavía no se pueden aplicar en los viajes.
            </div>
          )}
        </div>
      </div>

      {claimed && <ClaimedModal coupon={claimed} onClose={() => setClaimed(null)} />}
    </>
  );
}

function BenefitLine({ icon, text, button, busy, disabled, onClick }: {
  icon: string;
  text: ReactNode;
  button: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <div className="d-flex flex-wrap align-items-center gap-2">
      <div className="bugie-mini-icon"><i className={`fa-solid ${icon}`} aria-hidden="true" /></div>
      <div className="flex-grow-1 small">{text}</div>
      <button type="button" className="btn btn-sm btn-bugie rounded-pill" disabled={disabled} onClick={onClick}>
        {busy
          ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Reclamando...</>
          : button}
      </button>
    </div>
  );
}

function ClaimedModal({ coupon, onClose }: { coupon: Redemption; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(coupon.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Sin permiso del navegador: el codigo igual esta visible.
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="¡Beneficio reclamado!"
      description={coupon.itemName}
      footer={<button type="button" className="btn btn-bugie" onClick={onClose}>Entendido</button>}
    >
      <div className="bx-stack text-center">
        <div>
          <div className="small bugie-muted">Tu código</div>
          <div className="fw-bold" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '1.4rem', letterSpacing: '.08em' }}>
            {coupon.code}
          </div>
        </div>
        <div>
          <button type="button" onClick={copy} className="btn btn-sm btn-bugie-outline rounded-pill">
            <i className={`fa-solid ${copied ? 'fa-check' : 'fa-copy'} me-1`} aria-hidden="true" />
            {copied ? 'Copiado' : 'Copiar'}
          </button>
        </div>
        <Notice tone="info" icon="fa-tag">
          Úsalo con «Usar un cupón» en tu próximo viaje. Vence el <strong>{fmtDate(coupon.expiresAt)}</strong>.
        </Notice>
      </div>
    </Modal>
  );
}
