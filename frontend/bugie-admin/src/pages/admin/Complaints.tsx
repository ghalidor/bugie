import { useEffect, useRef, useState, type ReactNode } from 'react';
import { API, apiFetch, ApiError } from '../../state/api';
import { PERMS, usePermissions } from '../../state/permissions';
import {
  DataTable, Drawer, EmptyState, Field, FilterBar, Page, Pagination, SectionCard, Select, Skeleton,
  StatCard, StatGrid, StatusBadge, useConfirm, useDebouncedValue, useToast,
  type Column, type Tone,
} from '../../components/ui';
import TripDetailModal, { type TripDetail } from '../../components/TripDetailModal';
import DateRangeFilter, { appendRange, EMPTY_RANGE, rangeCount, type DateRange } from '../../components/DateRangeFilter';
import { PassengerLink } from '../../components/EntityLinks';
import { csvDateTag, csvResultMessage, downloadCsv, fetchAllPages } from '../../state/csv';
import './ops.scss';
import './siteAdmin.scss';

/**
 * Libro de Reclamaciones (formato Indecopi). Las hojas llegan desde la web
 * pública (/libro-reclamaciones). Hay que responder en el plazo configurado
 * (días hábiles: sin fines de semana ni feriados): la respuesta se envía por
 * correo al consumidor y la hoja queda cerrada.
 * Las que llegan con el campo trampa lleno se marcan "Posible bot": no
 * cuentan en los pendientes y se descartan o se marcan como válidas.
 * Cualquier hoja pendiente se puede anular. Anular y descartar piden motivo
 * (queda guardado con quién y cuándo), no envían correo y no borran nada.
 * Cada hoja guarda su plazo (responseDays) del día en que se registró.
 * Toda acción pide confirmación antes de ejecutarse.
 * API: /api/landing/admin/complaints (listado, stats, detalle, reply, discard, void, valid).
 */

interface Complaint {
  id: string; code: string; createdAt: string;
  consumerName: string; consumerAddress: string; docType: string; docNumber: string;
  phone: string; email: string; guardianName: string | null; userId: string | null;
  goodType: string; claimedAmount: number | null; goodDescription: string | null;
  complaintType: 'reclamo' | 'queja'; tripId: string | null; tripCode: string | null; reference: string | null;
  detail: string; request: string;
  status: 'pendiente' | 'respondida' | 'descartada' | 'anulada';
  dueDate: string; responseDays: number; daysLeft: number | null; isOverdue: boolean;
  response: string | null; respondedAt: string | null; respondedByName: string | null;
  responseEmailSent: boolean; confirmationEmailSent: boolean;
  isBot: boolean; botReason: string | null;
  /** Anulada o descartada: motivo interno, quién y cuándo. */
  closedReason: string | null; closedAt: string | null; closedByName: string | null;
}
interface Paged { items: Complaint[]; page: number; pageSize: number; total: number; }
interface Stats {
  pending: number; dueSoon: number; overdue: number; answered: number;
  bots: number; discarded: number; voided: number;
  /** Plazo de respuesta y umbral "por vencer" (días hábiles, de Configuración). */
  responseDays: number; dueSoonDays: number;
}

type StatusFilter = 'all' | 'pendiente' | 'por_vencer' | 'vencida' | 'respondida' | 'posible_bot' | 'descartada' | 'anulada';
const DEFAULT_DUE_SOON_DAYS = 3;
/** Motivo de anular o descartar (igual que el backend). */
const REASON_MIN = 10;
const REASON_MAX = 500;
const PAGE_SIZE = 20;

const daysText = (n: number) => `${n} ${n === 1 ? 'día hábil' : 'días hábiles'}`;

const TYPE_OPTIONS = [
  { value: '', label: 'Reclamos y quejas' },
  { value: 'reclamo', label: 'Solo reclamos' },
  { value: 'queja', label: 'Solo quejas' },
];

/** "03/10/2026" de "2026-10-03..." (hora de Perú sin zona). */
function fmtDay(iso?: string | null) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}
function fmtDateTime(iso?: string | null) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : fmtDay(iso);
}

/** Plazo restante con color: verde con holgura, ámbar por vencer, rojo vencida. */
function DueBadge({ c, soonDays }: { c: Complaint; soonDays: number }) {
  if (c.status === 'anulada') return <StatusBadge tone="neutral" icon="fa-circle-xmark" size="sm">Anulada</StatusBadge>;
  if (c.status === 'descartada') return <StatusBadge tone="neutral" icon="fa-ban" size="sm">Descartada</StatusBadge>;
  if (c.isBot) return <StatusBadge tone="bad" icon="fa-robot" size="sm">Posible bot</StatusBadge>;
  if (c.status === 'respondida') return <StatusBadge tone="ok" icon="fa-check" size="sm">Respondida</StatusBadge>;
  const d = c.daysLeft ?? 0;
  let tone: Tone = 'ok';
  let text = `${d} días hábiles`;
  if (c.isOverdue) { tone = 'bad'; text = `Vencida (${Math.abs(d)} ${Math.abs(d) === 1 ? 'día hábil' : 'días hábiles'})`; }
  else if (d === 0) { tone = 'bad'; text = 'Vence hoy'; }
  else if (d <= soonDays) { tone = 'warn'; text = d === 1 ? '1 día hábil' : `${d} días hábiles`; }
  return <StatusBadge tone={tone} icon={c.isOverdue ? 'fa-triangle-exclamation' : 'fa-clock'} size="sm">{text}</StatusBadge>;
}

const STATUS_LABEL: Record<Complaint['status'], string> = {
  pendiente: 'Pendiente', respondida: 'Respondida', descartada: 'Descartada', anulada: 'Anulada',
};

const TypeBadge = ({ type }: { type: string }) => type === 'queja'
  ? <StatusBadge tone="info" size="sm">Queja</StatusBadge>
  : <StatusBadge tone="primary" size="sm">Reclamo</StatusBadge>;

export default function Complaints() {
  const { has, loading: permsLoading } = usePermissions();
  const toast = useToast();

  const [status, setStatus] = useState<StatusFilter>('pendiente');
  const [type, setType]     = useState('');
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search);
  const [page, setPage]     = useState(1);
  const [range, setRange]   = useState<DateRange>(EMPTY_RANGE);
  const [exporting, setExporting] = useState(false);

  const [data, setData]       = useState<Paged | null>(null);
  const [stats, setStats]     = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [openId, setOpenId]   = useState<string | null>(null);

  const allowed = has(PERMS.ViewComplaints);
  const soonDays = stats?.dueSoonDays ?? DEFAULT_DUE_SOON_DAYS;

  // Cambiar un filtro vuelve a la página 1 (sin pedir dos veces); reqId descarta respuestas viejas.
  const filterKey = `${status}|${type}|${q.trim()}|${range.from}|${range.to}`;
  const lastKey = useRef(filterKey);
  const reqId = useRef(0);
  useEffect(() => {
    if (!allowed) return;
    if (lastKey.current !== filterKey) {
      lastKey.current = filterKey;
      if (page !== 1) { setPage(1); return; }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, page, allowed]);

  /** Filtros del listado (sin página): los usa también el CSV. */
  function filterParams() {
    const params = new URLSearchParams();
    if (status !== 'all') params.set('status', status);
    if (type) params.set('type', type);
    if (q.trim()) params.set('search', q.trim());
    appendRange(params, range);
    return params;
  }

  async function load() {
    const id = ++reqId.current;
    setLoading(true); setLoadErr(null);
    try {
      const params = filterParams();
      params.set('page', String(page));
      params.set('pageSize', String(PAGE_SIZE));
      const [list, st] = await Promise.all([
        apiFetch<Paged>(`${API.landing}/landing/admin/complaints?${params}`),
        apiFetch<Stats>(`${API.landing}/landing/admin/complaints/stats`),
      ]);
      if (id !== reqId.current) return;
      setData(list); setStats(st);
    } catch (err) {
      if (id === reqId.current) setLoadErr(err instanceof ApiError ? err.message : 'No se pudieron cargar las reclamaciones.');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }

  /** CSV con las columnas que suele pedir Indecopi (respeta los filtros, incluido el rango de fechas). */
  async function exportCsv() {
    setExporting(true);
    try {
      const base = filterParams();
      const all = await fetchAllPages(async (p, size) => {
        const params = new URLSearchParams(base);
        params.set('page', String(p));
        params.set('pageSize', String(size));
        return apiFetch<Paged>(`${API.landing}/landing/admin/complaints?${params}`);
      });
      downloadCsv(
        ['N° de hoja', 'Fecha de registro', 'Consumidor', 'Tipo de documento', 'N° de documento', 'Domicilio', 'Teléfono',
         'Correo', 'Padre/madre o apoderado', 'Bien contratado', 'Monto reclamado (S/)', 'Descripción del bien', 'Tipo',
         'Viaje o envío', 'Detalle', 'Pedido', 'Estado', 'Fecha límite', 'Fecha de respuesta', 'Respondido por', 'Respuesta'],
        all.items.map(c => [
          c.code, fmtDateTime(c.createdAt), c.consumerName, c.docType, c.docNumber, c.consumerAddress, c.phone,
          c.email, c.guardianName ?? '', c.goodType, c.claimedAmount != null ? c.claimedAmount.toFixed(2) : '', c.goodDescription ?? '',
          c.complaintType === 'queja' ? 'Queja' : 'Reclamo',
          c.tripCode ?? '', c.detail, c.request,
          c.isBot && c.status === 'pendiente' ? 'Posible bot' : STATUS_LABEL[c.status] ?? c.status,
          fmtDay(c.dueDate), c.respondedAt ? fmtDateTime(c.respondedAt) : '', c.respondedByName ?? '', c.response ?? '',
        ]),
        `libro-reclamaciones-${csvDateTag()}.csv`);
      if (all.truncated) toast.warning(csvResultMessage(all, 'hoja', 'hojas'));
      else toast.success(csvResultMessage(all, 'hoja', 'hojas'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo exportar el libro.');
    } finally { setExporting(false); }
  }

  if (!permsLoading && !allowed) {
    return (
      <Page title="Reclamaciones" icon="fa-book">
        <SectionCard>
          <EmptyState icon="fa-lock" title="Sin acceso" text="No tienes permiso para ver el Libro de Reclamaciones." />
        </SectionCard>
      </Page>
    );
  }

  const columns: Column<Complaint>[] = [
    { key: 'code', header: 'N° de hoja', priority: 1, render: c => (
      <span className="d-grid">
        <span className="fw-semibold">{c.code}</span>
        <span className="small bugie-muted">{fmtDay(c.createdAt)}</span>
      </span>
    ) },
    { key: 'consumer', header: 'Consumidor', priority: 1, render: c => (
      <span className="d-grid" style={{ minWidth: 0 }}>
        <span className="text-truncate">{c.userId
          ? <PassengerLink userId={c.userId}>{c.consumerName}</PassengerLink>
          : c.consumerName}</span>
        <span className="small bugie-muted text-truncate">{c.email}</span>
      </span>
    ) },
    { key: 'type', header: 'Tipo', priority: 2, render: c => <TypeBadge type={c.complaintType} /> },
    { key: 'trip', header: 'Viaje o envío', priority: 3, render: c => c.tripCode ?? <span className="bugie-muted">—</span> },
    { key: 'due', header: 'Plazo', priority: 1, render: c => (
      <span className="d-grid gap-1">
        <DueBadge c={c} soonDays={soonDays} />
        {c.status === 'pendiente' && !c.isBot && <span className="small bugie-muted">Límite: {fmtDay(c.dueDate)}</span>}
      </span>
    ) },
  ];

  const s = stats;
  return (
    <Page
      title="Libro de Reclamaciones"
      subtitle={s
        ? `Hojas de reclamación de la web. Las nuevas se responden en máximo ${daysText(s.responseDays)}.`
        : 'Hojas de reclamación de la web.'}
      icon="fa-book"
      helpKey="complaints"
      actions={[
        { label: 'Exportar CSV', icon: 'fa-file-csv', variant: 'secondary', onClick: exportCsv, loading: exporting, disabled: !data?.total },
        { label: 'Actualizar', icon: 'fa-rotate-right', variant: 'secondary', onClick: load, loading },
      ]}
    >
      <StatGrid tourId="complaints-stats">
        <StatCard label="Pendientes" value={s?.pending ?? 0} icon="fa-inbox" tone="primary" loading={!s}
                  hint="Sin responder" onClick={() => setStatus('pendiente')} />
        <StatCard label="Por vencer" value={s?.dueSoon ?? 0} icon="fa-hourglass-half" tone="warn" loading={!s}
                  hint={`${soonDays} ${soonDays === 1 ? 'día hábil' : 'días hábiles'} o menos`} pulse={(s?.dueSoon ?? 0) > 0} onClick={() => setStatus('por_vencer')} />
        <StatCard label="Vencidas" value={s?.overdue ?? 0} icon="fa-triangle-exclamation" tone="bad" loading={!s}
                  hint="Fuera del plazo legal" pulse={(s?.overdue ?? 0) > 0} onClick={() => setStatus('vencida')} />
        <StatCard label="Respondidas" value={s?.answered ?? 0} icon="fa-circle-check" tone="ok" loading={!s}
                  onClick={() => setStatus('respondida')} />
      </StatGrid>

      <SectionCard flush tourId="complaints-list">
        <div className="p-3" data-tour="complaints-filters">
          <FilterBar
            search={search} onSearchChange={setSearch}
            searchPlaceholder="Buscar por N°, nombre, correo, documento o viaje…"
            chips={[
              { value: 'all', label: 'Todas' },
              { value: 'pendiente', label: 'Pendientes', count: s?.pending },
              { value: 'por_vencer', label: 'Por vencer', count: s?.dueSoon },
              { value: 'vencida', label: 'Vencidas', count: s?.overdue },
              { value: 'respondida', label: 'Respondidas', count: s?.answered },
              { value: 'posible_bot', label: 'Posible bot', count: s?.bots },
              { value: 'descartada', label: 'Descartadas', count: s?.discarded },
              { value: 'anulada', label: 'Anuladas', count: s?.voided },
            ]}
            chip={status} onChipChange={v => setStatus(v as StatusFilter)}
            activeCount={(type ? 1 : 0) + rangeCount(range) + (search.trim() ? 1 : 0)}
            onClear={() => { setType(''); setSearch(''); setRange(EMPTY_RANGE); }}
          >
            <Select value={type} onChange={setType} options={TYPE_OPTIONS} aria-label="Tipo" />
            <DateRangeFilter value={range} onChange={setRange} label="Fecha de registro" />
          </FilterBar>
        </div>

        {loadErr && (
          <div className="px-3 pb-3">
            <div className="sa-note bx-tone-bad" role="alert">
              <i className="fa-solid fa-circle-exclamation" aria-hidden="true" /><span>{loadErr}</span>
            </div>
          </div>
        )}

        <DataTable
          columns={columns}
          rows={data?.items ?? []}
          rowKey={c => c.id}
          loading={loading && !data}
          onRowClick={c => setOpenId(c.id)}
          mobileTitle={c => c.code}
          mobileSubtitle={c => c.consumerName}
          empty={{
            icon: 'fa-book-open',
            variant: status === 'pendiente' || status === 'vencida' || status === 'posible_bot' ? 'done' : 'empty',
            title: status === 'pendiente' ? '¡Todo respondido!' : 'Sin reclamaciones',
            text: status === 'pendiente' ? 'No hay hojas pendientes de respuesta.' : 'No hay hojas en esta vista.',
          }}
          actions={c => [{
            label: c.isBot && c.status === 'pendiente' ? 'Revisar' : c.status === 'pendiente' ? 'Ver y responder' : 'Ver hoja',
            icon: 'fa-file-lines', onClick: () => setOpenId(c.id),
          }]}
        />

        <div className="px-3">
          <Pagination page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPageChange={setPage} />
        </div>
      </SectionCard>

      <ComplaintDrawer id={openId} soonDays={soonDays} onClose={() => setOpenId(null)} onChanged={load} />
    </Page>
  );
}

// ─── Detalle + respuesta ────────────────────────────────────────────────────
function ComplaintDrawer({ id, soonDays, onClose, onChanged }: {
  id: string | null; soonDays: number; onClose: () => void; onChanged: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();

  const [c, setC]             = useState<Complaint | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [response, setResponse] = useState('');
  const [sending, setSending] = useState(false);
  const [trip, setTrip]       = useState<TripDetail | null>(null);
  const [tripLoading, setTripLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    setC(null); setError(null); setResponse('');
    apiFetch<Complaint>(`${API.landing}/landing/admin/complaints/${id}`)
      .then(setC)
      .catch(err => setError(err instanceof ApiError ? err.message : 'No se pudo cargar la reclamación.'));
  }, [id]);

  async function openTrip() {
    if (!c?.tripId) return;
    setTripLoading(true);
    try {
      setTrip(await apiFetch<TripDetail>(`${API.trips}/trips/${c.tripId}`));
    } catch (err) {
      toast.error(err instanceof ApiError && err.status === 404
        ? 'No existe un viaje con ese código.'
        : err instanceof ApiError ? err.message : 'No se pudo cargar el viaje.');
    } finally {
      setTripLoading(false);
    }
  }

  async function send() {
    if (!c) return;
    if (!response.trim()) { setError('Escribe la respuesta.'); return; }
    const ok = await confirm({
      title: '¿Enviar la respuesta?',
      message: <>Se enviará por correo a <strong>{c.email}</strong> y la hoja <strong>{c.code}</strong> quedará cerrada. No se puede deshacer.</>,
      confirmText: 'Enviar respuesta',
    });
    if (!ok) return;
    setSending(true); setError(null);
    try {
      const updated = await apiFetch<Complaint>(`${API.landing}/landing/admin/complaints/${c.id}/reply`, {
        method: 'POST', body: JSON.stringify({ response }),
      });
      setC(updated); setResponse('');
      if (updated.responseEmailSent) toast.success(`Respuesta enviada a ${updated.email}.`);
      else toast.warning('La respuesta quedó guardada, pero no se pudo enviar el correo al consumidor. Avisa al equipo técnico para revisar el envío de correos.');
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar la respuesta.');
    } finally {
      setSending(false);
    }
  }

  /**
   * "Anular" (cualquier pendiente), "Descartar" (posible bot) o "Es válido"
   * (posible bot: plazo desde hoy y correo al cliente). Siempre con
   * confirmación; anular y descartar piden el motivo.
   */
  async function review(action: 'void' | 'discard' | 'valid') {
    if (!c) return;
    const reasonOpts = {
      reason: 'required' as const, reasonLabel: 'Motivo (interno)',
      reasonPlaceholder: 'Explica por qué. No se le envía al cliente.',
      reasonMinLength: REASON_MIN, reasonMaxLength: REASON_MAX,
    };
    const r = action === 'void'
      ? await confirm({
          title: '¿Anular esta hoja?',
          message: <>La hoja <strong>{c.code}</strong> quedará anulada y ya no se podrá responder. No se envía ningún correo
            ni aviso al cliente y la hoja no se borra.</>,
          confirmText: 'Anular', tone: 'danger', ...reasonOpts,
        })
      : action === 'discard'
      ? await confirm({
          title: '¿Descartar esta hoja?',
          message: <>La hoja <strong>{c.code}</strong> quedará descartada como envío automático. No se envía ningún correo
            y la hoja no se borra.</>,
          confirmText: 'Descartar', tone: 'danger', ...reasonOpts,
        })
      : await confirm({
          title: '¿Es una reclamación válida?',
          message: <>Se quita la marca de posible bot, el plazo se cuenta desde hoy y se envía la copia de la hoja a <strong>{c.email}</strong>.</>,
          confirmText: 'Es válido',
        });
    if (!r) return;
    setSending(true); setError(null);
    try {
      const updated = await apiFetch<Complaint>(`${API.landing}/landing/admin/complaints/${c.id}/${action}`, {
        method: 'POST',
        ...(action === 'valid' ? {} : { body: JSON.stringify({ reason: r.reason }) }),
      });
      setC(updated);
      if (action === 'void') toast.success(`Hoja ${updated.code} anulada.`);
      else if (action === 'discard') toast.success(`Hoja ${updated.code} descartada.`);
      else if (updated.confirmationEmailSent) toast.success(`Hoja ${updated.code} validada. Se envió la copia a ${updated.email}.`);
      else toast.warning('La hoja quedó válida, pero no se pudo enviar el correo al consumidor. Avisa al equipo técnico para revisar el envío de correos.');
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar la hoja.');
    } finally {
      setSending(false);
    }
  }

  async function close() {
    if (sending) return;
    if (response.trim() && !(await confirm({
      title: '¿Cerrar sin enviar?', message: 'Tu respuesta todavía no se ha enviado y se perderá.',
      confirmText: 'Cerrar sin enviar', cancelText: 'Seguir escribiendo', tone: 'warning',
    }))) return;
    onClose();
  }

  const isBot = !!c?.isBot && c.status === 'pendiente';
  const pending = c?.status === 'pendiente' && !isBot;
  // Solo una hoja pendiente (incluido posible bot) se puede anular; una respondida no.
  const canVoid = c?.status === 'pendiente';
  const closed = c?.status === 'anulada' || c?.status === 'descartada';

  return (
    <>
      <Drawer
        open={!!id}
        onClose={close}
        size="lg"
        title={c ? `Hoja ${c.code}` : 'Hoja de reclamación'}
        description={c ? `${c.consumerName} · ${fmtDateTime(c.createdAt)}` : undefined}
        busy={sending}
        footer={
          <>
            <button type="button" className="btn btn-bugie-outline" onClick={close} disabled={sending}>Cerrar</button>
            {canVoid && (
              <button type="button" className="btn btn-outline-danger" onClick={() => review('void')} disabled={sending}>
                <i className="fa-solid fa-circle-xmark me-2" aria-hidden="true" />Anular
              </button>
            )}
            {isBot && (
              <>
                <button type="button" className="btn btn-outline-danger" onClick={() => review('discard')} disabled={sending}>
                  <i className="fa-solid fa-ban me-2" aria-hidden="true" />Descartar
                </button>
                <button type="button" className="btn btn-bugie" onClick={() => review('valid')} disabled={sending}>
                  <i className="fa-solid fa-circle-check me-2" aria-hidden="true" />Es válido
                </button>
              </>
            )}
            {pending && (
              <button type="button" className="btn btn-bugie" onClick={send} disabled={sending || !response.trim()}>
                {sending
                  ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Enviando…</>
                  : <><i className="fa-solid fa-paper-plane me-2" aria-hidden="true" />Enviar respuesta</>}
              </button>
            )}
          </>
        }
      >
        {!c && !error && <Skeleton height={80} count={4} />}

        {error && (
          <div className="sa-note bx-tone-bad mb-3" role="alert">
            <i className="fa-solid fa-circle-exclamation" aria-hidden="true" /><span>{error}</span>
          </div>
        )}

        {c && (
          <div className="d-grid gap-4">
            <div className="d-flex flex-wrap gap-2 align-items-center">
              <TypeBadge type={c.complaintType} />
              <DueBadge c={c} soonDays={soonDays} />
              {pending && <span className="small bugie-muted">Límite: {fmtDay(c.dueDate)}</span>}
              {!isBot && !closed && <span className="small bugie-muted">Plazo: {daysText(c.responseDays)}</span>}
              {!closed && !isBot && !c.confirmationEmailSent && (
                <StatusBadge tone="warn" size="sm" icon="fa-envelope">No se envió la copia al consumidor</StatusBadge>
              )}
            </div>

            <Block title="1. Consumidor reclamante">
              <Kv label="Nombre completo" full>{c.userId
                ? <PassengerLink userId={c.userId} onNavigate={onClose}>{c.consumerName}</PassengerLink>
                : c.consumerName}</Kv>
              <Kv label="Domicilio" full>{c.consumerAddress}</Kv>
              <Kv label={c.docType}>{c.docNumber}</Kv>
              <Kv label="Teléfono">{c.phone}</Kv>
              <Kv label="E-mail"><a href={`mailto:${c.email}`}>{c.email}</a></Kv>
              {c.guardianName && <Kv label="Padre, madre o apoderado" full>{c.guardianName}</Kv>}
            </Block>

            <Block title="2. Bien contratado">
              <Kv label="Tipo">{c.goodType === 'producto' ? 'Producto' : 'Servicio'}</Kv>
              <Kv label="Monto reclamado">{c.claimedAmount != null ? `S/ ${c.claimedAmount.toFixed(2)}` : '—'}</Kv>
              <Kv label="Descripción" full>{c.goodDescription || '—'}</Kv>
            </Block>

            <Block title="3. Detalle de la reclamación">
              <Kv label="Tipo">{c.complaintType === 'queja' ? 'Queja' : 'Reclamo'}</Kv>
              <Kv label="Viaje o envío relacionado">
                {c.tripCode || '—'}
                {c.tripId && (
                  <button type="button" className="btn btn-sm btn-bugie-outline rounded-pill ms-2"
                          onClick={openTrip} disabled={tripLoading}>
                    <i className="fa-solid fa-route me-1" aria-hidden="true" />{tripLoading ? 'Cargando…' : 'Ver viaje'}
                  </button>
                )}
              </Kv>
              {c.reference && <Kv label="Referencia" full>{c.reference}</Kv>}
              <Kv label="Detalle" full>{c.detail}</Kv>
              <Kv label="Pedido" full>{c.request}</Kv>
            </Block>

            {isBot && (
              <div className="sa-note bx-tone-warn" role="note">
                <i className="fa-solid fa-robot" aria-hidden="true" />
                <span>
                  <strong>Posible bot.</strong> {c.botReason ?? 'Se detectó como envío automático.'} No se envió
                  ningún correo ni aviso. Si es real, márcala como válida: el plazo empieza a contar desde hoy y
                  se envía la copia al consumidor.
                </span>
              </div>
            )}

            {closed ? (
              <div className="sa-note bx-tone-neutral" role="note">
                <i className={`fa-solid ${c.status === 'anulada' ? 'fa-circle-xmark' : 'fa-ban'}`} aria-hidden="true" />
                <span className="d-grid gap-1">
                  <span>
                    <strong>{c.status === 'anulada' ? 'Hoja anulada.' : 'Hoja descartada como envío automático (posible bot).'}</strong>{' '}
                    No se envió ningún correo ni aviso al cliente.
                  </span>
                  {c.closedReason && <span className="sa-pre"><strong>Motivo:</strong> {c.closedReason}</span>}
                  {(c.closedByName || c.closedAt) && (
                    <span className="small bugie-muted">
                      {c.status === 'anulada' ? 'Anulada' : 'Descartada'}
                      {c.closedByName && <> por {c.closedByName}</>}
                      {c.closedAt && <> el {fmtDateTime(c.closedAt)}</>}
                    </span>
                  )}
                </span>
              </div>
            ) : isBot ? null : c.status === 'respondida' ? (
              <section className="sa-bubble tone bx-tone-ok">
                <div className="d-flex justify-content-between flex-wrap gap-2 mb-2">
                  <span className="small fw-semibold">
                    <i className="fa-solid fa-reply me-1" aria-hidden="true" />Respuesta de {c.respondedByName ?? 'Bugie'}
                  </span>
                  <span className="small bugie-muted">{fmtDateTime(c.respondedAt)}</span>
                </div>
                <p className="small sa-pre">{c.response}</p>
                {!c.responseEmailSent && (
                  <div className="small mt-2"><strong>Atención:</strong> el correo con la respuesta no se pudo enviar.</div>
                )}
              </section>
            ) : (
              <section className="d-grid gap-3">
                <h3 className="h6 fw-bold mb-0">Responder</h3>
                <Field label="Respuesta" required
                       help={`Se envía por correo a ${c.email} con el enlace de consulta. La hoja queda cerrada.`}>
                  <textarea className="form-control" rows={8} maxLength={4000}
                            value={response} onChange={e => setResponse(e.target.value)} />
                </Field>
              </section>
            )}
          </div>
        )}
      </Drawer>

      {trip && <TripDetailModal trip={trip} onClose={() => setTrip(null)} />}
    </>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="h6 fw-bold mb-2">{title}</h3>
      <div className="sa-grid">{children}</div>
    </section>
  );
}

function Kv({ label, children, full }: { label: string; children: ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'sa-col-full' : 'sa-col-third'}>
      <div className="small bugie-muted">{label}</div>
      <div className="sa-pre">{children}</div>
    </div>
  );
}
