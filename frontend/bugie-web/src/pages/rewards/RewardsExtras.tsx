import { useEffect, useState } from 'react';
import { ApiError } from '../../state/api';
import {
  rewardsApi, ActivePromotion, UserRaffle,
  RAFFLE_TYPE_LABEL, fmtDate, daysToDraw,
} from '../../state/rewards';

/* ──────────────────────────────────────────────────────────────────────────
   Promociones y sorteos, para el usuario.

   Las promociones llegan ya redactadas por el backend: «2x puntos» y «Lun a
   Vie, de 12:00 a 14:00». La pantalla no interpreta condiciones, solo las
   muestra, y destaca la que aplica en este momento.

   De los sorteos se muestran también los que vienen, no solo aquellos donde
   ya hay tickets: lo útil es saber qué se viene y qué falta para entrar.
   ────────────────────────────────────────────────────────────────────────── */

export default function RewardsExtras() {
  const [promos,  setPromos]  = useState<ActivePromotion[]>([]);
  const [raffles, setRaffles] = useState<UserRaffle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    Promise.all([rewardsApi.promotions(), rewardsApi.raffles()])
      .then(([p, r]) => { setPromos(p); setRaffles(r); })
      .catch(err => setError(err instanceof ApiError
        ? err.message
        : 'No se pudieron cargar las promociones.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="d-flex justify-content-center py-5"><span className="spinner-border" /></div>;
  }
  if (error) {
    return <div className="alert alert-danger small">{error}</div>;
  }

  const activas = promos.filter(p => p.activeNow);

  return (
    <>
      {activas.length > 0 && (
        <div className="alert alert-success d-flex align-items-start gap-2 mb-3">
          <i className="fa-solid fa-bolt mt-1" />
          <div>
            <strong>
              {activas.length === 1
                ? `${activas[0].name} está activa ahora`
                : `${activas.length} promociones activas ahora`}
            </strong>
            <div className="small">
              {activas.map(p => p.reward).join(' · ')} en tu próximo viaje.
            </div>
          </div>
        </div>
      )}

      <div className="row g-3">
        <div className="col-12 col-lg-6">
          <div className="bugie-card h-100">
            <div className="bugie-card-header">
              <i className="fa-solid fa-bullhorn me-2" />Promociones
            </div>
            <div className="bugie-card-body">
              {promos.length === 0 ? (
                <div className="text-center py-4 bugie-muted small">
                  No hay promociones activas por ahora.
                </div>
              ) : (
                <div className="d-grid gap-2">
                  {promos.map(p => <PromoCard key={p.id} p={p} />)}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-6">
          <div className="bugie-card h-100">
            <div className="bugie-card-header">
              <i className="fa-solid fa-dice me-2" />Sorteos
            </div>
            <div className="bugie-card-body">
              {raffles.length === 0 ? (
                <div className="text-center py-4 bugie-muted small">
                  No hay sorteos abiertos por ahora.
                </div>
              ) : (
                <div className="d-grid gap-2">
                  {raffles.map(r => <RaffleCard key={r.id} r={r} />)}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function PromoCard({ p }: { p: ActivePromotion }) {
  return (
    <div className="p-3" style={{
      borderRadius: 12,
      border: `1px solid ${p.activeNow ? '#34d399' : 'var(--bugie-border)'}`,
      background: p.activeNow ? 'rgba(52,211,153,.08)' : 'transparent',
    }}>
      <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
        <span className="fw-semibold">{p.name}</span>
        <span className="small fw-bold px-2 py-1" style={{
          borderRadius: 999,
          background: 'var(--bugie-primary)22',
          color: 'var(--bugie-primary)',
          fontSize: '.72rem',
        }}>
          {p.reward}
        </span>
        {p.activeNow && (
          <span className="small fw-semibold ms-auto" style={{ color: '#34d399' }}>
            <i className="fa-solid fa-circle me-1" style={{ fontSize: '.4rem', verticalAlign: 'middle' }} />
            Activa ahora
          </span>
        )}
      </div>

      {p.description && <div className="small mb-1">{p.description}</div>}

      <div className="small bugie-muted">
        <i className="fa-regular fa-clock me-1" />{p.when}
        {p.endDate && <> · hasta el {fmtDate(p.endDate)}</>}
      </div>
    </div>
  );
}

function RaffleCard({ r }: { r: UserRaffle }) {
  const sorteado = r.status === 'drawn';

  return (
    <div className="p-3" style={{
      borderRadius: 12,
      border: `1px solid ${r.iWon ? '#f5b400' : 'var(--bugie-border)'}`,
      background: r.iWon ? 'rgba(245,180,0,.1)' : 'transparent',
    }}>
      <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
        <span className="fw-semibold">{r.name}</span>
        <span className="bugie-chip">{RAFFLE_TYPE_LABEL[r.raffleType] ?? r.raffleType}</span>
      </div>

      <div className="small mb-2">{r.prizeDescription}</div>

      {r.iWon ? (
        <div className="small fw-semibold" style={{ color: '#f5b400' }}>
          <i className="fa-solid fa-trophy me-1" />
          ¡Ganaste! {r.myPrizeRank === 1 ? 'Premio principal' : `Puesto ${r.myPrizeRank}`}
          {r.myTicketNumber && <> con el ticket {r.myTicketNumber}</>}
        </div>
      ) : sorteado ? (
        <div className="small bugie-muted">
          Ya se sorteó. Participaste con {r.myTickets} ticket{r.myTickets === 1 ? '' : 's'}.
        </div>
      ) : (
        <div className="d-flex align-items-center gap-2 flex-wrap">
          {r.myTickets > 0 ? (
            <span className="small fw-semibold" style={{ color: '#34d399' }}>
              <i className="fa-solid fa-ticket me-1" />
              Tienes {r.myTickets} ticket{r.myTickets === 1 ? '' : 's'}
            </span>
          ) : r.eligible ? (
            <span className="small bugie-muted">
              <i className="fa-solid fa-ticket me-1" />
              Todavía sin tickets. Se reparten cada madrugada según tu nivel.
            </span>
          ) : (
            <span className="small" style={{ color: '#f59e0b' }}>
              <i className="fa-solid fa-lock me-1" />{r.notEligibleReason}
            </span>
          )}
          <span className="small bugie-muted ms-auto">
            {daysToDraw(r.drawDate)} · {fmtDate(r.drawDate)}
          </span>
        </div>
      )}
    </div>
  );
}
