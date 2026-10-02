import { useEffect, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import PayoutFields, { PayoutDraft, validatePayout } from '../../components/PayoutFields';
import { API, ApiError, apiFetch } from '../../state/api';
import {
  payoutsApi, Payout, PayoutReport, PayoutFilters, PAYOUT_METHOD, PAYOUT_SOURCE,
  nowLocalInput, fmtSoles, downloadPayoutsCsv,
} from '../../state/payouts';

const PAGE_SIZE = 25;

/// Reporte de pagos hechos a conductores: bonos canjeados, premios de sorteo
/// y pagos manuales. Cada pago guarda metodo, n. de operacion, fecha y quien pago.
export default function DriverPayouts() {
  const [filters, setFilters] = useState<PayoutFilters>({});
  const [page,    setPage]    = useState(1);
  const [data,    setData]    = useState<PayoutReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showForm,  setShowForm]  = useState(false);

  function load() {
    setLoading(true); setError(null);
    payoutsApi.list(filters, page, PAGE_SIZE)
      .then(setData)
      .catch(err => setError(err instanceof ApiError ? err.message : 'No se pudieron cargar los pagos.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, page]);

  const set = (k: keyof PayoutFilters, v: string) => { setFilters(f => ({ ...f, [k]: v || null })); setPage(1); };

  async function exportCsv() {
    setExporting(true);
    try {
      const all = await payoutsApi.list(filters, 1, 1000);
      downloadPayoutsCsv(all.items, `pagos-conductores-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo exportar.');
    } finally { setExporting(false); }
  }

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Pagos a conductores"
        subtitle="Bonos canjeados, premios de sorteo y pagos manuales, con su constancia."
        actions={
          <div className="d-flex gap-2">
            <button type="button" className="btn btn-sm btn-bugie-outline rounded-pill" onClick={exportCsv}
                    disabled={exporting || !data?.total}>
              {exporting ? <span className="spinner-border spinner-border-sm" /> : <><i className="fa-solid fa-file-csv me-1" />Exportar CSV</>}
            </button>
            <button type="button" className="btn btn-sm btn-bugie rounded-pill" onClick={() => setShowForm(s => !s)}>
              <i className="fa-solid fa-plus me-1" />Pago manual
            </button>
          </div>
        }
      />

      {showForm && <ManualPayoutForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}

      {/* Filtros */}
      <div className="bugie-card mb-3"><div className="p-3">
        <div className="row g-2 align-items-end">
          <div className="col-6 col-md-2">
            <label className="form-label small mb-1">Desde</label>
            <input type="date" className="form-control form-control-sm" value={filters.from ?? ''} onChange={e => set('from', e.target.value)} />
          </div>
          <div className="col-6 col-md-2">
            <label className="form-label small mb-1">Hasta</label>
            <input type="date" className="form-control form-control-sm" value={filters.to ?? ''} onChange={e => set('to', e.target.value)} />
          </div>
          <div className="col-6 col-md-2">
            <label className="form-label small mb-1">Método</label>
            <select className="form-select form-select-sm" value={filters.method ?? ''} onChange={e => set('method', e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(PAYOUT_METHOD).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div className="col-6 col-md-2">
            <label className="form-label small mb-1">Origen</label>
            <select className="form-select form-select-sm" value={filters.sourceType ?? ''} onChange={e => set('sourceType', e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(PAYOUT_SOURCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="col-12 col-md-3">
            <label className="form-label small mb-1">Buscar</label>
            <input className="form-control form-control-sm" placeholder="Conductor, n.º de operación o código"
                   value={filters.search ?? ''} onChange={e => set('search', e.target.value)} />
          </div>
          <div className="col-12 col-md-1 d-grid">
            <button type="button" className="btn btn-sm btn-bugie-outline rounded-pill" onClick={() => { setFilters({}); setPage(1); }}>
              Limpiar
            </button>
          </div>
        </div>
      </div></div>

      {/* Totales del filtro */}
      {data && (
        <div className="row g-2 mb-3">
          <div className="col-6 col-md-3">
            <div className="bugie-card p-3 h-100">
              <div className="small bugie-muted">Total pagado</div>
              <div className="h5 fw-bold mb-0">{fmtSoles(data.totalAmount)}</div>
              <div className="small bugie-muted">{data.total} pago{data.total === 1 ? '' : 's'}</div>
            </div>
          </div>
          {data.byMethod.map(m => (
            <div key={m.method} className="col-6 col-md-3">
              <div className="bugie-card p-3 h-100">
                <div className="small bugie-muted">
                  <i className={`fa-solid ${PAYOUT_METHOD[m.method]?.icon ?? 'fa-coins'} me-1`} />
                  {PAYOUT_METHOD[m.method]?.label ?? m.method}
                </div>
                <div className="h5 fw-bold mb-0">{fmtSoles(m.amount)}</div>
                <div className="small bugie-muted">{m.count} pago{m.count === 1 ? '' : 's'}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <div className="alert alert-danger small">{error}</div>}

      {loading ? (
        <div className="d-flex justify-content-center py-5"><span className="spinner-border" /></div>
      ) : !data || data.items.length === 0 ? (
        <div className="bugie-card"><div className="p-4 text-center bugie-muted">No hay pagos con este filtro.</div></div>
      ) : (
        <>
          <div className="d-flex flex-column gap-2">
            {data.items.map(p => <PayoutRow key={p.id} p={p} />)}
          </div>
          <div className="d-flex align-items-center justify-content-end gap-2 mt-3">
            <button type="button" className="btn btn-sm btn-bugie-outline rounded-pill" aria-label="Página anterior"
                    onClick={() => setPage(x => Math.max(1, x - 1))} disabled={page === 1}>
              <i className="fa-solid fa-chevron-left" />
            </button>
            <span className="small fw-semibold mx-2">Página {page} de {totalPages}</span>
            <button type="button" className="btn btn-sm btn-bugie-outline rounded-pill" aria-label="Página siguiente"
                    onClick={() => setPage(x => Math.min(totalPages, x + 1))} disabled={page >= totalPages}>
              <i className="fa-solid fa-chevron-right" />
            </button>
          </div>
        </>
      )}
    </>
  );
}

export function PayoutRow({ p, hideDriver = false }: { p: Payout; hideDriver?: boolean }) {
  const m = PAYOUT_METHOD[p.method] ?? { label: p.method, icon: 'fa-coins' };
  return (
    <div className="bugie-card">
      <div className="p-3 d-flex flex-wrap align-items-center gap-3">
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--bugie-border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <i className={`fa-solid ${m.icon}`} />
        </div>
        <div className="flex-grow-1" style={{ minWidth: 220 }}>
          {!hideDriver && <div className="fw-semibold">{p.driverName ?? 'Conductor'}</div>}
          <div className="small bugie-muted">
            {PAYOUT_SOURCE[p.sourceType] ?? p.sourceType}
            {p.sourceRef && p.sourceType === 'reward_redemption' && <> · {p.sourceRef}</>}
            {' · '}{m.label}{p.operationNumber && <> · op <span className="fw-semibold">{p.operationNumber}</span></>}
          </div>
          {p.note && <div className="small bugie-muted">Nota: {p.note}</div>}
        </div>
        <div className="text-end">
          <div className="fw-bold">{fmtSoles(p.amount)}</div>
          <div className="small bugie-muted">
            {p.paidAt ? new Date(p.paidAt).toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
          </div>
          {p.paidByAdminName && <div className="small bugie-muted">por {p.paidByAdminName}</div>}
        </div>
      </div>
    </div>
  );
}

interface DriverOption { userId: string; fullName?: string }

/// Pago que no viene de un canje ni de un sorteo (por ejemplo, un bono especial).
function ManualPayoutForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [driverId, setDriverId] = useState('');
  const [draft, setDraft] = useState<PayoutDraft>({ method: 'yape', operationNumber: '', amount: '', paidAt: nowLocalInput(), note: '' });
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Conductores aprobados (status 3)
    apiFetch<{ items: DriverOption[] }>(`${API.drivers}/drivers/paged?page=1&pageSize=100&status=3`)
      .then(d => setDrivers(d.items ?? []))
      .catch(() => setError('No se pudo cargar la lista de conductores.'));
  }, []);

  async function save() {
    setError(null);
    if (!driverId) { setError('Elige el conductor.'); return; }
    const invalid = validatePayout(draft);
    if (invalid) { setError(invalid); return; }
    if (!draft.note.trim()) { setError('En un pago manual escribe el motivo en la nota.'); return; }
    setBusy(true);
    try {
      const d = drivers.find(x => x.userId === driverId);
      await payoutsApi.register({
        driverId, driverName: d?.fullName ?? null,
        amount: Number(draft.amount), method: draft.method,
        operationNumber: draft.operationNumber.trim() || null,
        paidAt: draft.paidAt, note: draft.note.trim(), sourceType: 'manual',
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo registrar el pago.');
      setBusy(false);
    }
  }

  return (
    <div className="bugie-card mb-3"><div className="p-3">
      <div className="fw-semibold mb-2">Registrar pago manual</div>
      <div className="mb-2">
        <label className="form-label small mb-1">Conductor</label>
        <select className="form-select form-select-sm" value={driverId} onChange={e => setDriverId(e.target.value)}>
          <option value="">Elige un conductor…</option>
          {drivers.map(d => <option key={d.userId} value={d.userId}>{d.fullName ?? d.userId}</option>)}
        </select>
      </div>
      <div className="mb-2"><PayoutFields value={draft} onChange={setDraft} /></div>
      {error && <div className="alert alert-danger small mb-2">{error}</div>}
      <div className="d-flex gap-2">
        <button type="button" className="btn btn-sm btn-bugie rounded-pill" onClick={save} disabled={busy}>
          {busy ? <span className="spinner-border spinner-border-sm" /> : 'Registrar pago'}
        </button>
        <button type="button" className="btn btn-sm btn-bugie-outline rounded-pill" onClick={onClose} disabled={busy}>Cancelar</button>
      </div>
    </div></div>
  );
}

/// Seccion del detalle del conductor: pagos que recibio (ultimos 10 y total).
export function DriverPayoutsSection({ driverUserId }: { driverUserId: string }) {
  const [data,  setData]  = useState<PayoutReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    payoutsApi.list({ driverId: driverUserId }, 1, 10)
      .then(setData)
      .catch(err => setError(err instanceof ApiError ? err.message : 'No se pudieron cargar los pagos.'));
  }, [driverUserId]);

  return (
    <div className="bugie-card p-3 mt-3">
      <h5 className="fw-bold mb-3">
        <i className="fa-solid fa-money-bill-transfer me-2" style={{ color: '#34d399' }} />
        Pagos recibidos {data ? `(${data.total} · ${fmtSoles(data.totalAmount)})` : ''}
      </h5>
      {error && <div className="alert alert-danger small mb-2">{error}</div>}
      {!data && !error ? (
        <div className="d-flex justify-content-center py-3"><div className="spinner-border spinner-border-sm" /></div>
      ) : data && data.items.length === 0 ? (
        <div className="text-center py-3 bugie-muted small">Aún no se le registró ningún pago.</div>
      ) : data && (
        <div className="d-grid gap-2">
          {data.items.map(p => <PayoutRow key={p.id} p={p} hideDriver />)}
          {data.total > data.items.length && (
            <div className="small bugie-muted text-center">
              Mostrando los últimos {data.items.length}. El historial completo está en «Pagos a conductores».
            </div>
          )}
        </div>
      )}
    </div>
  );
}
