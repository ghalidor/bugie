import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { API, apiFetch, ApiError } from '../../state/api';
import { csvDateTag, csvDateTime, csvResultMessage, downloadCsv, fetchAllPages } from '../../state/csv';
import {
  Column, DataTable, EmptyState, FilterBar, Page, Pagination, SectionCard, Select, StatusBadge, Tabs,
  useConfirm, useTabParam, useToast,
} from '../../components/ui';
import DateRangeFilter, { DateRange, EMPTY_RANGE, appendRange, rangeCount } from '../../components/DateRangeFilter';
import DriverSuspendModal, { SuspendData, ymdToDisplay } from '../../components/DriverSuspendModal';
import { revokeAllSessions } from './people/AccountShared';
import { PersonCell, fileUrl, fmtDateTime } from './people/PeopleShared';
import { ComparePanel, FACE_REVIEW_LABEL, FaceReviewStatus, FaceStatus, faceResultMeta } from './DriverPresenceSection';

/* ──────────────────────────────────────────────────────────────────────────
   Verificación facial de conductores (interna: el conductor no ve el resultado).
   Interruptor, umbral y límite diario: Sistema › Configuración.

   Pestañas:
   - Conexiones a revisar: selfie "no coincide" con su foto de referencia.
     «Era él» (error del sistema) o «No era él» (queda como observación en la
     ficha, nota obligatoria). Atajos: cerrar sesiones y suspender (mismos
     endpoints que la ficha); reactivar se hace desde la ficha.
   - Fotos de perfil: pendientes de revisión (primera foto o no coincide).
     Aprobar (pasa a perfil + referencia) o rechazar con motivo.
   - Historial: conexiones verificadas y fotos subidas, con filtros y CSV.

   API: /api/drivers/admin/face/{summary|checkins|photos}
   ────────────────────────────────────────────────────────────────────────── */

interface Summary { pendingCheckIns: number; pendingPhotos: number; enabled: boolean; threshold: number; dailyLimit: number }

interface FaceCheck {
  id: string; driverId: string; driverUserId: string; driverName: string;
  photoUrl: string; referencePhotoUrl: string | null;
  faceStatus: FaceStatus | null; faceScore: number | null; matchPercent: number | null;
  liveness: string | null; faceError: string | null;
  checkedInAt: string; checkedOutAt: string | null;
  reviewStatus: FaceReviewStatus | null; reviewNote: string | null; reviewedByName: string | null; reviewedAt: string | null;
}

type PhotoStatus = 'pending_review' | 'approved' | 'rejected' | 'replaced';
interface PhotoAttempt {
  id: string; driverId: string; driverUserId: string | null; driverName: string;
  photoUrl: string; previousPhotoUrl: string | null; currentPhotoUrl: string | null; dniFrontUrl: string | null;
  faceResult: FaceStatus; score: number | null; matchPercent: number | null; faceError: string | null;
  status: PhotoStatus; autoApproved: boolean; reason: string | null; reviewedByName: string | null; reviewedAt: string | null;
  createdAt: string;
}

interface Paged<T> { items: T[]; total: number; page: number; pageSize: number }

const TABS = ['conexiones', 'fotos', 'historial'];
const BASE = `${API.drivers}/drivers/admin/face`;
const errMsg = (e: unknown, fallback: string) => e instanceof ApiError ? e.message : fallback;

const PHOTO_STATUS: Record<PhotoStatus, { label: string; tone: 'ok' | 'warn' | 'bad' | 'neutral' }> = {
  pending_review: { label: 'Por revisar', tone: 'warn' },
  approved:       { label: 'Aprobada', tone: 'ok' },
  rejected:       { label: 'Rechazada', tone: 'bad' },
  replaced:       { label: 'Reemplazada', tone: 'neutral' },
};

/// Resultado de la comparación de una foto de perfil nueva.
function photoResultLabel(p: PhotoAttempt): string {
  switch (p.faceResult) {
    case 'match':        return `Coincide con su foto anterior (${p.matchPercent ?? 0}%)`;
    case 'mismatch':     return `No coincide con su foto anterior (${p.matchPercent ?? 0}% de parecido)`;
    case 'no_reference': return 'Primera foto: compárala con su DNI';
    case 'error':        return p.faceError ?? 'No se pudo analizar la foto';
    default:             return 'Verificación apagada';
  }
}

export default function FaceVerification() {
  const [tab] = useTabParam(TABS);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [csvRun, setCsvRun] = useState<(() => Promise<void>) | null>(null);
  const [exporting, setExporting] = useState(false);

  const loadSummary = useCallback(() => {
    apiFetch<Summary>(`${BASE}/summary`).then(setSummary).catch(() => { /* los contadores no son críticos */ });
  }, []);
  useEffect(() => { loadSummary(); }, [loadSummary, reloadKey]);

  const refresh = () => setReloadKey(k => k + 1);

  async function exportCsv() {
    if (!csvRun) return;
    setExporting(true);
    try { await csvRun(); } finally { setExporting(false); }
  }

  return (
    <Page
      title="Verificación facial"
      subtitle="Selfies de conexión que no coinciden y fotos de perfil por revisar. Es interno: el conductor sigue trabajando."
      icon="fa-user-check"
      actions={[
        { label: 'Exportar CSV', icon: 'fa-file-csv', onClick: exportCsv, loading: exporting, hidden: tab !== 'historial' || !csvRun },
        { label: 'Actualizar', icon: 'fa-rotate-right', onClick: refresh },
      ]}
    >
      {summary && !summary.enabled && (
        <div className="sa-note bx-tone-warn mb-3" role="status">
          <i className="fa-solid fa-power-off" aria-hidden="true" />
          <span>
            La verificación facial está <strong>apagada</strong>: solo se guardan las fotos. Actívala en{' '}
            <Link to="/admin/configuracion">Configuración</Link>.
          </span>
        </div>
      )}

      <Tabs items={[
        { value: 'conexiones', label: 'Conexiones a revisar', icon: 'fa-plug', count: summary?.pendingCheckIns || undefined },
        { value: 'fotos',      label: 'Fotos de perfil',      icon: 'fa-id-badge', count: summary?.pendingPhotos || undefined },
        { value: 'historial',  label: 'Historial',            icon: 'fa-clock-rotate-left' },
      ]} />

      {tab === 'conexiones' && <PendingCheckIns reloadKey={reloadKey} onChanged={refresh} />}
      {tab === 'fotos' && <PendingPhotos reloadKey={reloadKey} onChanged={refresh} />}
      {tab === 'historial' && <History reloadKey={reloadKey} onCsv={setCsvRun} />}
    </Page>
  );
}

/* ── Conexiones a revisar ──────────────────────────────────────────────── */

function PendingCheckIns({ reloadKey, onChanged }: { reloadKey: number; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [data, setData] = useState<Paged<FaceCheck> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [suspendFor, setSuspendFor] = useState<FaceCheck | null>(null);
  const [suspendError, setSuspendError] = useState<string | null>(null);
  const [suspending, setSuspending] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    apiFetch<Paged<FaceCheck>>(`${BASE}/checkins?review=pending&page=${page}&pageSize=${pageSize}`)
      .then(d => { if (alive) setData(d); })
      .catch(e => { if (alive) setError(errMsg(e, 'No se pudieron cargar las conexiones.')); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [page, pageSize, reloadKey]);

  async function review(c: FaceCheck, decision: 'ok' | 'not_him') {
    const res = decision === 'ok'
      ? await confirm({
          title: '¿Era él?',
          message: 'La conexión queda aprobada como un error del sistema. No se agrega nada a su ficha.',
          confirmText: 'Sí, era él', reason: 'optional', reasonMaxLength: 500,
          reasonPlaceholder: 'Opcional: ej. poca luz, lentes, ángulo.',
        })
      : await confirm({
          title: '¿No era él?',
          message: 'Quedará como observación en la ficha del conductor. Si corresponde, usa también «Cerrar sesiones» o «Suspender».',
          tone: 'danger', confirmText: 'Registrar observación',
          reason: 'required', reasonMinLength: 10, reasonMaxLength: 500,
          reasonLabel: 'Nota (queda en su ficha)', reasonPlaceholder: 'Ej.: La selfie es de otra persona; se llamó al conductor y no contestó.',
        });
    if (!res) return;
    setBusy(c.id);
    try {
      await apiFetch(`${BASE}/checkins/${c.id}/review`, {
        method: 'POST', body: JSON.stringify({ decision, note: res.reason || null }),
      });
      toast.success(decision === 'ok' ? 'Conexión aprobada.' : 'Observación registrada en la ficha del conductor.');
      onChanged();
    } catch (e) { toast.error(errMsg(e, 'No se pudo guardar la revisión.')); }
    finally { setBusy(null); }
  }

  async function suspend(data: SuspendData) {
    if (!suspendFor) return;
    const ok = await confirm({
      title: '¿Suspender a este conductor?',
      message: data.until
        ? `Quedará suspendido hasta el ${ymdToDisplay(data.until)} (inclusive) y se reactivará solo al terminar.`
        : 'Suspensión indefinida: seguirá suspendido hasta que lo reactives desde su ficha.',
      tone: 'danger', confirmText: 'Sí, suspender',
    });
    if (!ok) return;
    setSuspending(true); setSuspendError(null);
    try {
      await apiFetch(`${API.drivers}/drivers/admin/${suspendFor.driverId}/suspend`, {
        method: 'POST', body: JSON.stringify({ reason: data.reason, until: data.until }),
      });
      toast.success('Conductor suspendido. Fue notificado.');
      setSuspendFor(null);
    } catch (e) { setSuspendError(errMsg(e, 'No se pudo suspender.')); }
    finally { setSuspending(false); }
  }

  if (error) return <EmptyState variant="error" title="No se pudo cargar" text={error} />;
  const items = data?.items ?? [];

  return (
    <div className="d-grid gap-3 mt-3">
      {loading && !data ? (
        <SectionCard><p className="bugie-muted mb-0">Cargando…</p></SectionCard>
      ) : items.length === 0 ? (
        <EmptyState variant="done" icon="fa-user-check" title="Nada por revisar"
                    text="No hay conexiones con un rostro que no coincida." />
      ) : items.map(c => (
        <SectionCard
          key={c.id}
          title={<Link to={`/admin/conductores/${c.driverId}?tab=conexiones`}>{c.driverName}</Link>}
          icon="fa-triangle-exclamation"
          description={`Conexión del ${fmtDateTime(c.checkedInAt)}`}
          actions={<span className="d-inline-flex flex-wrap gap-1">
            <StatusBadge tone="bad" size="sm">{c.matchPercent ?? 0}% de parecido</StatusBadge>
            {c.liveness === 'passed'
              ? <StatusBadge tone="info" size="sm" icon="fa-eye">Prueba de vida OK</StatusBadge>
              : <StatusBadge tone="neutral" size="sm">Sin prueba de vida</StatusBadge>}
          </span>}
        >
          <div className="d-grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', maxWidth: 560 }}>
            <ComparePanel label="Selfie al conectarse" src={fileUrl('drivers', c.photoUrl)} highlight />
            <ComparePanel label="Foto de referencia" src={fileUrl('drivers', c.referencePhotoUrl)} />
          </div>
          <div className="d-flex flex-wrap gap-2 mt-3">
            <button type="button" className="btn btn-sm btn-bugie" disabled={!!busy} onClick={() => review(c, 'ok')}>
              <i className="fa-solid fa-circle-check me-2" aria-hidden="true" />Era él (error del sistema)
            </button>
            <button type="button" className="btn btn-sm btn-outline-danger" disabled={!!busy} onClick={() => review(c, 'not_him')}>
              <i className="fa-solid fa-flag me-2" aria-hidden="true" />No era él
            </button>
            <span className="flex-grow-1" />
            <button type="button" className="btn btn-sm btn-outline-secondary" disabled={!!busy}
                    onClick={() => revokeAllSessions(c.driverUserId, confirm, toast, 'Ej.: La selfie de conexión no era del conductor.')}>
              <i className="fa-solid fa-right-from-bracket me-2" aria-hidden="true" />Cerrar sesiones
            </button>
            <button type="button" className="btn btn-sm btn-outline-danger" disabled={!!busy}
                    onClick={() => { setSuspendError(null); setSuspendFor(c); }}>
              <i className="fa-solid fa-ban me-2" aria-hidden="true" />Suspender
            </button>
          </div>
        </SectionCard>
      ))}

      {(data?.total ?? 0) > pageSize && (
        <Pagination page={page} pageSize={pageSize} total={data?.total ?? 0}
                    onPageChange={setPage} onPageSizeChange={s => { setPageSize(s); setPage(1); }} />
      )}

      {suspendFor && (
        <DriverSuspendModal
          driverName={suspendFor.driverName}
          submitting={suspending}
          error={suspendError}
          onSubmit={suspend}
          onClose={() => setSuspendFor(null)}
        />
      )}
    </div>
  );
}

/* ── Fotos de perfil por revisar ───────────────────────────────────────── */

function PendingPhotos({ reloadKey, onChanged }: { reloadKey: number; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [data, setData] = useState<Paged<PhotoAttempt> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    apiFetch<Paged<PhotoAttempt>>(`${BASE}/photos?status=pending_review&page=${page}&pageSize=${pageSize}`)
      .then(d => { if (alive) setData(d); })
      .catch(e => { if (alive) setError(errMsg(e, 'No se pudieron cargar las fotos.')); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [page, pageSize, reloadKey]);

  async function approve(p: PhotoAttempt) {
    const ok = await confirm({
      title: '¿Aprobar esta foto?',
      message: 'Pasará a ser su foto de perfil (la ven los pasajeros) y su nueva foto de referencia para la verificación facial.',
      confirmText: 'Aprobar foto',
    });
    if (!ok) return;
    setBusy(p.id);
    try {
      const r = await apiFetch<{ hasFace: boolean }>(`${BASE}/photos/${p.id}/approve`, { method: 'POST' });
      if (r.hasFace) toast.success('Foto aprobada.');
      else toast.warning('Foto aprobada, pero no se detectó un rostro: sus conexiones quedarán «sin foto de referencia».');
      onChanged();
    } catch (e) { toast.error(errMsg(e, 'No se pudo aprobar la foto.')); }
    finally { setBusy(null); }
  }

  async function reject(p: PhotoAttempt) {
    const res = await confirm({
      title: '¿Rechazar esta foto?',
      message: 'Le llegará un aviso: «Tu foto de perfil no fue aprobada: <motivo>. Sube una foto tuya.» Sigue con su foto anterior.',
      tone: 'danger', confirmText: 'Rechazar foto',
      reason: 'required', reasonMinLength: 5, reasonMaxLength: 300,
      reasonLabel: 'Motivo (lo ve el conductor)', reasonPlaceholder: 'Ej.: No se ve bien tu rostro',
    });
    if (!res) return;
    setBusy(p.id);
    try {
      await apiFetch(`${BASE}/photos/${p.id}/reject`, { method: 'POST', body: JSON.stringify({ reason: res.reason }) });
      toast.success('Foto rechazada. El conductor fue notificado.');
      onChanged();
    } catch (e) { toast.error(errMsg(e, 'No se pudo rechazar la foto.')); }
    finally { setBusy(null); }
  }

  if (error) return <EmptyState variant="error" title="No se pudo cargar" text={error} />;
  const items = data?.items ?? [];

  return (
    <div className="d-grid gap-3 mt-3">
      {loading && !data ? (
        <SectionCard><p className="bugie-muted mb-0">Cargando…</p></SectionCard>
      ) : items.length === 0 ? (
        <EmptyState variant="done" icon="fa-id-badge" title="Nada por revisar" text="No hay fotos de perfil pendientes." />
      ) : items.map(p => (
        <SectionCard
          key={p.id}
          title={<Link to={`/admin/conductores/${p.driverId}`}>{p.driverName}</Link>}
          icon="fa-id-badge"
          description={`Subida el ${fmtDateTime(p.createdAt)}`}
          actions={<StatusBadge tone={p.faceResult === 'mismatch' ? 'bad' : p.faceResult === 'error' ? 'warn' : 'info'} size="sm">
            {photoResultLabel(p)}</StatusBadge>}
        >
          <div className="d-grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))' }}>
            <ComparePanel label="Foto nueva" src={fileUrl('drivers', p.photoUrl)} highlight />
            <ComparePanel label="Foto aprobada actual" src={fileUrl('drivers', p.currentPhotoUrl)} />
            <ComparePanel label="DNI - Frontal" src={fileUrl('drivers', p.dniFrontUrl)} />
          </div>
          <div className="d-flex flex-wrap gap-2 mt-3">
            <button type="button" className="btn btn-sm btn-bugie" disabled={!!busy} onClick={() => approve(p)}>
              <i className="fa-solid fa-circle-check me-2" aria-hidden="true" />Aprobar
            </button>
            <button type="button" className="btn btn-sm btn-outline-danger" disabled={!!busy} onClick={() => reject(p)}>
              <i className="fa-solid fa-circle-xmark me-2" aria-hidden="true" />Rechazar
            </button>
          </div>
        </SectionCard>
      ))}

      {(data?.total ?? 0) > pageSize && (
        <Pagination page={page} pageSize={pageSize} total={data?.total ?? 0}
                    onPageChange={setPage} onPageSizeChange={s => { setPageSize(s); setPage(1); }} />
      )}
    </div>
  );
}

/* ── Historial (filtros + CSV) ─────────────────────────────────────────── */

type HistoryKind = 'conexiones' | 'fotos';

const CHECK_FILTERS = [
  { value: '', label: 'Todos los resultados' },
  { value: 'mismatch', label: 'No coincide' },
  { value: 'match', label: 'Coincide' },
  { value: 'no_reference', label: 'Sin foto de referencia' },
  { value: 'error', label: 'Error al verificar' },
  { value: 'disabled', label: 'Verificación apagada' },
];
const REVIEW_FILTERS = [
  { value: '', label: 'Toda revisión' },
  { value: 'pending', label: 'Por revisar' },
  { value: 'confirmed_ok', label: 'Era él' },
  { value: 'not_him', label: 'No era él' },
];
const PHOTO_FILTERS = [
  { value: '', label: 'Todos los estados' },
  { value: 'pending_review', label: 'Por revisar' },
  { value: 'approved', label: 'Aprobadas' },
  { value: 'rejected', label: 'Rechazadas' },
  { value: 'replaced', label: 'Reemplazadas' },
];

/// onCsv = setState del padre: se le pasa un actualizador (la función de exportar no se ejecuta al guardarla).
function History({ reloadKey, onCsv }: { reloadKey: number; onCsv: Dispatch<SetStateAction<(() => Promise<void>) | null>> }) {
  const toast = useToast();
  const [kind, setKind] = useState<HistoryKind>('conexiones');
  const [status, setStatus] = useState('');
  const [review, setReview] = useState('');
  const [range, setRange] = useState<DateRange>(EMPTY_RANGE);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [checks, setChecks] = useState<Paged<FaceCheck> | null>(null);
  const [photos, setPhotos] = useState<Paged<PhotoAttempt> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const params = useCallback((p: number, size: number) => {
    const q = new URLSearchParams({ page: String(p), pageSize: String(size) });
    if (status) q.set('status', status);
    if (kind === 'conexiones' && review) q.set('review', review);
    appendRange(q, range);
    return q;
  }, [kind, status, review, range]);

  useEffect(() => { setPage(1); }, [kind, status, review, range, pageSize]);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    const url = kind === 'conexiones' ? `${BASE}/checkins?${params(page, pageSize)}` : `${BASE}/photos?${params(page, pageSize)}`;
    apiFetch<Paged<FaceCheck> | Paged<PhotoAttempt>>(url)
      .then(d => {
        if (!alive) return;
        if (kind === 'conexiones') setChecks(d as Paged<FaceCheck>); else setPhotos(d as Paged<PhotoAttempt>);
      })
      .catch(e => { if (alive) setError(errMsg(e, 'No se pudo cargar el historial.')); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [kind, params, page, pageSize, reloadKey]);

  // Exportación con los filtros actuales (botón de la cabecera).
  const runRef = useRef<() => Promise<void>>(async () => {});
  runRef.current = async () => {
    try {
      if (kind === 'conexiones') {
        const all = await fetchAllPages(async (p, size) => apiFetch<Paged<FaceCheck>>(`${BASE}/checkins?${params(p, size)}`));
        downloadCsv(
          ['Fecha de conexión', 'Conductor', 'Resultado', '% de parecido', 'Prueba de vida', 'Detalle', 'Revisión', 'Nota', 'Revisado por', 'Fecha de revisión'],
          all.items.map(c => [
            csvDateTime(c.checkedInAt), c.driverName, faceResultMeta(c.faceStatus).label, c.matchPercent ?? '',
            c.liveness === 'passed' ? 'Sí' : 'No', c.faceError ?? '',
            c.reviewStatus ? FACE_REVIEW_LABEL[c.reviewStatus].label : '', c.reviewNote ?? '', c.reviewedByName ?? '', csvDateTime(c.reviewedAt),
          ]),
          `verificacion-facial-conexiones-${csvDateTag()}.csv`);
        if (all.truncated) toast.warning(csvResultMessage(all, 'conexión', 'conexiones'));
        else toast.success(csvResultMessage(all, 'conexión', 'conexiones'));
      } else {
        const all = await fetchAllPages(async (p, size) => apiFetch<Paged<PhotoAttempt>>(`${BASE}/photos?${params(p, size)}`));
        downloadCsv(
          ['Fecha', 'Conductor', 'Estado', 'Aprobación', 'Resultado', '% de parecido', 'Motivo de rechazo', 'Revisado por', 'Fecha de revisión'],
          all.items.map(p => [
            csvDateTime(p.createdAt), p.driverName, PHOTO_STATUS[p.status]?.label ?? p.status,
            p.status === 'approved' ? (p.autoApproved ? 'Automática' : p.faceResult === 'disabled' ? 'Directa (verificación apagada)' : 'Por un administrador') : '',
            photoResultLabel(p), p.matchPercent ?? '', p.reason ?? '', p.reviewedByName ?? '', csvDateTime(p.reviewedAt),
          ]),
          `verificacion-facial-fotos-${csvDateTag()}.csv`);
        if (all.truncated) toast.warning(csvResultMessage(all, 'foto', 'fotos'));
        else toast.success(csvResultMessage(all, 'foto', 'fotos'));
      }
    } catch (e) { toast.error(errMsg(e, 'No se pudo exportar.')); }
  };
  useEffect(() => {
    onCsv(() => () => runRef.current());
    return () => onCsv(null);
  }, [onCsv]);

  const checkColumns: Column<FaceCheck>[] = [
    { key: 'driver', header: 'Conductor', priority: 1, width: '24%',
      render: c => <PersonCell name={c.driverName} src={fileUrl('drivers', c.photoUrl)} sub={fmtDateTime(c.checkedInAt)} /> },
    { key: 'result', header: 'Resultado', priority: 1, render: c => {
      const m = faceResultMeta(c.faceStatus, c.matchPercent);
      return <StatusBadge tone={m.tone} size="sm" icon={m.icon} title={c.faceError ?? undefined}>{m.label}</StatusBadge>;
    } },
    { key: 'liveness', header: 'Prueba de vida', priority: 3, render: c => c.liveness === 'passed' ? 'Sí' : 'No' },
    { key: 'review', header: 'Revisión', priority: 2, render: c => c.reviewStatus
      ? <span title={c.reviewNote ?? undefined}><StatusBadge tone={FACE_REVIEW_LABEL[c.reviewStatus].tone} size="sm">{FACE_REVIEW_LABEL[c.reviewStatus].label}</StatusBadge>
          {c.reviewedByName && <div className="small bugie-muted">{c.reviewedByName}</div>}</span>
      : <span className="bugie-muted">—</span> },
    { key: 'go', header: '', priority: 3, align: 'right',
      render: c => <Link className="small" to={`/admin/conductores/${c.driverId}?tab=conexiones`}>Ver ficha</Link> },
  ];

  const photoColumns: Column<PhotoAttempt>[] = [
    { key: 'driver', header: 'Conductor', priority: 1, width: '24%',
      render: p => <PersonCell name={p.driverName} src={fileUrl('drivers', p.photoUrl)} sub={fmtDateTime(p.createdAt)} /> },
    { key: 'status', header: 'Estado', priority: 1, render: p => (
      <span>
        <StatusBadge tone={PHOTO_STATUS[p.status]?.tone ?? 'neutral'} size="sm">{PHOTO_STATUS[p.status]?.label ?? p.status}</StatusBadge>
        {p.status === 'approved' && <div className="small bugie-muted">{p.autoApproved ? 'Automática' : p.faceResult === 'disabled' ? 'Directa' : p.reviewedByName ?? 'Administrador'}</div>}
        {p.status === 'rejected' && <div className="small bugie-muted" style={{ overflowWrap: 'anywhere' }}>{p.reason}</div>}
      </span>
    ) },
    { key: 'result', header: 'Comparación', priority: 2, render: p => <span className="small">{photoResultLabel(p)}</span> },
    { key: 'go', header: '', priority: 3, align: 'right',
      render: p => <Link className="small" to={`/admin/conductores/${p.driverId}`}>Ver ficha</Link> },
  ];

  const activeCount = (status ? 1 : 0) + (review ? 1 : 0) + rangeCount(range);
  const total = kind === 'conexiones' ? checks?.total ?? 0 : photos?.total ?? 0;

  return (
    <SectionCard flush className="mt-3">
      <div className="p-3">
        <FilterBar
          chips={[{ value: 'conexiones', label: 'Conexiones' }, { value: 'fotos', label: 'Fotos de perfil' }]}
          chip={kind}
          onChipChange={v => { setKind(v as HistoryKind); setStatus(''); setReview(''); }}
          activeCount={activeCount}
          onClear={activeCount ? () => { setStatus(''); setReview(''); setRange(EMPTY_RANGE); } : undefined}
        >
          <Select value={status} onChange={setStatus} options={kind === 'conexiones' ? CHECK_FILTERS : PHOTO_FILTERS}
                  aria-label={kind === 'conexiones' ? 'Resultado' : 'Estado'} />
          {kind === 'conexiones' && <Select value={review} onChange={setReview} options={REVIEW_FILTERS} aria-label="Revisión" />}
          <DateRangeFilter value={range} onChange={setRange} label={kind === 'conexiones' ? 'Fecha de conexión' : 'Fecha de subida'} />
        </FilterBar>
      </div>
      {error ? (
        <EmptyState compact variant="error" title="No se pudo cargar" text={error} />
      ) : kind === 'conexiones' ? (
        <DataTable
          columns={checkColumns}
          rows={checks?.items ?? []}
          rowKey={c => c.id}
          loading={loading}
          mobileTitle={c => c.driverName}
          mobileSubtitle={c => fmtDateTime(c.checkedInAt)}
          empty={{ title: 'Sin conexiones', text: 'No hay conexiones verificadas con esos filtros.', icon: 'fa-plug' }}
          caption="Historial de conexiones verificadas"
        />
      ) : (
        <DataTable
          columns={photoColumns}
          rows={photos?.items ?? []}
          rowKey={p => p.id}
          loading={loading}
          mobileTitle={p => p.driverName}
          mobileSubtitle={p => fmtDateTime(p.createdAt)}
          empty={{ title: 'Sin fotos', text: 'No hay fotos de perfil con esos filtros.', icon: 'fa-id-badge' }}
          caption="Historial de fotos de perfil"
        />
      )}
      <div className="px-3">
        <Pagination page={page} pageSize={pageSize} total={total}
                    onPageChange={setPage} onPageSizeChange={setPageSize} />
      </div>
    </SectionCard>
  );
}
