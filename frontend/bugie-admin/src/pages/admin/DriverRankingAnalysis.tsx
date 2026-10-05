import { useEffect, useMemo, useState } from 'react';
import { API, apiFetch, ApiError } from '../../state/api';
import {
  Column, DataTable, EmptyState, FilterBar, SectionCard, Select, Skeleton, StatCard, StatGrid, StatusBadge,
} from '../../components/ui';
import { fileUrl } from './people/PeopleShared';
import './ops.scss';
import './cobros.scss';

// GET /api/trips/admin/reports/driver-ranking/analysis?months=6&top=5
interface TopItem { driverUserId: string; fullName: string; place: number; avgStars: number; ratingCount: number }
interface Period  { year: number; month: number; ratedDrivers: number; top: TopItem[] }
interface DriverStats {
  driverUserId: string; fullName: string; photoUrl: string | null;
  monthsRanked: number; monthsFirst: number; monthsTop3: number; monthsInTop: number;
  bestPlace: number; worstPlace: number; avgPlace: number; avgStars: number;
  trend: 'up' | 'down' | 'flat'; trendDelta: number;
  places: (number | null)[];
}
interface Analysis { months: number; top: number; periods: Period[]; drivers: DriverStats[] }

const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];
const monthLabel = (p: { year: number; month: number }) => `${MONTHS_SHORT[p.month - 1]} ${String(p.year).slice(2)}`;

// Colores del gráfico: tokens del tema en orden fijo (el color sigue al conductor, no al puesto).
const SERIES = ['var(--bugie-primary)', 'var(--bugie-accent)', 'var(--bugie-info)', 'var(--bugie-primary-2)', 'var(--bugie-accent-2)'];
const CHART_DRIVERS = 5;

const TREND: Record<DriverStats['trend'], { label: string; icon: string; tone: 'ok' | 'bad' | 'neutral' }> = {
  up:   { label: 'Mejora',   icon: 'fa-arrow-trend-up',   tone: 'ok' },
  down: { label: 'Empeora',  icon: 'fa-arrow-trend-down', tone: 'bad' },
  flat: { label: 'Estable',  icon: 'fa-minus',            tone: 'neutral' },
};

const cellClass = (place: number | null, top: number) =>
  place == null ? 'none' : place === 1 ? 'p1' : place <= 3 ? 'p3' : place <= top ? 'ptop' : '';

/// Análisis del ranking en varios meses: quién se mantiene arriba, puesto por mes y evolución del top.
export default function DriverRankingAnalysis() {
  const [months,  setMonths]  = useState(6);
  const [top,     setTop]     = useState(5);
  const [data,    setData]    = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    apiFetch<Analysis>(`${API.trips}/trips/admin/reports/driver-ranking/analysis?months=${months}&top=${top}`)
      .then(d => { if (!cancelled) setData(d); })
      .catch(err => { if (!cancelled) setError(err instanceof ApiError ? err.message : 'No se pudo cargar el análisis.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [months, top]);

  const periods = data?.periods ?? [];
  const drivers = data?.drivers ?? [];
  const range = periods.length ? `${monthLabel(periods[0])} – ${monthLabel(periods[periods.length - 1])}` : '';
  const leader = drivers[0];
  const mostTop3 = useMemo(() => [...drivers].sort((a, b) => b.monthsTop3 - a.monthsTop3)[0], [drivers]);
  const monthsWithData = periods.filter(p => p.ratedDrivers > 0).length;

  const columns: Column<DriverStats>[] = [
    {
      key: 'driver', header: 'Conductor', priority: 1, width: '28%',
      render: d => (
        <div className="ops-person">
          {d.photoUrl
            ? <img src={fileUrl('drivers', d.photoUrl) ?? undefined} alt="" className="ops-photo" />
            : <span className="ops-photo-ph" aria-hidden="true"><i className="fa-solid fa-user" /></span>}
          <div><div className="name">{d.fullName}</div><div className="ops-muted">{d.monthsRanked} de {data?.months} meses con calificaciones</div></div>
        </div>
      ),
    },
    { key: 'first', header: 'Meses como 1.º', priority: 1, align: 'right', render: d => d.monthsFirst > 0 ? <StatusBadge tone="warn" icon="fa-crown" size="sm">{d.monthsFirst}</StatusBadge> : <span className="ops-muted">0</span> },
    { key: 'top3', header: 'Meses en top 3', priority: 1, align: 'right', render: d => <span className="fw-semibold">{d.monthsTop3}</span> },
    { key: 'best', header: 'Mejor / peor', priority: 2, align: 'right', render: d => <span className="ops-nowrap">#{d.bestPlace} / #{d.worstPlace}</span> },
    { key: 'avg', header: 'Puesto promedio', priority: 2, align: 'right', render: d => d.avgPlace.toFixed(1) },
    { key: 'stars', header: 'Estrellas prom.', priority: 3, align: 'right', render: d => d.avgStars.toFixed(2) },
    {
      key: 'trend', header: 'Tendencia', priority: 2,
      render: d => {
        const t = TREND[d.trend];
        return <StatusBadge tone={t.tone} icon={t.icon} size="sm">{t.label}{d.trend !== 'flat' && ` (${d.trendDelta > 0 ? '+' : ''}${d.trendDelta.toFixed(1)})`}</StatusBadge>;
      },
    },
  ];

  return (
    <>
      <SectionCard flush tourId="analysis-filters">
        <div className="p-3">
          <FilterBar
            chips={[{ value: '3', label: 'Últimos 3 meses' }, { value: '6', label: 'Últimos 6 meses' }, { value: '12', label: 'Últimos 12 meses' }]}
            chip={String(months)}
            onChipChange={v => setMonths(Number(v))}
            activeCount={top !== 5 ? 1 : 0}
            onClear={() => setTop(5)}
          >
            <label className="ops-filter"><span>Top por mes</span>
              <Select
                size="sm"
                value={top}
                onChange={setTop}
                options={[3, 5, 10].map(n => ({ value: n, label: `Top ${n}` }))}
              />

            </label>
          </FilterBar>
        </div>
      </SectionCard>

      {error && <div className="alert alert-danger small mt-3">{error}</div>}

      <StatGrid min={170} tourId="analysis-stats">
        <StatCard label="Meses con calificaciones" value={data ? `${monthsWithData} de ${data.months}` : '—'} icon="fa-calendar" tone="primary" loading={loading && !data} hint={range} />
        <StatCard label={`Pasaron por el top ${top}`} value={data ? drivers.length : '—'} icon="fa-users" tone="info" loading={loading && !data} />
        <StatCard label="Más veces 1.º" value={leader && leader.monthsFirst > 0 ? leader.fullName : '—'} icon="fa-crown" tone="warn" loading={loading && !data}
                  hint={leader && leader.monthsFirst > 0 ? `${leader.monthsFirst} mes${leader.monthsFirst === 1 ? '' : 'es'} en el primer puesto` : undefined} />
        <StatCard label="Más constante en el top 3" value={mostTop3 && mostTop3.monthsTop3 > 0 ? mostTop3.fullName : '—'} icon="fa-medal" tone="ok" loading={loading && !data}
                  hint={mostTop3 && mostTop3.monthsTop3 > 0 ? `${mostTop3.monthsTop3} mes${mostTop3.monthsTop3 === 1 ? '' : 'es'} en el top 3` : undefined} />
      </StatGrid>

      <SectionCard className="mt-3" tourId="analysis-constant" title="Los más constantes" icon="fa-ranking-star" description="Ordenados por meses como 1.º, luego meses en el top 3 y puesto promedio." flush>
        <DataTable
          columns={columns}
          rows={drivers}
          rowKey={d => d.driverUserId}
          loading={loading}
          caption={`Conductores más constantes del ranking, ${range}`}
          mobileSubtitle={d => <>1.º {d.monthsFirst} · top 3 {d.monthsTop3} · prom. #{d.avgPlace.toFixed(1)}</>}
          empty={{ icon: 'fa-trophy', title: 'Sin datos en este rango', text: 'Ningún conductor recibió calificaciones en estos meses.' }}
        />
      </SectionCard>

      <SectionCard className="mt-3" tourId="analysis-matrix" title="Puesto por mes" icon="fa-table-cells" description="Puesto de cada conductor en el ranking de cada mes. «—» = sin calificaciones ese mes.">
        {loading && !data ? <Skeleton height={160} radius={10} /> : drivers.length === 0 ? (
          <EmptyState compact title="Sin datos" text="No hay conductores en el top de estos meses." />
        ) : (
          <>
            <div className="rk-matrix-wrap">
              <table className="rk-matrix">
                <caption className="visually-hidden">Puesto de cada conductor por mes</caption>
                <thead>
                  <tr>
                    <th scope="col" className="name">Conductor</th>
                    {periods.map(p => <th key={`${p.year}-${p.month}`} scope="col">{monthLabel(p)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {drivers.map(d => (
                    <tr key={d.driverUserId}>
                      <td className="name">{d.fullName}</td>
                      {d.places.map((pl, i) => (
                        <td key={i} className={`rk-cell ${cellClass(pl, top)}`}
                            title={pl == null ? `${monthLabel(periods[i])}: sin calificaciones` : `${monthLabel(periods[i])}: puesto ${pl}`}>
                          {pl == null ? '—' : `#${pl}`}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rk-legend mt-2">
              <span><span className="sw rk-cell p1" />1.º puesto</span>
              <span><span className="sw rk-cell p3" />2.º y 3.º</span>
              <span><span className="sw rk-cell ptop" />Top {top}</span>
              <span><span className="sw rk-cell" />Fuera del top</span>
            </div>
          </>
        )}
      </SectionCard>

      <SectionCard className="mt-3" title="Evolución del top" icon="fa-chart-line"
                   description={`Puesto mes a mes de los ${Math.min(CHART_DRIVERS, drivers.length) || CHART_DRIVERS} conductores más constantes (arriba = mejor puesto).`}>
        {loading && !data ? <Skeleton height={220} radius={10} /> : drivers.length === 0 ? (
          <EmptyState compact title="Sin datos" text="No hay nada que graficar en este rango." />
        ) : (
          <RankChart periods={periods} drivers={drivers.slice(0, CHART_DRIVERS)} />
        )}
      </SectionCard>
    </>
  );
}

/// Gráfico de líneas en SVG: eje X = meses, eje Y = puesto (1 arriba). Sin librerías.
function RankChart({ periods, drivers }: { periods: Period[]; drivers: DriverStats[] }) {
  const W = 720, H = 260, padL = 36, padR = 16, padT = 14, padB = 30;
  const maxPlace = Math.max(3, ...drivers.flatMap(d => d.places.filter((p): p is number => p != null)));
  const n = periods.length;
  const x = (i: number) => padL + (n <= 1 ? (W - padL - padR) / 2 : (i * (W - padL - padR)) / (n - 1));
  const y = (place: number) => padT + ((place - 1) * (H - padT - padB)) / Math.max(1, maxPlace - 1);
  const ticks = Array.from(new Set([1, Math.ceil(maxPlace / 2), maxPlace])).sort((a, b) => a - b);

  // Tramos continuos (un mes sin calificaciones corta la línea).
  const segments = (places: (number | null)[]) => {
    const out: string[] = [];
    let cur: string[] = [];
    places.forEach((p, i) => {
      if (p == null) { if (cur.length) out.push(cur.join(' ')); cur = []; return; }
      cur.push(`${cur.length ? 'L' : 'M'}${x(i).toFixed(1)},${y(p).toFixed(1)}`);
    });
    if (cur.length) out.push(cur.join(' '));
    return out;
  };

  return (
    <>
      <svg className="rk-chart" viewBox={`0 0 ${W} ${H}`} role="img"
           aria-label={`Puesto por mes de ${drivers.map(d => d.fullName).join(', ')}`}>
        {ticks.map(t => (
          <g key={t}>
            <line className="grid" x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} />
            <text className="axis" x={padL - 8} y={y(t) + 4} textAnchor="end">#{t}</text>
          </g>
        ))}
        {periods.map((p, i) => (
          <text key={i} className="axis" x={x(i)} y={H - 8} textAnchor="middle">{monthLabel(p)}</text>
        ))}
        {drivers.map((d, si) => (
          <g key={d.driverUserId} style={{ color: SERIES[si % SERIES.length] }}>
            {segments(d.places).map((path, k) => <path key={k} className="line" d={path} stroke="currentColor" />)}
            {d.places.map((p, i) => p == null ? null : (
              <g key={i}>
                <circle className="dot" cx={x(i)} cy={y(p)} r={5} fill="currentColor" />
                <circle className="hit" cx={x(i)} cy={y(p)} r={12}>
                  <title>{`${d.fullName} · ${monthLabel(periods[i])}: puesto ${p}`}</title>
                </circle>
              </g>
            ))}
          </g>
        ))}
      </svg>
      <div className="rk-series mt-2" aria-hidden="true">
        {drivers.map((d, si) => (
          <span key={d.driverUserId}><span className="sw" style={{ background: SERIES[si % SERIES.length] }} />{d.fullName}</span>
        ))}
      </div>
    </>
  );
}
