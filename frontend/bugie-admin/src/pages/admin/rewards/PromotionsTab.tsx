import { useEffect, useState } from 'react';
import { ApiError } from '../../../state/api';
import {
  rewardsAdminApi, Promotion, PromotionInput,
  DIAS, PROMO_TYPES, TARGETS, USER_TYPE_LABEL,
  describePromotion, promotionGroup, fmtPoints,
} from '../../../state/rewards';

/* ──────────────────────────────────────────────────────────────────────────
   Promociones.

   El admin nunca escribe JSON: elige los días con casillas, las horas con
   selectores y marca lo demás. El backend arma las condiciones.

   La parte importante de la pantalla es explicar CÓMO SE COMBINAN, porque esa
   es la regla que no se adivina: día y franja compiten entre sí, primer viaje
   y método de pago se suman encima.
   ────────────────────────────────────────────────────────────────────────── */

const emptyPromo = (): PromotionInput => ({
  name: '', description: '',
  promotionType: 'multiplier', targetUserType: 'passenger',
  multiplierValue: 2, bonusPoints: null,
  startDate: new Date().toISOString(), endDate: null,
  isActive: false,
  daysOfWeek: null, startHour: null, endHour: null,
  firstTripOfDay: false, paymentMethods: null, minAmount: null,
});

const GROUP_INFO: Record<string, { label: string; color: string; help: string }> = {
  franja:  { label: 'Franja horaria', color: '#818cf8',
             help: 'Gana sobre la promoción de día. Solo paga una de las dos.' },
  dia:     { label: 'Día de semana',  color: '#38bdf8',
             help: 'No se aplica si el viaje cae dentro de una franja horaria.' },
  suma:    { label: 'Se suma',        color: '#34d399',
             help: 'Se agrega encima de la promoción de día o franja que aplique.' },
  siempre: { label: 'Siempre',        color: '#94a3b8',
             help: 'Sin condiciones de tiempo: compite con las de día y franja.' },
};

export default function PromotionsTab() {
  const [items,   setItems]   = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);   // id | 'new' | null
  const [busy,    setBusy]    = useState<string | null>(null);

  function load() {
    setLoading(true); setError(null);
    rewardsAdminApi.promotions()
      .then(setItems)
      .catch(e => setError(e instanceof ApiError ? e.message : 'No se pudieron cargar las promociones.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function toggle(p: Promotion) {
    setBusy(p.id); setError(null);
    try {
      await rewardsAdminApi.setPromotionActive(p.id, !p.isActive);
      setItems(prev => prev.map(x => x.id === p.id ? { ...x, isActive: !x.isActive } : x));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo cambiar el estado.');
    } finally {
      setBusy(null);
    }
  }

  async function remove(p: Promotion) {
    const aviso = p.timesApplied > 0
      ? `«${p.name}» ya se aplicó ${p.timesApplied} veces. Al borrarla se pierde ese historial.\n\n` +
        'Si solo quieres que deje de aplicarse, es mejor desactivarla.\n\n¿Borrar igual?'
      : `¿Borrar «${p.name}»?`;
    if (!confirm(aviso)) return;

    setBusy(p.id); setError(null);
    try {
      await rewardsAdminApi.deletePromotion(p.id);
      setItems(prev => prev.filter(x => x.id !== p.id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo borrar.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <button type="button" onClick={() => setEditing('new')} disabled={editing !== null}
                className="btn btn-sm btn-bugie rounded-pill">
          <i className="fa-solid fa-plus me-1" />Nueva promoción
        </button>
        <span className="small bugie-muted ms-auto">
          {items.filter(p => p.isActive).length} activas de {items.length}
        </span>
      </div>

      <CombinationHelp />

      {error && <div className="alert alert-danger small mb-3">{error}</div>}

      {editing === 'new' && (
        <PromotionForm initial={emptyPromo()} id={null}
                       onCancel={() => setEditing(null)}
                       onSaved={() => { setEditing(null); load(); }} />
      )}

      {loading ? (
        <div className="d-flex justify-content-center py-5"><span className="spinner-border" /></div>
      ) : error ? null : items.length === 0 ? (
        <div className="bugie-card"><div className="bugie-card-body text-center py-4 bugie-muted">
          No hay promociones. Crea la primera con el botón de arriba.
        </div></div>
      ) : (
        <div className="d-flex flex-column gap-2">
          {items.map(p => editing === p.id ? (
            <PromotionForm key={p.id} id={p.id} initial={toInput(p)}
                           onCancel={() => setEditing(null)}
                           onSaved={() => { setEditing(null); load(); }} />
          ) : (
            <PromotionRow key={p.id} p={p} busy={busy === p.id} disabled={editing !== null}
                          onEdit={() => setEditing(p.id)}
                          onToggle={() => toggle(p)}
                          onDelete={() => remove(p)} />
          ))}
        </div>
      )}
    </>
  );
}

function toInput(p: Promotion): PromotionInput {
  const { id, timesApplied, pointsGiven, warning, ...rest } = p;
  return rest;
}

/* ── Explicación de las reglas de combinación ──────────────────────────── */
function CombinationHelp() {
  const [open, setOpen] = useState(false);
  return (
    <div className="bugie-card mb-3">
      <button type="button" onClick={() => setOpen(v => !v)}
              className="w-100 text-start p-3 d-flex align-items-center gap-2"
              style={{ background: 'transparent', border: 0, color: 'inherit' }}>
        <i className="fa-solid fa-circle-info" style={{ color: 'var(--bugie-primary)' }} />
        <span className="small fw-semibold">Cómo se combinan dos promociones en un mismo viaje</span>
        <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'} ms-auto small`} />
      </button>
      {open && (
        <div className="px-3 pb-3 small">
          <p className="mb-2">
            <strong>Día de la semana y franja horaria compiten:</strong> si el viaje cae dentro
            de una franja, manda la franja y la del día no suma.
          </p>
          <p className="mb-2">
            <strong>Primer viaje del día y método de pago se suman</strong> encima de la anterior.
            Un multiplicador de 2x aporta +1 al total.
          </p>
          <div className="p-3" style={{ background: 'var(--bugie-bg-2, rgba(125,125,160,.08))', borderRadius: 10 }}>
            <div className="fw-semibold mb-1">Ejemplo</div>
            Lunes 5pm, viaje de S/ 10, con promos de lunes 2x, franja 4-7pm 4x,
            primer viaje 2x y Yape +50 puntos:
            <ul className="mb-0 mt-2">
              <li>Base: 10 × 10 = 100 puntos</li>
              <li>Gana la franja (4x). <strong>El lunes no suma.</strong></li>
              <li>Primer viaje aporta +1 → total 5x</li>
              <li>100 × 5 = 500, más 50 de Yape = <strong>550 puntos</strong></li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Fila de promoción ─────────────────────────────────────────────────── */
function PromotionRow({ p, busy, disabled, onEdit, onToggle, onDelete }: {
  p: Promotion; busy: boolean; disabled: boolean;
  onEdit: () => void; onToggle: () => void; onDelete: () => void;
}) {
  const group = GROUP_INFO[promotionGroup(p)];

  return (
    <div className="bugie-card" style={{ overflow: 'hidden', opacity: p.isActive ? 1 : .6 }}>
      <div style={{ height: 3, background: p.isActive ? group.color : 'var(--bugie-border)' }} />
      <div className="p-3 d-flex flex-wrap align-items-center gap-3">
        <div className="flex-grow-1" style={{ minWidth: 240 }}>
          <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
            <span className="fw-bold">{p.name}</span>
            <span className="badge rounded-pill" title={group.help}
                  style={{ background: group.color + '22', color: group.color, fontSize: '.68rem' }}>
              {group.label}
            </span>
            <span className="badge rounded-pill"
                  style={{ background: 'var(--bugie-primary)22', color: 'var(--bugie-primary)', fontSize: '.68rem' }}>
              {USER_TYPE_LABEL[p.targetUserType] ?? 'Ambos'}
            </span>
            {!p.isActive && <span className="small bugie-muted">(apagada)</span>}
          </div>
          <div className="small bugie-muted">{describePromotion(p)}</div>
          {p.warning && (
            <div className="small mt-1" style={{ color: '#f59e0b' }}>
              <i className="fa-solid fa-triangle-exclamation me-1" />{p.warning}
            </div>
          )}
        </div>

        <div className="text-end small" style={{ minWidth: 120 }}>
          <div className="bugie-muted">Aplicada</div>
          <div className="fw-bold">{p.timesApplied} veces</div>
          {p.pointsGiven > 0 && (
            <div className="bugie-muted">{fmtPoints(p.pointsGiven)} pts regalados</div>
          )}
        </div>

        <div className="d-flex gap-2">
          <button type="button" onClick={onToggle} disabled={busy || disabled}
                  className={`btn btn-sm rounded-pill ${p.isActive ? 'btn-bugie-outline' : 'btn-bugie'}`}>
            {busy ? <span className="spinner-border spinner-border-sm" />
                  : p.isActive ? 'Desactivar' : 'Activar'}
          </button>
          <button type="button" onClick={onEdit} disabled={disabled}
                  className="btn btn-sm btn-bugie-outline rounded-pill">
            <i className="fa-solid fa-pen" />
          </button>
          <button type="button" onClick={onDelete} disabled={busy || disabled}
                  className="btn btn-sm btn-bugie-outline rounded-pill">
            <i className="fa-solid fa-trash" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Formulario ────────────────────────────────────────────────────────── */
function PromotionForm({ initial, id, onCancel, onSaved }: {
  initial: PromotionInput; id: string | null;
  onCancel: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState<PromotionInput>(initial);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const set = <K extends keyof PromotionInput>(k: K, v: PromotionInput[K]) =>
    setF(p => ({ ...p, [k]: v }));

  const dias = f.daysOfWeek ?? [];
  const toggleDia = (n: number) =>
    set('daysOfWeek', dias.includes(n) ? dias.filter(d => d !== n) : [...dias, n].sort());

  const pagos = f.paymentMethods ?? [];
  const togglePago = (m: string) =>
    set('paymentMethods', pagos.includes(m) ? pagos.filter(x => x !== m) : [...pagos, m]);

  const usaFranja = f.startHour !== null && f.endHour !== null;

  async function save() {
    setSaving(true); setError(null);
    try {
      if (id) await rewardsAdminApi.updatePromotion(id, f);
      else    await rewardsAdminApi.createPromotion(f);
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bugie-card mb-2" style={{ border: '1px solid var(--bugie-primary)' }}>
      <div className="bugie-card-header">{id ? `Editar ${initial.name}` : 'Nueva promoción'}</div>
      <div className="bugie-card-body">
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label small fw-semibold">Nombre</label>
            <input className="form-control form-control-sm" value={f.name}
                   placeholder="Hora Feliz" onChange={e => set('name', e.target.value)} />
          </div>
          <div className="col-md-6">
            <label className="form-label small fw-semibold">Descripción</label>
            <input className="form-control form-control-sm" value={f.description ?? ''}
                   onChange={e => set('description', e.target.value)} />
          </div>

          <div className="col-md-4">
            <label className="form-label small fw-semibold">Qué entrega</label>
            <select className="form-select form-select-sm" value={f.promotionType}
                    onChange={e => set('promotionType', e.target.value as PromotionInput['promotionType'])}>
              {PROMO_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {f.promotionType === 'multiplier' ? (
            <div className="col-md-4">
              <label className="form-label small fw-semibold">Multiplicador</label>
              <input type="number" min={1.1} max={10} step={0.5} className="form-control form-control-sm"
                     value={f.multiplierValue ?? ''}
                     onChange={e => set('multiplierValue', e.target.value === '' ? null : Number(e.target.value))} />
              <div className="small bugie-muted mt-1">Con 2 se gana el doble de puntos.</div>
            </div>
          ) : (
            <div className="col-md-4">
              <label className="form-label small fw-semibold">Puntos extra</label>
              <input type="number" min={1} className="form-control form-control-sm"
                     value={f.bonusPoints ?? ''}
                     onChange={e => set('bonusPoints', e.target.value === '' ? null : Number(e.target.value))} />
              <div className="small bugie-muted mt-1">Se suman tal cual, sin multiplicarse.</div>
            </div>
          )}

          <div className="col-md-4">
            <label className="form-label small fw-semibold">Para quién</label>
            <select className="form-select form-select-sm" value={f.targetUserType}
                    onChange={e => set('targetUserType', e.target.value as PromotionInput['targetUserType'])}>
              {TARGETS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {/* ── Condiciones ── */}
          <div className="col-12">
            <div className="small fw-bold mt-2 mb-2" style={{ letterSpacing: '.02em' }}>
              ¿CUÁNDO APLICA?
            </div>
            <div className="small bugie-muted mb-3">
              Si no marcas nada, aplica siempre. Recuerda que día y franja horaria
              compiten entre sí; primer viaje y método de pago se suman.
            </div>
          </div>

          <div className="col-12">
            <label className="form-label small fw-semibold">Días de la semana</label>
            <div className="d-flex flex-wrap gap-2">
              {DIAS.map(d => (
                <button key={d.n} type="button" onClick={() => toggleDia(d.n)}
                        title={d.largo}
                        className={`btn btn-sm rounded-pill ${dias.includes(d.n) ? 'btn-bugie' : 'btn-bugie-outline'}`}
                        style={{ minWidth: 54 }}>
                  {d.corto}
                </button>
              ))}
              {dias.length > 0 && (
                <button type="button" onClick={() => set('daysOfWeek', null)}
                        className="btn btn-sm btn-bugie-outline rounded-pill">
                  Todos los días
                </button>
              )}
            </div>
          </div>

          <div className="col-md-6">
            <label className="form-label small fw-semibold">Franja horaria</label>
            <div className="d-flex align-items-center gap-2">
              <select className="form-select form-select-sm" style={{ width: 90 }}
                      value={f.startHour ?? ''}
                      onChange={e => set('startHour', e.target.value === '' ? null : Number(e.target.value))}>
                <option value="">—</option>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                ))}
              </select>
              <span className="small bugie-muted">a</span>
              <select className="form-select form-select-sm" style={{ width: 90 }}
                      value={f.endHour ?? ''}
                      onChange={e => set('endHour', e.target.value === '' ? null : Number(e.target.value))}>
                <option value="">—</option>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                ))}
              </select>
              {usaFranja && (
                <button type="button" className="btn btn-sm btn-bugie-outline rounded-pill"
                        onClick={() => { set('startHour', null); set('endHour', null); }}>
                  Quitar
                </button>
              )}
            </div>
            <div className="small bugie-muted mt-1">
              La hora de fin no se incluye: de 12 a 14 cubre hasta las 13:59.
              Hora de Perú.
            </div>
          </div>

          <div className="col-md-6">
            <label className="form-label small fw-semibold">Método de pago</label>
            <div className="d-flex flex-wrap gap-2">
              {['yape', 'plin', 'cash'].map(m => (
                <button key={m} type="button" onClick={() => togglePago(m)}
                        className={`btn btn-sm rounded-pill ${pagos.includes(m) ? 'btn-bugie' : 'btn-bugie-outline'}`}>
                  {m === 'cash' ? 'Efectivo' : m === 'yape' ? 'Yape' : 'Plin'}
                </button>
              ))}
            </div>
            <div className="small bugie-muted mt-1">Si no marcas ninguno, aplica con cualquiera.</div>
          </div>

          <div className="col-md-6">
            <div className="form-check mt-2">
              <input id="primer-viaje" type="checkbox" className="form-check-input"
                     checked={f.firstTripOfDay}
                     onChange={e => set('firstTripOfDay', e.target.checked)} />
              <label htmlFor="primer-viaje" className="form-check-label small">
                Solo el primer viaje del día
              </label>
            </div>
          </div>

          <div className="col-md-6">
            <label className="form-label small fw-semibold">Monto mínimo del viaje (S/)</label>
            <input type="number" min={0} step={1} className="form-control form-control-sm"
                   placeholder="Sin mínimo" value={f.minAmount ?? ''}
                   onChange={e => set('minAmount', e.target.value === '' ? null : Number(e.target.value))} />
            <div className="small bugie-muted mt-1">
              Evita que se hagan viajes muy cortos solo para cazar la promoción.
            </div>
          </div>

          <div className="col-md-6">
            <label className="form-label small fw-semibold">Termina el</label>
            <input type="date" className="form-control form-control-sm"
                   value={f.endDate ? f.endDate.slice(0, 10) : ''}
                   onChange={e => set('endDate', e.target.value
                     ? new Date(e.target.value + 'T23:59:59').toISOString() : null)} />
            <div className="small bugie-muted mt-1">Déjalo vacío para que no tenga fin.</div>
          </div>

          <div className="col-md-6 d-flex align-items-end">
            <div className="form-check mb-2">
              <input id="promo-activa" type="checkbox" className="form-check-input"
                     checked={f.isActive} onChange={e => set('isActive', e.target.checked)} />
              <label htmlFor="promo-activa" className="form-check-label small fw-semibold">
                Activa desde ya
              </label>
            </div>
          </div>
        </div>

        {error && <div className="alert alert-danger small mt-3 mb-0">{error}</div>}

        <div className="d-flex gap-2 mt-3">
          <button type="button" onClick={save} disabled={saving}
                  className="btn btn-bugie rounded-pill px-4">
            {saving ? <><span className="spinner-border spinner-border-sm me-2" />Guardando…</>
                    : id ? 'Guardar cambios' : 'Crear promoción'}
          </button>
          <button type="button" onClick={onCancel} disabled={saving}
                  className="btn btn-bugie-outline rounded-pill">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
