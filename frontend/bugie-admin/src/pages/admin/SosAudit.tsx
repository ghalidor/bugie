import { useEffect, useRef, useState } from 'react';
import { todayPeru } from '../../components/DriverSuspendModal';
import { useTripDetail } from '../../components/useTripDetail';
import { apiFetch, API, ApiError } from '../../state/api';
import {
  Column, DataTable, DateRangeField, DateRangeValue, Pagination, SectionCard, StatCard, StatGrid, StatusBadge, useToast,
} from '../../components/ui';
import { CsvExporter, csvResultMessage, downloadCsv, fetchAllPages, useCsvExporter } from '../../state/csv';
import { SOS_GOAL_FALLBACK_MIN } from '../../hooks/useSosGoal';
import { fmtElapsed, SosAttention } from './livemap/sosAttention';
import { fmtDateTime, roleLabel } from './livemap/types';

/* ──────────────────────────────────────────────────────────────────────────
   Centro SOS > Auditoría: tiempos de respuesta de cada SOS del período.
   GET /api/trips/admin/reports/sos?from&to&page&pageSize (días de Perú).
   Respuesta = lo primero entre "visto" y "atendiendo", menos la activación.
   Si se resolvió sin ninguna marca: hasta la resolución ("atención no registrada").
   ────────────────────────────────────────────────────────────────────────── */

interface AuditItem extends SosAttention {
  userId: string; userRole: string; userName?: string | null;
  resolved: boolean;
  resolutionReason?: string | null;
  /** Minutos hasta resolver. */
  durationMinutes?: number | null;
  meetsGoal?: boolean | null;
}

interface AuditSummary {
  total: number; resolved: number; open: number; responded: number; pending: number;
  avgResponseMin: number | null; medianResponseMin: number | null; maxResponseMin: number | null;
  respondedUnder2MinPct: number | null; unregisteredCount: number; avgResolveMin: number | null;
}

interface AuditPage {
  from: string; to: string; goalMin: number;
  summary: AuditSummary;
  items: AuditItem[]; page: number; pageSize: number; total: number;
}

const PAGE_SIZE = 20;

const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const fmtPct = (n: number | null | undefined) =>
  (n == null ? '—' : `${n.toLocaleString('es-PE', { maximumFractionDigits: 1 })}%`);
const fmtMin = (n: number | null | undefined) =>
  (n == null ? '—' : `${n.toLocaleString('es-PE', { maximumFractionDigits: 1 })} min`);
const csvMin = (n: number | null | undefined) => (n == null ? '' : n.toFixed(1));

/** "Sí" / "No" / "Pendiente" de la meta. */
function GoalBadge({ a }: { a: AuditItem }) {
  if (a.meetsGoal == null) return <StatusBadge tone="neutral" size="sm">Pendiente</StatusBadge>;
  return a.meetsGoal
    ? <StatusBadge tone="ok" size="sm" icon="fa-check">Sí</StatusBadge>
    : <StatusBadge tone="warn" size="sm" icon="fa-triangle-exclamation">No</StatusBadge>;
}

/** Hora y persona de una marca ("—" si no hubo). */
function Mark({ at, by }: { at?: string | null; by?: string | null }) {
  if (!at) return <span className="small bugie-muted">—</span>;
  return (
    <div className="small d-grid" style={{ minWidth: 0 }}>
      <span className="ops-nowrap">{fmtDateTime(at)}</span>
      {by && <span className="bugie-muted text-truncate">{by}</span>}
    </div>
  );
}

export default function SosAudit({ trip, onCsv }: {
  trip: ReturnType<typeof useTripDetail>;
  onCsv?: (e: CsvExporter | null) => void;
}) {
  const toast = useToast();
  const today = todayPeru();
  const [range, setRange] = useState<DateRangeValue>({ from: addDays(today, -29), to: today });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AuditPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);
  // Meta vigente que usó el backend (Configuración → sos_response_min).
  const goal = data?.goalMin ?? SOS_GOAL_FALLBACK_MIN;

  // Rango incompleto: se completa con el mismo día (el backend exige ambos días válidos).
  const from = range.from || range.to || today;
  const to = range.to || range.from || today;
  const query = (p: number, size: number) =>
    new URLSearchParams({ from, to, page: String(p), pageSize: String(size) }).toString();

  function load() {
    const id = ++reqId.current;
    setLoading(true); setError(null);
    apiFetch<AuditPage>(`${API.trips}/trips/admin/reports/sos?${query(page, PAGE_SIZE)}`)
      .then(d => { if (id === reqId.current) setData(d); })
      .catch(err => { if (id === reqId.current) setError(err instanceof ApiError ? err.message : 'No se pudo cargar la auditoría.'); })
      .finally(() => { if (id === reqId.current) setLoading(false); });
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [from, to, page]);

  function changeRange(r: DateRangeValue) {
    setRange(r);
    setPage(1);
  }

  /** CSV con todas las alertas del período. */
  async function exportCsv() {
    try {
      const all = await fetchAllPages((p, size) =>
        apiFetch<AuditPage>(`${API.trips}/trips/admin/reports/sos?${query(p, size)}`));
      downloadCsv(
        ['Activada', 'Quién activó', 'Rol', 'Visto', 'Visto por', 'Atendiendo', 'Atendiendo por',
         'Resuelta', 'Resuelta por', 'Motivo', 'Minutos de respuesta', 'Minutos hasta resolver',
         `Cumple meta (< ${goal} min)`, 'Atención no registrada', 'Id de la alerta', 'Id del viaje'],
        all.items.map(a => [
          fmtDateTime(a.createdAt), a.userName ?? '', roleLabel(a.userRole),
          a.firstSeenAt ? fmtDateTime(a.firstSeenAt) : '', a.firstSeenByName ?? '',
          a.attendingAt ? fmtDateTime(a.attendingAt) : '', a.attendingByName ?? '',
          a.resolvedAt ? fmtDateTime(a.resolvedAt) : '', a.resolvedByName ?? '', a.resolutionReason ?? '',
          csvMin(a.responseMinutes), csvMin(a.durationMinutes),
          a.meetsGoal == null ? 'Pendiente' : a.meetsGoal ? 'Sí' : 'No',
          a.attentionUnregistered ? 'Sí' : 'No', a.id, a.tripId,
        ]),
        `sos-auditoria-${from}_a_${to}.csv`);
      if (all.truncated) toast.warning(csvResultMessage(all, 'alerta', 'alertas'));
      else toast.success(csvResultMessage(all, 'alerta', 'alertas'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo exportar la auditoría.');
    }
  }
  useCsvExporter(onCsv, data?.total ?? 0, exportCsv);

  const s = data?.summary;
  const avgOk = s?.avgResponseMin != null ? s.avgResponseMin < goal : null;
  const pctOk = s?.respondedUnder2MinPct != null ? s.respondedUnder2MinPct >= 100 : null;
  const tone = (ok: boolean | null) => (ok == null ? 'neutral' : ok ? 'ok' : 'warn') as 'neutral' | 'ok' | 'warn';

  const columns: Column<AuditItem>[] = [
    { key: 'created', header: 'Activada', priority: 1, render: a => <span className="small ops-nowrap">{fmtDateTime(a.createdAt)}</span> },
    {
      key: 'who', header: 'Quién activó', priority: 1,
      render: a => <span className="small">{a.userName || roleLabel(a.userRole)} <span className="bugie-muted">· {roleLabel(a.userRole)}</span></span>,
    },
    { key: 'seen', header: 'Visto', priority: 2, render: a => <Mark at={a.firstSeenAt} by={a.firstSeenByName} /> },
    { key: 'attending', header: 'Atendiendo', priority: 2, render: a => <Mark at={a.attendingAt} by={a.attendingByName} /> },
    {
      key: 'resolved', header: 'Resuelta', priority: 2,
      render: a => a.resolved
        ? <div className="small d-grid" style={{ minWidth: 0 }}>
            <Mark at={a.resolvedAt} by={a.resolvedByName} />
            {a.resolutionReason && <span className="bugie-muted text-truncate" title={a.resolutionReason}>{a.resolutionReason}</span>}
          </div>
        : <StatusBadge tone="bad" size="sm" icon="fa-bell">Activa</StatusBadge>,
    },
    {
      key: 'response', header: 'Respuesta', priority: 1, align: 'right',
      render: a => (
        <div className="d-grid text-end small">
          <span className="fw-semibold ops-nowrap">{fmtElapsed(a.responseMinutes)}</span>
          {a.attentionUnregistered && <StatusBadge tone="neutral" size="sm" title="Se resolvió sin marcar visto ni atendiendo: se toma la hora de resolución.">No registrada</StatusBadge>}
        </div>
      ),
    },
    { key: 'toResolve', header: 'Hasta resolver', priority: 3, align: 'right', render: a => <span className="small ops-nowrap">{fmtElapsed(a.durationMinutes)}</span> },
    { key: 'goal', header: `Meta < ${goal} min`, priority: 1, align: 'center', render: a => <GoalBadge a={a} /> },
  ];

  return (
    <div className="d-grid gap-3">
      <SectionCard
        title="Auditoría de respuesta"
        icon="fa-stopwatch"
        description={`Respuesta = primera vez que un admin abrió la alerta o presionó "Atendiendo" (lo que pase primero). Meta: menos de ${goal} min.`}
      >
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <span className="small fw-semibold">Período (fecha de la alerta)</span>
          <DateRangeField value={range} onChange={changeRange} max={today} aria-label="Período de la auditoría" />
        </div>
      </SectionCard>

      {error && (
        <div className="alert alert-warning small mb-0 d-flex align-items-center gap-2 flex-wrap" role="alert">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
          <span className="flex-grow-1">{error}</span>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={load}>Reintentar</button>
        </div>
      )}

      <StatGrid min={180}>
        <StatCard label="Alertas SOS" icon="fa-bell" tone="primary" loading={loading && !data}
                  value={s ? s.total.toLocaleString('es-PE') : '—'}
                  hint={s ? `${s.resolved} resueltas · ${s.open} activas` : undefined} />
        <StatCard label="Respuesta promedio" icon="fa-stopwatch" tone={tone(avgOk)} loading={loading && !data}
                  value={s ? fmtMin(s.avgResponseMin) : '—'}
                  hint={s?.avgResponseMin == null ? 'Sin respuestas en el período'
                    : `Mediana ${fmtMin(s.medianResponseMin)} · máximo ${fmtMin(s.maxResponseMin)}`} />
        <StatCard label={`Respondidas en menos de ${goal} min`} icon="fa-circle-check" tone={tone(pctOk)} loading={loading && !data}
                  value={s ? fmtPct(s.respondedUnder2MinPct) : '—'}
                  hint={s ? `De ${s.responded} con respuesta${s.pending ? ` · ${s.pending} activas sin abrir` : ''}` : undefined} />
        <StatCard label="Atención no registrada" icon="fa-circle-question" tone={s && s.unregisteredCount > 0 ? 'warn' : 'neutral'} loading={loading && !data}
                  value={s ? s.unregisteredCount.toLocaleString('es-PE') : '—'}
                  hint="Resueltas sin marcar visto ni atendiendo (cuenta la hora de resolución)" />
        <StatCard label="Promedio hasta resolver" icon="fa-flag-checkered" tone="info" loading={loading && !data}
                  value={s ? fmtMin(s.avgResolveMin) : '—'} hint="Desde la activación hasta desactivarla" />
      </StatGrid>

      <SectionCard flush title="Alertas del período" icon="fa-list">
        <DataTable
          columns={columns}
          rows={data?.items ?? []}
          rowKey={a => a.id}
          loading={loading}
          caption="Auditoría de alertas SOS"
          mobileTitle={a => <>{a.userName || roleLabel(a.userRole)} · {roleLabel(a.userRole)}</>}
          mobileSubtitle={a => <>{fmtDateTime(a.createdAt)} · respuesta {fmtElapsed(a.responseMinutes)}</>}
          onRowClick={trip.canOpen ? a => trip.open(a.tripId) : undefined}
          actions={a => [{ label: 'Ver detalle del viaje', icon: 'fa-route', onClick: () => trip.open(a.tripId), hidden: !trip.canOpen }]}
          empty={{ title: 'Sin alertas SOS en el período', text: 'Prueba con un rango de fechas más amplio.' }}
        />
        <div className="px-3">
          <Pagination page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPageChange={setPage} />
        </div>
      </SectionCard>
    </div>
  );
}
