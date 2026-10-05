import { useCallback, useEffect, useState } from 'react';
import {
  rewardsAdminApi, UserSearch, UserRewardsDetail, UserTransaction,
  fmtPoints, fmtDate, describeReward, STATUS_LABEL, STATUS_TONE,
} from '../../../state/rewards';
import {
  Column, DataTable, Drawer, EmptyState, Field, FilterBar, Pagination, SectionCard, Skeleton,
  StatCard, StatGrid, StatusBadge, useDebouncedValue, useToast,
} from '../../../components/ui';
import { errMsg, LoadError } from './common';

/* ──────────────────────────────────────────────────────────────────────────
   Soporte: buscar a una persona y corregirle los puntos.

   Existe para no entrar a producción con psql cada vez que alguien reclama.
   Lo que NO se puede hacer, a propósito: borrar o editar movimientos. El
   libro de puntos es inmutable; un error se corrige con un ajuste nuevo que
   queda registrado, igual que en contabilidad.
   ────────────────────────────────────────────────────────────────────────── */

const TX_LABEL: Record<string, string> = {
  earn:       'Ganó',
  redeem:     'Canjeó',
  expire:     'Vencieron',
  bonus:      'Devolución',
  adjust_add: 'Ajuste (+)',
  adjust_sub: 'Ajuste (−)',
};

const SOURCE_LABEL: Record<string, string> = {
  trip_completed:     'Viaje completado',
  rating:             'Calificación',
  referral:           'Referido',
  referral_qualified: 'Referido activo',
  streak:             'Racha',
  weekly_goal:        'Meta semanal',
  promotion:          'Promoción',
  catalog_redemption: 'Canje',
  redemption_refund:  'Canje anulado',
  points_expired:     'Vencimiento',
  admin_adjustment:   'Ajuste del admin',
};

const HISTORY_PAGE = 10;

export default function SupportTab() {
  const [query,   setQuery]   = useState('');
  const debounced = useDebouncedValue(query.trim(), 450);
  const [results, setResults] = useState<UserSearch[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);

  const [userId,  setUserId]  = useState<string | null>(null);
  const [detail,  setDetail]  = useState<UserRewardsDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailErr, setDetailErr] = useState<string | null>(null);

  // Busca solo con 3 letras o más (lo mismo que exige el backend).
  useEffect(() => {
    if (debounced.length < 3) { setResults(null); setSearchErr(null); return; }
    let alive = true;
    setSearching(true); setSearchErr(null);
    rewardsAdminApi.searchUsers(debounced)
      .then(r => { if (alive) setResults(r); })
      .catch(e => { if (alive) setSearchErr(errMsg(e, 'No se pudo buscar.')); })
      .finally(() => { if (alive) setSearching(false); });
    return () => { alive = false; };
  }, [debounced]);

  const open = useCallback(async (id: string) => {
    setUserId(id); setLoadingDetail(true); setDetailErr(null);
    try {
      setDetail(await rewardsAdminApi.getUser(id));
    } catch (e) {
      setDetailErr(errMsg(e, 'No se pudo cargar el usuario.'));
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const back = () => { setUserId(null); setDetail(null); setDetailErr(null); };

  if (userId) {
    return (
      <div className="rw-stack">
        <div>
          <button type="button" onClick={back} className="btn btn-sm btn-outline-secondary">
            <i className="fa-solid fa-arrow-left me-1" aria-hidden="true" />Volver a la búsqueda
          </button>
        </div>
        {loadingDetail && !detail ? (
          <SectionCard><Skeleton count={4} height={18} /></SectionCard>
        ) : detailErr || !detail ? (
          <SectionCard><LoadError text={detailErr ?? 'No se pudo cargar.'} onRetry={() => open(userId)} /></SectionCard>
        ) : (
          <UserDetail detail={detail} onReload={() => open(userId)} />
        )}
      </div>
    );
  }

  const columns: Column<UserSearch>[] = [
    { key: 'name', header: 'Usuario', priority: 1, render: u => (
      <div style={{ minWidth: 0 }}>
        <div className="rw-cell-main text-truncate">
          <i className={`fa-solid ${u.role === 'driver' ? 'fa-car-side' : 'fa-user'} me-2 bugie-muted`} aria-hidden="true" />
          {u.fullName ?? 'Sin nombre'}
        </div>
        <div className="rw-cell-sub text-truncate">{u.email}{u.phone && ` · ${u.phone}`}</div>
      </div>
    ) },
    { key: 'role', header: 'Tipo', priority: 2, render: u => u.role === 'driver' ? 'Conductor' : 'Pasajero' },
    { key: 'level', header: 'Nivel', priority: 3, render: u => u.currentLevel ?? '—' },
    { key: 'points', header: 'Puntos', align: 'right', priority: 1, render: u => u.hasProfile
      ? <strong>{fmtPoints(u.availablePoints)}</strong>
      : <StatusBadge tone="warn" size="sm">Sin puntos aún</StatusBadge> },
  ];

  return (
    <SectionCard flush tourId="rw-red-support">
      <div className="p-3 pb-0">
        <FilterBar search={query} onSearchChange={setQuery} searchPlaceholder="Correo, nombre o teléfono (mín. 3 letras)" />
        <p className="small bugie-muted mt-2 mb-0">
          Busca en todas las cuentas, no solo en las que tienen puntos: si alguien reclama que no le acreditaron nada, quizá aún no tiene perfil.
        </p>
      </div>
      {searchErr ? <LoadError text={searchErr} /> : results === null && !searching ? (
        <EmptyState compact icon="fa-magnifying-glass" title="Busca a una persona" text="Escribe al menos 3 letras para ver resultados." />
      ) : (
        <DataTable
          columns={columns}
          rows={results ?? []}
          rowKey={u => u.userId}
          loading={searching}
          onRowClick={u => open(u.userId)}
          maxHeight="none"
          empty={{ title: 'Ningún usuario coincide', text: 'Prueba con otra parte del nombre, el correo o el teléfono.' }}
        />
      )}
    </SectionCard>
  );
}

function UserDetail({ detail, onReload }: { detail: UserRewardsDetail; onReload: () => void }) {
  const u = detail.user;
  const p = detail.profile;
  const [adjusting, setAdjusting] = useState(false);
  const [page, setPage] = useState(1);

  const history = detail.history ?? [];
  const pageRows = history.slice((page - 1) * HISTORY_PAGE, page * HISTORY_PAGE);

  const columns: Column<UserTransaction>[] = [
    { key: 'type', header: 'Movimiento', priority: 1, render: t => (
      <div style={{ minWidth: 0 }}>
        <div className="rw-cell-main">
          {TX_LABEL[t.type] ?? t.type}
          {t.type.startsWith('adjust') && <StatusBadge tone="primary" size="sm" className="ms-2">manual</StatusBadge>}
        </div>
        <div className="rw-cell-sub">{SOURCE_LABEL[t.sourceEvent] ?? t.sourceEvent}</div>
      </div>
    ) },
    { key: 'points', header: 'Puntos', align: 'right', priority: 1, render: t => {
      const suma = ['earn', 'bonus', 'adjust_add'].includes(t.type);
      return <span className={suma ? 'rw-plus' : 'rw-minus'}>{suma ? '+' : '−'}{fmtPoints(t.points)}</span>;
    } },
    { key: 'balance', header: 'Saldo', align: 'right', priority: 1, render: t => fmtPoints(t.balanceAfter) },
    { key: 'date', header: 'Fecha', priority: 2, render: t => fmtDate(t.createdAt, true) },
    { key: 'notes', header: 'Nota', priority: 3, render: t => t.notes ?? '—' },
  ];

  return (
    <>
      <SectionCard
        title={u.fullName ?? 'Sin nombre'}
        icon={u.role === 'driver' ? 'fa-car-side' : 'fa-user'}
        description={`${u.email ?? ''}${u.phone ? ` · ${u.phone}` : ''} · ${u.role === 'driver' ? 'Conductor' : 'Pasajero'}`}
        actions={
          <button type="button" className="btn btn-sm btn-bugie" onClick={() => setAdjusting(true)} data-tour="rw-adjust">
            <i className="fa-solid fa-pen-to-square me-1" aria-hidden="true" />Ajustar puntos
          </button>
        }
      >
        {p ? (
          <>
            <StatGrid min={140}>
              <StatCard label="Disponibles" value={fmtPoints(p.availablePoints)} icon="fa-wallet" tone="primary" />
              <StatCard label="Ganados" value={fmtPoints(p.totalPoints)} icon="fa-coins" tone="ok" />
              <StatCard label="Canjeados" value={fmtPoints(p.redeemedPoints)} icon="fa-gift" tone="info" />
            </StatGrid>
            <p className="rw-note">
              Nivel <strong>{p.currentLevel}</strong> · miembro desde {fmtDate(p.memberSince)} ·{' '}
              {p.pointsExpiryDate ? `sus puntos vencen el ${fmtDate(p.pointsExpiryDate)}` : 'sin fecha de vencimiento'}
              {detail.invited > 0 && ` · invitó a ${detail.invited} (${detail.invitedQualified} activos)`}
            </p>
          </>
        ) : (
          <EmptyState compact icon="fa-circle-info" title="Nunca ganó puntos" text="Todavía no tiene perfil de puntos. Suele ser la respuesta al reclamo." />
        )}
      </SectionCard>

      <div className="bx-split">
        <SectionCard title="Historial de puntos" icon="fa-clock-rotate-left" description={`${history.length} movimiento${history.length === 1 ? '' : 's'}`} flush>
          <DataTable
            columns={columns}
            rows={pageRows}
            rowKey={t => t.id}
            maxHeight="none"
            empty={{ title: 'Sin movimientos', text: 'Nunca se le acreditó nada.' }}
          />
          <div className="px-3">
            <Pagination page={page} pageSize={HISTORY_PAGE} total={history.length} onPageChange={setPage} />
          </div>
        </SectionCard>

        <SectionCard title="Canjes y logros" icon="fa-gift">
          {detail.redemptions.length === 0 && detail.milestones.length === 0 ? (
            <EmptyState compact title="Sin canjes ni logros todavía" />
          ) : (
            <div className="rw-stack">
              {detail.redemptions.map(r => (
                <div key={r.id} className="d-flex align-items-center gap-2" style={{ minWidth: 0 }}>
                  <div className="flex-grow-1" style={{ minWidth: 0 }}>
                    <div className="rw-cell-main text-truncate">{r.itemName}</div>
                    <div className="rw-cell-sub"><span className="rw-mono">{r.code}</span> · {describeReward(r)}</div>
                  </div>
                  <StatusBadge tone={STATUS_TONE[r.status] ?? 'neutral'} size="sm">{STATUS_LABEL[r.status] ?? r.status}</StatusBadge>
                </div>
              ))}
              {detail.milestones.length > 0 && (
                <div>
                  <div className="small fw-semibold mb-1">Logros recientes</div>
                  <ul className="small bugie-muted mb-0 ps-3">
                    {detail.milestones.map((m, i) => <li key={i}>{m}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </SectionCard>
      </div>

      <AdjustDrawer
        open={adjusting}
        userId={u.userId}
        userName={u.fullName ?? u.email ?? 'el usuario'}
        currentBalance={p?.availablePoints ?? 0}
        onClose={() => setAdjusting(false)}
        onDone={() => { setAdjusting(false); setPage(1); onReload(); }}
      />
    </>
  );
}

function AdjustDrawer({ open, userId, userName, currentBalance, onClose, onDone }: {
  open: boolean; userId: string; userName: string; currentBalance: number;
  onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [points, setPoints] = useState('');
  const [reason, setReason] = useState('');
  const [busy,   setBusy]   = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  useEffect(() => { if (open) { setPoints(''); setReason(''); setError(null); } }, [open]);

  const valor  = Number(points);
  const hayNum = points.trim() !== '' && !Number.isNaN(valor) && valor !== 0;
  const valido = hayNum && reason.trim().length >= 5;
  const nuevo  = currentBalance + (Number.isNaN(valor) ? 0 : valor);

  async function aplicar() {
    setBusy(true); setError(null);
    try {
      const r = await rewardsAdminApi.adjustPoints(userId, valor, reason.trim());
      toast.success(`Saldo: ${fmtPoints(r.balanceBefore)} → ${fmtPoints(r.balanceAfter)}.`, 'Ajuste aplicado');
      if (r.warning) toast.warning(r.warning);
      onDone();
    } catch (e) {
      setError(errMsg(e, 'No se pudo aplicar el ajuste.'));
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
      title="Ajustar puntos"
      description={`A ${userName}. Queda en el historial con tu usuario y el motivo.`}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className="btn btn-bugie" onClick={aplicar} disabled={!valido || busy}>
            {busy && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}Aplicar ajuste
          </button>
        </>
      }
    >
      <div className="rw-form">
        <Field label="Puntos" help="Positivo suma, negativo resta." required>
          <input type="number" className="form-control" placeholder="Ej. 500 o -200" value={points} onChange={e => setPoints(e.target.value)} />
        </Field>
        <Field
          label="Motivo"
          help="Mínimo 5 caracteres."
          helpLong="Obligatorio: dentro de seis meses nadie recordará por qué este usuario recibió estos puntos."
          required
        >
          <textarea className="form-control" rows={3} placeholder="Ej. compensación por falla del 12/10 que no acreditó puntos" value={reason} onChange={e => setReason(e.target.value)} />
        </Field>

        {hayNum && (
          <div className="rw-summary" aria-live="polite">
            <i className="fa-solid fa-scale-balanced" aria-hidden="true" />
            <span>
              El saldo pasaría de <strong>{fmtPoints(currentBalance)}</strong> a <strong>{fmtPoints(Math.max(0, nuevo))}</strong>
              {nuevo < 0 && ' (no baja de cero: se resta solo lo disponible)'}.
            </span>
          </div>
        )}
        {error && <div className="alert alert-danger small mb-0" role="alert">{error}</div>}
        <p className="small bugie-muted mb-0">El ajuste no borra ni cambia movimientos anteriores: agrega uno nuevo.</p>
      </div>
    </Drawer>
  );
}
