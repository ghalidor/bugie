import { useEffect, useRef, useState } from 'react';
import PayoutFields, { PayoutDraft, validatePayout } from '../../components/PayoutFields';
import { API, ApiError, apiFetch } from '../../state/api';
import {
  payoutsApi, Payout, PayoutReport, PayoutFilters, PayoutCodeLookup, PAYOUT_METHOD, PAYOUT_SOURCE,
  nowLocalInput, fmtSoles, downloadPayoutsCsv, payoutCode,
} from '../../state/payouts';
import {
  Column, DataTable, Drawer, EmptyState, Field, FilterBar, Page, Pagination, SectionCard, Skeleton,
  Select, StatCard, StatGrid, StatusBadge, useConfirm, useDebouncedValue, useToast,
} from '../../components/ui';
import { DriverLink } from '../../components/EntityLinks';

/** "Vas a pagar S/ 35.00 a Juan Pari por Yape (op. 123)." */
function paySummary(amount: number, driverName: string | null | undefined, method: string, operationNumber: string) {
  const m = PAYOUT_METHOD[method as keyof typeof PAYOUT_METHOD]?.label ?? method;
  const op = operationNumber.trim() ? ` (op. ${operationNumber.trim()})` : '';
  return `Vas a pagar ${fmtSoles(amount)} a ${driverName || 'el conductor'} por ${m}${op}.`;
}
import { csvDateTag, csvResultMessage, fetchAllPages } from '../../state/csv';
import './ops.scss';
import './cobros.scss';

const PAGE_SIZE = 25;

const fmtPaidAt = (s: string | null) =>
  s ? new Date(s).toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const sourceTone = (s: string) => (s === 'raffle_prize' ? 'warn' : s === 'manual' ? 'neutral' : 'primary') as 'warn' | 'neutral' | 'primary';

/// Código del pago (BG-..., PZ-..., PAG-...) en letra monoespaciada.
function PayCode({ p }: { p: Payout }) {
  const code = payoutCode(p);
  return code ? <span className="cb-code">{code}</span> : null;
}

/// Reporte de pagos hechos a conductores: bonos canjeados, premios de sorteo
/// y pagos manuales. Cada pago guarda su código, método, n. de operación, fecha y quién pagó.
export default function DriverPayouts() {
  const toast = useToast();
  const [filters, setFilters] = useState<PayoutFilters>({});
  const [search,  setSearch]  = useState('');
  const dq = useDebouncedValue(search.trim(), 350);
  const [page,    setPage]    = useState(1);
  const [data,    setData]    = useState<PayoutReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showCode,  setShowCode]  = useState(false);
  const [showForm,  setShowForm]  = useState(false);

  const effective: PayoutFilters = { ...filters, search: dq || null };
  const filterKey = JSON.stringify(effective);
  const lastKey = useRef(filterKey);

  function load() {
    setLoading(true); setError(null);
    payoutsApi.list(effective, page, PAGE_SIZE)
      .then(setData)
      .catch(err => setError(err instanceof ApiError ? err.message : 'No se pudieron cargar los pagos.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    // Cambiar un filtro vuelve a la página 1 (sin pedir dos veces).
    if (lastKey.current !== filterKey) {
      lastKey.current = filterKey;
      if (page !== 1) { setPage(1); return; }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, page]);

  const set = (k: keyof PayoutFilters, v: string) => setFilters(f => ({ ...f, [k]: v || null }));
  const activeCount = (['from', 'to', 'method', 'sourceType'] as const).filter(k => !!filters[k]).length;

  async function exportCsv() {
    setExporting(true);
    try {
      // Todas las páginas (no solo las primeras 1000); si hay demasiadas, se avisa.
      const all = await fetchAllPages((p, size) => payoutsApi.list(effective, p, size), 500);
      downloadPayoutsCsv(all.items, `pagos-conductores-${csvDateTag()}.csv`);
      if (all.truncated) toast.warning(csvResultMessage(all, 'pago', 'pagos'));
      else toast.success(csvResultMessage(all, 'pago', 'pagos'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo exportar.');
    } finally { setExporting(false); }
  }

  const columns: Column<Payout>[] = [
    { key: 'driver', header: 'Conductor', priority: 1, width: '22%', render: p => <span className="fw-semibold"><DriverLink userId={p.driverId}>{p.driverName ?? 'Conductor'}</DriverLink></span> },
    {
      key: 'source', header: 'Origen y código', priority: 1,
      render: p => (
        <div className="d-flex flex-column align-items-start gap-1">
          <StatusBadge tone={sourceTone(p.sourceType)} size="sm">{PAYOUT_SOURCE[p.sourceType] ?? p.sourceType}</StatusBadge>
          <PayCode p={p} />
        </div>
      ),
    },
    {
      key: 'method', header: 'Método', priority: 2,
      render: p => {
        const m = PAYOUT_METHOD[p.method] ?? { label: p.method, icon: 'fa-coins' };
        return (
          <div className="small">
            <div className="ops-nowrap"><i className={`fa-solid ${m.icon} me-1 bugie-muted`} aria-hidden="true" />{m.label}</div>
            {p.operationNumber && <div className="ops-muted">op <span className="fw-semibold">{p.operationNumber}</span></div>}
          </div>
        );
      },
    },
    {
      key: 'paidAt', header: 'Fecha de pago', priority: 2,
      render: p => (
        <div className="small">
          <div className="ops-nowrap">{fmtPaidAt(p.paidAt)}</div>
          {p.paidByAdminName && <div className="ops-muted">por {p.paidByAdminName}</div>}
        </div>
      ),
    },
    { key: 'note', header: 'Nota', priority: 3, render: p => <span className="ops-muted">{p.note || '—'}</span> },
    { key: 'amount', header: 'Monto', priority: 1, align: 'right', render: p => <span className="ops-amount ok">{fmtSoles(p.amount)}</span> },
  ];

  return (
    <Page
      title="Pagos a conductores"
      subtitle="Cobra con el código que trae el conductor: canjes de puntos, premios de sorteo y bonos especiales."
      helpKey="driver-payouts"
      actions={[
        { label: 'Exportar CSV', icon: 'fa-file-csv', onClick: exportCsv, loading: exporting, disabled: !data?.total },
        { label: 'Bono especial', icon: 'fa-gift', onClick: () => setShowForm(true) },
        { label: 'Cobrar con código', icon: 'fa-barcode', variant: 'primary', onClick: () => setShowCode(true) },
      ]}
    >
      <StatGrid min={150} tourId="payouts-stats">
        <StatCard label="Total pagado" value={data ? fmtSoles(data.totalAmount) : '—'} icon="fa-money-bill-transfer" tone="ok"
                  loading={!data && loading} hint={data ? `${data.total} pago${data.total === 1 ? '' : 's'} con este filtro` : undefined} />
        {data?.byMethod.map(m => (
          <StatCard key={m.method} label={PAYOUT_METHOD[m.method]?.label ?? m.method} value={fmtSoles(m.amount)}
                    icon={PAYOUT_METHOD[m.method]?.icon ?? 'fa-coins'} tone="neutral" hint={`${m.count} pago${m.count === 1 ? '' : 's'}`} />
        ))}
      </StatGrid>

      <SectionCard flush tourId="payouts-list">
        <div className="p-3" data-tour="payouts-filters">
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Conductor, n.º de operación o código"
            activeCount={activeCount}
            onClear={() => setFilters({})}
          >
            <label className="ops-filter"><span>Desde</span><input type="date" className="form-control form-control-sm" value={filters.from ?? ''} onChange={e => set('from', e.target.value)} /></label>
            <label className="ops-filter"><span>Hasta</span><input type="date" className="form-control form-control-sm" value={filters.to ?? ''} onChange={e => set('to', e.target.value)} /></label>
            <label className="ops-filter"><span>Método</span>
              <Select
                size="sm"
                value={filters.method ?? ''}
                onChange={v => set('method', v)}
                options={[
                  { value: '', label: 'Todos' },
                  ...Object.entries(PAYOUT_METHOD).map(([k, v]) => ({ value: k, label: v.label, icon: v.icon })),
                ]}
              />
            </label>
            <label className="ops-filter"><span>Origen</span>
              <Select
                size="sm"
                value={filters.sourceType ?? ''}
                onChange={v => set('sourceType', v)}
                options={[
                  { value: '', label: 'Todos' },
                  ...Object.entries(PAYOUT_SOURCE).map(([k, v]) => ({ value: k, label: v })),
                ]}
              />
            </label>
          </FilterBar>
        </div>

        {error && <div className="alert alert-danger small mx-3">{error}</div>}

        <DataTable
          columns={columns}
          rows={data?.items ?? []}
          rowKey={p => p.id}
          loading={loading}
          caption="Pagos a conductores"
          mobileSubtitle={p => <>{payoutCode(p) ?? PAYOUT_SOURCE[p.sourceType]} · {PAYOUT_METHOD[p.method]?.label ?? p.method} · {fmtPaidAt(p.paidAt)}</>}
          empty={{
            title: 'No hay pagos con este filtro',
            text: 'Cambia las fechas o el método, o cobra el código que trae un conductor.',
            action: <button type="button" className="btn btn-sm btn-bugie" onClick={() => setShowCode(true)}><i className="fa-solid fa-barcode me-1" aria-hidden="true" />Cobrar con código</button>,
          }}
        />
        <div className="px-3">
          <Pagination page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPageChange={setPage} />
        </div>
      </SectionCard>

      <CodePayoutDrawer
        open={showCode}
        onClose={() => setShowCode(false)}
        onSaved={p => { setShowCode(false); toast.success(`Pago registrado. El código ${payoutCode(p) ?? ''} quedó pagado.`); load(); }}
      />

      <ManualPayoutDrawer
        open={showForm}
        onClose={() => setShowForm(false)}
        onSaved={p => { setShowForm(false); toast.success(`Bono registrado con el comprobante ${payoutCode(p) ?? ''}.`); load(); }}
      />
    </Page>
  );
}

/// Fila compacta de un pago (se usa en el detalle del conductor).
export function PayoutRow({ p, hideDriver = false }: { p: Payout; hideDriver?: boolean }) {
  const m = PAYOUT_METHOD[p.method] ?? { label: p.method, icon: 'fa-coins' };
  const code = payoutCode(p);
  return (
    <div className="bx-inbox-item" style={{ cursor: 'default' }}>
      <span className="bx-stat-icon bx-tone-ok" aria-hidden="true"><i className={`fa-solid ${m.icon}`} /></span>
      <span className="text" style={{ minWidth: 0, flex: 1 }}>
        {!hideDriver && <span className="title d-block">{p.driverName ?? 'Conductor'}</span>}
        <span className="sub d-block">
          {PAYOUT_SOURCE[p.sourceType] ?? p.sourceType}
          {code && <> · <span className="cb-code">{code}</span></>}
          {' · '}{m.label}{p.operationNumber && <> · op <span className="fw-semibold">{p.operationNumber}</span></>}
        </span>
        {p.note && <span className="sub d-block">Nota: {p.note}</span>}
      </span>
      <span className="text-end">
        <span className="ops-amount ok d-block">{fmtSoles(p.amount)}</span>
        <span className="ops-muted d-block">{fmtPaidAt(p.paidAt)}</span>
        {p.paidByAdminName && <span className="ops-muted d-block">por {p.paidByAdminName}</span>}
      </span>
    </div>
  );
}

const statusTone = (c: PayoutCodeLookup) =>
  (c.payable ? 'ok' : c.existingPayout || c.status === 'used' || c.status === 'delivered' ? 'info' : 'bad') as 'ok' | 'info' | 'bad';

/// Cobro con código: el admin escribe el código que trae el conductor (canje BG-... o
/// premio PZ-...), ve qué es, de quién y cuánto, y registra el pago. Sin código válido
/// no se registra nada, y un código ya pagado no se puede volver a pagar.
function CodePayoutDrawer({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (p: Payout) => void }) {
  const confirm = useConfirm();
  const [code,      setCode]      = useState('');
  const [info,      setInfo]      = useState<PayoutCodeLookup | null>(null);
  const [searching, setSearching] = useState(false);
  const [draft,     setDraft]     = useState<PayoutDraft | null>(null);
  const [busy,      setBusy]      = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setCode(''); setInfo(null); setDraft(null); setError(null); setBusy(false); setSearching(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  async function search() {
    const c = code.trim().toUpperCase();
    setError(null); setInfo(null); setDraft(null);
    if (!c) { setError('Escribe el código que trae el conductor.'); return; }
    setSearching(true);
    try {
      const found = await payoutsApi.lookupCode(c);
      setInfo(found);
      setDraft({ method: 'yape', operationNumber: '', amount: found.amount ? String(found.amount) : '', paidAt: nowLocalInput(), note: '' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo buscar el código.');
    } finally { setSearching(false); }
  }

  async function pay() {
    if (!info || !draft || !info.payable) return;
    setError(null);
    const invalid = validatePayout(draft);
    if (invalid) { setError(invalid); return; }
    const amount = info.amount ?? Number(draft.amount);
    const ok = await confirm({
      title: '¿Registrar el pago?',
      message: <>{paySummary(amount, info.driverName, draft.method, draft.operationNumber)}<br />
        Código <strong>{info.code}</strong>: {info.title}. Después no se podrá volver a pagar este código.</>,
      confirmText: 'Registrar pago',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const p = await payoutsApi.payCode(info.code, {
        method: draft.method,
        operationNumber: draft.operationNumber.trim() || null,
        paidAt: draft.paidAt,
        note: draft.note.trim() || null,
        amount: info.amount ? null : Number(draft.amount),
      });
      onSaved(p);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo registrar el pago.');
      // 409: alguien lo pagó antes; se vuelve a consultar para mostrar el estado real.
      if (err instanceof ApiError && err.status === 409) {
        payoutsApi.lookupCode(info.code).then(setInfo).catch(() => undefined);
      }
    } finally { setBusy(false); }
  }

  const ex = info?.existingPayout;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      busy={busy}
      dirty="auto"
      title="Cobrar con código"
      description="Escribe el código del canje de puntos (BG-…) o del premio de sorteo (PZ-…) que trae el conductor."
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className="btn btn-bugie" onClick={pay} disabled={busy || !info?.payable}
                  title={info && !info.payable ? info.reason ?? undefined : undefined}>
            {busy && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}Registrar pago
          </button>
        </>
      }
    >
      <div className="d-grid gap-3">
        <form onSubmit={e => { e.preventDefault(); search(); }}>
          <Field id="cb-code-input" label="Código" required help="Lo ve el conductor en su app, en Mis canjes o en el sorteo que ganó.">
            <div className="input-group" id="cb-code-group">
              <input ref={inputRef} id="cb-code-input" className="form-control cb-code-input" value={code} maxLength={40}
                     placeholder="Ej: BG-7KQ2MX" autoComplete="off" spellCheck={false}
                     onChange={e => { setCode(e.target.value.toUpperCase()); if (info) { setInfo(null); setDraft(null); } }} />
              <button type="submit" className="btn btn-outline-primary" disabled={searching || busy}>
                {searching ? <span className="spinner-border spinner-border-sm" aria-hidden="true" /> : <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />}
                <span className="ms-1">Buscar</span>
              </button>
            </div>
          </Field>
        </form>

        {searching && <Skeleton height={120} radius={12} />}

        {info && (
          <div className={`cb-result cb-${statusTone(info)}`}>
            <div className="d-flex flex-wrap align-items-center gap-2">
              <span className="cb-code lg">{info.code}</span>
              <StatusBadge tone={info.kind === 'raffle_prize' ? 'warn' : 'primary'} size="sm">
                {PAYOUT_SOURCE[info.kind] ?? info.kind}
              </StatusBadge>
              <span className="flex-grow-1" />
              <StatusBadge tone={statusTone(info)} icon={info.payable ? 'fa-circle-check' : 'fa-circle-xmark'}>{info.statusLabel}</StatusBadge>
            </div>
            <div className="fw-semibold mt-2">{info.title}</div>
            {info.detail && <div className="ops-muted">{info.detail}</div>}
            <dl className="cb-kv mt-2 mb-0">
              <dt>Conductor</dt>
              <dd>{info.driverName ?? '—'}{info.userRole && info.userRole !== 'driver' && <span className="text-danger"> ({info.userRole === 'passenger' ? 'pasajero' : info.userRole})</span>}</dd>
              <dt>Monto a pagar</dt>
              <dd className="ops-amount">{info.amount != null ? fmtSoles(info.amount) : 'Sin monto fijo'}</dd>
              {info.expiresAt && <><dt>Vence</dt><dd>{fmtPaidAt(info.expiresAt)}</dd></>}
              {info.settledAt && <><dt>Pagado / entregado</dt><dd>{fmtPaidAt(info.settledAt)}</dd></>}
            </dl>
            {!info.payable && info.reason && (
              <div className="alert alert-warning small mb-0 mt-2" role="status"><i className="fa-solid fa-ban me-1" aria-hidden="true" />{info.reason}</div>
            )}
            {ex && (
              <div className="ops-muted mt-2">
                Pago registrado: {fmtSoles(ex.amount)} por {PAYOUT_METHOD[ex.method]?.label ?? ex.method}
                {ex.operationNumber && <> · op {ex.operationNumber}</>} · {fmtPaidAt(ex.paidAt)}{ex.paidByAdminName && <> · por {ex.paidByAdminName}</>}
              </div>
            )}
          </div>
        )}

        {info?.payable && draft && (
          <form className="d-grid gap-2" onSubmit={e => { e.preventDefault(); pay(); }}>
            <PayoutFields value={draft} onChange={setDraft} amountLocked={info.amount != null} />
            {info.amount == null && (
              <p className="ops-muted mb-0"><i className="fa-solid fa-circle-info me-1" aria-hidden="true" />Este premio no tiene monto fijo: escribe cuánto se pagó.</p>
            )}
            <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
          </form>
        )}

        {error && <div className="alert alert-danger small mb-0" role="alert">{error}</div>}
      </div>
    </Drawer>
  );
}

interface DriverOption { userId: string; fullName?: string }

const emptyDraft = (): PayoutDraft => ({ method: 'yape', operationNumber: '', amount: '', paidAt: nowLocalInput(), note: '' });

/// Bono especial sin código (no viene de un canje ni de un sorteo). El motivo es
/// obligatorio y el sistema genera un comprobante propio (PAG-2026-000123).
function ManualPayoutDrawer({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (p: Payout) => void }) {
  const confirm = useConfirm();
  const [drivers,  setDrivers]  = useState<DriverOption[]>([]);
  const [driverId, setDriverId] = useState('');
  const [draft,    setDraft]    = useState<PayoutDraft>(emptyDraft);
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDriverId(''); setDraft(emptyDraft()); setError(null); setBusy(false);
    // Conductores aprobados (status 3)
    apiFetch<{ items: DriverOption[] }>(`${API.drivers}/drivers/paged?page=1&pageSize=100&status=3`)
      .then(d => setDrivers(d.items ?? []))
      .catch(() => setError('No se pudo cargar la lista de conductores.'));
  }, [open]);

  async function save() {
    setError(null);
    if (!driverId) { setError('Elige el conductor.'); return; }
    const invalid = validatePayout(draft);
    if (invalid) { setError(invalid); return; }
    if (!draft.note.trim()) { setError('Escribe el motivo del bono.'); return; }
    const d = drivers.find(x => x.userId === driverId);
    const ok = await confirm({
      title: '¿Registrar el bono especial?',
      message: <>{paySummary(Number(draft.amount), d?.fullName, draft.method, draft.operationNumber)}<br />Motivo: {draft.note.trim()}</>,
      confirmText: 'Registrar bono',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const p = await payoutsApi.register({
        driverId, driverName: d?.fullName ?? null,
        amount: Number(draft.amount), method: draft.method,
        operationNumber: draft.operationNumber.trim() || null,
        paidAt: draft.paidAt, note: draft.note.trim(), sourceType: 'manual',
      });
      onSaved(p);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo registrar el pago.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      busy={busy}
      dirty="auto"
      title="Registrar bono especial"
      description="Solo para pagos sin código (bonos especiales). Si el conductor trae un código, usa «Cobrar con código»."
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className="btn btn-bugie" onClick={save} disabled={busy}>
            {busy && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}Registrar bono
          </button>
        </>
      }
    >
      <form className="d-grid gap-3" onSubmit={e => { e.preventDefault(); save(); }}>
        <Field label="Conductor" required help="Solo aparecen los conductores aprobados.">
          <Select
            value={driverId || null}
            onChange={setDriverId}
            placeholder="Elige un conductor…"
            searchPlaceholder="Buscar conductor…"
            options={drivers.map(d => ({ value: d.userId, label: d.fullName ?? d.userId }))}
          />

        </Field>
        <PayoutFields value={draft} onChange={setDraft} noteLabel="Motivo" noteRequired />
        <p className="ops-muted mb-0">
          <i className="fa-solid fa-receipt me-1" aria-hidden="true" />Se genera un comprobante (PAG-AAAA-000000) que el conductor ve en sus pagos recibidos.
        </p>
        {error && <div className="alert alert-danger small mb-0" role="alert">{error}</div>}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Drawer>
  );
}

/// Sección del detalle del conductor: pagos que recibió (últimos 10 y total).
export function DriverPayoutsSection({ driverUserId }: { driverUserId: string }) {
  const [data,  setData]  = useState<PayoutReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    payoutsApi.list({ driverId: driverUserId }, 1, 10)
      .then(setData)
      .catch(err => setError(err instanceof ApiError ? err.message : 'No se pudieron cargar los pagos.'));
  }, [driverUserId]);

  return (
    <SectionCard
      className="mt-3"
      title="Pagos recibidos"
      icon="fa-money-bill-transfer"
      actions={data ? <StatusBadge tone="ok">{data.total} · {fmtSoles(data.totalAmount)}</StatusBadge> : undefined}
      flush
    >
      {error ? (
        <div className="p-3"><div className="alert alert-danger small mb-0">{error}</div></div>
      ) : !data ? (
        <div className="p-3 d-grid gap-2"><Skeleton height={44} radius={10} count={2} /></div>
      ) : data.items.length === 0 ? (
        <EmptyState compact title="Sin pagos" text="Aún no se le registró ningún pago." />
      ) : (
        <div className="bx-inbox">
          {data.items.map(p => <PayoutRow key={p.id} p={p} hideDriver />)}
          {data.total > data.items.length && (
            <div className="ops-muted text-center p-2">
              Mostrando los últimos {data.items.length}. El historial completo está en «Pagos a conductores».
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}
