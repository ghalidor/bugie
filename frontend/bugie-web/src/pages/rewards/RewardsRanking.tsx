import { useEffect, useState } from 'react';
import { ApiError } from '../../state/api';
import { rewardsApi, FriendsRanking, fmtPoints, LEVEL_COLOR } from '../../state/rewards';

/* ──────────────────────────────────────────────────────────────────────────
   Ranking entre amigos.

   Tus amigos son quienes invitaste y quien te invitó. Se mide por puntos del
   MES: si fuera histórico, quien lleva un año estaría siempre primero y el
   ranking dejaría de motivar.

   Los nombres llegan abreviados desde el backend («Carlos R.»): el ranking lo
   ven otras personas, y quien compartió un código no aceptó mostrar su nombre
   completo.
   ────────────────────────────────────────────────────────────────────────── */

export default function RewardsRanking() {
  const [data,    setData]    = useState<FriendsRanking | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    rewardsApi.ranking()
      .then(setData)
      .catch(() => setData(null))
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

  // Solo él mismo: no hay con quién competir todavía.
  if (data.entries.length <= 1) {
    return (
      <div className="bugie-card">
        <div className="bugie-card-header">
          <i className="fa-solid fa-ranking-star me-2" />Ranking entre amigos
        </div>
        <div className="bugie-card-body text-center py-4">
          <i className="fa-solid fa-user-group fa-2x d-block mb-3" style={{ opacity: .3 }} />
          <div className="small bugie-muted">
            Invita a alguien con tu código y aparecerán acá, compitiendo contigo
            por los puntos del mes.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bugie-card">
      <div className="bugie-card-header d-flex align-items-center">
        <i className="fa-solid fa-ranking-star me-2" />
        <span>Ranking entre amigos</span>
        <span className="small bugie-muted ms-auto">{data.monthLabel}</span>
      </div>
      <div className="bugie-card-body">
        <div className="d-grid gap-2">
          {data.entries.map(e => {
            const color = LEVEL_COLOR[e.level] ?? '#94a3b8';
            return (
              <div key={e.userId} className="d-flex align-items-center gap-3 p-2"
                   style={{
                     borderRadius: 10,
                     background: e.isMe ? 'var(--bugie-primary)14' : 'transparent',
                     border: `1px solid ${e.isMe ? 'var(--bugie-primary)' : 'transparent'}`,
                   }}>
                <span className="fw-bold text-center" style={{ width: 28, color: e.position <= 3 ? '#f5b400' : 'var(--bugie-muted)' }}>
                  {e.position === 1 ? <i className="fa-solid fa-crown" /> : e.position}
                </span>

                <i className="fa-solid fa-medal" style={{ color, width: 16 }} />

                <div className="flex-grow-1" style={{ minWidth: 0 }}>
                  <div className="small fw-semibold text-truncate">{e.fullName}</div>
                  <div className="small bugie-muted">{e.relation}</div>
                </div>

                <div className="text-end">
                  <div className="fw-bold">{fmtPoints(e.pointsThisMonth)}</div>
                  <div className="small bugie-muted">
                    {e.trips} {e.trips === 1 ? 'viaje' : 'viajes'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="small bugie-muted mt-3">
          Se cuentan los puntos ganados este mes. El primero de cada mes vuelve a empezar.
        </div>
      </div>
    </div>
  );
}
