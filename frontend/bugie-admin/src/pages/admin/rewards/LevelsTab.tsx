import { useEffect, useState } from 'react';
import { ApiError } from '../../../state/api';
import { rewardsAdminApi, RewardLevel, USER_TYPE_LABEL, fmtPoints } from '../../../state/rewards';

const LEVEL_COLOR: Record<string, string> = {
  bronze: '#cd7f32', silver: '#a8b3c1', gold: '#f5b400', platinum: '#7dd3fc',
};

export default function LevelsTab() {
  const [userType, setUserType] = useState<'passenger' | 'driver'>('passenger');
  const [levels,   setLevels]   = useState<RewardLevel[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [editing,  setEditing]  = useState<string | null>(null);

  function load() {
    setLoading(true); setError(null);
    rewardsAdminApi.levels(userType)
      .then(data => setLevels([...data].sort((a, b) => a.sortOrder - b.sortOrder)))
      .catch(err => setError(err instanceof ApiError ? err.message : 'No se pudieron cargar los niveles.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    setEditing(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userType]);

  function onSaved(updated: RewardLevel) {
    setLevels(prev => prev.map(l => l.id === updated.id ? updated : l));
    setEditing(null);
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
        <span className="small bugie-muted ms-2">
          Los rangos no pueden solaparse. El backend lo valida y te dice con qué nivel choca.
        </span>
      </div>

      {error && <div className="alert alert-danger small mb-3">{error}</div>}

      {loading ? (
        <div className="d-flex justify-content-center py-5"><span className="spinner-border" /></div>
      ) : error ? null : levels.length === 0 ? (
        <div className="bugie-card"><div className="bugie-card-body text-center py-4 bugie-muted">
          No hay niveles para {USER_TYPE_LABEL[userType].toLowerCase()}. Revisa que corriste el script 007.
        </div></div>
      ) : (
        <div className="d-flex flex-column gap-2">
          {levels.map(l => editing === l.id
            ? <LevelForm key={l.id} level={l} onCancel={() => setEditing(null)} onSaved={onSaved} />
            : <LevelRow key={l.id} level={l} onEdit={() => setEditing(l.id)} disabled={editing !== null} />
          )}
        </div>
      )}
    </>
  );
}

function LevelRow({ level, onEdit, disabled }: { level: RewardLevel; onEdit: () => void; disabled: boolean }) {
  const color = LEVEL_COLOR[level.name] ?? '#94a3b8';
  const range = level.maxPoints === null
    ? `${fmtPoints(level.minPoints)} pts o más`
    : `${fmtPoints(level.minPoints)} – ${fmtPoints(level.maxPoints)} pts`;

  return (
    <div className="bugie-card" style={{ overflow: 'hidden', opacity: level.isActive ? 1 : 0.55 }}>
      <div style={{ height: 3, background: color }} />
      <div className="p-3 d-flex flex-wrap align-items-center gap-3">
        <i className="fa-solid fa-medal" style={{ color, fontSize: '1.4rem', width: 24 }} />
        <div className="flex-grow-1">
          <div className="fw-bold">
            {level.displayName}
            {!level.isActive && <span className="small fw-normal bugie-muted ms-2">(inactivo)</span>}
          </div>
          <div className="small bugie-muted">{range}</div>
        </div>
        <div className="d-flex flex-wrap gap-3 small">
          <span><span className="bugie-muted">Descuento </span><strong>{level.discountPercentage}%</strong></span>
          <span><span className="bugie-muted">Viajes gratis/mes </span><strong>{level.monthlyFreeTrips}</strong></span>
          <span><span className="bugie-muted">Tickets semana </span><strong>{level.weeklyRaffleTickets}</strong></span>
          <span><span className="bugie-muted">Tickets mes </span><strong>{level.monthlyRaffleTickets}</strong></span>
        </div>
        <button type="button" onClick={onEdit} disabled={disabled}
                className="btn btn-sm btn-bugie-outline rounded-pill">
          <i className="fa-solid fa-pen me-1" />Editar
        </button>
      </div>
    </div>
  );
}

function LevelForm({ level, onCancel, onSaved }: {
  level: RewardLevel; onCancel: () => void; onSaved: (l: RewardLevel) => void;
}) {
  const [form,   setForm]   = useState<RewardLevel>(level);
  const [noCap,  setNoCap]  = useState(level.maxPoints === null);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const set = <K extends keyof RewardLevel>(k: K, v: RewardLevel[K]) => setForm(f => ({ ...f, [k]: v }));
  const num = (v: string) => (v.trim() === '' ? 0 : Number(v));

  async function save() {
    setSaving(true); setError(null);
    try {
      const updated = await rewardsAdminApi.saveLevel({ ...form, maxPoints: noCap ? null : form.maxPoints });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar el nivel.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bugie-card" style={{ border: '1px solid var(--bugie-primary)' }}>
      <div className="bugie-card-header">Editar nivel {level.displayName}</div>
      <div className="bugie-card-body">
        <div className="row g-3">
          <div className="col-md-4">
            <label className="form-label small fw-semibold">Nombre visible</label>
            <input className="form-control form-control-sm" value={form.displayName}
                   onChange={e => set('displayName', e.target.value)} />
          </div>
          <div className="col-md-4">
            <label className="form-label small fw-semibold">Desde (puntos)</label>
            <input type="number" min={0} className="form-control form-control-sm" value={form.minPoints}
                   onChange={e => set('minPoints', num(e.target.value))} />
          </div>
          <div className="col-md-4">
            <label className="form-label small fw-semibold">Hasta (puntos)</label>
            <input type="number" min={0} className="form-control form-control-sm"
                   value={noCap ? '' : form.maxPoints ?? ''} disabled={noCap}
                   onChange={e => set('maxPoints', num(e.target.value))} />
            <div className="form-check mt-1">
              <input id={`nocap-${level.id}`} type="checkbox" className="form-check-input"
                     checked={noCap} onChange={e => setNoCap(e.target.checked)} />
              <label htmlFor={`nocap-${level.id}`} className="form-check-label small">Sin techo (nivel más alto)</label>
            </div>
          </div>

          <div className="col-6 col-md-3">
            <label className="form-label small fw-semibold">Descuento %</label>
            <input type="number" min={0} max={100} step="0.5" className="form-control form-control-sm"
                   value={form.discountPercentage} onChange={e => set('discountPercentage', num(e.target.value))} />
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label small fw-semibold">Viajes gratis / mes</label>
            <input type="number" min={0} className="form-control form-control-sm"
                   value={form.monthlyFreeTrips} onChange={e => set('monthlyFreeTrips', num(e.target.value))} />
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label small fw-semibold">Tickets semanales</label>
            <input type="number" min={0} className="form-control form-control-sm"
                   value={form.weeklyRaffleTickets} onChange={e => set('weeklyRaffleTickets', num(e.target.value))} />
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label small fw-semibold">Tickets mensuales</label>
            <input type="number" min={0} className="form-control form-control-sm"
                   value={form.monthlyRaffleTickets} onChange={e => set('monthlyRaffleTickets', num(e.target.value))} />
          </div>

          <div className="col-12">
            <div className="form-check">
              <input id={`active-${level.id}`} type="checkbox" className="form-check-input"
                     checked={form.isActive} onChange={e => set('isActive', e.target.checked)} />
              <label htmlFor={`active-${level.id}`} className="form-check-label small">Nivel activo</label>
            </div>
          </div>
        </div>

        {error && <div className="alert alert-danger small mt-3 mb-0">{error}</div>}

        <div className="d-flex gap-2 mt-3">
          <button type="button" onClick={save} disabled={saving} className="btn btn-bugie rounded-pill">
            {saving ? <><span className="spinner-border spinner-border-sm me-2" />Guardando...</> : 'Guardar cambios'}
          </button>
          <button type="button" onClick={onCancel} disabled={saving} className="btn btn-bugie-outline rounded-pill">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
