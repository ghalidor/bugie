import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  rewardsAdminApi, CatalogItem, CatalogItemInput, RewardLevel,
  REWARD_TYPES, USER_TYPE_LABEL, rewardTypeLabel, describeReward,
  needsAmount, needsPercentage, needsQuantity, fmtPoints,
} from '../../../state/rewards';
import {
  Column, DataTable, Drawer, Field, FilterBar, SectionCard, Select, StatusBadge, Switch,
  useConfirm, useToast,
} from '../../../components/ui';
import { errMsg, FormSection, LoadError, optNum, USER_TYPE_CHIPS } from './common';

/** Formulario vacío para crear una recompensa nueva. */
const emptyItem = (userType: 'passenger' | 'driver'): CatalogItemInput => ({
  code: '', userType, name: '', description: '',
  pointsCost: 500, rewardType: 'discount_amount',
  amountSoles: 2, quantity: null, percentage: null,
  minLevel: null, stock: null, validityDays: 30, sortOrder: 0, isActive: true,
});

export default function CatalogTab() {
  const [userType, setUserType] = useState<'passenger' | 'driver'>('passenger');
  const [search,   setSearch]   = useState('');
  const [items,    setItems]    = useState<CatalogItem[]>([]);
  const [levels,   setLevels]   = useState<RewardLevel[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  // null = cerrado. 'new' = creando. CatalogItem = editando.
  const [editing,  setEditing]  = useState<CatalogItem | 'new' | null>(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    Promise.all([rewardsAdminApi.catalog(userType), rewardsAdminApi.levels(userType)])
      .then(([c, l]) => { setItems(c); setLevels(l); })
      .catch(err => setError(errMsg(err, 'No se pudo cargar el catálogo.')))
      .finally(() => setLoading(false));
  }, [userType]);

  useEffect(load, [load]);

  const levelName = (n: string | null) => levels.find(l => l.name === n)?.displayName ?? n;

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? items.filter(i => i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q)) : items;
  }, [items, search]);

  const columns: Column<CatalogItem>[] = [
    { key: 'name', header: 'Recompensa', priority: 1, width: '32%', render: i => (
      <div style={{ minWidth: 0 }}>
        <div className="rw-cell-main text-truncate">{i.name}</div>
        <div className="rw-cell-sub text-truncate">{describeReward(i)} · <span className="rw-mono">{i.code}</span></div>
      </div>
    ) },
    { key: 'cost', header: 'Costo', align: 'right', priority: 1, render: i => <strong>{fmtPoints(i.pointsCost)} pts</strong> },
    { key: 'type', header: 'Tipo', priority: 3, render: i => rewardTypeLabel(i.rewardType) },
    { key: 'stock', header: 'Stock', align: 'right', priority: 2, render: i => i.stock === null
      ? <span className="bugie-muted">Ilimitado</span>
      : i.stock <= 0 ? <StatusBadge tone="bad" size="sm">Agotado</StatusBadge> : fmtPoints(i.stock) },
    { key: 'validity', header: 'Vigencia', priority: 3, render: i => `${i.validityDays} días` },
    { key: 'level', header: 'Nivel mín.', priority: 3, render: i => i.minLevel ? levelName(i.minLevel) : 'Todos' },
    { key: 'active', header: 'Estado', priority: 1, render: i => i.isActive
      ? <StatusBadge tone="ok" size="sm" dot>Visible</StatusBadge>
      : <StatusBadge tone="neutral" size="sm">Oculta</StatusBadge> },
  ];

  return (
    <SectionCard
      flush
      title={`Catálogo de ${USER_TYPE_LABEL[userType].toLowerCase()}`}
      description="Lo que los usuarios pueden canjear con sus puntos."
      actions={
        <button type="button" className="btn btn-sm btn-bugie" onClick={() => setEditing('new')} data-tour="rw-cat-new">
          <i className="fa-solid fa-plus me-1" aria-hidden="true" />Nueva recompensa
        </button>
      }
      tourId="rw-cat-list"
    >
      <div className="p-3 pb-0">
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar por nombre o código"
          chips={USER_TYPE_CHIPS}
          chip={userType}
          onChipChange={v => setUserType(v as 'passenger' | 'driver')}
        />
      </div>
      {error ? <LoadError text={error} onRetry={load} /> : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={i => i.id}
          loading={loading}
          onRowClick={i => setEditing(i)}
          actions={i => [{ label: 'Editar', icon: 'fa-pen', onClick: () => setEditing(i) }]}
          maxHeight="none"
          empty={search
            ? { title: 'Nada coincide con la búsqueda' }
            : { title: `No hay recompensas para ${USER_TYPE_LABEL[userType].toLowerCase()}`, text: 'Crea la primera con «Nueva recompensa».' }}
        />
      )}

      <ItemDrawer
        editing={editing}
        userType={userType}
        levels={levels}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
      />
    </SectionCard>
  );
}

function ItemDrawer({ editing, userType, levels, onClose, onSaved }: {
  editing: CatalogItem | 'new' | null; userType: 'passenger' | 'driver'; levels: RewardLevel[];
  onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const itemId = editing && editing !== 'new' ? editing.id : null;
  const [initial, setInitial] = useState<CatalogItemInput>(() => emptyItem(userType));
  const [form,    setForm]    = useState<CatalogItemInput>(initial);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!editing) return;
    let init: CatalogItemInput;
    if (editing === 'new') init = emptyItem(userType);
    else {
      const { id: _id, ...rest } = editing;
      init = { ...rest, description: rest.description ?? '' };
    }
    setInitial(init); setForm(init); setError(null); setSaving(false);
  }, [editing, userType]);

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const set = <K extends keyof CatalogItemInput>(k: K, v: CatalogItemInput[K]) => setForm(f => ({ ...f, [k]: v }));

  async function close() {
    if (saving) return;
    if (dirty) {
      const ok = await confirm({ title: '¿Descartar los cambios?', message: 'Lo que escribiste en esta recompensa se perderá.', tone: 'warning', confirmText: 'Descartar', cancelText: 'Seguir editando' });
      if (!ok) return;
    }
    onClose();
  }

  async function save() {
    setSaving(true); setError(null);
    // Solo se mandan los campos que usa el tipo elegido; el resto va en null.
    const t = form.rewardType;
    const payload: CatalogItemInput = {
      ...form,
      description: form.description?.trim() || null,
      amountSoles: needsAmount(t)     ? form.amountSoles : null,
      percentage:  needsPercentage(t) ? form.percentage  : null,
      quantity:    needsQuantity(t)   ? form.quantity    : null,
    };
    try {
      if (itemId) await rewardsAdminApi.updateItem(itemId, payload);
      else        await rewardsAdminApi.createItem(payload);
      toast.success(itemId ? 'Recompensa actualizada.' : 'Recompensa creada.');
      onSaved();
    } catch (err) {
      setError(errMsg(err, 'No se pudo guardar la recompensa.'));
    } finally {
      setSaving(false);
    }
  }

  const t = form.rewardType;
  const extraFields = [needsAmount(t), needsPercentage(t), needsQuantity(t)].filter(Boolean).length;
  const preview = describeReward(form);

  return (
    <Drawer
      open={!!editing}
      onClose={close}
      title={itemId ? `Editar ${initial.name}` : 'Nueva recompensa'}
      description={`Catálogo de ${USER_TYPE_LABEL[form.userType].toLowerCase()}`}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={close} disabled={saving}>Cancelar</button>
          <button type="button" className="btn btn-bugie" onClick={save} disabled={saving || (!!itemId && !dirty)}>
            {saving && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
            {itemId ? 'Guardar cambios' : 'Crear recompensa'}
          </button>
        </>
      }
    >
      <div className="rw-form">
        <div className="rw-summary">
          <i className="fa-solid fa-gift" aria-hidden="true" />
          <span><strong>{form.name || 'Sin nombre'}</strong>: {preview} por <strong>{fmtPoints(form.pointsCost)} pts</strong>, vale {form.validityDays} días.</span>
        </div>

        <FormSection step={1} title="Qué es">
          <Field label="Nombre que ve el usuario" required>
            <input className="form-control" value={form.name} onChange={e => set('name', e.target.value)} />
          </Field>
          <Field label="Código interno" help={itemId ? 'No se puede cambiar una vez creado.' : 'Único y sin espacios.'} required>
            <input className="form-control" value={form.code} disabled={itemId !== null} placeholder="pass_discount_5" onChange={e => set('code', e.target.value)} />
          </Field>
          <Field label="Descripción" optional span="full">
            <textarea className="form-control" rows={2} value={form.description ?? ''} onChange={e => set('description', e.target.value)} />
          </Field>
        </FormSection>

        <FormSection step={2} title="Qué recibe y cuánto cuesta">
          <Field label="Tipo de recompensa" span="full">
            <Select value={t} onChange={v => set('rewardType', v)} options={REWARD_TYPES} />
          </Field>
          {needsAmount(t) && (
            <Field label="Monto (S/)" required>
              <input type="number" min={0} step="0.5" className="form-control" value={form.amountSoles ?? ''} onChange={e => set('amountSoles', optNum(e.target.value))} />
            </Field>
          )}
          {needsPercentage(t) && (
            <Field label="Porcentaje de descuento" required>
              <input type="number" min={1} max={100} className="form-control" value={form.percentage ?? ''} onChange={e => set('percentage', optNum(e.target.value))} />
            </Field>
          )}
          {needsQuantity(t) && (
            <Field label={t === 'raffle_ticket' ? 'Cantidad de tickets' : 'Días que dura el descuento'} required>
              <input type="number" min={1} className="form-control" value={form.quantity ?? ''} onChange={e => set('quantity', optNum(e.target.value))} />
            </Field>
          )}
          {/* Si queda sola en su fila, ocupa todo el ancho (sin huecos). */}
          <Field label="Costo en puntos" required span={extraFields % 2 === 0 ? 'full' : undefined}>
            <input type="number" min={1} className="form-control" value={form.pointsCost} onChange={e => set('pointsCost', Number(e.target.value))} />
          </Field>
        </FormSection>

        <FormSection step={3} title="Condiciones">
          <Field label="Vigencia del cupón (días)" help="Desde que se canjea.">
            <input type="number" min={1} className="form-control" value={form.validityDays} onChange={e => set('validityDays', Number(e.target.value))} />
          </Field>
          <Field label="Nivel mínimo">
            <Select
              value={form.minLevel ?? ''}
              onChange={v => set('minLevel', v || null)}
              options={[
                { value: '', label: 'Todos los niveles' },
                ...levels.map(l => ({ value: l.name, label: l.displayName })),
              ]}
            />

          </Field>
          <Field label="Stock" help="Vacío = ilimitado.">
            <input type="number" min={0} className="form-control" placeholder="Ilimitado" value={form.stock ?? ''} onChange={e => set('stock', optNum(e.target.value))} />
          </Field>
          <Field label="Orden en el catálogo" help="Posición de la recompensa en la lista.">
            <input type="number" className="form-control" value={form.sortOrder} onChange={e => set('sortOrder', Number(e.target.value))} />
          </Field>
          <div className="bx-col-full">
            <Switch checked={form.isActive} onChange={v => set('isActive', v)} label="Visible en el catálogo" description="Si la apagas, deja de mostrarse en el catálogo." />
          </div>
        </FormSection>

        {error && <div className="alert alert-danger small mb-0" role="alert">{error}</div>}
      </div>
    </Drawer>
  );
}
