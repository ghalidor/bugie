import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  rewardsAdminApi, Promotion, PromotionInput,
  DIAS, PROMO_TYPES, TARGETS, USER_TYPE_LABEL,
  describePromotion, promotionGroup, fmtPoints, fmtDate,
} from '../../../state/rewards';
import {
  ActionItem, Column, DataTable, Drawer, Field, FilterBar, Modal, Page, SectionCard, Select, StatusBadge, Switch, Tone,
  useConfirm, useToast,
} from '../../../components/ui';
import { errMsg, FormSection, LoadError, optNum } from './common';

/* ──────────────────────────────────────────────────────────────────────────
   Promociones.

   El admin nunca escribe JSON: elige días, horas y métodos con botones. El
   backend arma las condiciones. Lo que no se adivina es CÓMO SE COMBINAN:
   día y franja compiten entre sí; primer viaje y método de pago se suman.
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

const GROUP_INFO: Record<string, { label: string; tone: Tone; help: string }> = {
  franja:  { label: 'Franja horaria', tone: 'primary', help: 'Gana sobre la promoción de día. Solo paga una de las dos.' },
  dia:     { label: 'Día de semana',  tone: 'info',    help: 'No se aplica si el viaje cae dentro de una franja horaria.' },
  suma:    { label: 'Se suma',        tone: 'ok',      help: 'Se agrega encima de la promoción de día o franja que aplique.' },
  siempre: { label: 'Siempre',        tone: 'neutral', help: 'Sin condiciones de tiempo: compite con las de día y franja.' },
};

const PAY_METHODS = [
  { value: 'yape', label: 'Yape' },
  { value: 'plin', label: 'Plin' },
  { value: 'cash', label: 'Efectivo' },
];

const HOURS = Array.from({ length: 24 }, (_, h) => h);

function toInput(p: Promotion): PromotionInput {
  const { id: _id, timesApplied: _t, pointsGiven: _g, warning: _w, ...rest } = p;
  return rest;
}

export default function PromotionsTab() {
  const confirm = useConfirm();
  const toast = useToast();
  const [items,   setItems]   = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [editing, setEditing] = useState<Promotion | 'new' | null>(null);
  const [busy,    setBusy]    = useState<string | null>(null);
  const [filter,  setFilter]  = useState('all');
  const [search,  setSearch]  = useState('');
  const [helpOpen, setHelpOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    rewardsAdminApi.promotions()
      .then(setItems)
      .catch(e => setError(errMsg(e, 'No se pudieron cargar las promociones.')))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function toggle(p: Promotion) {
    const ok = await confirm(p.isActive
      ? { title: `¿Apagar «${p.name}»?`, tone: 'warning', confirmText: 'Apagar promoción',
          message: 'Deja de aplicarse desde ahora a los viajes nuevos. Los puntos ya ganados no cambian. Puedes volver a activarla.' }
      : { title: `¿Activar «${p.name}»?`, confirmText: 'Activar promoción',
          message: 'Se aplicará a los viajes nuevos que cumplan sus condiciones, dentro de sus fechas.' });
    if (!ok) return;
    setBusy(p.id);
    try {
      await rewardsAdminApi.setPromotionActive(p.id, !p.isActive);
      setItems(prev => prev.map(x => x.id === p.id ? { ...x, isActive: !x.isActive } : x));
      toast.success(`«${p.name}» ${p.isActive ? 'quedó apagada' : 'quedó activa'}.`);
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo cambiar el estado.'));
    } finally {
      setBusy(null);
    }
  }

  async function remove(p: Promotion) {
    const ok = await confirm({
      title: `¿Borrar «${p.name}»?`,
      message: p.timesApplied > 0
        ? `Ya se aplicó ${p.timesApplied} veces y al borrarla se pierde ese historial. Si solo quieres que deje de aplicarse, mejor apágala.`
        : 'Se borrará de forma permanente.',
      tone: 'danger',
      confirmText: 'Borrar promoción',
      typeToConfirm: 'BORRAR',
    });
    if (!ok) return;
    setBusy(p.id);
    try {
      await rewardsAdminApi.deletePromotion(p.id);
      setItems(prev => prev.filter(x => x.id !== p.id));
      toast.success('Promoción borrada.');
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo borrar.'));
    } finally {
      setBusy(null);
    }
  }

  const activeCount = items.filter(p => p.isActive).length;
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter(p => filter === 'all' || (filter === 'on' ? p.isActive : !p.isActive))
      .filter(p => !q || p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q));
  }, [items, filter, search]);

  const columns: Column<Promotion>[] = [
    { key: 'name', header: 'Promoción', priority: 1, width: '34%', render: p => {
      const g = GROUP_INFO[promotionGroup(p)];
      return (
        <div style={{ minWidth: 0 }}>
          <div className="rw-cell-main">{p.name}</div>
          <div className="rw-cell-sub">{describePromotion(p)}</div>
          <div className="rw-badges mt-1">
            <StatusBadge tone={g.tone} size="sm" title={g.help}>{g.label}</StatusBadge>
          </div>
          {p.warning && <div className="rw-cell-sub mt-1" style={{ color: 'var(--bugie-warn)' }}><i className="fa-solid fa-triangle-exclamation me-1" aria-hidden="true" />{p.warning}</div>}
        </div>
      );
    } },
    { key: 'target', header: 'Para', priority: 2, render: p => USER_TYPE_LABEL[p.targetUserType] ?? 'Ambos' },
    { key: 'applied', header: 'Aplicada', align: 'right', priority: 2, render: p => (
      <div>
        <div className="fw-semibold">{fmtPoints(p.timesApplied)} veces</div>
        {p.pointsGiven > 0 && <div className="rw-cell-sub">{fmtPoints(p.pointsGiven)} pts</div>}
      </div>
    ) },
    { key: 'end', header: 'Termina', priority: 3, render: p => p.endDate ? fmtDate(p.endDate) : 'Sin fin' },
    { key: 'active', header: 'Activa', priority: 1, render: p => (
      <span onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
        <Switch checked={p.isActive} onChange={() => toggle(p)} disabled={busy === p.id} ariaLabel={`Activar ${p.name}`} />
      </span>
    ) },
  ];

  const actions = (p: Promotion): ActionItem[] => [
    { label: 'Editar', icon: 'fa-pen', onClick: () => setEditing(p) },
    { label: p.isActive ? 'Apagar' : 'Activar', icon: p.isActive ? 'fa-pause' : 'fa-play', onClick: () => toggle(p), disabled: busy === p.id },
    { label: 'Borrar', icon: 'fa-trash', danger: true, separator: true, onClick: () => remove(p), disabled: busy === p.id },
  ];

  return (
    <Page
      title="Promociones"
      subtitle="Multiplica o suma puntos según día, hora, método de pago o primer viaje."
      icon="fa-bullhorn"
      helpKey="rewards-promotions"
      actions={[
        { label: 'Nueva promoción', icon: 'fa-plus', variant: 'primary', onClick: () => setEditing('new') },
        { label: '¿Cómo se combinan?', icon: 'fa-circle-question', onClick: () => setHelpOpen(true) },
      ]}
    >
      <SectionCard flush tourId="rw-promo-list">
        <div className="p-3 pb-0">
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Buscar promoción"
            chips={[
              { value: 'all', label: 'Todas', count: items.length },
              { value: 'on',  label: 'Activas', count: activeCount },
              { value: 'off', label: 'Apagadas', count: items.length - activeCount },
            ]}
            chip={filter}
            onChipChange={setFilter}
          />
        </div>
        {error ? <LoadError text={error} onRetry={load} /> : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={p => p.id}
            loading={loading}
            onRowClick={p => setEditing(p)}
            actions={actions}
            maxHeight="none"
            empty={items.length === 0
              ? { title: 'No hay promociones', text: 'Crea la primera con «Nueva promoción».' }
              : { title: 'Nada coincide con el filtro' }}
          />
        )}
      </SectionCard>

      <PromotionDrawer
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
      />

      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title="Cómo se combinan dos promociones" size="md"
             footer={<button type="button" className="btn btn-bugie" onClick={() => setHelpOpen(false)}>Entendido</button>}>
        <CombinationHelp />
      </Modal>
    </Page>
  );
}

/* ── Explicación de las reglas de combinación ──────────────────────────── */
function CombinationHelp() {
  return (
    <div className="small rw-stack">
      <p className="mb-0"><StatusBadge tone="primary" size="sm">Compiten</StatusBadge> Día de la semana y franja horaria: si el viaje cae en una franja, manda la franja y la del día no suma.</p>
      <p className="mb-0"><StatusBadge tone="ok" size="sm">Se suman</StatusBadge> Primer viaje del día y método de pago van encima. Un multiplicador de 2x aporta +1 al total.</p>
      <div className="rw-summary">
        <i className="fa-solid fa-calculator" aria-hidden="true" />
        <div>
          <div className="fw-semibold mb-1">Ejemplo</div>
          Lunes 5 pm, viaje de S/ 10, con promos de lunes 2x, franja 4-7 pm 4x, primer viaje 2x y Yape +50 puntos:
          <ul className="mb-0 mt-2 ps-3">
            <li>Base: 10 × 10 = 100 puntos</li>
            <li>Gana la franja (4x). <strong>El lunes no suma.</strong></li>
            <li>Primer viaje aporta +1 → total 5x</li>
            <li>100 × 5 = 500, más 50 de Yape = <strong>550 puntos</strong></li>
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ── Formulario en Drawer ──────────────────────────────────────────────── */
function PromotionDrawer({ editing, onClose, onSaved }: {
  editing: Promotion | 'new' | null; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const id = editing && editing !== 'new' ? editing.id : null;
  const [initial, setInitial] = useState<PromotionInput>(emptyPromo);
  const [f,       setF]       = useState<PromotionInput>(initial);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!editing) return;
    const init = editing === 'new' ? emptyPromo() : toInput(editing);
    setInitial(init); setF(init); setError(null); setSaving(false);
  }, [editing]);

  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const set = <K extends keyof PromotionInput>(k: K, v: PromotionInput[K]) => setF(p => ({ ...p, [k]: v }));

  const dias = f.daysOfWeek ?? [];
  const toggleDia = (n: number) => {
    const next = dias.includes(n) ? dias.filter(d => d !== n) : [...dias, n].sort();
    set('daysOfWeek', next.length ? next : null);
  };
  const pagos = f.paymentMethods ?? [];
  const togglePago = (m: string) => {
    const next = pagos.includes(m) ? pagos.filter(x => x !== m) : [...pagos, m];
    set('paymentMethods', next.length ? next : null);
  };

  // Una franja con solo inicio o solo fin no aplica nunca: se avisa antes de guardar.
  const franjaIncompleta = (f.startHour === null) !== (f.endHour === null);
  const group = GROUP_INFO[promotionGroup({ ...f, id: '', timesApplied: 0, pointsGiven: 0, warning: null })];
  const resumen = describePromotion({ ...f, id: '', timesApplied: 0, pointsGiven: 0, warning: null });

  async function close() {
    if (saving) return;
    if (dirty) {
      const ok = await confirm({ title: '¿Descartar los cambios?', message: 'Lo que configuraste en esta promoción se perderá.', tone: 'warning', confirmText: 'Descartar', cancelText: 'Seguir editando' });
      if (!ok) return;
    }
    onClose();
  }

  async function save() {
    if (franjaIncompleta) { setError('Elige la hora de inicio y la de fin, o quita la franja.'); return; }
    setSaving(true); setError(null);
    try {
      if (id) await rewardsAdminApi.updatePromotion(id, f);
      else    await rewardsAdminApi.createPromotion(f);
      toast.success(id ? 'Promoción actualizada.' : 'Promoción creada.');
      onSaved();
    } catch (e) {
      setError(errMsg(e, 'No se pudo guardar.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={!!editing}
      onClose={close}
      title={id ? `Editar ${initial.name}` : 'Nueva promoción'}
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={close} disabled={saving}>Cancelar</button>
          <button type="button" className="btn btn-bugie" onClick={save} disabled={saving || (!!id && !dirty)}>
            {saving && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
            {id ? 'Guardar cambios' : 'Crear promoción'}
          </button>
        </>
      }
    >
      <div className="rw-form">
        <div className="rw-summary" aria-live="polite">
          <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true" />
          <div style={{ minWidth: 0 }}>
            <div><strong>{f.name || 'Sin nombre'}</strong> · {TARGETS.find(t => t.value === f.targetUserType)?.label}</div>
            <div>{resumen}</div>
            <div className="rw-badges mt-1">
              <StatusBadge tone={group.tone} size="sm">{group.label}</StatusBadge>
              <span className="small bugie-muted">{group.help}</span>
            </div>
          </div>
        </div>

        <FormSection step={1} title="Qué es">
          <Field label="Nombre" required>
            <input className="form-control" value={f.name} placeholder="Hora Feliz" onChange={e => set('name', e.target.value)} />
          </Field>
          <Field label="Para quién">
            <Select
              value={f.targetUserType as string}
              onChange={v => set('targetUserType', v as PromotionInput['targetUserType'])}
              options={TARGETS}
            />
          </Field>
          <Field label="Descripción" optional help="La ve el usuario en la app." span="full">
            <input className="form-control" value={f.description ?? ''} onChange={e => set('description', e.target.value)} />
          </Field>
        </FormSection>

        <FormSection step={2} title="Cuándo aplica" help="Si no marcas nada, aplica siempre.">
          <div className="bx-field bx-col-full">
            <div className="bx-field-label">Días de la semana</div>
            <div className="rw-chips" role="group" aria-label="Días de la semana">
              {DIAS.map(d => (
                <button key={d.n} type="button" className="bx-chip" aria-pressed={dias.includes(d.n)} title={d.largo} onClick={() => toggleDia(d.n)}>
                  {d.corto}
                </button>
              ))}
              {dias.length > 0 && (
                <button type="button" className="btn btn-sm btn-link text-decoration-none" onClick={() => set('daysOfWeek', null)}>Todos los días</button>
              )}
            </div>
          </div>

          <Field
            label="Franja horaria"
            help="Hora de Perú. La hora de fin no se incluye."
            helpLong="De 12 a 14 cubre de 12:00 a 13:59. Día y franja compiten: si el viaje cae en una franja, la del día no suma."
            error={franjaIncompleta ? 'Elige inicio y fin, o quita la franja.' : undefined}
          >
            <div className="rw-range">
              <Select<string | number>
                aria-label="Hora de inicio"
                value={f.startHour ?? ''}
                onChange={v => set('startHour', optNum(String(v)))}
                options={[{ value: '', label: 'Inicio' }, ...HOURS.map(h => ({ value: h, label: `${String(h).padStart(2, '0')}:00` }))]}
              />
              <span className="small bugie-muted">a</span>
              <Select<string | number>
                aria-label="Hora de fin"
                value={f.endHour ?? ''}
                onChange={v => set('endHour', optNum(String(v)))}
                options={[{ value: '', label: 'Fin' }, ...HOURS.map(h => ({ value: h, label: `${String(h).padStart(2, '0')}:00` }))]}
              />
              {(f.startHour !== null || f.endHour !== null) && (
                <button type="button" className="bx-icon-btn sm ghost" aria-label="Quitar franja" title="Quitar franja"
                        onClick={() => setF(p => ({ ...p, startHour: null, endHour: null }))}>
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              )}
            </div>
          </Field>

          <Field label="Monto mínimo del viaje (S/)" optional help="Evita viajes muy cortos solo por la promoción.">
            <input type="number" min={0} step={1} className="form-control" placeholder="Sin mínimo" value={f.minAmount ?? ''} onChange={e => set('minAmount', optNum(e.target.value))} />
          </Field>

          <div className="bx-field bx-col-full">
            <div className="bx-field-label">Método de pago</div>
            <div className="rw-chips" role="group" aria-label="Método de pago">
              {PAY_METHODS.map(m => (
                <button key={m.value} type="button" className="bx-chip" aria-pressed={pagos.includes(m.value)} onClick={() => togglePago(m.value)}>
                  {m.label}
                </button>
              ))}
            </div>
            <p className="bx-field-help">Sin marcar, aplica con cualquiera.</p>
          </div>

          <div className="bx-col-full">
            <Switch checked={f.firstTripOfDay} onChange={v => set('firstTripOfDay', v)} label="Solo el primer viaje del día" description="Se suma encima de la promoción de día o franja." />
          </div>
        </FormSection>

        <FormSection step={3} title="Beneficio">
          <Field label="Qué entrega">
            <Select
              value={f.promotionType as string}
              onChange={v => set('promotionType', v as PromotionInput['promotionType'])}
              options={PROMO_TYPES}
            />

          </Field>
          {f.promotionType === 'multiplier' ? (
            <Field label="Multiplicador" help="Con 2 se gana el doble de puntos." required>
              <input type="number" min={1.1} max={10} step={0.5} className="form-control" value={f.multiplierValue ?? ''} onChange={e => set('multiplierValue', optNum(e.target.value))} />
            </Field>
          ) : (
            <Field label="Puntos extra" help="Se suman tal cual, sin multiplicarse." required>
              <input type="number" min={1} className="form-control" value={f.bonusPoints ?? ''} onChange={e => set('bonusPoints', optNum(e.target.value))} />
            </Field>
          )}
        </FormSection>

        <FormSection step={4} title="Vigencia">
          <Field label="Termina el" optional help="Vacío = no tiene fin.">
            <input type="date" className="form-control" value={f.endDate ? f.endDate.slice(0, 10) : ''}
                   onChange={e => set('endDate', e.target.value ? new Date(e.target.value + 'T23:59:59').toISOString() : null)} />
          </Field>
          <div className="bx-field">
            <span className="bx-field-label">Estado</span>
            <div className="bx-control-box">
              <Switch checked={f.isActive} onChange={v => set('isActive', v)} label="Activa desde ya" description="Puedes crearla apagada y activarla luego." />
            </div>
          </div>
        </FormSection>

        {error && <div className="alert alert-danger small mb-0" role="alert">{error}</div>}
      </div>
    </Drawer>
  );
}
