import { useEffect, useState } from 'react';
import { ApiError } from '../../state/api';
import {
  rewardsApi, CatalogItem, RedeemResult,
  REWARD_ICON, fmtPoints, describeReward,
} from '../../state/rewards';

export default function RewardsCatalog({ onRedeemed }: { onRedeemed: (r: RedeemResult) => void }) {
  const [items,     setItems]     = useState<CatalogItem[]>([]);
  const [available, setAvailable] = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);   // canje fallido
  const [loadError, setLoadError] = useState<string | null>(null);   // no se pudo cargar

  // Item que el usuario esta por confirmar, y el que se esta enviando.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [redeeming,  setRedeeming]  = useState<string | null>(null);

  useEffect(() => {
    Promise.all([rewardsApi.catalog(), rewardsApi.me()])
      .then(([c, p]) => { setItems(c); setAvailable(p.availablePoints); })
      .catch(err => setLoadError(err instanceof ApiError
        ? err.message
        : 'No se pudo cargar el catálogo.'))
      .finally(() => setLoading(false));
  }, []);

  async function redeem(item: CatalogItem) {
    setRedeeming(item.id);
    setError(null);
    try {
      const result = await rewardsApi.redeem(item.id);
      onRedeemed(result);
    } catch (err) {
      // El backend explica el motivo: saldo, nivel, agotado o canje apagado.
      setError(err instanceof ApiError ? err.message : 'No se pudo completar el canje.');
      setConfirming(null);
    } finally {
      setRedeeming(null);
    }
  }

  if (loading) {
    return <div className="d-flex justify-content-center py-5"><span className="spinner-border" /></div>;
  }
  if (loadError) {
    return <div className="alert alert-danger small">{loadError}</div>;
  }

  return (
    <>
      <div className="bugie-card mb-3">
        <div className="bugie-card-body d-flex align-items-center justify-content-between gap-3">
          <span className="bugie-muted">Tienes para canjear</span>
          <span className="fw-bold" style={{ fontSize: '1.5rem' }}>{fmtPoints(available)} pts</span>
        </div>
      </div>

      {error && <div className="alert alert-danger small mb-3">{error}</div>}

      {items.length === 0 ? (
        <div className="bugie-card">
          <div className="bugie-card-body text-center py-4 bugie-muted">
            No hay recompensas disponibles por ahora.
          </div>
        </div>
      ) : (
        <div className="row g-3">
          {items.map(item => (
            <div key={item.id} className="col-12 col-md-6 col-xl-4">
              <RewardCard
                item={item}
                confirming={confirming === item.id}
                redeeming={redeeming === item.id}
                disabled={redeeming !== null}
                onAsk={() => { setError(null); setConfirming(item.id); }}
                onCancel={() => setConfirming(null)}
                onConfirm={() => redeem(item)}
              />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function RewardCard({ item, confirming, redeeming, disabled, onAsk, onCancel, onConfirm }: {
  item: CatalogItem;
  confirming: boolean;
  redeeming: boolean;
  disabled: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const locked = !item.canAfford;

  return (
    <div className="bugie-card h-100" style={{ opacity: locked ? 0.65 : 1 }}>
      <div className="bugie-card-body d-flex flex-column h-100">
        <div className="d-flex align-items-start gap-3 mb-2">
          <div className="bugie-mini-icon"><i className={REWARD_ICON[item.rewardType] ?? 'fa-solid fa-gift'} /></div>
          <div className="flex-grow-1">
            <div className="fw-semibold">{item.name}</div>
            <div className="small bugie-muted">{describeReward(item)}</div>
          </div>
        </div>

        {item.description && <div className="small mb-2">{item.description}</div>}

        <div className="small bugie-muted mb-3">
          Válido {item.validityDays} días después de canjear
          {item.stock !== null && ` · quedan ${item.stock}`}
        </div>

        <div className="mt-auto">
          <div className="fw-bold mb-2" style={{ fontSize: '1.2rem' }}>
            {fmtPoints(item.pointsCost)} pts
          </div>

          {locked ? (
            <div className="small bugie-muted">
              <i className="fa-solid fa-lock me-1" />
              {item.blockedReason}
            </div>
          ) : confirming ? (
            <div>
              <div className="small mb-2">
                Se descontarán {fmtPoints(item.pointsCost)} puntos de tu saldo.
              </div>
              <div className="d-flex gap-2">
                <button type="button" onClick={onConfirm} disabled={redeeming}
                        className="btn btn-bugie rounded-pill flex-grow-1">
                  {redeeming
                    ? <><span className="spinner-border spinner-border-sm me-2" />Canjeando...</>
                    : 'Confirmar canje'}
                </button>
                <button type="button" onClick={onCancel} disabled={redeeming}
                        className="btn btn-bugie-outline rounded-pill">
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={onAsk} disabled={disabled}
                    className="btn btn-bugie rounded-pill w-100">
              Canjear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
