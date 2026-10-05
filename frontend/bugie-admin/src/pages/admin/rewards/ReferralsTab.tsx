import { useCallback, useEffect, useState } from 'react';
import { rewardsAdminApi, ReferralStats, TopReferrer, fmtPoints, fmtDate } from '../../../state/rewards';
import { Column, DataTable, EmptyState, SectionCard, Skeleton, StatCard, StatGrid } from '../../../components/ui';
import { errMsg, LoadError } from './common';

/* ──────────────────────────────────────────────────────────────────────────
   Referidos: ¿el programa vale lo que cuesta? Cuántos usuarios trajo,
   cuántos se quedaron y cuántos puntos se regalaron para conseguirlo.
   ────────────────────────────────────────────────────────────────────────── */

export default function ReferralsTab() {
  const [data,    setData]    = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    rewardsAdminApi.referralStats()
      .then(setData)
      .catch(e => setError(errMsg(e, 'No se pudieron cargar los referidos.')))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  if (!loading && (error || !data)) {
    return <SectionCard><LoadError text={error ?? 'No se pudo cargar.'} onRetry={load} /></SectionCard>;
  }

  const tasaAceptacion = data && data.invitationsSent > 0
    ? Math.round(data.invitationsAccepted / data.invitationsSent * 100) : null;
  const tasaActivacion = data && data.totalReferrals > 0
    ? Math.round(data.qualified / data.totalReferrals * 100) : null;

  const columns: Column<TopReferrer & { rank: number }>[] = [
    { key: 'name', header: 'Usuario', priority: 1, render: r => (
      <div style={{ minWidth: 0 }}>
        <div className="rw-cell-main text-truncate">{r.rank}. {r.fullName ?? 'Usuario sin nombre'}</div>
        <div className="rw-cell-sub text-truncate">{r.email ?? r.userId}</div>
      </div>
    ) },
    { key: 'invited', header: 'Invitados', align: 'right', priority: 1, render: r => fmtPoints(r.invited) },
    { key: 'qualified', header: 'Activos', align: 'right', priority: 1, render: r => fmtPoints(r.qualified) },
    { key: 'pointsEarned', header: 'Puntos ganados', align: 'right', priority: 2, render: r => <span className="rw-plus">+{fmtPoints(r.pointsEarned)}</span> },
    { key: 'lastAt', header: 'Último referido', priority: 3, render: r => fmtDate(r.lastAt) },
  ];

  return (
    <div className="rw-stack">
      <StatGrid min={170}>
        <StatCard label="Usuarios traídos" value={fmtPoints(data?.totalReferrals)} icon="fa-user-plus" tone="primary" hint="Se registraron con un código" loading={loading} />
        <StatCard label="Ya activos" value={fmtPoints(data?.qualified)} icon="fa-user-check" tone="ok" hint="Completaron los viajes de la meta" loading={loading} />
        <StatCard label="Puntos regalados" value={fmtPoints(data?.pointsGiven)} icon="fa-coins" tone="warn" hint="Lo que costó el programa" loading={loading} />
        <StatCard label="Códigos creados" value={fmtPoints(data?.codesIssued)} icon="fa-qrcode" tone="info" hint="Abrieron «Invita y gana»" loading={loading} />
      </StatGrid>

      <div className="bx-split">
        <SectionCard title="Invitaciones por correo" icon="fa-envelope">
          {loading || !data ? <Skeleton count={2} height={16} /> : tasaAceptacion !== null ? (
            <>
              <div className="rw-bar-head mb-2">
                <span className="fw-bold fs-4">{fmtPoints(data.invitationsSent)}</span>
                <span className="bugie-muted small grow">enviadas</span>
                <span className="fw-bold fs-4 rw-plus">{fmtPoints(data.invitationsAccepted)}</span>
                <span className="bugie-muted small">terminaron en registro</span>
              </div>
              <div className="rw-bar-track"><div className="rw-bar-fill ok" style={{ width: `${tasaAceptacion}%` }} /></div>
              <p className="rw-note">{tasaAceptacion}% de las invitaciones terminó en una cuenta nueva.</p>
            </>
          ) : (
            <EmptyState compact title="Aún no hay invitaciones por correo" text="El código también se comparte por fuera; esos casos no se cuentan aquí." />
          )}
        </SectionCard>

        <SectionCard title="Qué tan bien funciona" icon="fa-chart-simple">
          {loading || !data ? <Skeleton count={2} height={16} /> : tasaActivacion !== null ? (
            <>
              <div className="rw-bar-head mb-2">
                <span className="fw-bold fs-4">{tasaActivacion}%</span>
                <span className="bugie-muted small grow">de los traídos completó los viajes de la meta</span>
              </div>
              <div className="rw-bar-track"><div className="rw-bar-fill" style={{ width: `${tasaActivacion}%` }} /></div>
              <p className="rw-note">
                {data.pending} {data.pending === 1 ? 'sigue' : 'siguen'} sin llegar a la meta.
                Costo por usuario traído: <strong>{fmtPoints(Math.round(data.pointsGiven / data.totalReferrals))} puntos</strong>.
              </p>
            </>
          ) : (
            <EmptyState compact title="Todavía nadie se registró con un código" />
          )}
        </SectionCard>
      </div>

      <SectionCard title="Quiénes más invitan" icon="fa-trophy" description="Si alguien tiene muchos invitados y casi ninguno activo, revísalo." flush>
        <DataTable
          columns={columns}
          rows={(data?.topReferrers ?? []).map((r, i) => ({ ...r, rank: i + 1 }))}
          rowKey={r => r.userId}
          loading={loading}
          maxHeight="none"
          empty={{ title: 'Todavía nadie trajo usuarios', text: 'Cuando alguien invite con su código aparecerá aquí.' }}
        />
      </SectionCard>
    </div>
  );
}
