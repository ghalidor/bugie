import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { API, ApiError, apiFetch } from '../../state/api';
import { fmtSoles } from '../../state/payouts';
import { downloadCsv } from '../../state/csv';
import DateRangeFilter, { DateRange } from '../../components/DateRangeFilter';
import { todayPeru } from '../../components/DriverSuspendModal';
import {
  Column, DataTable, EmptyState, FilterBar, Masonry, Page, SectionCard, Skeleton, StatCard, StatGrid, StatusBadge,
  useIsMobile, useToast,
} from '../../components/ui';
import './ops.scss';
import './reports.scss';

// ─────────────────────────────────────────────────────────────
// Finanzas › Resumen de gestión: cifras clave de un período.
// Junta 4 reportes que se piden en paralelo (todos con ?from&to, días de Perú):
//   Trips    GET /trips/admin/reports/summary
//   Payments GET /payments/admin/reports/summary
//   Auth     GET /auth/admin/reports/users
//   Drivers  GET /drivers/admin/reports/summary
// Si uno falla, solo sus secciones muestran el aviso; el resto se ve igual.
// ─────────────────────────────────────────────────────────────

interface TripsReport {
  from: string; to: string;
  trips: {
    created: number; completed: number; cancelled: number; inProgressNow: number;
    completedRides: number; completedDeliveries: number;
    cancelledByPassenger: number; cancelledByDriver: number; cancelledByAdmin: number; cancelledBySystem: number;
    /** Porcentaje 0-100. */
    cancellationRate: number | null;
    totalFares: number; avgFare: number | null; totalDiscounts: number;
    avgDistanceKm: number | null; avgTripMin: number | null; avgPickupMin: number | null;
  };
  people: { activePassengers: number; activeDrivers: number };
  sos: {
    total: number; resolved: number; open: number;
    /** Meta de respuesta en minutos (Configuración → sos_response_min) usada en los porcentajes. */
    goalMin?: number;
    avgResolveMin: number | null; medianResolveMin: number | null; maxResolveMin: number | null;
    resolvedUnder2MinPct: number | null;
    /** Tiempo de respuesta: lo primero entre "visto" y "atendiendo" (o la resolución si no se registró). */
    avgResponseMin?: number | null; medianResponseMin?: number | null;
    respondedUnder2MinPct?: number | null;
    /** Resueltas sin marcar visto ni atendiendo. */
    unregisteredCount?: number;
  };
  safety: { deviations: number; alertsNoSignal: number; alertsLongStop: number; alertsDelayed: number };
  daily: { date: string; created: number; completed: number; cancelled: number; fares: number }[];
  /** 24 filas, hora de Perú. */
  hourly: { hour: number; completed: number }[];
}

interface PaymentsReport {
  from: string; to: string;
  totals: { payments: number; amount: number; platformFee: number; driverAmount: number; avgFeeRatePct: number | null };
  byMethod: { method: string; count: number; amount: number; platformFee: number }[];
  daily: { date: string; amount: number; platformFee: number }[];
  commissions: { charged: number | null; paid: number | null; pendingNow: number | null } | null;
}

interface UsersReport {
  from: string; to: string;
  newPassengers: number; newDrivers: number;
  totals: { passengers: number; drivers: number; activeUsers: number };
  daily: { date: string; passengers: number; drivers: number }[];
}

interface DriversReport {
  from: string; to: string;
  approved: number; rejected: number; suspended: number;
  pendingReviewNow: number; approvedTotal: number; onlineNow: number;
}

/* ── Período ───────────────────────────────────────────────── */

const PRESETS = [
  { value: 'hoy',           label: 'Hoy' },
  { value: '7d',            label: 'Últimos 7 días' },
  { value: '30d',           label: 'Últimos 30 días' },
  { value: 'mes',           label: 'Este mes' },
  { value: 'mes-pasado',    label: 'Mes pasado' },
  { value: 'personalizado', label: 'Personalizado' },
];
const DEFAULT_PRESET = '30d';
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Fechas "YYYY-MM-DD" como días de calendario (sin zona horaria). */
const dayToDate = (s: string) => new Date(`${s}T00:00:00Z`);
const dateToDay = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => { const d = dayToDate(s); d.setUTCDate(d.getUTCDate() + n); return dateToDay(d); };

function presetRange(preset: string, today: string): DateRange {
  switch (preset) {
    case 'hoy': return { from: today, to: today };
    case '7d':  return { from: addDays(today, -6), to: today };
    case 'mes': return { from: `${today.slice(0, 7)}-01`, to: today };
    case 'mes-pasado': {
      const lastOfPrev = addDays(`${today.slice(0, 7)}-01`, -1);
      return { from: `${lastOfPrev.slice(0, 7)}-01`, to: lastOfPrev };
    }
    default: return { from: addDays(today, -29), to: today };
  }
}

/** Todos los días del rango (tope de 10 años para no colgar el navegador). */
function daysOf(r: DateRange): string[] {
  const out: string[] = [];
  for (let d = r.from; d <= r.to && out.length < 3660; d = addDays(d, 1)) out.push(d);
  return out;
}

/* ── Formatos ──────────────────────────────────────────────── */

const DASH = '—';
const fmtNum = (n: number | null | undefined) => (n == null ? DASH : n.toLocaleString('es-PE'));
const fmtDec = (n: number | null | undefined, digits = 1) =>
  (n == null ? DASH : n.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: digits }));
const fmtMoney = (n: number | null | undefined) => (n == null ? DASH : fmtSoles(n));
const fmtPct = (n: number | null | undefined) => (n == null ? DASH : `${fmtDec(n)}%`);
const fmtMin = (n: number | null | undefined) => (n == null ? DASH : `${fmtDec(n)} min`);
const shortDay = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const longDay = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
const share = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0);
const compact = new Intl.NumberFormat('es-PE', { notation: 'compact', maximumFractionDigits: 1 });

const METHOD_LABEL: Record<string, string> = { cash: 'Efectivo', yape: 'Yape', plin: 'Plin' };
const METHOD_ICON: Record<string, string> = { cash: 'fa-money-bill-wave', yape: 'fa-mobile-screen', plin: 'fa-mobile-screen' };

/** Meta SOS de respaldo si el backend aún no envía goalMin (acta: menos de 2 min). */
const SOS_GOAL_FALLBACK_MIN = 2;

/* ── Carga de cada reporte (independiente) ─────────────────── */

interface ReportState<T> { data: T | null; loading: boolean; error: string | null; reload: () => void; }

function useReport<T>(url: string, refreshKey: number): ReportState<T> {
  const [data,    setData]    = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [retry,   setRetry]   = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    apiFetch<T>(url)
      .then(d => { if (!cancelled) setData(d); })
      .catch(err => {
        if (cancelled) return;
        setData(null);
        setError(err instanceof ApiError ? err.message : 'No se pudo cargar.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [url, refreshKey, retry]);

  return { data, loading, error, reload: () => setRetry(r => r + 1) };
}

/* ── Piezas de la página ───────────────────────────────────── */

/** Aviso dentro de una sección cuando su reporte falló. */
function SectionError({ what, report }: { what: string; report: ReportState<unknown> }) {
  return (
    <div className="alert alert-warning small d-flex align-items-center gap-2 flex-wrap mb-0" role="alert">
      <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
      <span className="flex-grow-1">No pudimos cargar {what}. {report.error}</span>
      <button type="button" className="btn btn-sm btn-outline-secondary" onClick={report.reload}>Reintentar</button>
    </div>
  );
}

interface Fact { label: string; value: ReactNode; share?: number }

/** Lista "etiqueta … valor", con títulos de grupo opcionales. */
function Facts({ groups }: { groups: { title?: string; items: Fact[] }[] }) {
  return (
    <>
      {groups.map((g, gi) => (
        <div key={gi}>
          {g.title && <p className="rp-facts-title">{g.title}</p>}
          <dl className="rp-facts">
            {g.items.map(f => (
              <div key={f.label}>
                <dt style={{ flex: 1 }}>
                  {f.label}
                  {f.share != null && <span className="rp-share" aria-hidden="true"><span style={{ width: `${Math.min(100, f.share)}%` }} /></span>}
                </dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </>
  );
}

/** Contenido de una tarjeta según el estado de su reporte. */
function Body<T>({ report, what, children }: { report: ReportState<T>; what: string; children: (d: T) => ReactNode }) {
  if (report.loading) return <div className="d-grid gap-2"><Skeleton height={18} count={4} /></div>;
  if (report.error || !report.data) return <SectionError what={what} report={report as ReportState<unknown>} />;
  return <>{children(report.data)}</>;
}

/* ── Gráfico de barras sin librerías ───────────────────────── */

interface ChartSeries { label: string; className: string }
interface ChartPoint { label: string; title: string; values: number[] }

/** Tope "redondo" del eje (1, 2, 5 × 10^n). */
function niceMax(v: number) {
  if (v <= 0) return 1;
  const e = 10 ** Math.floor(Math.log10(v));
  const f = v / e;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e;
}

/// Barras apiladas en CSS: la primera serie va abajo. Tooltip con `title`.
/// Responsive (las barras se reparten el ancho) y con colores del tema.
function BarChart({ points, series, ariaLabel, money, height = 190 }: {
  points: ChartPoint[]; series: ChartSeries[]; ariaLabel: string; money?: boolean; height?: number;
}) {
  const isMobile = useIsMobile();
  const max = niceMax(Math.max(0, ...points.map(p => p.values.reduce((a, b) => a + b, 0))));
  const mid = max / 2;
  const ticks = [max, ...(money || Number.isInteger(mid) ? [mid] : []), 0];
  const fmtTick = (t: number) => (money ? `S/ ${compact.format(t)}` : compact.format(t));
  const step = Math.max(1, Math.ceil(points.length / (isMobile ? 6 : 12)));
  const cols = { gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` };

  return (
    <div className="rp-chart">
      <div className="rp-chart-body" style={{ height }} role="img" aria-label={ariaLabel}>
        <div className="rp-chart-y" aria-hidden="true">
          {ticks.map(t => <span key={t} style={{ top: `${100 - (t / max) * 100}%` }}>{fmtTick(t)}</span>)}
        </div>
        <div className="rp-chart-plot">
          <div className="rp-chart-grid" aria-hidden="true">
            {ticks.filter(t => t > 0).map(t => <span key={t} style={{ top: `${100 - (t / max) * 100}%` }} />)}
          </div>
          <div className="rp-chart-bars" style={cols}>
            {points.map((p, i) => {
              const total = p.values.reduce((a, b) => a + b, 0);
              return (
                <div key={i} className="rp-col" title={p.title}>
                  <div className={`rp-stack ${total > 0 ? 'has-value' : ''}`} style={{ height: `${(total / max) * 100}%` }}>
                    {p.values.map((v, si) => v > 0 && <span key={si} className={series[si].className} style={{ flexGrow: v }} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="rp-chart-x" style={cols} aria-hidden="true">
        {points.map((p, i) => <span key={i}>{i % step === 0 ? p.label : ''}</span>)}
      </div>
      {series.length > 1 && (
        <div className="rp-legend" aria-hidden="true">
          {series.map(s => <span key={s.label}><span className={`sw ${s.className}`} />{s.label}</span>)}
        </div>
      )}
    </div>
  );
}

/** Agrupa los días en tramos: un día por barra, o una semana (lunes a domingo) si el rango es largo. */
interface Bucket { label: string; from: string; to: string; days: string[] }
const WEEKLY_AFTER_DAYS = 62;

function bucketsOf(days: string[]): Bucket[] {
  if (days.length <= WEEKLY_AFTER_DAYS) return days.map(d => ({ label: shortDay(d), from: d, to: d, days: [d] }));
  const out: Bucket[] = [];
  for (const d of days) {
    const isMonday = dayToDate(d).getUTCDay() === 1;
    if (!out.length || isMonday) out.push({ label: shortDay(d), from: d, to: d, days: [] });
    const b = out[out.length - 1];
    b.days.push(d); b.to = d;
  }
  return out;
}

const bucketName = (b: Bucket) => (b.from === b.to ? longDay(b.from) : `Semana del ${longDay(b.from)} al ${longDay(b.to)}`);

/** Suma un campo de una serie diaria dentro de cada tramo. */
function sumBy<T extends { date: string }>(rows: T[] | undefined, pick: (r: T) => number) {
  const byDay = new Map<string, number>();
  for (const r of rows ?? []) byDay.set(r.date.slice(0, 10), (byDay.get(r.date.slice(0, 10)) ?? 0) + (pick(r) ?? 0));
  return (b: Bucket) => b.days.reduce((a, d) => a + (byDay.get(d) ?? 0), 0);
}

/* ── Página ────────────────────────────────────────────────── */

export default function ManagementSummary() {
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const today = todayPeru();

  // El período vive en la URL (?periodo=7d, y ?desde&hasta si es personalizado).
  const rawPreset = sp.get('periodo');
  const preset = rawPreset && PRESETS.some(p => p.value === rawPreset) ? rawPreset : DEFAULT_PRESET;
  const range: DateRange = useMemo(() => {
    if (preset !== 'personalizado') return presetRange(preset, today);
    const d = sp.get('desde') ?? '', h = sp.get('hasta') ?? '';
    const from = ISO_DAY.test(d) ? d : '', to = ISO_DAY.test(h) ? h : '';
    if (!from && !to) return presetRange(DEFAULT_PRESET, today);
    const a = from || to, b = to || from;
    return a <= b ? { from: a, to: b } : { from: b, to: a };
  }, [preset, sp, today]);

  function choosePreset(value: string) {
    setSp(prev => {
      const next = new URLSearchParams(prev);
      if (value === DEFAULT_PRESET) next.delete('periodo'); else next.set('periodo', value);
      if (value === 'personalizado') { next.set('desde', range.from); next.set('hasta', range.to); }
      else { next.delete('desde'); next.delete('hasta'); }
      return next;
    }, { replace: true });
  }

  function setCustom(r: DateRange) {
    setSp(prev => {
      const next = new URLSearchParams(prev);
      next.set('periodo', 'personalizado');
      if (r.from) next.set('desde', r.from); else next.delete('desde');
      if (r.to) next.set('hasta', r.to); else next.delete('hasta');
      return next;
    }, { replace: true });
  }

  // Los 4 reportes se piden a la vez; cada uno con su propio estado.
  const [refreshKey, setRefreshKey] = useState(0);
  const qs = `from=${range.from}&to=${range.to}`;
  const tripsR    = useReport<TripsReport>(`${API.trips}/trips/admin/reports/summary?${qs}`, refreshKey);
  const paymentsR = useReport<PaymentsReport>(`${API.payments}/payments/admin/reports/summary?${qs}`, refreshKey);
  const usersR    = useReport<UsersReport>(`${API.auth}/auth/admin/reports/users?${qs}`, refreshKey);
  const driversR  = useReport<DriversReport>(`${API.drivers}/drivers/admin/reports/summary?${qs}`, refreshKey);
  const anyLoading = tripsR.loading || paymentsR.loading || usersR.loading || driversR.loading;

  const t = tripsR.data, p = paymentsR.data, u = usersR.data, d = driversR.data;
  const days = useMemo(() => daysOf(range), [range]);
  const buckets = useMemo(() => bucketsOf(days), [days]);
  const weekly = days.length > WEEKLY_AFTER_DAYS;
  const periodText = range.from === range.to ? longDay(range.from) : `del ${longDay(range.from)} al ${longDay(range.to)}`;

  /* ── Gráficos ── */
  const tripsChart = useMemo<ChartPoint[]>(() => {
    if (!t) return [];
    const completed = sumBy(t.daily, r => r.completed);
    const cancelled = sumBy(t.daily, r => r.cancelled);
    return buckets.map(b => {
      const c = completed(b), x = cancelled(b);
      return { label: b.label, values: [c, x], title: `${bucketName(b)}\nCompletados: ${fmtNum(c)}\nCancelados: ${fmtNum(x)}` };
    });
  }, [t, buckets]);

  const moneyChart = useMemo<ChartPoint[]>(() => {
    if (!p) return [];
    const amount = sumBy(p.daily, r => r.amount);
    const fee = sumBy(p.daily, r => r.platformFee);
    return buckets.map(b => {
      const a = amount(b), f = fee(b);
      return { label: b.label, values: [f, Math.max(0, a - f)], title: `${bucketName(b)}\nMonto pagado: ${fmtSoles(a)}\nComisión Bugie: ${fmtSoles(f)}` };
    });
  }, [p, buckets]);

  const hourlyChart = useMemo<ChartPoint[]>(() => {
    if (!t) return [];
    const byHour = new Map((t.hourly ?? []).map(h => [h.hour, h.completed]));
    return Array.from({ length: 24 }, (_, h) => {
      const v = byHour.get(h) ?? 0;
      const hh = String(h).padStart(2, '0');
      return { label: `${h}h`, values: [v], title: `${hh}:00 a ${hh}:59\nViajes completados: ${fmtNum(v)}` };
    });
  }, [t]);

  const peakHour = useMemo(() => {
    let best = -1, max = 0;
    hourlyChart.forEach((pt, h) => { if (pt.values[0] > max) { max = pt.values[0]; best = h; } });
    return best;
  }, [hourlyChart]);

  /* ── CSV: una fila por día con las 3 series y la fila TOTAL ── */
  function exportCsv() {
    const tr = sumBy(t?.daily, r => r.created), tc = sumBy(t?.daily, r => r.completed), tx = sumBy(t?.daily, r => r.cancelled);
    const tf = sumBy(t?.daily, r => r.fares);
    const pa = sumBy(p?.daily, r => r.amount), pf = sumBy(p?.daily, r => r.platformFee);
    const un = sumBy(u?.daily, r => r.passengers), ud = sumBy(u?.daily, r => r.drivers);
    // Columnas de un reporte que no cargó: vacías (no en 0, para no confundir).
    const cells = (v: number[]) => [
      t ? v[0] : '', t ? v[1] : '', t ? v[2] : '', t ? v[3].toFixed(2) : '',
      p ? v[4].toFixed(2) : '', p ? v[5].toFixed(2) : '',
      u ? v[6] : '', u ? v[7] : '',
    ];
    const totals = [0, 0, 0, 0, 0, 0, 0, 0];
    const rows = days.map(day => {
      const b: Bucket = { label: day, from: day, to: day, days: [day] };
      const vals = [tr(b), tc(b), tx(b), tf(b), pa(b), pf(b), un(b), ud(b)];
      vals.forEach((v, i) => { totals[i] += v; });
      return [longDay(day), ...cells(vals)];
    });
    downloadCsv(
      ['Fecha', 'Viajes creados', 'Completados', 'Cancelados', 'Monto viajes (S/)', 'Pagos (S/)', 'Comisión (S/)', 'Pasajeros nuevos', 'Conductores nuevos'],
      [...rows, ['TOTAL', ...cells(totals)]],
      `resumen-gestion-${range.from}_a_${range.to}.csv`);
    const missing = [!t && 'viajes', !p && 'pagos', !u && 'usuarios nuevos'].filter(Boolean);
    if (missing.length) toast.warning(`Se exportó sin los datos de ${missing.join(' y ')} (no se pudieron cargar).`);
    else toast.success(`Se exportaron ${days.length.toLocaleString('es-PE')} ${days.length === 1 ? 'día' : 'días'}.`);
  }

  /* ── Medios de pago ── */
  type MethodRow = PaymentsReport['byMethod'][number] & { pct: number };
  const methodRows: MethodRow[] = (p?.byMethod ?? []).map(m => ({ ...m, pct: share(m.amount, p?.totals.amount ?? 0) }));
  const methodCols: Column<MethodRow>[] = [
    {
      key: 'method', header: 'Método', priority: 1,
      render: m => <span className="ops-nowrap"><i className={`fa-solid ${METHOD_ICON[m.method] ?? 'fa-credit-card'} me-1 bugie-muted`} aria-hidden="true" />{METHOD_LABEL[m.method] ?? m.method}</span>,
    },
    { key: 'count', header: 'Pagos', priority: 2, align: 'right', render: m => fmtNum(m.count) },
    { key: 'amount', header: 'Monto', priority: 1, align: 'right', render: m => <span className="ops-amount">{fmtSoles(m.amount)}</span> },
    { key: 'pct', header: '% del total', priority: 1, align: 'right', render: m => `${fmtDec(m.pct)}%` },
    { key: 'fee', header: 'Comisión', priority: 2, align: 'right', render: m => <span className="ops-amount">{fmtSoles(m.platformFee)}</span> },
  ];

  /* ── Tarjeta SOS ── */
  const sos = t?.sos;
  const sosGoal = sos?.goalMin ?? SOS_GOAL_FALLBACK_MIN;
  const sosOk = sos?.avgResponseMin != null ? sos.avgResponseMin < sosGoal : null;

  return (
    <Page
      title="Resumen de gestión"
      subtitle="Las cifras clave de la operación en el período que elijas (días de Perú)."
      icon="fa-chart-line"
      helpKey="reports-summary"
      actions={[
        { label: 'Exportar CSV', icon: 'fa-file-csv', onClick: exportCsv, disabled: anyLoading || (!t && !p && !u) },
        { label: 'Actualizar', icon: 'fa-rotate-right', onClick: () => setRefreshKey(k => k + 1), loading: anyLoading && (!!t || !!p || !!u || !!d) },
      ]}
    >
      <SectionCard tourId="rs-period">
        <FilterBar
          chips={PRESETS}
          chip={preset}
          onChipChange={choosePreset}
          activeCount={preset === 'personalizado' ? 1 : 0}
        >
          {preset === 'personalizado' && <DateRangeFilter value={range} onChange={setCustom} label="Período" />}
        </FilterBar>
        <p className="rp-period mb-0 mt-2">
          <i className="fa-regular fa-calendar me-1" aria-hidden="true" />
          Mostrando <strong>{periodText}</strong> ({days.length.toLocaleString('es-PE')} {days.length === 1 ? 'día' : 'días'})
        </p>
      </SectionCard>

      <StatGrid min={180} tourId="rs-stats" className="rp-kpis">
        <StatCard label="Viajes completados" icon="fa-flag-checkered" tone="ok" loading={tripsR.loading}
                  value={t ? fmtNum(t.trips.completed) : DASH}
                  hint={t ? `${fmtNum(t.trips.created)} creados · ${fmtNum(t.trips.inProgressNow)} en curso ahora` : tripsR.error && 'No se pudo cargar'} />
        <StatCard label="Cancelados" icon="fa-ban" tone="bad" loading={tripsR.loading}
                  value={t ? fmtNum(t.trips.cancelled) : DASH}
                  hint={t ? `Tasa de cancelación: ${fmtPct(t.trips.cancellationRate)}` : tripsR.error && 'No se pudo cargar'} />
        <StatCard label="Monto de viajes" icon="fa-sack-dollar" tone="info" loading={tripsR.loading}
                  value={t ? fmtSoles(t.trips.totalFares) : DASH}
                  hint={t ? `Tarifa promedio: ${fmtMoney(t.trips.avgFare)}` : tripsR.error && 'No se pudo cargar'} />
        <StatCard label="Comisión Bugie" icon="fa-building" tone="primary" loading={paymentsR.loading}
                  value={p ? fmtSoles(p.totals.platformFee) : DASH}
                  hint={p ? `${fmtPct(p.totals.avgFeeRatePct)} promedio de ${fmtSoles(p.totals.amount)} pagados` : paymentsR.error && 'No se pudo cargar'} />
        <StatCard label="Pasajeros activos" icon="fa-user" tone="primary" loading={tripsR.loading}
                  value={t ? fmtNum(t.people.activePassengers) : DASH} hint={tripsR.error ? 'No se pudo cargar' : 'Con al menos un viaje completado'} />
        <StatCard label="Conductores activos" icon="fa-car" tone="info" loading={tripsR.loading}
                  value={t ? fmtNum(t.people.activeDrivers) : DASH} hint={tripsR.error ? 'No se pudo cargar' : 'Con al menos un viaje completado'} />
        <StatCard label="Usuarios nuevos" icon="fa-user-plus" tone="ok" loading={usersR.loading}
                  value={u ? fmtNum(u.newPassengers + u.newDrivers) : DASH}
                  hint={u ? `${fmtNum(u.newPassengers)} pasajeros · ${fmtNum(u.newDrivers)} conductores` : usersR.error && 'No se pudo cargar'} />
        <StatCard label="SOS: tiempo promedio de respuesta" icon="fa-shield-halved" loading={tripsR.loading}
                  tone={sosOk == null ? 'neutral' : sosOk ? 'ok' : 'warn'}
                  value={sos ? fmtMin(sos.avgResponseMin) : DASH}
                  hint={!sos ? (tripsR.error && 'No se pudo cargar') : sos.avgResponseMin == null ? 'Sin alertas respondidas en el período' : (
                    <span className="d-inline-flex flex-wrap align-items-center gap-1">
                      <StatusBadge size="sm" tone={sosOk ? 'ok' : 'warn'} icon={sosOk ? 'fa-check' : 'fa-triangle-exclamation'}>
                        {sosOk ? 'Cumple' : 'No cumple'} la meta &lt; {sosGoal} min
                      </StatusBadge>
                      <span>Desde la alerta hasta que un admin la abre o la atiende · {fmtPct(sos.respondedUnder2MinPct)} en menos de {sosGoal} min</span>
                    </span>
                  )} />
      </StatGrid>

      <div className="rp-charts" data-tour="rs-charts">
        <SectionCard title={weekly ? 'Viajes por semana' : 'Viajes por día'} icon="fa-chart-column"
                     description={weekly ? 'Completados y cancelados, sumados por semana (lunes a domingo).' : 'Completados y cancelados de cada día.'}>
          <Body report={tripsR} what="los viajes">
            {() => tripsChart.every(pt => pt.values[0] + pt.values[1] === 0)
              ? <EmptyState compact title="Sin viajes en el período" text="Prueba con un rango más amplio." />
              : <BarChart points={tripsChart} ariaLabel={`Viajes ${periodText}: ${fmtNum(t?.trips.completed)} completados y ${fmtNum(t?.trips.cancelled)} cancelados.`}
                          series={[{ label: 'Completados', className: 'rp-c-ok' }, { label: 'Cancelados', className: 'rp-c-bad' }]} />}
          </Body>
        </SectionCard>

        <SectionCard title={weekly ? 'Ingresos por semana' : 'Ingresos por día'} icon="fa-coins"
                     description="Monto pagado por los pasajeros; la parte de abajo es la comisión de Bugie.">
          <Body report={paymentsR} what="los pagos">
            {() => moneyChart.every(pt => pt.values[0] + pt.values[1] === 0)
              ? <EmptyState compact title="Sin pagos en el período" text="Prueba con un rango más amplio." />
              : <BarChart points={moneyChart} money ariaLabel={`Ingresos ${periodText}: ${fmtMoney(p?.totals.amount)} pagados, ${fmtMoney(p?.totals.platformFee)} de comisión.`}
                          series={[{ label: 'Comisión Bugie', className: 'rp-c-primary' }, { label: 'Resto del monto (conductor)', className: 'rp-c-info' }]} />}
          </Body>
        </SectionCard>
      </div>

      <div data-tour="rs-details">
        <Masonry minColumnWidth={340}>
          <SectionCard title="Horas pico" icon="fa-clock"
                       description={peakHour >= 0 ? `Viajes completados por hora (hora de Perú). La hora con más viajes: ${String(peakHour).padStart(2, '0')}:00.` : 'Viajes completados por hora (hora de Perú).'}>
            <Body report={tripsR} what="los viajes">
              {() => peakHour < 0
                ? <EmptyState compact title="Sin viajes completados" text="No hay horas que mostrar en este período." />
                : <BarChart points={hourlyChart} height={150} ariaLabel={`Viajes completados por hora. La hora con más viajes es las ${peakHour}:00.`}
                            series={[{ label: 'Completados', className: 'rp-c-primary' }]} />}
            </Body>
          </SectionCard>

          <SectionCard title="Medios de pago" icon="fa-credit-card" flush
                       footer={p && methodRows.length > 0 ? <span className="ops-muted">Total: {fmtNum(p.totals.payments)} pagos · {fmtSoles(p.totals.amount)} · comisión {fmtSoles(p.totals.platformFee)}</span> : undefined}>
            {paymentsR.error ? <div className="p-3"><SectionError what="los pagos" report={paymentsR} /></div> : (
              <div className="rp-methods">
              <DataTable
                columns={methodCols}
                rows={methodRows}
                rowKey={m => m.method}
                loading={paymentsR.loading}
                skeletonRows={3}
                maxHeight="none"
                caption="Pagos por método"
                empty={{ title: 'Sin pagos en el período' }}
              />
              </div>
            )}
          </SectionCard>

          <SectionCard title="Viajes" icon="fa-route">
            <Body report={tripsR} what="los viajes">
              {r => (
                <Facts groups={[
                  { title: 'Completados', items: [
                    { label: 'Viajes de pasajeros', value: fmtNum(r.trips.completedRides), share: share(r.trips.completedRides, r.trips.completed) },
                    { label: 'Envíos', value: fmtNum(r.trips.completedDeliveries), share: share(r.trips.completedDeliveries, r.trips.completed) },
                  ] },
                  { title: 'Cancelados por', items: [
                    { label: 'Pasajero', value: fmtNum(r.trips.cancelledByPassenger), share: share(r.trips.cancelledByPassenger, r.trips.cancelled) },
                    { label: 'Conductor', value: fmtNum(r.trips.cancelledByDriver), share: share(r.trips.cancelledByDriver, r.trips.cancelled) },
                    { label: 'Administrador', value: fmtNum(r.trips.cancelledByAdmin), share: share(r.trips.cancelledByAdmin, r.trips.cancelled) },
                    { label: 'Sistema', value: fmtNum(r.trips.cancelledBySystem), share: share(r.trips.cancelledBySystem, r.trips.cancelled) },
                  ] },
                ]} />
              )}
            </Body>
          </SectionCard>

          <SectionCard title="Promedios por viaje" icon="fa-gauge">
            <Body report={tripsR} what="los viajes">
              {r => (
                <Facts groups={[{ items: [
                  { label: 'Tarifa', value: fmtMoney(r.trips.avgFare) },
                  { label: 'Distancia', value: r.trips.avgDistanceKm == null ? DASH : `${fmtDec(r.trips.avgDistanceKm)} km` },
                  { label: 'Duración del viaje', value: fmtMin(r.trips.avgTripMin) },
                  { label: 'Espera hasta el recojo', value: fmtMin(r.trips.avgPickupMin) },
                  { label: 'Descuentos aplicados (total)', value: fmtSoles(r.trips.totalDiscounts) },
                ] }]} />
              )}
            </Body>
          </SectionCard>

          <SectionCard title="Seguridad" icon="fa-shield-halved">
            <Body report={tripsR} what="los datos de seguridad">
              {r => (
                <Facts groups={[
                  { title: 'Alertas SOS', items: [
                    { label: 'Total', value: fmtNum(r.sos.total) },
                    { label: 'Resueltas', value: fmtNum(r.sos.resolved) },
                    { label: 'Abiertas', value: r.sos.open > 0 ? <StatusBadge tone="bad" size="sm">{fmtNum(r.sos.open)}</StatusBadge> : fmtNum(r.sos.open) },
                  ] },
                  { title: 'Tiempo de respuesta (visto o atendiendo)', items: [
                    { label: 'Promedio', value: fmtMin(r.sos.avgResponseMin) },
                    { label: 'Mediana', value: fmtMin(r.sos.medianResponseMin) },
                    { label: `Respondidas en menos de ${r.sos.goalMin ?? SOS_GOAL_FALLBACK_MIN} min`, value: fmtPct(r.sos.respondedUnder2MinPct) },
                    { label: 'Atención no registrada', value: r.sos.unregisteredCount ? <StatusBadge tone="warn" size="sm">{fmtNum(r.sos.unregisteredCount)}</StatusBadge> : fmtNum(r.sos.unregisteredCount ?? 0) },
                  ] },
                  { title: 'Tiempo hasta resolver', items: [
                    { label: 'Promedio', value: fmtMin(r.sos.avgResolveMin) },
                    { label: 'Mediana', value: fmtMin(r.sos.medianResolveMin) },
                    { label: 'Máximo', value: fmtMin(r.sos.maxResolveMin) },
                    { label: `Resueltas en menos de ${r.sos.goalMin ?? SOS_GOAL_FALLBACK_MIN} min`, value: fmtPct(r.sos.resolvedUnder2MinPct) },
                  ] },
                  { title: 'Alertas de seguimiento', items: [
                    { label: 'Desvíos de ruta', value: fmtNum(r.safety.deviations) },
                    { label: 'Sin señal GPS', value: fmtNum(r.safety.alertsNoSignal) },
                    { label: 'Detenido mucho tiempo', value: fmtNum(r.safety.alertsLongStop) },
                    { label: 'Viaje demorado', value: fmtNum(r.safety.alertsDelayed) },
                  ] },
                ]} />
              )}
            </Body>
          </SectionCard>

          <SectionCard title="Conductores" icon="fa-id-card">
            <Body report={driversR} what="los conductores">
              {r => (
                <Facts groups={[
                  { title: 'En el período', items: [
                    { label: 'Aprobados', value: fmtNum(r.approved) },
                    { label: 'Rechazados', value: fmtNum(r.rejected) },
                    { label: 'Suspendidos', value: fmtNum(r.suspended) },
                  ] },
                  { title: 'Ahora', items: [
                    { label: 'En revisión', value: fmtNum(r.pendingReviewNow) },
                    { label: 'Aprobados en total', value: fmtNum(r.approvedTotal) },
                    { label: 'En línea', value: fmtNum(r.onlineNow) },
                  ] },
                ]} />
              )}
            </Body>
          </SectionCard>

          <SectionCard title="Usuarios" icon="fa-users">
            <Body report={usersR} what="los usuarios">
              {r => (
                <Facts groups={[
                  { title: 'Nuevos en el período', items: [
                    { label: 'Pasajeros', value: fmtNum(r.newPassengers) },
                    { label: 'Conductores', value: fmtNum(r.newDrivers) },
                  ] },
                  { title: 'Totales', items: [
                    { label: 'Pasajeros', value: fmtNum(r.totals.passengers) },
                    { label: 'Conductores', value: fmtNum(r.totals.drivers) },
                    { label: 'Usuarios activos', value: fmtNum(r.totals.activeUsers) },
                  ] },
                ]} />
              )}
            </Body>
          </SectionCard>

          <SectionCard title="Comisiones" icon="fa-scale-unbalanced">
            <Body report={paymentsR} what="las comisiones">
              {r => (
                <Facts groups={[
                  { title: 'En el período', items: [
                    { label: 'Cobradas', value: fmtMoney(r.commissions?.charged) },
                    { label: 'Pagadas por los conductores', value: fmtMoney(r.commissions?.paid) },
                  ] },
                  { title: 'Ahora', items: [
                    { label: 'Deuda actual', value: fmtMoney(r.commissions?.pendingNow) },
                  ] },
                ]} />
              )}
            </Body>
          </SectionCard>
        </Masonry>
      </div>
    </Page>
  );
}
