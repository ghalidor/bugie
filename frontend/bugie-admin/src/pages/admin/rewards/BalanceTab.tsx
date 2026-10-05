import { useCallback, useEffect, useState } from 'react';
import { rewardsAdminApi, ProgramBalance, fmtPoints } from '../../../state/rewards';
import { EmptyState, SectionCard, Skeleton, StatCard, StatGrid } from '../../../components/ui';
import { errMsg, LoadError } from './common';

/* ──────────────────────────────────────────────────────────────────────────
   Balance del programa.

   El número que importa es una deuda: los puntos disponibles sin canjear son
   algo que alguien va a querer cobrar, y que tú vas a tener que pagar.
   Todo lo demás de esta vista existe para contextualizar ese número.
   ────────────────────────────────────────────────────────────────────────── */

export default function BalanceTab() {
  const [data,    setData]    = useState<ProgramBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    rewardsAdminApi.balance()
      .then(setData)
      .catch(e => setError(errMsg(e, 'No se pudo cargar el balance.')))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  // Una respuesta inesperada no debe dejar el panel en blanco.
  if (!loading && (error || !data || typeof data.pointsAvailable !== 'number')) {
    return <SectionCard><LoadError text={error ?? 'El balance llegó incompleto. Revisa que el servicio de puntos esté respondiendo.'} onRetry={load} /></SectionCard>;
  }

  const bySource = data?.bySource ?? [];
  const byMonth  = data?.byMonth  ?? [];
  const maxMonth = Math.max(...byMonth.map(x => Math.max(x.issued, x.redeemed)), 1);

  return (
    <div className="rw-stack">
      <StatGrid min={170} tourId="rw-sum-stats">
        <StatCard
          label="Puntos por canjear"
          value={fmtPoints(data?.pointsAvailable)}
          icon="fa-scale-balanced"
          tone="warn"
          hint={`Deuda viva: lo que ${fmtPoints(data?.profilesWithPoints)} usuarios pueden canjear hoy`}
          loading={loading}
        />
        <StatCard label="Emitidos en total" value={fmtPoints(data?.pointsIssued)} icon="fa-coins" tone="primary" hint="Todo lo que se repartió" loading={loading} />
        <StatCard label="Canjeados" value={fmtPoints(data?.pointsRedeemed)} icon="fa-gift" tone="ok" hint={`${data?.redemptionRate ?? 0}% de lo emitido`} loading={loading} />
        <StatCard label="Vencidos" value={fmtPoints(data?.pointsExpired)} icon="fa-hourglass-end" tone="neutral" hint="Se perdieron por inactividad" loading={loading} />
        <StatCard label="Cupones vigentes" value={fmtPoints(data?.activeRedemptions)} icon="fa-ticket" tone="info" hint="Pendientes de usar o entregar" to="/admin/puntos/canjes" loading={loading} />
      </StatGrid>

      {!loading && data?.pointsIssued === 0 && (
        <EmptyState compact icon="fa-seedling" title="Todavía no se emitió ningún punto" text="Los números aparecerán cuando se complete el primer viaje." />
      )}

      <div className="bx-split">
        <SectionCard title="De dónde salen los puntos" icon="fa-arrow-trend-up" description="Qué mecánica reparte más." tourId="rw-sum-sources">
          {loading ? <Skeleton count={4} height={14} /> : bySource.length === 0 ? (
            <EmptyState compact title="Sin movimientos todavía" />
          ) : (
            <div className="rw-bars">
              {bySource.map(s => {
                const pct = data!.pointsIssued > 0 ? Math.round(s.points / data!.pointsIssued * 100) : 0;
                return (
                  <div key={s.sourceEvent} className="rw-bar-row">
                    <div className="rw-bar-head">
                      <span className="fw-semibold">{s.label}</span>
                      <span className="bugie-muted small grow">{fmtPoints(s.transactions)} veces</span>
                      <span className="fw-bold">{fmtPoints(s.points)}</span>
                      <span className="bugie-muted small">{pct}%</span>
                    </div>
                    <div className="rw-bar-track" role="presentation"><div className="rw-bar-fill" style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
            </div>
          )}
          <p className="rw-note">Si una mecánica se lleva casi todo, revisa si da más de lo que aporta.</p>
        </SectionCard>

        <SectionCard title="Últimos meses" icon="fa-calendar" description="Emitidos frente a canjeados.">
          {loading ? <Skeleton count={4} height={14} /> : byMonth.length === 0 ? (
            <EmptyState compact title="Sin datos todavía" />
          ) : (
            <>
              <div className="rw-legend mb-2">
                <span><span className="dot" aria-hidden="true" />Emitidos</span>
                <span><span className="dot ok" aria-hidden="true" />Canjeados</span>
              </div>
              <div className="rw-bars">
                {byMonth.map(m => (
                  <div key={m.month} className="rw-bar-row">
                    <div className="rw-bar-head">
                      <span className="fw-semibold grow">{m.month}</span>
                      <span className="bugie-muted small">{fmtPoints(m.issued)} / {fmtPoints(m.redeemed)}</span>
                    </div>
                    <div className="rw-bar-track" title={`Emitidos: ${fmtPoints(m.issued)}`}><div className="rw-bar-fill" style={{ width: `${m.issued / maxMonth * 100}%` }} /></div>
                    <div className="rw-bar-track" title={`Canjeados: ${fmtPoints(m.redeemed)}`}><div className="rw-bar-fill ok" style={{ width: `${m.redeemed / maxMonth * 100}%` }} /></div>
                  </div>
                ))}
              </div>
            </>
          )}
          <p className="rw-note">Si lo emitido crece mucho más rápido que lo canjeado, la deuda se acumula.</p>
        </SectionCard>
      </div>
    </div>
  );
}
