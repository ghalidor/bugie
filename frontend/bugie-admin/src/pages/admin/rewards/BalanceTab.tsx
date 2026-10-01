import { useEffect, useState } from 'react';
import { ApiError } from '../../../state/api';
import { rewardsAdminApi, ProgramBalance, fmtPoints } from '../../../state/rewards';

/* ──────────────────────────────────────────────────────────────────────────
   Balance del programa.

   Se llama Balance y no «estadísticas» porque el número que importa es una
   deuda: los puntos disponibles sin canjear son algo que alguien va a querer
   cobrar, y que tú vas a tener que pagar.

   Todo lo demás de esta pantalla existe para contextualizar ese número.
   ────────────────────────────────────────────────────────────────────────── */

export default function BalanceTab() {
  const [data,    setData]    = useState<ProgramBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    rewardsAdminApi.balance()
      .then(setData)
      .catch(e => setError(e instanceof ApiError ? e.message : 'No se pudo cargar el balance.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="d-flex justify-content-center py-5"><span className="spinner-border" /></div>;
  }
  if (error || !data) {
    return <div className="alert alert-danger small">{error ?? 'No se pudo cargar.'}</div>;
  }

  const sinMovimiento = data.pointsIssued === 0;

  return (
    <>
      {/* ── La deuda, primero y solo ── */}
      <div className="bugie-card mb-3" style={{ overflow: 'hidden' }}>
        <div style={{ height: 3, background: '#f59e0b' }} />
        <div className="bugie-card-body">
          <div className="d-flex flex-wrap align-items-end gap-3">
            <div>
              <div className="small bugie-muted">Puntos por canjear</div>
              <div className="fw-bold" style={{ fontSize: '2.4rem', lineHeight: 1 }}>
                {fmtPoints(data.pointsAvailable)}
              </div>
            </div>
            <div className="small bugie-muted mb-1">
              repartidos entre {fmtPoints(data.profilesWithPoints)} usuarios
            </div>
          </div>

          <div className="small mt-3">
            Esto es lo que tus usuarios pueden canjear hoy. Es una <strong>deuda</strong>:
            cuando la canjeen, el premio lo pagas tú.
          </div>
        </div>
      </div>

      {/* ── Totales ── */}
      <div className="row g-3 mb-3">
        {[
          ['Emitidos en total', fmtPoints(data.pointsIssued),   'Todo lo que se repartió'],
          ['Canjeados',         fmtPoints(data.pointsRedeemed),  `${data.redemptionRate}% de lo emitido`],
          ['Vencidos',          fmtPoints(data.pointsExpired),   'Se perdieron por inactividad'],
          ['Cupones vigentes',  fmtPoints(data.activeRedemptions), 'Pendientes de usar o entregar'],
        ].map(([label, value, help]) => (
          <div className="col-6 col-xl-3" key={label}>
            <div className="bugie-kpi h-100">
              <div className="label">{label}</div>
              <div className="value">{value}</div>
              <div className="small bugie-muted mt-1" style={{ fontSize: '.72rem' }}>{help}</div>
            </div>
          </div>
        ))}
      </div>

      {sinMovimiento && (
        <div className="alert alert-info small">
          Todavía no se emitió ningún punto. Los números aparecerán cuando se
          complete el primer viaje.
        </div>
      )}

      <div className="row g-3">
        {/* ── De dónde salen los puntos ── */}
        <div className="col-12 col-xl-6">
          <div className="bugie-card h-100">
            <div className="bugie-card-header">
              <i className="fa-solid fa-arrow-trend-up me-2" />De dónde salen los puntos
            </div>
            <div className="bugie-card-body">
              {data.bySource.length === 0 ? (
                <div className="text-center py-4 bugie-muted small">Sin movimientos todavía.</div>
              ) : (
                <div className="d-flex flex-column gap-2">
                  {data.bySource.map(s => {
                    const pct = data.pointsIssued > 0
                      ? Math.round(s.points / data.pointsIssued * 100) : 0;
                    return (
                      <div key={s.sourceEvent}>
                        <div className="d-flex align-items-baseline gap-2 small">
                          <span className="fw-semibold">{s.label}</span>
                          <span className="bugie-muted">{s.transactions} veces</span>
                          <span className="ms-auto fw-bold">{fmtPoints(s.points)}</span>
                          <span className="bugie-muted" style={{ width: 38, textAlign: 'right' }}>
                            {pct}%
                          </span>
                        </div>
                        <div className="progress mt-1" style={{ height: 5 }}>
                          <div className="progress-bar" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="small bugie-muted mt-3">
                Si una mecánica se lleva casi todo, conviene revisar si está dando
                más de lo que aporta.
              </div>
            </div>
          </div>
        </div>

        {/* ── Mes a mes ── */}
        <div className="col-12 col-xl-6">
          <div className="bugie-card h-100">
            <div className="bugie-card-header">
              <i className="fa-solid fa-calendar me-2" />Últimos meses
            </div>
            <div className="bugie-card-body">
              {data.byMonth.length === 0 ? (
                <div className="text-center py-4 bugie-muted small">Sin datos todavía.</div>
              ) : (
                <>
                  <div className="d-flex gap-3 small bugie-muted mb-2">
                    <span><i className="fa-solid fa-square me-1" style={{ color: 'var(--bugie-primary)' }} />Emitidos</span>
                    <span><i className="fa-solid fa-square me-1" style={{ color: '#34d399' }} />Canjeados</span>
                  </div>

                  <div className="d-flex flex-column gap-2">
                    {data.byMonth.map(m => {
                      const max = Math.max(...data.byMonth.map(x => Math.max(x.issued, x.redeemed)), 1);
                      return (
                        <div key={m.month}>
                          <div className="d-flex small">
                            <span className="fw-semibold">{m.month}</span>
                            <span className="ms-auto bugie-muted">
                              {fmtPoints(m.issued)} / {fmtPoints(m.redeemed)}
                            </span>
                          </div>
                          <div className="d-flex gap-1 mt-1">
                            <div style={{
                              height: 8, borderRadius: 4,
                              width: `${m.issued / max * 100}%`,
                              background: 'var(--bugie-primary)',
                              minWidth: m.issued > 0 ? 4 : 0,
                            }} />
                          </div>
                          <div className="d-flex gap-1 mt-1">
                            <div style={{
                              height: 8, borderRadius: 4,
                              width: `${m.redeemed / max * 100}%`,
                              background: '#34d399',
                              minWidth: m.redeemed > 0 ? 4 : 0,
                            }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              <div className="small bugie-muted mt-3">
                Si lo emitido crece mucho más rápido que lo canjeado, la deuda se
                acumula y en algún momento llega toda junta.
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
