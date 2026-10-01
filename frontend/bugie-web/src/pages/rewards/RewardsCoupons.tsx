import { useEffect, useState } from 'react';
import { ApiError } from '../../state/api';
import {
  rewardsApi, Redemption,
  STATUS_LABEL, STATUS_COLOR, REWARD_ICON, fmtPoints, fmtDate, describeReward,
} from '../../state/rewards';

const FILTERS: { key: string | null; label: string }[] = [
  { key: null,        label: 'Todos' },
  { key: 'active',    label: 'Vigentes' },
  { key: 'used',      label: 'Usados' },
  { key: 'expired',   label: 'Vencidos' },
  { key: 'cancelled', label: 'Anulados' },
];

/// Tipos que entrega el equipo de Bugie fuera de la app.
const MANUAL_TYPES = new Set(['wallet_bonus', 'physical', 'partner_benefit']);

export default function RewardsCoupons({ highlightCode, onDismissHighlight }: {
  highlightCode: string | null;
  onDismissHighlight: () => void;
}) {
  const [status,  setStatus]  = useState<string | null>(null);
  const [items,   setItems]   = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    rewardsApi.myCoupons(status, 1, 50)
      .then(data => setItems(data.items))
      .catch(err => setError(err instanceof ApiError ? err.message : 'No se pudieron cargar tus cupones.'))
      .finally(() => setLoading(false));
  }, [status]);

  return (
    <>
      {highlightCode && (
        <div className="alert alert-success d-flex align-items-center gap-2 mb-3">
          <i className="fa-solid fa-circle-check" />
          <div className="flex-grow-1">
            Canje realizado. Tu cupón es <strong>{highlightCode}</strong>.
          </div>
          <button type="button" className="btn-close" aria-label="Cerrar" onClick={onDismissHighlight} />
        </div>
      )}

      <div className="d-flex flex-wrap gap-2 mb-3">
        {FILTERS.map(f => (
          <button
            key={f.label}
            type="button"
            onClick={() => setStatus(f.key)}
            className={`btn btn-sm rounded-pill ${status === f.key ? 'btn-bugie' : 'btn-bugie-outline'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <div className="alert alert-danger small mb-3">{error}</div>}

      {loading ? (
        <div className="d-flex justify-content-center py-5"><span className="spinner-border" /></div>
      ) : error ? null : items.length === 0 ? (
        <div className="bugie-card">
          <div className="bugie-card-body text-center py-4 bugie-muted">
            {status === null
              ? 'Aún no canjeaste ninguna recompensa.'
              : `No tienes cupones ${STATUS_LABEL[status]?.toLowerCase()}.`}
          </div>
        </div>
      ) : (
        <div className="d-grid gap-2">
          {items.map(r => (
            <CouponCard key={r.id} coupon={r} highlighted={r.code === highlightCode} />
          ))}
        </div>
      )}
    </>
  );
}

function CouponCard({ coupon, highlighted }: { coupon: Redemption; highlighted: boolean }) {
  const [copied, setCopied] = useState(false);
  const color = STATUS_COLOR[coupon.status] ?? '#94a3b8';

  async function copy() {
    try {
      await navigator.clipboard.writeText(coupon.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // El navegador no dio permiso: el codigo igual esta visible en pantalla.
    }
  }

  return (
    <div className="bugie-card" style={{
      borderLeft: `4px solid ${color}`,
      boxShadow: highlighted ? `0 0 0 2px ${color}` : undefined,
    }}>
      <div className="bugie-card-body">
        <div className="d-flex flex-wrap align-items-start gap-3">
          <div className="bugie-mini-icon"><i className={REWARD_ICON[coupon.rewardType] ?? 'fa-solid fa-gift'} /></div>

          <div className="flex-grow-1">
            <div className="fw-semibold">{coupon.itemName}</div>
            <div className="small bugie-muted">{describeReward(coupon)}</div>
            <div className="small bugie-muted mt-1">
              Canjeado el {fmtDate(coupon.createdAt)} por {fmtPoints(coupon.pointsSpent)} pts
            </div>
          </div>

          <span className="small fw-semibold px-2 py-1" style={{
            borderRadius: 999, background: `${color}22`, color,
          }}>
            {STATUS_LABEL[coupon.status] ?? coupon.status}
          </span>
        </div>

        <div className="d-flex flex-wrap align-items-center gap-3 mt-3 pt-2"
             style={{ borderTop: '1px dashed var(--bugie-border)' }}>
          <div>
            <div className="small bugie-muted">Código</div>
            <div className="fw-bold" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '1.15rem', letterSpacing: '.08em' }}>
              {coupon.code}
            </div>
          </div>

          {coupon.status === 'active' && (
            <button type="button" onClick={copy} className="btn btn-sm btn-bugie-outline rounded-pill">
              <i className={`fa-solid ${copied ? 'fa-check' : 'fa-copy'} me-1`} />
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          )}

          <div className="ms-auto text-end small">
            {coupon.status === 'active' && <div>Vence el <strong>{fmtDate(coupon.expiresAt)}</strong></div>}
            {coupon.status === 'used' && coupon.usedAt && <div>Usado el {fmtDate(coupon.usedAt)}</div>}
            {coupon.status === 'expired' && <div>Venció el {fmtDate(coupon.expiresAt)}</div>}
          </div>
        </div>

        {coupon.status === 'active' && MANUAL_TYPES.has(coupon.rewardType) && (
          <div className="small bugie-muted mt-2">
            <i className="fa-solid fa-circle-info me-1" />
            La entrega la coordina el equipo de Bugie.
          </div>
        )}

        {coupon.usedNote && coupon.status !== 'active' && (
          <div className="small bugie-muted mt-2">{coupon.usedNote}</div>
        )}
      </div>
    </div>
  );
}
