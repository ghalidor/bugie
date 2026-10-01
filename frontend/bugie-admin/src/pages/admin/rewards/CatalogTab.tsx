import { useEffect, useState } from 'react';
import { ApiError } from '../../../state/api';
import {
  rewardsAdminApi, CatalogItem, CatalogItemInput, RewardLevel,
  REWARD_TYPES, USER_TYPE_LABEL, rewardTypeLabel, describeReward,
  needsAmount, needsPercentage, needsQuantity, fmtPoints,
} from '../../../state/rewards';

/** Formulario vacio para crear una recompensa nueva. */
const emptyItem = (userType: 'passenger' | 'driver'): CatalogItemInput => ({
  code: '', userType, name: '', description: '',
  pointsCost: 500, rewardType: 'discount_amount',
  amountSoles: 2, quantity: null, percentage: null,
  minLevel: null, stock: null, validityDays: 30, sortOrder: 0, isActive: true,
});

export default function CatalogTab() {
  const [userType, setUserType] = useState<'passenger' | 'driver'>('passenger');
  const [items,    setItems]    = useState<CatalogItem[]>([]);
  const [levels,   setLevels]   = useState<RewardLevel[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  // null = sin formulario abierto. 'new' = creando. id = editando ese item.
  const [editing, setEditing] = useState<string | null>(null);

  function load() {
    setLoading(true); setError(null);
    Promise.all([rewardsAdminApi.catalog(userType), rewardsAdminApi.levels(userType)])
      .then(([c, l]) => { setItems(c); setLevels(l); })
      .catch(err => setError(err instanceof ApiError ? err.message : 'No se pudo cargar el catálogo.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    setEditing(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userType]);

  function onSaved() {
    setEditing(null);
    load();
  }

  return (
    <>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        {(['passenger', 'driver'] as const).map(t => (
          <button key={t} type="button" onClick={() => setUserType(t)}
                  className={`btn btn-sm rounded-pill ${userType === t ? 'btn-bugie' : 'btn-bugie-outline'}`}>
            {USER_TYPE_LABEL[t]}
          </button>
        ))}
        <button type="button" onClick={() => setEditing('new')} disabled={editing !== null}
                className="btn btn-sm btn-bugie rounded-pill ms-auto">
          <i className="fa-solid fa-plus me-1" />Nueva recompensa
        </button>
      </div>

      {error && <div className="alert alert-danger small mb-3">{error}</div>}

      {editing === 'new' && (
        <ItemForm initial={emptyItem(userType)} itemId={null} levels={levels}
                  onCancel={() => setEditing(null)} onSaved={onSaved} />
      )}

      {loading ? (
        <div className="d-flex justify-content-center py-5"><span className="spinner-border" /></div>
      ) : error ? null : items.length === 0 ? (
        <div className="bugie-card"><div className="bugie-card-body text-center py-4 bugie-muted">
          No hay recompensas para {USER_TYPE_LABEL[userType].toLowerCase()}. Crea la primera con el botón de arriba.
        </div></div>
      ) : (
        <div className="d-flex flex-column gap-2 mt-2">
          {items.map(item => editing === item.id ? (
            <ItemForm key={item.id} itemId={item.id} levels={levels}
                      initial={{ ...item, description: item.description ?? '' }}
                      onCancel={() => setEditing(null)} onSaved={onSaved} />
          ) : (
            <ItemRow key={item.id} item={item} levels={levels}
                     onEdit={() => setEditing(item.id)} disabled={editing !== null} />
          ))}
        </div>
      )}
    </>
  );
}

function ItemRow({ item, levels, onEdit, disabled }: {
  item: CatalogItem; levels: RewardLevel[]; onEdit: () => void; disabled: boolean;
}) {
  const minLevel = levels.find(l => l.name === item.minLevel)?.displayName;
  const soldOut  = item.stock !== null && item.stock <= 0;

  return (
    <div className="bugie-card" style={{ overflow: 'hidden', opacity: item.isActive ? 1 : 0.55 }}>
      <div style={{ height: 3, background: item.isActive ? '#818cf8' : '#94a3b8' }} />
      <div className="p-3 d-flex flex-wrap align-items-center gap-3">
        <div className="flex-grow-1" style={{ minWidth: 220 }}>
          <div className="fw-bold">
            {item.name}
            {!item.isActive && <span className="small fw-normal bugie-muted ms-2">(inactiva)</span>}
          </div>
          <div className="small bugie-muted">
            {describeReward(item)} · código <strong>{item.code}</strong>
          </div>
        </div>
        <div className="d-flex flex-wrap gap-3 small">
          <span><span className="bugie-muted">Tipo </span>{rewardTypeLabel(item.rewardType)}</span>
          <span><span className="bugie-muted">Vigencia </span>{item.validityDays} d</span>
          <span>
            <span className="bugie-muted">Stock </span>
            {item.stock === null ? 'ilimitado' : <strong style={{ color: soldOut ? '#ef4444' : undefined }}>{item.stock}</strong>}
          </span>
          {minLevel && <span><span className="bugie-muted">Nivel mín. </span>{minLevel}</span>}
        </div>
        <div className="fw-bold text-end" style={{ minWidth: 90 }}>{fmtPoints(item.pointsCost)} pts</div>
        <button type="button" onClick={onEdit} disabled={disabled}
                className="btn btn-sm btn-bugie-outline rounded-pill">
          <i className="fa-solid fa-pen me-1" />Editar
        </button>
      </div>
    </div>
  );
}

function ItemForm({ initial, itemId, levels, onCancel, onSaved }: {
  initial: CatalogItemInput; itemId: string | null; levels: RewardLevel[];
  onCancel: () => void; onSaved: () => void;
}) {
  const [form,   setForm]   = useState<CatalogItemInput>(initial);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const set = <K extends keyof CatalogItemInput>(k: K, v: CatalogItemInput[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  /** Campo numerico que puede quedar vacio (null). */
  const optNum = (v: string) => (v.trim() === '' ? null : Number(v));

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
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar la recompensa.');
    } finally {
      setSaving(false);
    }
  }

  const t = form.rewardType;

  return (
    <div className="bugie-card mb-2" style={{ border: '1px solid var(--bugie-primary)' }}>
      <div className="bugie-card-header">{itemId ? `Editar ${initial.name}` : 'Nueva recompensa'}</div>
      <div className="bugie-card-body">
        <div className="row g-3">
          <div className="col-md-4">
            <label className="form-label small fw-semibold">Código interno</label>
            <input className="form-control form-control-sm" value={form.code} disabled={itemId !== null}
                   placeholder="pass_discount_5" onChange={e => set('code', e.target.value)} />
            <div className="small bugie-muted mt-1">
              {itemId ? 'No se puede cambiar una vez creado.' : 'Único, sin espacios. Solo para uso interno.'}
            </div>
          </div>
          <div className="col-md-8">
            <label className="form-label small fw-semibold">Nombre que ve el usuario</label>
            <input className="form-control form-control-sm" value={form.name}
                   onChange={e => set('name', e.target.value)} />
          </div>

          <div className="col-12">
            <label className="form-label small fw-semibold">Descripción</label>
            <input className="form-control form-control-sm" value={form.description ?? ''}
                   onChange={e => set('description', e.target.value)} />
          </div>

          <div className="col-md-4">
            <label className="form-label small fw-semibold">Tipo de recompensa</label>
            <select className="form-select form-select-sm" value={t}
                    onChange={e => set('rewardType', e.target.value)}>
              {REWARD_TYPES.map(rt => <option key={rt.value} value={rt.value}>{rt.label}</option>)}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label small fw-semibold">Costo en puntos</label>
            <input type="number" min={1} className="form-control form-control-sm" value={form.pointsCost}
                   onChange={e => set('pointsCost', Number(e.target.value))} />
          </div>
          <div className="col-md-4">
            <label className="form-label small fw-semibold">Días de vigencia del cupón</label>
            <input type="number" min={1} className="form-control form-control-sm" value={form.validityDays}
                   onChange={e => set('validityDays', Number(e.target.value))} />
          </div>

          {/* Campos que dependen del tipo */}
          {needsAmount(t) && (
            <div className="col-md-4">
              <label className="form-label small fw-semibold">Monto (S/)</label>
              <input type="number" min={0} step="0.5" className="form-control form-control-sm"
                     value={form.amountSoles ?? ''} onChange={e => set('amountSoles', optNum(e.target.value))} />
            </div>
          )}
          {needsPercentage(t) && (
            <div className="col-md-4">
              <label className="form-label small fw-semibold">Porcentaje de descuento</label>
              <input type="number" min={1} max={100} className="form-control form-control-sm"
                     value={form.percentage ?? ''} onChange={e => set('percentage', optNum(e.target.value))} />
            </div>
          )}
          {needsQuantity(t) && (
            <div className="col-md-4">
              <label className="form-label small fw-semibold">
                {t === 'raffle_ticket' ? 'Cantidad de tickets' : 'Días que dura el descuento'}
              </label>
              <input type="number" min={1} className="form-control form-control-sm"
                     value={form.quantity ?? ''} onChange={e => set('quantity', optNum(e.target.value))} />
            </div>
          )}

          <div className="col-md-4">
            <label className="form-label small fw-semibold">Nivel mínimo</label>
            <select className="form-select form-select-sm" value={form.minLevel ?? ''}
                    onChange={e => set('minLevel', e.target.value || null)}>
              <option value="">Todos los niveles</option>
              {levels.map(l => <option key={l.id} value={l.name}>{l.displayName}</option>)}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label small fw-semibold">Stock</label>
            <input type="number" min={0} className="form-control form-control-sm" placeholder="Vacío = ilimitado"
                   value={form.stock ?? ''} onChange={e => set('stock', optNum(e.target.value))} />
          </div>
          <div className="col-md-4">
            <label className="form-label small fw-semibold">Orden en el catálogo</label>
            <input type="number" className="form-control form-control-sm" value={form.sortOrder}
                   onChange={e => set('sortOrder', Number(e.target.value))} />
          </div>

          <div className="col-12">
            <div className="form-check">
              <input id="item-active" type="checkbox" className="form-check-input" checked={form.isActive}
                     onChange={e => set('isActive', e.target.checked)} />
              <label htmlFor="item-active" className="form-check-label small">
                Visible en el catálogo
              </label>
            </div>
          </div>
        </div>

        {error && <div className="alert alert-danger small mt-3 mb-0">{error}</div>}

        <div className="d-flex gap-2 mt-3">
          <button type="button" onClick={save} disabled={saving} className="btn btn-bugie rounded-pill">
            {saving
              ? <><span className="spinner-border spinner-border-sm me-2" />Guardando...</>
              : itemId ? 'Guardar cambios' : 'Crear recompensa'}
          </button>
          <button type="button" onClick={onCancel} disabled={saving} className="btn btn-bugie-outline rounded-pill">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
