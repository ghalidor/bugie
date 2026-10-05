import { useCallback, useEffect, useState } from 'react';
import { rewardsAdminApi, RewardLevel, USER_TYPE_LABEL, fmtPoints } from '../../../state/rewards';
import {
  Column, DataTable, Drawer, Field, FilterBar, SectionCard, StatusBadge, Switch,
  useConfirm, useToast,
} from '../../../components/ui';
import { errMsg, FormSection, LoadError, USER_TYPE_CHIPS } from './common';

const rangeText = (l: Pick<RewardLevel, 'minPoints' | 'maxPoints'>) => l.maxPoints === null
  ? `${fmtPoints(l.minPoints)} pts o más`
  : `${fmtPoints(l.minPoints)} – ${fmtPoints(l.maxPoints)} pts`;

const soles = (v: number | null) => (v === null ? 'Sin tope' : `S/ ${v.toFixed(2)}`);

/** Campos que se comparan en la confirmación de guardado (antes → después). */
const DIFF_FIELDS: { key: keyof RewardLevel; label: string; fmt?: (l: RewardLevel) => string; passengerOnly?: boolean }[] = [
  { key: 'displayName',            label: 'Nombre' },
  { key: 'minPoints',              label: 'Rango', fmt: rangeText },
  { key: 'discountPercentage',     label: 'Descuento', fmt: l => `${l.discountPercentage}%` },
  { key: 'monthlyFreeTrips',       label: 'Viajes gratis / mes' },
  { key: 'monthlyDiscountCoupons', label: 'Cupones de descuento al mes', passengerOnly: true },
  { key: 'freeTripMaxAmount',      label: 'Tope de cada viaje gratis', fmt: l => soles(l.freeTripMaxAmount), passengerOnly: true },
  { key: 'weeklyRaffleTickets',    label: 'Tickets semanales' },
  { key: 'monthlyRaffleTickets',   label: 'Tickets mensuales' },
  { key: 'isActive',               label: 'Estado', fmt: l => (l.isActive ? 'Activo' : 'Inactivo') },
];

/** Misma validación que el backend para los beneficios de pasajero. */
function validateLevel(l: RewardLevel): string | null {
  if (l.userType !== 'passenger') return null;
  if (!Number.isInteger(l.monthlyDiscountCoupons) || l.monthlyDiscountCoupons < 0)
    return 'Los cupones de descuento al mes deben ser un número entero de 0 o más.';
  if (l.freeTripMaxAmount !== null && !(l.freeTripMaxAmount > 0))
    return 'El tope del viaje gratis debe ser mayor que 0 (o déjalo vacío).';
  if (l.monthlyFreeTrips > 0 && l.freeTripMaxAmount === null)
    return 'Si el nivel da viajes gratis, indica el tope en soles de cada viaje.';
  return null;
}

export default function LevelsTab() {
  const [userType, setUserType] = useState<'passenger' | 'driver'>('passenger');
  const [levels,   setLevels]   = useState<RewardLevel[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [editing,  setEditing]  = useState<RewardLevel | null>(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    rewardsAdminApi.levels(userType)
      .then(data => setLevels([...data].sort((a, b) => a.sortOrder - b.sortOrder)))
      .catch(err => setError(errMsg(err, 'No se pudieron cargar los niveles.')))
      .finally(() => setLoading(false));
  }, [userType]);

  useEffect(load, [load]);

  const columns: Column<RewardLevel>[] = [
    { key: 'name', header: 'Nivel', priority: 1, render: l => (
      <div style={{ minWidth: 0 }}>
        <div className="rw-cell-main"><i className="fa-solid fa-medal me-2" style={{ color: 'var(--bugie-warn)' }} aria-hidden="true" />{l.displayName}</div>
        <div className="rw-cell-sub">{rangeText(l)}</div>
      </div>
    ) },
    { key: 'discount', header: 'Descuento', align: 'right', priority: 1, render: l => `${l.discountPercentage}%` },
    ...(userType === 'passenger' ? [
      { key: 'coupons', header: 'Cupones/mes', align: 'right', priority: 2, render: (l: RewardLevel) => l.monthlyDiscountCoupons },
    ] as Column<RewardLevel>[] : []),
    { key: 'free', header: 'Viajes gratis/mes', align: 'right', priority: 2, render: l => l.monthlyFreeTrips },
    ...(userType === 'passenger' ? [
      { key: 'cap', header: 'Tope viaje gratis', align: 'right', priority: 3, render: (l: RewardLevel) => (l.monthlyFreeTrips > 0 ? soles(l.freeTripMaxAmount) : '—') },
    ] as Column<RewardLevel>[] : []),
    { key: 'weekly', header: 'Tickets semana', align: 'right', priority: 2, render: l => l.weeklyRaffleTickets },
    { key: 'monthly', header: 'Tickets mes', align: 'right', priority: 3, render: l => l.monthlyRaffleTickets },
    { key: 'active', header: 'Estado', priority: 1, render: l => l.isActive
      ? <StatusBadge tone="ok" size="sm" dot>Activo</StatusBadge>
      : <StatusBadge tone="neutral" size="sm">Inactivo</StatusBadge> },
  ];

  return (
    <SectionCard
      flush
      title={`Niveles de ${USER_TYPE_LABEL[userType].toLowerCase()}`}
      description="Los rangos no pueden solaparse: si chocan, al guardar te diremos con qué nivel."
      tourId="rw-cat-levels"
    >
      <div className="p-3 pb-0">
        <FilterBar chips={USER_TYPE_CHIPS} chip={userType} onChipChange={v => setUserType(v as 'passenger' | 'driver')} />
      </div>
      {error ? <LoadError text={error} onRetry={load} /> : (
        <DataTable
          columns={columns}
          rows={levels}
          rowKey={l => l.id}
          loading={loading}
          onRowClick={setEditing}
          actions={l => [{ label: 'Editar', icon: 'fa-pen', onClick: () => setEditing(l) }]}
          maxHeight="none"
          empty={{ title: `No hay niveles para ${USER_TYPE_LABEL[userType].toLowerCase()}`, text: 'Revisa que corriste el script 007.' }}
        />
      )}

      <LevelDrawer
        level={editing}
        onClose={() => setEditing(null)}
        onSaved={updated => { setLevels(prev => prev.map(l => l.id === updated.id ? updated : l)); setEditing(null); }}
      />
    </SectionCard>
  );
}

function LevelDrawer({ level, onClose, onSaved }: {
  level: RewardLevel | null; onClose: () => void; onSaved: (l: RewardLevel) => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [form,   setForm]   = useState<RewardLevel | null>(null);
  const [noCap,  setNoCap]  = useState(false);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  useEffect(() => {
    if (!level) return;
    setForm(level); setNoCap(level.maxPoints === null); setError(null); setSaving(false);
  }, [level]);

  const dirty = !!level && !!form && (JSON.stringify(form) !== JSON.stringify(level) || noCap !== (level.maxPoints === null));
  const set = <K extends keyof RewardLevel>(k: K, v: RewardLevel[K]) => setForm(f => f && ({ ...f, [k]: v }));
  const num = (v: string) => (v.trim() === '' ? 0 : Number(v));

  async function close() {
    if (saving) return;
    if (dirty) {
      const ok = await confirm({ title: '¿Descartar los cambios?', message: 'Los cambios de este nivel se perderán.', tone: 'warning', confirmText: 'Descartar', cancelText: 'Seguir editando' });
      if (!ok) return;
    }
    onClose();
  }

  async function save() {
    if (!form || !level) return;
    const next: RewardLevel = { ...form, maxPoints: noCap ? null : form.maxPoints };
    const invalid = validateLevel(next);
    if (invalid) { setError(invalid); return; }

    const changes = DIFF_FIELDS
      .filter(f => !f.passengerOnly || next.userType === 'passenger')
      .map(f => {
        const fmt = f.fmt ?? ((l: RewardLevel) => String(l[f.key]));
        return { label: f.label, before: fmt(level), after: fmt(next) };
      })
      .filter(c => c.before !== c.after);

    const ok = await confirm({
      title: `¿Guardar el nivel ${next.displayName || level.displayName}?`,
      message: (
        <div>
          <p className="mb-2">Los cambios aplican desde ahora a los usuarios de este nivel:</p>
          <ul className="mb-0 ps-3">
            {changes.map(c => (
              <li key={c.label}><strong>{c.label}:</strong> {c.before} → {c.after}</li>
            ))}
          </ul>
        </div>
      ),
      confirmText: 'Guardar',
      cancelText: 'Revisar',
    });
    if (!ok) return;

    setSaving(true); setError(null);
    try {
      const updated = await rewardsAdminApi.saveLevel(next);
      toast.success(`Nivel ${updated.displayName} guardado.`);
      onSaved(updated);
    } catch (err) {
      setError(errMsg(err, 'No se pudo guardar el nivel.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={!!level}
      onClose={close}
      title={level ? `Editar nivel ${level.displayName}` : ''}
      description={level ? USER_TYPE_LABEL[level.userType] : undefined}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={close} disabled={saving}>Cancelar</button>
          <button type="button" className="btn btn-bugie" onClick={save} disabled={saving || !dirty}>
            {saving && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}Guardar cambios
          </button>
        </>
      }
    >
      {form && (
        <div className="rw-form">
          <div className="rw-summary">
            <i className="fa-solid fa-medal" aria-hidden="true" />
            <span><strong>{form.displayName || 'Sin nombre'}</strong>: {rangeText({ minPoints: form.minPoints, maxPoints: noCap ? null : form.maxPoints })}, {form.discountPercentage}% de descuento.</span>
          </div>

          <FormSection step={1} title="Nombre y rango">
            <Field label="Nombre visible" required span="full">
              <input className="form-control" value={form.displayName} onChange={e => set('displayName', e.target.value)} />
            </Field>
            <Field label="Desde (puntos)">
              <input type="number" min={0} className="form-control" value={form.minPoints} onChange={e => set('minPoints', num(e.target.value))} />
            </Field>
            <Field label="Hasta (puntos)">
              <input type="number" min={0} className="form-control" value={noCap ? '' : form.maxPoints ?? ''} disabled={noCap} placeholder={noCap ? 'Sin techo' : ''} onChange={e => set('maxPoints', num(e.target.value))} />
            </Field>
            <div className="bx-col-full">
              <Switch checked={noCap} onChange={setNoCap} label="Sin techo" description="Para el nivel más alto." />
            </div>
          </FormSection>

          <FormSection step={2} title="Beneficios">
            <Field label="Descuento %">
              <input type="number" min={0} max={100} step="0.5" className="form-control" value={form.discountPercentage} onChange={e => set('discountPercentage', num(e.target.value))} />
            </Field>
            <Field label="Viajes gratis / mes">
              <input type="number" min={0} className="form-control" value={form.monthlyFreeTrips} onChange={e => set('monthlyFreeTrips', num(e.target.value))} />
            </Field>
            {form.userType === 'passenger' ? (
              <>
                <Field label="Cupones de descuento al mes" help="Cuántos cupones de su % de descuento puede reclamar el pasajero cada mes.">
                  <input type="number" min={0} step={1} className="form-control" value={form.monthlyDiscountCoupons} onChange={e => set('monthlyDiscountCoupons', num(e.target.value))} />
                </Field>
                <Field
                  label="Tope de cada viaje gratis (S/)"
                  required={form.monthlyFreeTrips > 0}
                  optional={form.monthlyFreeTrips === 0}
                  help="Monto máximo que cubre cada viaje gratis; si cuesta más, el pasajero paga la diferencia."
                >
                  <input
                    type="number" min={0.1} step="0.5" className="form-control"
                    value={form.freeTripMaxAmount ?? ''}
                    onChange={e => set('freeTripMaxAmount', e.target.value.trim() === '' ? null : Number(e.target.value))}
                  />
                </Field>
              </>
            ) : (
              <div className="bx-col-full small text-muted">
                <i className="fa-solid fa-circle-info me-1" aria-hidden="true" />
                Los cupones de descuento mensuales y el tope del viaje gratis solo aplican a niveles de pasajero.
              </div>
            )}
            <Field label="Tickets semanales" helpLong="Tickets automáticos en los sorteos de tipo Semanal.">
              <input type="number" min={0} className="form-control" value={form.weeklyRaffleTickets} onChange={e => set('weeklyRaffleTickets', num(e.target.value))} />
            </Field>
            <Field label="Tickets mensuales" helpLong="Tickets automáticos en los sorteos de tipo Mensual.">
              <input type="number" min={0} className="form-control" value={form.monthlyRaffleTickets} onChange={e => set('monthlyRaffleTickets', num(e.target.value))} />
            </Field>
            <div className="bx-col-full">
              <Switch checked={form.isActive} onChange={v => set('isActive', v)} label="Nivel activo" />
            </div>
          </FormSection>

          {error && <div className="alert alert-danger small mb-0" role="alert">{error}</div>}
        </div>
      )}
    </Drawer>
  );
}
