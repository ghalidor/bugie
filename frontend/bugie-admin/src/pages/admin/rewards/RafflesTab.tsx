import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../../state/api';
import {
  rewardsAdminApi, Raffle, RaffleInput, RaffleVerification, RaffleWinner, RewardLevel,
  RAFFLE_TYPES, RAFFLE_STATUS, RAFFLE_TONE, TARGETS,
  raffleTypeLabel, describeParticipants, fmtDate, fmtPoints,
} from '../../../state/rewards';
import { payoutsApi, PAYOUT_METHOD, nowLocalInput, fmtSoles } from '../../../state/payouts';
import PayoutFields, { PayoutDraft, validatePayout } from '../../../components/PayoutFields';
import {
  ActionItem, Column, DataTable, Drawer, Field, FilterBar, Page, SectionCard, Select, StatusBadge, Switch,
  useConfirm, useToast,
} from '../../../components/ui';
import { errMsg, FormSection, LoadError, optNum } from './common';

/* ──────────────────────────────────────────────────────────────────────────
   Sorteos.

   Lo distinto de esta pantalla es «Comprobar»: recalcula el sorteo con la
   semilla guardada y compara con el ganador registrado. Convierte «confía en
   nosotros» en algo que se puede demostrar.
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

function toInput(r: Raffle): RaffleInput {
  return {
    name: r.name, raffleType: r.raffleType, prizeDescription: r.prizeDescription,
    prizeValue: r.prizeValue, drawDate: r.drawDate,
    minLevelRequired: r.minLevelRequired, minMonthsActive: r.minMonthsActive,
    targetUserType: r.targetUserType, winnersCount: r.winnersCount,
    open: r.status === 'open',
  };
}

const roleLabel = (role?: string | null) =>
  role === 'driver' ? 'Conductor' : role === 'passenger' ? 'Pasajero' : role ?? '';

export default function RafflesTab() {
  const confirm = useConfirm();
  const toast = useToast();
  const [items,   setItems]   = useState<Raffle[]>([]);
  const [levels,  setLevels]  = useState<RewardLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [editing, setEditing] = useState<Raffle | 'new' | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [busy,    setBusy]    = useState<string | null>(null);
  const [filter,  setFilter]  = useState('all');

  const load = useCallback(() => {
    setLoading(true); setError(null);
    return Promise.all([rewardsAdminApi.raffles(), rewardsAdminApi.levels()])
      .then(([r, l]) => { setItems(r); setLevels(l); })
      .catch(e => setError(errMsg(e, 'No se pudieron cargar los sorteos.')))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const levelNames = useMemo(() => Object.fromEntries(levels.map(l => [l.name, l.displayName])), [levels]);
  const detail = items.find(r => r.id === detailId) ?? null;

  async function draw(r: Raffle) {
    const ok = await confirm({
      title: `¿Sortear «${r.name}» ahora?`,
      message: `Participan ${fmtPoints(r.ticketsNow)} tickets y saldrán ${r.winnersCount} ganador${r.winnersCount === 1 ? '' : 'es'}. A cada ganador le llega una notificación push y un correo con su código de premio. No se puede deshacer.`,
      tone: 'danger',
      confirmText: 'Sortear ahora',
      typeToConfirm: 'SORTEAR',
    });
    if (!ok) return;
    setBusy(r.id);
    try {
      const drawn = await rewardsAdminApi.drawRaffle(r.id);
      const codes = drawn.winners.map(w => w.prizeCode).filter(Boolean).join(', ');
      toast.success(`«${r.name}» sorteado.${codes ? ` Código${drawn.winners.length === 1 ? '' : 's'} de premio: ${codes}.` : ''} Al ganador le llega push y correo.`);
      await load();
      setDetailId(r.id);
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo sortear.'));
    } finally {
      setBusy(null);
    }
  }

  async function remove(r: Raffle) {
    const ok = await confirm({
      title: `¿Borrar «${r.name}»?`,
      message: `Se pierden sus ${fmtPoints(r.ticketsNow)} tickets. No se puede deshacer.`,
      tone: 'danger',
      confirmText: 'Borrar sorteo',
      typeToConfirm: 'BORRAR',
    });
    if (!ok) return;
    setBusy(r.id);
    try {
      await rewardsAdminApi.deleteRaffle(r.id);
      toast.success('Sorteo borrado.');
      if (detailId === r.id) setDetailId(null);
      load();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo borrar.'));
    } finally {
      setBusy(null);
    }
  }

  async function maintenance() {
    const ok = await confirm({
      title: '¿Repartir tickets ahora?',
      message: 'Entrega a cada usuario los tickets que le tocan por nivel en los sorteos abiertos. No sortea nada. El reparto corre solo cada madrugada; esto es para no esperar.',
      confirmText: 'Repartir tickets',
    });
    if (!ok) return;
    setBusy('maint');
    try {
      const r = await rewardsAdminApi.raffleMaintenance(false);
      toast.info(
        `${fmtPoints(r.ticketsGranted)} tickets entregados, ${r.rafflesDrawn} sorteos ejecutados.` + (r.messages.length ? ' ' + r.messages.join(' ') : ''),
        'Reparto terminado');
      load();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo ejecutar el reparto.'));
    } finally {
      setBusy(null);
    }
  }

  const counts = (s: string) => items.filter(r => r.status === s).length;
  const rows = filter === 'all' ? items : items.filter(r => r.status === filter);

  const columns: Column<Raffle>[] = [
    { key: 'name', header: 'Sorteo', priority: 1, width: '30%', render: r => (
      <div style={{ minWidth: 0 }}>
        <div className="rw-cell-main text-truncate">{r.name}</div>
        <div className="rw-cell-sub text-truncate">{r.prizeDescription}{r.prizeValue ? ` · S/ ${r.prizeValue}` : ''}</div>
      </div>
    ) },
    { key: 'type', header: 'Tipo', priority: 3, render: r => raffleTypeLabel(r.raffleType) },
    { key: 'who', header: 'Participan', priority: 3, render: r => <span className="rw-cell-sub">{describeParticipants(r, levelNames)}</span> },
    { key: 'date', header: 'Fecha', priority: 1, render: r => fmtDate(r.status === 'drawn' ? r.drawnAt : r.drawDate, true) },
    { key: 'tickets', header: 'Tickets', align: 'right', priority: 2, render: r => fmtPoints(r.status === 'drawn' ? (r.ticketsAtDraw ?? 0) : r.ticketsNow) },
    { key: 'status', header: 'Estado', priority: 1, render: r => {
      const delivered = r.winners.filter(w => w.status === 'delivered').length;
      return (
        <span className="rw-badges">
          <StatusBadge tone={RAFFLE_TONE[r.status] ?? 'neutral'} size="sm">{RAFFLE_STATUS[r.status]?.label ?? r.status}</StatusBadge>
          {r.winners.length > 0 && (
            <StatusBadge tone={delivered === r.winners.length ? 'ok' : 'warn'} size="sm" icon="fa-gift">{delivered}/{r.winners.length}</StatusBadge>
          )}
        </span>
      );
    } },
  ];

  const actions = (r: Raffle): ActionItem[] => {
    const sorteado = r.status === 'drawn';
    return [
      { label: 'Ver detalle', icon: 'fa-eye', onClick: () => setDetailId(r.id) },
      { label: 'Sortear', icon: 'fa-dice', hidden: sorteado, disabled: busy !== null || r.ticketsNow === 0, onClick: () => draw(r) },
      { label: 'Editar', icon: 'fa-pen', hidden: sorteado, onClick: () => setEditing(r) },
      { label: 'Borrar', icon: 'fa-trash', danger: true, separator: true, hidden: sorteado, disabled: busy !== null, onClick: () => remove(r) },
    ];
  };

  return (
    <Page
      title="Sorteos"
      subtitle="Premios por sorteo con tickets según nivel. Cada resultado se puede comprobar."
      icon="fa-dice"
      helpKey="rewards-raffles"
      actions={[
        { label: 'Nuevo sorteo', icon: 'fa-plus', variant: 'primary', onClick: () => setEditing('new') },
        { label: 'Repartir tickets', icon: 'fa-ticket', onClick: maintenance, loading: busy === 'maint', disabled: busy !== null && busy !== 'maint' },
      ]}
    >
      <SectionCard flush tourId="rw-raffle-list">
        <div className="p-3 pb-0">
          <FilterBar
            chips={[
              { value: 'all',    label: 'Todos',     count: items.length },
              { value: 'open',   label: 'Abiertos',  count: counts('open') },
              { value: 'closed', label: 'Cerrados',  count: counts('closed') },
              { value: 'drawn',  label: 'Sorteados', count: counts('drawn') },
            ]}
            chip={filter}
            onChipChange={setFilter}
          />
        </div>
        {error ? <LoadError text={error} onRetry={load} /> : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={r => r.id}
            loading={loading}
            onRowClick={r => setDetailId(r.id)}
            actions={actions}
            maxHeight="none"
            empty={items.length === 0
              ? { title: 'No hay sorteos', text: 'Crea el primero con «Nuevo sorteo».' }
              : { title: 'Ningún sorteo con este estado' }}
          />
        )}
      </SectionCard>

      <RaffleDetail
        raffle={detail}
        levelNames={levelNames}
        busy={busy !== null}
        onClose={() => setDetailId(null)}
        onDraw={draw}
        onEdit={r => { setDetailId(null); setEditing(r); }}
        onDelete={remove}
        onChanged={load}
      />

      <RaffleDrawer
        editing={editing}
        levels={levels}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
      />
    </Page>
  );
}

/* ── Detalle: ganadores, entregas y comprobación ───────────────────────── */
function RaffleDetail({ raffle: r, levelNames, busy, onClose, onDraw, onEdit, onDelete, onChanged }: {
  raffle: Raffle | null; levelNames: Record<string, string>; busy: boolean;
  onClose: () => void; onDraw: (r: Raffle) => void; onEdit: (r: Raffle) => void;
  onDelete: (r: Raffle) => void; onChanged: () => void;
}) {
  const toast = useToast();
  const [verification, setVerification] = useState<RaffleVerification | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => { setVerification(null); }, [r?.id]);

  async function verify() {
    if (!r) return;
    setVerifying(true);
    try {
      setVerification(await rewardsAdminApi.verifyRaffle(r.id));
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo comprobar el sorteo.'));
    } finally {
      setVerifying(false);
    }
  }

  const sorteado = r?.status === 'drawn';

  return (
    <Drawer
      open={!!r}
      onClose={onClose}
      title={r?.name}
      description={r ? `${raffleTypeLabel(r.raffleType)} · ${RAFFLE_STATUS[r.status]?.label ?? r.status}` : undefined}
      size="lg"
      footer={r && (sorteado ? (
        <button type="button" className="btn btn-outline-secondary" onClick={verify} disabled={verifying}>
          {verifying ? <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" /> : <i className="fa-solid fa-shield-halved me-2" aria-hidden="true" />}
          Comprobar resultado
        </button>
      ) : (
        <>
          <button type="button" className="btn btn-outline-danger" onClick={() => onDelete(r)} disabled={busy}>
            <i className="fa-solid fa-trash me-1" aria-hidden="true" />Borrar
          </button>
          <button type="button" className="btn btn-outline-secondary" onClick={() => onEdit(r)}>
            <i className="fa-solid fa-pen me-1" aria-hidden="true" />Editar
          </button>
          <button type="button" className="btn btn-bugie" onClick={() => onDraw(r)} disabled={busy || r.ticketsNow === 0}
                  title={r.ticketsNow === 0 ? 'Primero hay que repartir tickets' : undefined}>
            <i className="fa-solid fa-dice me-1" aria-hidden="true" />Sortear
          </button>
        </>
      ))}
    >
      {r && (
        <div className="rw-stack">
          <dl className="rw-kv">
            <div><dt>Premio</dt><dd>{r.prizeDescription}</dd></div>
            <div><dt>Valor aproximado</dt><dd>{r.prizeValue ? `S/ ${r.prizeValue}` : '—'}</dd></div>
            <div><dt>Participan</dt><dd>{describeParticipants(r, levelNames)}</dd></div>
            <div><dt>Ganadores</dt><dd>{r.winnersCount}</dd></div>
            <div><dt>{sorteado ? 'Sorteado el' : 'Se sortea el'}</dt><dd>{fmtDate(sorteado ? r.drawnAt : r.drawDate, true)}</dd></div>
            <div><dt>Tickets</dt><dd>{fmtPoints(sorteado ? (r.ticketsAtDraw ?? 0) : r.ticketsNow)}</dd></div>
          </dl>

          {!sorteado && r.ticketsNow === 0 && (
            <div className="alert alert-info small mb-0">
              Aún no tiene tickets. Se reparten solos cada madrugada, o ahora con «Repartir tickets».
            </div>
          )}

          {r.winners.length > 0 && (
            <SectionCard title="Ganadores" icon="fa-trophy" description="A cada ganador le llega una notificación push y un correo con su código de premio (PZ-…). Marca cada premio cuando lo entregues.">
              <div className="rw-stack">
                {r.winners.map(w => <WinnerRow key={w.id} w={w} prizeValue={r.prizeValue} onDone={onChanged} />)}
              </div>
            </SectionCard>
          )}

          {verification && (
            <div className={`rw-verify ${verification.matches ? 'ok' : 'bad'}`} role="status">
              <div className="fw-semibold">
                <StatusBadge tone={verification.matches ? 'ok' : 'bad'} icon={verification.matches ? 'fa-circle-check' : 'fa-circle-xmark'}>
                  {verification.matches ? 'Coincide' : 'No coincide'}
                </StatusBadge>{' '}
                {verification.matches
                  ? 'El ganador es el mismo que sale de la semilla.'
                  : 'El ganador registrado NO coincide con el recálculo.'}
              </div>
              <div className="bugie-muted">
                Se repitió el sorteo con la semilla guardada y los {verification.ticketCount} tickets. Cualquiera con estos datos puede hacer el mismo cálculo.
              </div>
              <div className="rw-mono"><span className="bugie-muted">Semilla: </span>{verification.seed}</div>
              <div className="rw-mono"><span className="bugie-muted">Hash: </span>{verification.seedHash}</div>
              <div className="rw-mono"><span className="bugie-muted">Recalculado: </span>{verification.recalculatedTickets.join(', ')}</div>
              <div className="rw-mono"><span className="bugie-muted">Registrado: </span>{verification.storedTickets.join(', ')}</div>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

/* ── Ganador: entrega del premio (y pago si es en dinero a un conductor) ── */
function WinnerRow({ w, prizeValue, onDone }: {
  w: RaffleWinner; prizeValue: number | null; onDone: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [open,   setOpen]   = useState(false);
  const [pay,    setPay]    = useState(w.userRole === 'driver' && !!prizeValue);
  const [note,   setNote]   = useState('');
  const [busy,   setBusy]   = useState(false);
  const [error,  setError]  = useState<string | null>(null);
  const [payout, setPayout] = useState<PayoutDraft>(() => ({
    method: 'yape', operationNumber: '', amount: prizeValue ? String(prizeValue) : '',
    paidAt: nowLocalInput(), note: '',
  }));
  const canPay = w.userRole === 'driver';

  async function deliver() {
    setError(null);
    if (pay) {
      const invalid = validatePayout(payout);
      if (invalid) { setError(invalid); return; }
    }
    const op0 = payout.operationNumber.trim();
    const ok = await confirm(pay
      ? { title: '¿Registrar el pago y entregar el premio?', confirmText: 'Registrar pago',
          message: `Vas a pagar ${fmtSoles(Number(payout.amount))} a ${w.userName ?? 'el ganador'} por ${PAYOUT_METHOD[payout.method].label}${op0 ? ` (op. ${op0})` : ''} y el premio quedará entregado.` }
      : { title: '¿Marcar el premio como entregado?', confirmText: 'Marcar entregado',
          message: `El premio de ${w.userName ?? 'el ganador'} quedará como entregado.` });
    if (!ok) return;
    setBusy(true);
    try {
      let nota = note.trim();
      if (pay) {
        try {
          await payoutsApi.register({
            driverId: w.userId, driverName: w.userName ?? null,
            amount: Number(payout.amount), method: payout.method,
            operationNumber: payout.operationNumber.trim() || null,
            paidAt: payout.paidAt, note: payout.note.trim() || null,
            sourceType: 'raffle_prize', sourceRef: w.id,
          });
        } catch (err) {
          // 409 = el premio ya tenía su pago registrado.
          if (!(err instanceof ApiError && err.status === 409)) throw err;
        }
        const op = payout.operationNumber.trim();
        nota = `Pagado por ${PAYOUT_METHOD[payout.method].label}${op ? ` · op ${op}` : ''} · ${fmtSoles(Number(payout.amount))}`
             + (payout.note.trim() ? ` · ${payout.note.trim()}` : '');
      }
      await rewardsAdminApi.deliverPrize(w.id, nota || undefined);
      toast.success(pay ? 'Pago registrado y premio entregado.' : 'Premio marcado como entregado.');
      setOpen(false); setBusy(false);
      onDone();
    } catch (err) {
      setError(errMsg(err, 'No se pudo registrar la entrega.'));
      setBusy(false);
    }
  }

  return (
    <div className="rw-winner">
      <div className="d-flex flex-wrap align-items-center gap-2">
        <StatusBadge tone={w.prizeRank === 1 ? 'warn' : 'neutral'} size="sm" icon={w.prizeRank === 1 ? 'fa-crown' : undefined}>
          {w.prizeRank === 1 ? 'Premio principal' : `Puesto ${w.prizeRank}`}
        </StatusBadge>
        <span className="rw-mono">{w.ticketNumber}</span>
        {w.prizeCode && (
          <StatusBadge tone="info" size="sm" icon="fa-ticket">
            Código de premio: <span className="rw-mono">{w.prizeCode}</span>
          </StatusBadge>
        )}
        <span className="flex-grow-1" />
        {w.status === 'delivered'
          ? <StatusBadge tone="ok" size="sm" icon="fa-circle-check">Entregado {w.deliveredAt ? fmtDate(w.deliveredAt) : ''}</StatusBadge>
          : !open && (
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setOpen(true)}>
              <i className="fa-solid fa-hand-holding me-1" aria-hidden="true" />Marcar entregado
            </button>
          )}
      </div>
      <div className="small">
        {w.userName && <><i className="fa-solid fa-user me-1 bugie-muted" aria-hidden="true" />{w.userName}</>}
        {w.userRole && <span className="bugie-muted"> · {roleLabel(w.userRole)}</span>}
        {w.prizeDetail && <span className="bugie-muted"> · {w.prizeDetail}</span>}
      </div>
      {w.status === 'delivered' && w.note && <div className="small bugie-muted">Nota: {w.note}</div>}

      {open && w.status !== 'delivered' && (
        <div className="rw-stack pt-2" style={{ borderTop: '1px solid var(--bugie-border)' }}>
          {canPay && (
            <Switch checked={pay} onChange={setPay} label="Se pagó en dinero al conductor" description="Queda en el reporte de pagos." />
          )}
          {pay
            ? <PayoutFields value={payout} onChange={setPayout} />
            : (
              <Field label="Nota de la entrega" optional>
                <input className="form-control" value={note} onChange={e => setNote(e.target.value)} />
              </Field>
            )}
          {error && <div className="alert alert-danger small mb-0" role="alert">{error}</div>}
          <div className="d-flex flex-wrap gap-2">
            <button type="button" onClick={deliver} disabled={busy} className="btn btn-sm btn-bugie">
              {busy && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
              {pay ? 'Registrar pago y entregar' : 'Confirmar entrega'}
            </button>
            <button type="button" onClick={() => { setOpen(false); setError(null); }} disabled={busy} className="btn btn-sm btn-outline-secondary">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Formulario en Drawer ──────────────────────────────────────────────── */
function RaffleDrawer({ editing, levels, onClose, onSaved }: {
  editing: Raffle | 'new' | null; levels: RewardLevel[]; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const id = editing && editing !== 'new' ? editing.id : null;
  const [initial, setInitial] = useState<RaffleInput>(emptyRaffle);
  const [f,       setF]       = useState<RaffleInput>(initial);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!editing) return;
    const init = editing === 'new' ? emptyRaffle() : toInput(editing);
    setInitial(init); setF(init); setError(null); setSaving(false);
  }, [editing]);

  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const set = <K extends keyof RaffleInput>(k: K, v: RaffleInput[K]) => setF(p => ({ ...p, [k]: v }));

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

  async function close() {
    if (saving) return;
    if (dirty) {
      const ok = await confirm({ title: '¿Descartar los cambios?', message: 'Lo que configuraste en este sorteo se perderá.', tone: 'warning', confirmText: 'Descartar', cancelText: 'Seguir editando' });
      if (!ok) return;
    }
    onClose();
  }

  async function save() {
    setSaving(true); setError(null);
    try {
      if (id) await rewardsAdminApi.updateRaffle(id, f);
      else    await rewardsAdminApi.createRaffle(f);
      toast.success(id ? 'Sorteo actualizado.' : 'Sorteo creado.');
      onSaved();
    } catch (e) {
      setError(errMsg(e, 'No se pudo guardar.'));
    } finally {
      setSaving(false);
    }
  }

  const levelLabel = nivelesDisponibles.find(l => l.name === f.minLevelRequired)?.displayName;

  return (
    <Drawer
      open={!!editing}
      onClose={close}
      title={id ? `Editar ${initial.name}` : 'Nuevo sorteo'}
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={close} disabled={saving}>Cancelar</button>
          <button type="button" className="btn btn-bugie" onClick={save} disabled={saving || (!!id && !dirty)}>
            {saving && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
            {id ? 'Guardar cambios' : 'Crear sorteo'}
          </button>
        </>
      }
    >
      <div className="rw-form">
        <div className="rw-summary" aria-live="polite">
          <i className="fa-solid fa-dice" aria-hidden="true" />
          <span>
            <strong>{f.name || 'Sin nombre'}</strong>: {f.prizeDescription || 'premio sin definir'} para{' '}
            {TARGETS.find(t => t.value === f.targetUserType)?.label.toLowerCase()}
            {levelLabel ? ` desde ${levelLabel}` : ''}, {f.winnersCount} ganador{f.winnersCount === 1 ? '' : 'es'}, el {fmtDate(f.drawDate, true)}.
          </span>
        </div>

        <FormSection step={1} title="Premio">
          <Field label="Nombre" required span="full">
            <input className="form-control" value={f.name} placeholder="Sorteo mensual de octubre" onChange={e => set('name', e.target.value)} />
          </Field>
          <Field label="Premio" required>
            <input className="form-control" value={f.prizeDescription} placeholder="Smartphone gama media" onChange={e => set('prizeDescription', e.target.value)} />
          </Field>
          <Field label="Valor aproximado (S/)" optional>
            <input type="number" min={0} className="form-control" value={f.prizeValue ?? ''} onChange={e => set('prizeValue', optNum(e.target.value))} />
          </Field>
        </FormSection>

        <FormSection step={2} title="Cuándo y cómo">
          <Field label="Tipo" helpLong="Define cuántos tickets da cada nivel: los semanales y los mensuales se configuran por separado en Catálogo → Niveles.">
            <Select
              value={f.raffleType as string}
              onChange={v => set('raffleType', v as RaffleInput['raffleType'])}
              options={RAFFLE_TYPES}
            />
          </Field>
          <Field label="Fecha del sorteo" required>
            <input type="datetime-local" className="form-control" value={paraInput(f.drawDate)}
                   onChange={e => { if (e.target.value) set('drawDate', new Date(e.target.value).toISOString()); }} />
          </Field>
          <Field label="Cantidad de ganadores" span="full" help="Nadie gana dos premios en el mismo sorteo." helpLong="El mensual del documento de Player Tracking tiene 4: uno principal y tres secundarios.">
            <input type="number" min={1} max={50} className="form-control" value={f.winnersCount} onChange={e => set('winnersCount', Number(e.target.value))} />
          </Field>
          <div className="bx-col-full">
            <Switch checked={f.open} onChange={v => set('open', v)} label="Abierto: reparte tickets" description="Si lo cierras, deja de repartir pero conserva los tickets ya entregados." />
          </div>
        </FormSection>

        <FormSection step={3} title="Quién participa">
          <Field label="Tipo de usuario">
            <Select
              value={f.targetUserType as string}
              onChange={v => set('targetUserType', v as RaffleInput['targetUserType'])}
              options={TARGETS}
            />
          </Field>
          <Field label="Nivel mínimo" helpLong="En el documento de Player Tracking, el sorteo semanal es desde Oro.">
            <Select
              value={f.minLevelRequired ?? ''}
              onChange={v => set('minLevelRequired', v || null)}
              options={[
                { value: '', label: 'Todos los niveles' },
                ...nivelesDisponibles.map(l => ({ value: l.name, label: l.displayName })),
              ]}
            />

          </Field>
          <Field label="Meses mínimos activos" optional span="full" help="Para el sorteo especial." helpLong="Se cuenta desde que el usuario empezó a acumular puntos.">
            <input type="number" min={0} className="form-control" placeholder="Sin mínimo" value={f.minMonthsActive ?? ''} onChange={e => set('minMonthsActive', optNum(e.target.value))} />
          </Field>
        </FormSection>

        {error && <div className="alert alert-danger small mb-0" role="alert">{error}</div>}
      </div>
    </Drawer>
  );
}
