import { useEffect, useMemo, useState } from 'react';
import { DriverLink } from '../../components/EntityLinks';
import { API, apiFetch, ApiError } from '../../state/api';
import {
  Column, DataTable, FilterBar, Page, Pagination, SectionCard, Select, StatCard, StatGrid, StatusBadge, Tabs, useTabParam,
} from '../../components/ui';
import DriverRankingAnalysis from './DriverRankingAnalysis';
import { fileUrl } from './people/PeopleShared';
import './ops.scss';

/// Fila del ranking devuelto por GET /api/trips/admin/reports/driver-ranking
interface RankingItem {
  driverUserId:          string;
  fullName:              string;
  email:                 string | null;
  phone:                 string | null;
  photoUrl:              string | null;
  avgStars:              number;
  ratingCount:           number;
  tripsCompletedInMonth: number;
  earningsInMonth:       number;
}

interface RankingResponse {
  year: number; month: number; page: number; pageSize: number;
  total: number; totalPages: number; items: RankingItem[];
}

type Row = RankingItem & { place: number };

const MONTHS_ES = [
  'Enero',   'Febrero', 'Marzo',     'Abril',   'Mayo',      'Junio',
  'Julio',   'Agosto',  'Septiembre','Octubre', 'Noviembre', 'Diciembre',
];

const PAGE_SIZE = 25;

/// Puesto con medalla para el top 3.
function Place({ n }: { n: number }) {
  const medal = n <= 3 ? ['Primer', 'Segundo', 'Tercer'][n - 1] + ' puesto' : `Puesto ${n}`;
  return <span className={`ops-rank ${n <= 3 ? `r${n}` : ''}`} title={medal} aria-label={medal}>{n <= 3 ? <i className="fa-solid fa-medal" aria-hidden="true" /> : `#${n}`}</span>;
}

export default function DriverRanking() {
  const [tab] = useTabParam(['mensual', 'analisis']);
  const today = new Date();
  // Filtros: arrancamos en el mes actual.
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);  // 1..12
  const [page,  setPage]  = useState(1);

  const [data,    setData]    = useState<RankingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => { if (tab === 'mensual') load(); /* eslint-disable-next-line */ }, [year, month, page, tab]);

  async function load() {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ year: String(year), month: String(month), page: String(page), pageSize: String(PAGE_SIZE) });
      setData(await apiFetch<RankingResponse>(`${API.trips}/trips/admin/reports/driver-ranking?${params.toString()}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar el ranking.');
    } finally {
      setLoading(false);
    }
  }

  // Al cambiar mes o año se vuelve a la página 1 (en el mismo cambio: una sola carga).
  const changeMonth = (m: number) => { setMonth(m); setPage(1); };
  const changeYear  = (y: number) => {
    setYear(y); setPage(1);
    // En el año actual no hay meses futuros: si estaba en uno, se pasa al mes actual.
    if (y === today.getFullYear() && month > today.getMonth() + 1) setMonth(today.getMonth() + 1);
  };

  // Años seleccionables: desde 2024 hasta este año (sin años futuros).
  const years = useMemo(() => {
    const arr: number[] = [];
    for (let y = today.getFullYear(); y >= 2024; y--) arr.push(y);
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows: Row[] = useMemo(
    () => (data?.items ?? []).map((r, i) => ({ ...r, place: (page - 1) * PAGE_SIZE + i + 1 })),
    [data, page],
  );

  // KPIs: el total y el top son del mes; promedio y ganancias son de la página visible.
  const stats = useMemo(() => {
    const items = data?.items ?? [];
    if (items.length === 0) return { total: data?.total ?? 0, top: 0, avgPage: 0, earnings: 0 };
    return {
      total:    data!.total,
      top:      page === 1 ? items[0].avgStars : 0,
      avgPage:  items.reduce((a, r) => a + r.avgStars, 0) / items.length,
      earnings: items.reduce((a, r) => a + r.earningsInMonth, 0),
    };
  }, [data, page]);

  const columns: Column<Row>[] = [
    {
      key: 'driver', header: 'Conductor', priority: 1, width: '32%',
      render: r => (
        <div className="ops-person">
          <Place n={r.place} />
          {r.photoUrl
            ? <img src={fileUrl('drivers', r.photoUrl) ?? undefined} alt="" className="ops-photo" />
            : <span className="ops-photo-ph" aria-hidden="true"><i className="fa-solid fa-user" /></span>}
          <div><div className="name"><DriverLink userId={r.driverUserId}>{r.fullName}</DriverLink></div></div>
        </div>
      ),
    },
    { key: 'stars', header: 'Promedio', priority: 1, render: r => <StatusBadge tone="warn" icon="fa-star" size="sm">{r.avgStars.toFixed(2)}</StatusBadge> },
    { key: 'ratings', header: 'Calificaciones', priority: 2, align: 'right', render: r => r.ratingCount.toLocaleString('es-PE') },
    { key: 'trips', header: 'Viajes del mes', priority: 1, align: 'right', render: r => r.tripsCompletedInMonth.toLocaleString('es-PE') },
    { key: 'earnings', header: 'Ganancias', priority: 2, align: 'right', render: r => <span className="ops-amount ok">S/ {r.earningsInMonth.toFixed(2)}</span> },
    {
      key: 'contact', header: 'Contacto', priority: 3,
      render: r => <div className="small text-truncate"><div className="text-truncate">{r.email ?? '—'}</div>{r.phone && <div className="ops-muted">{r.phone}</div>}</div>,
    },
  ];

  const period = `${MONTHS_ES[month - 1]} ${year}`;
  const isCurrent = year === today.getFullYear() && month === today.getMonth() + 1;

  return (
    <Page
      title="Ranking de conductores"
      subtitle="Los conductores mejor calificados de cada mes, según su promedio de estrellas."
      helpKey="ranking"
      actions={[{ label: 'Actualizar', icon: 'fa-rotate-right', onClick: load, loading: loading && !!data, hidden: tab !== 'mensual' }]}
    >
      <div data-tour="ranking-tabs">
        <Tabs items={[
          { value: 'mensual',  label: 'Ranking del mes',     icon: 'fa-trophy' },
          { value: 'analisis', label: 'Análisis de ranking', icon: 'fa-chart-line' },
        ]} />
      </div>

      {tab === 'analisis' ? <DriverRankingAnalysis /> : <>
      <StatGrid min={160} tourId="ranking-stats">
        <StatCard label="Con calificación"   value={stats.total.toLocaleString('es-PE')} icon="fa-users"      tone="primary" loading={loading && !data} hint={period} />
        <StatCard label="Promedio del n.º 1" value={stats.top ? stats.top.toFixed(2) : '—'} icon="fa-star"   tone="warn"    loading={loading && !data} hint={page === 1 ? undefined : 'Vuelve a la página 1 para verlo'} />
        <StatCard label="Promedio en esta página"  value={stats.avgPage ? stats.avgPage.toFixed(2) : '—'} icon="fa-chart-line" tone="ok"   loading={loading && !data} />
        <StatCard label="Ganancias de esta página" value={`S/ ${stats.earnings.toFixed(2)}`}             icon="fa-coins"      tone="info" loading={loading && !data}
                  hint={(data?.total ?? 0) > (data?.items.length ?? 0)
                    ? `Suma de los ${data?.items.length ?? 0} conductores que ves, no de todo el mes`
                    : 'Suma de todos los conductores del mes'} />
      </StatGrid>

      <SectionCard flush tourId="ranking-list">
        <div className="p-3" data-tour="ranking-filters">
          <FilterBar
            activeCount={isCurrent ? 0 : 1}
            onClear={() => { setYear(today.getFullYear()); setMonth(today.getMonth() + 1); setPage(1); }}
          >
            <label className="ops-filter"><span>Mes</span>
              <Select
                size="sm"
                value={month}
                onChange={changeMonth}
                searchable={false}
                options={MONTHS_ES.map((name, i) => ({
                  value: i + 1, label: name,
                  disabled: year === today.getFullYear() && i + 1 > today.getMonth() + 1,
                }))}
              />
            </label>
            <label className="ops-filter"><span>Año</span>
              <Select
                size="sm"
                value={year}
                onChange={changeYear}
                options={years.map(y => ({ value: y, label: String(y) }))}
              />

            </label>
          </FilterBar>
        </div>

        {error && <div className="alert alert-danger small mx-3">{error}</div>}

        <DataTable
          columns={columns}
          rows={rows}
          rowKey={r => r.driverUserId}
          loading={loading}
          caption={`Ranking de conductores de ${period}`}
          mobileSubtitle={r => <>{r.ratingCount} calificaciones · S/ {r.earningsInMonth.toFixed(2)}</>}
          empty={{ icon: 'fa-trophy', title: 'Sin calificaciones', text: `Ningún conductor recibió calificaciones en ${period}.` }}
        />
        <div className="px-3">
          <Pagination page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPageChange={setPage} />
        </div>
      </SectionCard>
      </>}
    </Page>
  );
}