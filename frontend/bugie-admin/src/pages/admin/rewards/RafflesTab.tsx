import { useEffect, useState } from 'react';
import { ApiError } from '../../../state/api';
import {
  rewardsAdminApi, Raffle, RaffleInput, RaffleVerification, RewardLevel,
  RAFFLE_TYPES, RAFFLE_STATUS, TARGETS, USER_TYPE_LABEL,
  raffleTypeLabel, describeParticipants, fmtDate, fmtPoints,
} from '../../../state/rewards';

/* ──────────────────────────────────────────────────────────────────────────
   Sorteos.

   Lo distinto de esta pantalla es el botón de comprobar: recalcula el sorteo
   con la semilla guardada y compara con el ganador registrado. Es lo que
   convierte «confía en nosotros» en algo que se puede demostrar.
   ────────────────────────────────────────────────────────────────────────── */

const emptyRaffle = (): RaffleInput => {
  const enUnaSemana = new Date();
  enUnaSemana.setDate(enUnaSemana.getDate() + 7);
  enUnaSemana.setHours(20, 0, 0, 0);
  return {
    name: '', raffleType: 'monthly', prizeDescription: '', prizeValue: null,
    drawDate: enUnaSemana.toISOString(),
    minLevelRequired: null, minMonthsActive: null,
    targetUserType: 'passenger', winnersCount: 1, open: true,
  };
};

export default function RafflesTab() {
  const [items,   setItems]   = useState<Raffle[]>([]);
  const [levels,  setLevels]  = useState<RewardLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy,    setBusy]    = useState<string | null>(null);
  const [check,   setCheck]   = useState<{ id: string; data: RaffleVerification } | null>(null);
  const [maint,   setMaint]   = useState<string | null>(null);

  function load() {
    setLoading(true); setError(null);
    Promise.all([rewardsAdminApi.raffles(), rewardsAdminApi.levels()])
      .then(([r, l]) => { setItems(r); setLevels(l); })
      .catch(e => setError(e instanceof ApiError ? e.message : 'No se pudieron cargar los sorteos.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const levelNames = Object.fromEntries(levels.map(l => [l.name, l.displayName]));

  async function run<T>(id: string, fn: () => Promise<T>, after?: (r: T) => void) {
    setBusy(id); setError(null);
    try {
      const r = await fn();
      after?.(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo completar la acción.');
    } finally {
      setBusy(null);
    }
  }

  async function maintenance(draw: boolean) {
    setBusy('maint'); setError(null); setMaint(null);
    try {
      const r = await rewardsAdminApi.raffleMaintenance(draw);
      setMaint(
        `${r.ticketsGranted} tickets entregados, ${r.rafflesDrawn} sorteos ejecutados.` +
        (r.messages.length ? ' ' + r.messages.join(' ') : ''));
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo ejecutar el mantenimiento.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <button type="button" onClick={() => setEditing('new')} disabled={editing !== null}
                className="btn btn-sm btn-bugie rounded-pill">
          <i className="fa-solid fa-plus me-1" />Nuevo sorteo
        </button>
        <button type="button" onClick={() => maintenance(false)} disabled={busy !== null}
                className="btn btn-sm btn-bugie-outline rounded-pill"
                title="Entrega los tickets que corresponden por nivel, sin sortear nada">
          {busy === 'maint' ? <span className="spinner-border spinner-border-sm" />
                            : <><i className="fa-solid fa-ticket me-1" />Repartir tickets</>}
        </button>
        <span className="small bugie-muted ms-auto">
          El reparto corre solo cada madrugada. Este botón es para no esperar.
        </span>
      </div>

      {maint && (
        <div className="alert alert-info small py-2 d-flex gap-2">
          <i className="fa-solid fa-circle-info mt-1" />
          <span>{maint}</span>
        </div>
      )}

      {error && <div className="alert alert-danger small mb-3">{error}</div>}

      {editing === 'new' && (
        <RaffleForm initial={emptyRaffle()} id={null} levels={levels}
                    onCancel={() => setEditing(null)}
                    onSaved={() => { setEditing(null); load(); }} />
      )}

      {loading ? (
        <div className="d-flex justify-content-center py-5"><span className="spinner-border" /></div>
      ) : error ? null : items.length === 0 ? (
        <div className="bugie-card"><div className="bugie-card-body text-center py-4 bugie-muted">
          No hay sorteos. Crea el primero con el botón de arriba.
        </div></div>
      ) : (
        <div className="d-flex flex-column gap-2">
          {items.map(r => editing === r.id ? (
            <RaffleForm key={r.id} id={r.id} levels={levels} initial={toInput(r)}
                        onCancel={() => setEditing(null)}
                        onSaved={() => { setEditing(null); load(); }} />
          ) : (
            <RaffleCard
              key={r.id} r={r} levelNames={levelNames}
              busy={busy === r.id} disabled={editing !== null}
              verification={check?.id === r.id ? check.data : null}
              onEdit={() => setEditing(r.id)}
              onDraw={() => {
                if (!confirm(`Sortear «${r.name}» ahora con ${r.ticketsNow} tickets?\n\nNo se puede deshacer.`)) return;
                run(r.id, () => rewardsAdminApi.drawRaffle(r.id), load);
              }}
              onVerify={() => run(r.id, () => rewardsAdminApi.verifyRaffle(r.id),
                                 d => setCheck({ id: r.id, data: d }))}
              onCloseVerify={() => setCheck(null)}
              onDeliver={(w) => {
                const nota = prompt('Nota de la entrega (opcional)') ?? undefined;
                run(r.id, () => rewardsAdminApi.deliverPrize(w, nota), load);
              }}
              onDelete={() => {
                if (!confirm(`¿Borrar «${r.name}»? Se pierden sus ${r.ticketsNow} tickets.`)) return;
                run(r.id, () => rewardsAdminApi.deleteRaffle(r.id), load);
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}

function toInput(r: Raffle): RaffleInput {
  return {
    name: r.name, raffleType: r.raffleType, prizeDescription: r.prizeDescription,
    prizeValue: r.prizeValue, drawDate: r.drawDate,
    minLevelRequired: r.minLevelRequired, minMonthsActive: r.minMonthsActive,
    targetUserType: r.targetUserType, winnersCount: r.winnersCount,
    open: r.status === 'open',
  };
}

/* ── Tarjeta de sorteo ─────────────────────────────────────────────────── */
function RaffleCard({ r, levelNames, busy, disabled, verification,
                      onEdit, onDraw, onVerify, onCloseVerify, onDeliver, onDelete }: {
  r: Raffle; levelNames: Record<string, string>;
  busy: boolean; disabled: boolean; verification: RaffleVerification | null;
  onEdit: () => void; onDraw: () => void; onVerify: () => void;
  onCloseVerify: () => void; onDeliver: (winnerId: string) => void; onDelete: () => void;
}) {
  const estado = RAFFLE_STATUS[r.status] ?? { label: r.status, color: '#94a3b8' };
  const sorteado = r.status === 'drawn';

  return (
    <div className="bugie-card" style={{ overflow: 'hidden' }}>
      <div style={{ height: 3, background: estado.color }} />
      <div className="p-3">
        <div className="d-flex flex-wrap align-items-start gap-3">
          <div className="flex-grow-1" style={{ minWidth: 240 }}>
            <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
              <span className="fw-bold">{r.name}</span>
              <span className="badge rounded-pill"
                    style={{ background: estado.color + '22', color: estado.color, fontSize: '.68rem' }}>
                {estado.label}
              </span>
              <span className="badge rounded-pill"
                    style={{ background: 'var(--bugie-primary)22', color: 'var(--bugie-primary)', fontSize: '.68rem' }}>
                {raffleTypeLabel(r.raffleType)}
              </span>
            </div>
            <div className="small">{r.prizeDescription}
              {r.prizeValue ? <span className="bugie-muted"> · valor S/ {r.prizeValue}</span> : null}
            </div>
            <div className="small bugie-muted mt-1">
              {describeParticipants(r, levelNames)} · {r.winnersCount} ganador{r.winnersCount === 1 ? '' : 'es'}
            </div>
          </div>

          <div className="text-end small" style={{ minWidth: 130 }}>
            <div className="bugie-muted">{sorteado ? 'Sorteado el' : 'Se sortea el'}</div>
            <div className="fw-semibold">{fmtDate(sorteado ? r.drawnAt : r.drawDate, true)}</div>
            <div className="bugie-muted mt-1">
              {fmtPoints(sorteado ? (r.ticketsAtDraw ?? 0) : r.ticketsNow)} tickets
            </div>
          </div>

          <div className="d-flex flex-wrap gap-2">
            {!sorteado && (
              <button type="button" onClick={onDraw} disabled={busy || disabled || r.ticketsNow === 0}
                      className="btn btn-sm btn-bugie rounded-pill"
                      title={r.ticketsNow === 0 ? 'Primero hay que repartir tickets' : ''}>
                {busy ? <span className="spinner-border spinner-border-sm" />
                      : <><i className="fa-solid fa-dice me-1" />Sortear</>}
              </button>
            )}
            {sorteado && (
              <button type="button" onClick={verification ? onCloseVerify : onVerify}
                      disabled={busy || disabled}
                      className="btn btn-sm btn-bugie-outline rounded-pill">
                <i className="fa-solid fa-shield-halved me-1" />
                {verification ? 'Ocultar' : 'Comprobar'}
              </button>
            )}
            {!sorteado && (
              <>
                <button type="button" onClick={onEdit} disabled={disabled}
                        className="btn btn-sm btn-bugie-outline rounded-pill">
                  <i className="fa-solid fa-pen" />
                </button>
                <button type="button" onClick={onDelete} disabled={busy || disabled}
                        className="btn btn-sm btn-bugie-outline rounded-pill">
                  <i className="fa-solid fa-trash" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Ganadores */}
        {r.winners.length > 0 && (
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--bugie-border)' }}>
            <div className="small fw-semibold mb-2">Ganadores</div>
            <div className="d-flex flex-column gap-2">
              {r.winners.map(w => (
                <div key={w.id} className="d-flex flex-wrap align-items-center gap-2 small">
                  <span className="badge rounded-pill"
                        style={{ background: w.prizeRank === 1 ? '#f5b40022' : 'var(--bugie-border)',
                                 color: w.prizeRank === 1 ? '#f5b400' : 'var(--bugie-muted)' }}>
                    {w.prizeRank === 1 ? 'Premio principal' : `Puesto ${w.prizeRank}`}
                  </span>
                  <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontWeight: 600 }}>
                    {w.ticketNumber}
                  </span>
                  <span className="bugie-muted">{w.prizeDetail}</span>
                  {w.status === 'delivered' ? (
                    <span style={{ color: '#34d399' }}>
                      <i className="fa-solid fa-circle-check me-1" />
                      Entregado {w.deliveredAt ? fmtDate(w.deliveredAt) : ''}
                    </span>
                  ) : (
                    <button type="button" onClick={() => onDeliver(w.id)} disabled={busy || disabled}
                            className="btn btn-sm btn-bugie-outline rounded-pill py-0 px-2 ms-auto"
                            style={{ fontSize: '.72rem' }}>
                      Marcar entregado
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Comprobación */}
        {verification && (
          <div className="mt-3 p-3" style={{
            background: verification.matches
              ? 'color-mix(in srgb, #34d399 10%, transparent)'
              : 'color-mix(in srgb, #ef4444 10%, transparent)',
            border: `1px solid ${verification.matches ? '#34d39955' : '#ef444455'}`,
            borderRadius: 10,
          }}>
            <div className="fw-semibold small mb-2" style={{ color: verification.matches ? '#34d399' : '#ef4444' }}>
              <i className={`fa-solid ${verification.matches ? 'fa-circle-check' : 'fa-circle-xmark'} me-2`} />
              {verification.matches
                ? 'El ganador coincide con el que sale de la semilla.'
                : 'El ganador registrado NO coincide con el recálculo.'}
            </div>
            <div className="small bugie-muted mb-2">
              Se repitió el sorteo con la semilla guardada y los {verification.ticketCount} tickets.
              Cualquiera con estos datos puede hacer el mismo cálculo.
            </div>
            <div className="small" style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>
              <div><span className="bugie-muted">Semilla: </span>{verification.seed}</div>
              <div><span className="bugie-muted">Hash: </span>{verification.seedHash?.slice(0, 32)}…</div>
              <div className="mt-1">
                <span className="bugie-muted">Recalculado: </span>{verification.recalculatedTickets.join(', ')}
              </div>
              <div>
                <span className="bugie-muted">Registrado: </span>{verification.storedTickets.join(', ')}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Formulario ────────────────────────────────────────────────────────── */
function RaffleForm({ initial, id, levels, onCancel, onSaved }: {
  initial: RaffleInput; id: string | null; levels: RewardLevel[];
  onCancel: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState<RaffleInput>(initial);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const set = <K extends keyof RaffleInput>(k: K, v: RaffleInput[K]) =>
    setF(p => ({ ...p, [k]: v }));

  // Niveles del tipo de usuario elegido, sin repetir nombres.
  const nivelesDisponibles = levels
    .filter(l => f.targetUserType === 'both' || l.userType === f.targetUserType)
    .filter((l, i, arr) => arr.findIndex(x => x.name === l.name) === i)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  /** El input datetime-local necesita el formato YYYY-MM-DDTHH:mm sin zona. */
  const paraInput = (iso: string) => {
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  async function save() {
    setSaving(true); setError(null);
    try {
      if (id) await rewardsAdminApi.updateRaffle(id, f);
      else    await rewardsAdminApi.createRaffle(f);
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bugie-card mb-2" style={{ border: '1px solid var(--bugie-primary)' }}>
      <div className="bugie-card-header">{id ? `Editar ${initial.name}` : 'Nuevo sorteo'}</div>
      <div className="bugie-card-body">
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label small fw-semibold">Nombre</label>
            <input className="form-control form-control-sm" value={f.name}
                   placeholder="Sorteo mensual de octubre"
                   onChange={e => set('name', e.target.value)} />
          </div>
          <div className="col-md-3">
            <label className="form-label small fw-semibold">Tipo</label>
            <select className="form-select form-select-sm" value={f.raffleType}
                    onChange={e => set('raffleType', e.target.value as RaffleInput['raffleType'])}>
              {RAFFLE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <div className="small bugie-muted mt-1">
              Define cuántos tickets da cada nivel: los semanales y los mensuales
              se configuran por separado en la pestaña Niveles.
            </div>
          </div>
          <div className="col-md-3">
            <label className="form-label small fw-semibold">Fecha del sorteo</label>
            <input type="datetime-local" className="form-control form-control-sm"
                   value={paraInput(f.drawDate)}
                   onChange={e => set('drawDate', new Date(e.target.value).toISOString())} />
          </div>

          <div className="col-md-8">
            <label className="form-label small fw-semibold">Premio</label>
            <input className="form-control form-control-sm" value={f.prizeDescription}
                   placeholder="Smartphone gama media"
                   onChange={e => set('prizeDescription', e.target.value)} />
          </div>
          <div className="col-md-4">
            <label className="form-label small fw-semibold">Valor aproximado (S/)</label>
            <input type="number" min={0} className="form-control form-control-sm"
                   value={f.prizeValue ?? ''}
                   onChange={e => set('prizeValue', e.target.value === '' ? null : Number(e.target.value))} />
          </div>

          <div className="col-12">
            <div className="small fw-bold mt-2 mb-2">¿QUIÉN PARTICIPA?</div>
          </div>

          <div className="col-md-4">
            <label className="form-label small fw-semibold">Tipo de usuario</label>
            <select className="form-select form-select-sm" value={f.targetUserType}
                    onChange={e => set('targetUserType', e.target.value as RaffleInput['targetUserType'])}>
              {TARGETS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div className="col-md-4">
            <label className="form-label small fw-semibold">Nivel mínimo</label>
            <select className="form-select form-select-sm" value={f.minLevelRequired ?? ''}
                    onChange={e => set('minLevelRequired', e.target.value || null)}>
              <option value="">Todos los niveles</option>
              {nivelesDisponibles.map(l => (
                <option key={l.name} value={l.name}>{l.displayName}</option>
              ))}
            </select>
            <div className="small bugie-muted mt-1">El semanal del PDF es desde Oro.</div>
          </div>

          <div className="col-md-4">
            <label className="form-label small fw-semibold">Meses mínimos activos</label>
            <input type="number" min={0} className="form-control form-control-sm"
                   placeholder="Sin mínimo" value={f.minMonthsActive ?? ''}
                   onChange={e => set('minMonthsActive', e.target.value === '' ? null : Number(e.target.value))} />
            <div className="small bugie-muted mt-1">
              Para el sorteo especial. Se cuenta desde que empezó a acumular puntos.
            </div>
          </div>

          <div className="col-md-4">
            <label className="form-label small fw-semibold">Cantidad de ganadores</label>
            <input type="number" min={1} max={50} className="form-control form-control-sm"
                   value={f.winnersCount}
                   onChange={e => set('winnersCount', Number(e.target.value))} />
            <div className="small bugie-muted mt-1">
              El mensual del PDF tiene 4: uno principal y tres secundarios.
              Nadie gana dos premios en el mismo sorteo.
            </div>
          </div>

          <div className="col-md-8 d-flex align-items-end">
            <div className="form-check mb-3">
              <input id="raffle-open" type="checkbox" className="form-check-input"
                     checked={f.open} onChange={e => set('open', e.target.checked)} />
              <label htmlFor="raffle-open" className="form-check-label small fw-semibold">
                Abierto: reparte tickets
              </label>
              <div className="small bugie-muted">
                Si lo cierras, deja de repartir pero conserva los tickets ya entregados.
              </div>
            </div>
          </div>
        </div>

        {error && <div className="alert alert-danger small mt-3 mb-0">{error}</div>}

        <div className="d-flex gap-2 mt-3">
          <button type="button" onClick={save} disabled={saving}
                  className="btn btn-bugie rounded-pill px-4">
            {saving ? <><span className="spinner-border spinner-border-sm me-2" />Guardando…</>
                    : id ? 'Guardar cambios' : 'Crear sorteo'}
          </button>
          <button type="button" onClick={onCancel} disabled={saving}
                  className="btn btn-bugie-outline rounded-pill">Cancelar</button>
        </div>
      </div>
    </div>
  );
}
