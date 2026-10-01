import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import { API, apiFetch, ApiError } from '../../state/api';

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
  year:       number;
  month:      number;
  page:       number;
  pageSize:   number;
  total:      number;
  totalPages: number;
  items:      RankingItem[];
}

const MONTHS_ES = [
  'Enero',   'Febrero', 'Marzo',     'Abril',   'Mayo',      'Junio',
  'Julio',   'Agosto',  'Septiembre','Octubre', 'Noviembre', 'Diciembre',
];

const PAGE_SIZE = 25;

export default function DriverRanking() {
  const today = new Date();
  // Filtros: arrancamos en el mes actual.
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);  // 1..12
  const [page,  setPage]  = useState(1);

  const [data,    setData]    = useState<RankingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // Al cambiar mes/año, vuelvo a la página 1
  useEffect(() => { setPage(1); }, [year, month]);
  // Recargo al cambiar filtros o página
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [year, month, page]);

  async function load() {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({
        year:     String(year),
        month:    String(month),
        page:     String(page),
        pageSize: String(PAGE_SIZE),
      });
      const res = await apiFetch<RankingResponse>(
        `${API.trips}/trips/admin/reports/driver-ranking?${params.toString()}`
      );
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar el ranking.');
    } finally {
      setLoading(false);
    }
  }

  // Años seleccionables: desde 2024 hasta este año + 1.
  const years = useMemo(() => {
    const min = 2024;
    const max = today.getFullYear() + 1;
    const arr: number[] = [];
    for (let y = max; y >= min; y--) arr.push(y);
    return arr;
  }, []);

  // Stats agregadas para los KPIs de arriba (calculadas del set de la página + total).
  // Si querés stats globales del mes (no solo de esta página), después agregamos
  // un endpoint /stats. Por ahora alcanza con el promedio del Top1 + total.
  const stats = useMemo(() => {
    if (!data || data.items.length === 0) {
      return { total: data?.total ?? 0, top: 0, avgPage: 0, earnings: 0 };
    }
    const earnings = data.items.reduce((a, r) => a + r.earningsInMonth, 0);
    const avgPage  = data.items.reduce((a, r) => a + r.avgStars, 0) / data.items.length;
    return {
      total:    data.total,
      top:      data.items[0].avgStars,
      avgPage:  avgPage,
      earnings: earnings,
    };
  }, [data]);

  // "Lugar" en el ranking según la página actual.
  function rank(indexInPage: number): number {
    return (page - 1) * PAGE_SIZE + indexInPage + 1;
  }

  // Color del borde izquierdo según el rango (oro / plata / bronce / por defecto)
  function rankBorderColor(r: number): string {
    if (r === 1) return '#facc15';   // oro
    if (r === 2) return '#cbd5e1';   // plata
    if (r === 3) return '#fb923c';   // bronce
    return '#818cf8';                // azul-violeta default
  }

  // Cálculos de paginación visuales (mismo patrón que Passengers)
  const totalPages = data?.totalPages ?? 1;
  const fromIdx = data && data.total > 0 ? (page - 1) * PAGE_SIZE + 1 : 0;
  const toIdx   = data ? Math.min(page * PAGE_SIZE, data.total) : 0;

  return (
    <>
      <PageHeader
        title="Ranking de conductores"
        subtitle="Conductores mejor calificados por mes según promedio de estrellas."
        icon="fa-solid fa-trophy"
      />

      {/* KPIs */}
      <div className="row g-3 mb-4">
        {[
          { label: 'Conductores con calificación', value: stats.total,             color: '#818cf8', icon: 'fa-users',     format: 'int'   },
          { label: 'Promedio del top',              value: stats.top,               color: '#facc15', icon: 'fa-star',      format: 'stars' },
          { label: 'Promedio página',               value: stats.avgPage,           color: '#34d399', icon: 'fa-chart-line',format: 'stars' },
          { label: 'Ganancias página',              value: stats.earnings,          color: '#fb923c', icon: 'fa-coins',     format: 'money' },
        ].map(k => (
          <div className="col-md-3 col-sm-6" key={k.label}>
            <div className="bugie-card p-3">
              <div className="d-flex align-items-center gap-3">
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: k.color + '22',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className={`fa-solid ${k.icon}`} style={{ color: k.color }} />
                </div>
                <div>
                  <div className="small bugie-muted">{k.label}</div>
                  <div className="fw-bold fs-4" style={{ color: k.color, lineHeight: 1 }}>
                    {loading
                      ? '…'
                      : k.format === 'money'
                          ? `S/ ${k.value.toFixed(2)}`
                          : k.format === 'stars'
                              ? k.value.toFixed(2)
                              : k.value.toLocaleString('es-PE')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filtros (mes / año / refresh) — mismo patrón que tabs/buscador */}
      <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
        <div className="d-flex align-items-center gap-2">
          <label className="small bugie-muted text-uppercase mb-0">Mes</label>
          <select className="form-select form-select-sm rounded-pill"
                  style={{ width: 150 }}
                  value={month}
                  onChange={e => setMonth(Number(e.target.value))}>
            {MONTHS_ES.map((name, i) => (
              <option key={i+1} value={i+1}>{name}</option>
            ))}
          </select>
        </div>
        <div className="d-flex align-items-center gap-2">
          <label className="small bugie-muted text-uppercase mb-0">Año</label>
          <select className="form-select form-select-sm rounded-pill"
                  style={{ width: 110 }}
                  value={year}
                  onChange={e => setYear(Number(e.target.value))}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button className="btn btn-sm btn-bugie-outline rounded-pill ms-auto" onClick={load}>
          <i className="fa-solid fa-rotate-right me-1" />Actualizar
        </button>
      </div>

      {/* Error */}
      {error && <div className="alert alert-danger small mb-3">{error}</div>}

      {/* Loading inicial */}
      {loading && !data && (
        <div className="d-flex justify-content-center py-5"><span className="spinner-border" /></div>
      )}

      {/* Sin datos del mes */}
      {!loading && data && data.items.length === 0 ? (
        <div className="bugie-card p-5 text-center">
          <i className="fa-solid fa-trophy fa-2x mb-3 d-block bugie-muted" />
          <div className="fw-semibold mb-1">Sin calificaciones</div>
          <div className="small bugie-muted">
            Ningún conductor recibió calificaciones en {MONTHS_ES[month-1]} {year}.
          </div>
        </div>
      ) : data && data.items.length > 0 ? (
        <>
          {/* Lista de tarjetas (mismo patrón que Passengers / Conductores) */}
          <div className="d-flex flex-column gap-2">
            {data.items.map((r, i) => {
              const place = rank(i);
              const borderColor = rankBorderColor(place);
              return (
                <div key={r.driverUserId}
                     className="bugie-card px-3 py-3"
                     style={{ overflow: 'hidden', position: 'relative' }}>
                  {/* Acento de borde izquierdo según puesto */}
                  <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
                    background: borderColor, borderRadius: '12px 0 0 12px',
                  }} />

                  <div className="d-flex align-items-center gap-3 ps-1 flex-wrap">
                    {/* Número de puesto */}
                    <div style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                                  background: borderColor + '22',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontWeight: 700, color: borderColor, fontSize: '0.95rem' }}>
                      #{place}
                    </div>

                    {/* Avatar + nombre + email */}
                    <div className="flex-grow-1" style={{ minWidth: 0 }}>
                      <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
                        {r.photoUrl
                          ? <img src={r.photoUrl} alt={r.fullName}
                                 style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                          : <div style={{ width: 28, height: 28, borderRadius: '50%',
                                          background: 'rgba(129,140,248,0.2)',
                                          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <i className="fa-solid fa-user" style={{ color: '#818cf8', fontSize: '0.75rem' }} />
                            </div>
                        }
                        <span className="fw-semibold">{r.fullName}</span>
                        <span className="badge rounded-pill"
                              style={{ background: 'rgba(250,204,21,0.2)', color: '#facc15', fontSize: '0.72rem' }}>
                          <i className="fa-solid fa-star me-1" style={{ fontSize: '0.65rem' }} />
                          {r.avgStars.toFixed(2)}
                        </span>
                      </div>
                      <div className="small bugie-muted">
                        {r.email ?? '—'}{r.phone ? ` · ${r.phone}` : ''}
                      </div>
                    </div>

                    {/* Métricas a la derecha (calificaciones / viajes / ganancias) */}
                    <div className="d-flex gap-3 flex-shrink-0 flex-wrap text-end">
                      <div>
                        <div className="small bugie-muted">Calificaciones</div>
                        <div className="fw-bold">{r.ratingCount}</div>
                      </div>
                      <div>
                        <div className="small bugie-muted">Viajes del mes</div>
                        <div className="fw-bold">{r.tripsCompletedInMonth}</div>
                      </div>
                      <div>
                        <div className="small bugie-muted">Ganancias</div>
                        <div className="fw-bold" style={{ color: '#34d399' }}>
                          S/ {r.earningsInMonth.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Paginación — mismo patrón visual que Passengers */}
          <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mt-3">
            <div className="small bugie-muted">
              Mostrando <strong>{fromIdx}–{toIdx}</strong> de <strong>{data.total.toLocaleString('es-PE')}</strong>
            </div>
            <div className="d-flex align-items-center gap-2">
              <button className="btn btn-sm btn-bugie-outline rounded-pill"
                onClick={() => setPage(1)} disabled={page === 1}>
                <i className="fa-solid fa-angles-left" />
              </button>
              <button className="btn btn-sm btn-bugie-outline rounded-pill"
                onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                <i className="fa-solid fa-chevron-left" />
              </button>
              <span className="small fw-semibold mx-2">
                Página {page} de {totalPages}
              </span>
              <button className="btn btn-sm btn-bugie-outline rounded-pill"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                <i className="fa-solid fa-chevron-right" />
              </button>
              <button className="btn btn-sm btn-bugie-outline rounded-pill"
                onClick={() => setPage(totalPages)} disabled={page >= totalPages}>
                <i className="fa-solid fa-angles-right" />
              </button>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}