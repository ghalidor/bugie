import { useEffect, useState } from 'react';
import { API, apiFetch, ApiError } from '../../state/api';
import {
  DataTable, Drawer, Field, SectionCard, Select, StatusBadge, Switch, Tabs,
  useConfirm, useToast, type Column,
} from '../../components/ui';

/**
 * Feriados (dentro de Configuración). No cuentan como días hábiles para los
 * plazos del Libro de Reclamaciones.
 *   fijo   mes/día, se repite cada año
 *   movil  Jueves y Viernes Santo, calculados desde la Pascua (solo se renombran o desactivan)
 *   extra  una fecha exacta (se puede borrar)
 * Cada cambio se guarda al momento. API: /api/landing/admin/holidays.
 */

type Kind = 'fijo' | 'movil' | 'extra';

interface Holiday {
  id: string; name: string; kind: Kind;
  month: number | null; day: number | null; movable: string | null; date: string | null;
  isActive: boolean; currentYearDate: string | null;
}

interface YearDay {
  date: string; name: string; kind: Kind; holidayId: string; isActive: boolean; isWeekend: boolean;
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTH_OPTIONS = MONTHS.map((m, i) => ({ value: String(i + 1), label: m[0].toUpperCase() + m.slice(1) }));
const KIND_OPTIONS = [
  { value: 'fijo', label: 'Fijo (se repite cada año)' },
  { value: 'extra', label: 'Extra (solo una fecha)' },
];

/** "28/07/2026" de "2026-07-28". */
function fmtDay(iso?: string | null) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}
/** Día de la semana de "yyyy-MM-dd" (sin zona horaria). */
function weekday(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return WEEKDAYS[new Date(y, m - 1, d).getDay()];
}

const KindBadge = ({ kind }: { kind: Kind }) =>
  kind === 'fijo' ? <StatusBadge tone="primary" size="sm">Fijo</StatusBadge>
  : kind === 'movil' ? <StatusBadge tone="info" size="sm">Móvil</StatusBadge>
  : <StatusBadge tone="neutral" size="sm">Extra</StatusBadge>;

function whenText(h: Holiday) {
  if (h.kind === 'fijo') return `${h.day} de ${MONTHS[(h.month ?? 1) - 1]}`;
  if (h.kind === 'movil') return `Calculado cada año${h.currentYearDate ? ` (este año: ${fmtDay(h.currentYearDate)})` : ''}`;
  return fmtDay(h.date);
}

export default function HolidaysSection() {
  const toast = useToast();
  const confirm = useConfirm();
  const thisYear = new Date().getFullYear();

  const [tab, setTab]         = useState('list');
  const [list, setList]       = useState<Holiday[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [year, setYear]       = useState(String(thisYear));
  const [days, setDays]       = useState<YearDay[] | null>(null);
  const [busyId, setBusyId]   = useState<string | null>(null);
  // null = cerrado, 'new' = agregar, o el feriado que se edita.
  const [editing, setEditing] = useState<Holiday | 'new' | null>(null);

  const yearOptions = [-1, 0, 1, 2, 3].map(d => ({ value: String(thisYear + d), label: String(thisYear + d) }));

  async function loadList() {
    setLoadErr(null);
    try {
      setList(await apiFetch<Holiday[]>(`${API.landing}/landing/admin/holidays`));
    } catch (err) {
      setLoadErr(err instanceof ApiError ? err.message : 'No se pudieron cargar los feriados.');
    }
  }

  async function loadYear(y: string) {
    setDays(null);
    try {
      setDays(await apiFetch<YearDay[]>(`${API.landing}/landing/admin/holidays/year/${y}`));
    } catch (err) {
      setDays([]);
      toast.error(err instanceof ApiError ? err.message : 'No se pudo cargar el calendario.');
    }
  }

  useEffect(() => { loadList(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { if (tab === 'year') loadYear(year); /* eslint-disable-next-line */ }, [tab, year]);

  /** Tras un cambio: recarga la lista y, si está abierta, la vista del año. */
  function refresh() {
    loadList();
    if (tab === 'year') loadYear(year);
  }

  async function toggle(h: Holiday, active: boolean) {
    const ok = await confirm(active
      ? { title: `¿Activar "${h.name}"?`, confirmText: 'Activar feriado',
          message: 'Volverá a contar como feriado: no se cuenta como día hábil en los plazos (por ejemplo, del Libro de Reclamaciones).' }
      : { title: `¿Desactivar "${h.name}"?`, confirmText: 'Desactivar feriado', tone: 'warning' as const,
          message: 'Ese día pasará a contar como día hábil en los plazos (por ejemplo, del Libro de Reclamaciones).' });
    if (!ok) return;
    setBusyId(h.id);
    try {
      await apiFetch(`${API.landing}/landing/admin/holidays/${h.id}/active`, {
        method: 'PUT', body: JSON.stringify({ isActive: active }),
      });
      toast.success(active ? `"${h.name}" vuelve a contar como feriado.` : `"${h.name}" ya no cuenta como feriado.`);
      refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo cambiar el feriado.');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(h: Holiday) {
    const ok = await confirm({
      title: '¿Borrar este feriado?',
      message: <>Se borrará <strong>{h.name}</strong> ({fmtDay(h.date)}). Las reclamaciones ya registradas conservan su fecha límite.</>,
      confirmText: 'Borrar', tone: 'danger',
    });
    if (!ok) return;
    try {
      await apiFetch(`${API.landing}/landing/admin/holidays/${h.id}`, { method: 'DELETE' });
      toast.success('Feriado borrado.');
      refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo borrar el feriado.');
    }
  }

  const columns: Column<Holiday>[] = [
    { key: 'name', header: 'Feriado', priority: 1, render: h => (
      <span className={h.isActive ? '' : 'bugie-muted'}>{h.name}</span>
    ) },
    { key: 'kind', header: 'Tipo', priority: 2, render: h => <KindBadge kind={h.kind} /> },
    { key: 'when', header: 'Fecha', priority: 1, render: h => whenText(h) },
    { key: 'active', header: 'Activo', priority: 1, render: h => (
      <Switch checked={h.isActive} disabled={busyId === h.id} onChange={v => toggle(h, v)}
              ariaLabel={`${h.isActive ? 'Desactivar' : 'Activar'} ${h.name}`} />
    ) },
  ];

  const yearColumns: Column<YearDay>[] = [
    { key: 'date', header: 'Fecha', priority: 1, render: d => (
      <span className="d-grid">
        <span className="fw-semibold">{fmtDay(d.date)}</span>
        <span className="small bugie-muted">{weekday(d.date)}</span>
      </span>
    ) },
    { key: 'name', header: 'Feriado', priority: 1, render: d => d.name },
    { key: 'kind', header: 'Tipo', priority: 2, render: d => <KindBadge kind={d.kind} /> },
    { key: 'state', header: 'Cuenta', priority: 1, render: d =>
      !d.isActive ? <StatusBadge tone="neutral" size="sm">Desactivado</StatusBadge>
      : d.isWeekend ? <StatusBadge tone="info" size="sm">Cae en fin de semana</StatusBadge>
      : <StatusBadge tone="ok" size="sm" icon="fa-check">No es día hábil</StatusBadge> },
  ];

  return (
    <SectionCard
      title="Feriados" icon="fa-calendar-xmark" flush className="sa-anim" tourId="settings-holidays"
      description="No cuentan como días hábiles en los plazos de las reclamaciones. Cada cambio se guarda al momento."
      actions={
        <button type="button" className="btn btn-sm btn-bugie" onClick={() => setEditing('new')}>
          <i className="fa-solid fa-plus me-1" aria-hidden="true" />Agregar feriado
        </button>
      }
    >
      <div className="px-3 pt-3">
        <Tabs value={tab} onChange={setTab} ariaLabel="Vista de feriados" items={[
          { value: 'list', label: 'Lista', icon: 'fa-list' },
          { value: 'year', label: 'Calendario del año', icon: 'fa-calendar-days' },
        ]} />
      </div>

      {loadErr && (
        <div className="p-3">
          <div className="sa-note bx-tone-bad" role="alert">
            <i className="fa-solid fa-circle-exclamation" aria-hidden="true" /><span>{loadErr}</span>
          </div>
        </div>
      )}

      {tab === 'list' ? (
        <DataTable
          columns={columns}
          rows={list ?? []}
          rowKey={h => h.id}
          loading={!list && !loadErr}
          mobileTitle={h => h.name}
          mobileSubtitle={h => whenText(h)}
          empty={{ icon: 'fa-calendar', title: 'Sin feriados', text: 'Agrega los feriados que no deben contar como días hábiles.' }}
          actions={h => [
            { label: 'Editar', icon: 'fa-pen', onClick: () => setEditing(h) },
            { label: 'Borrar', icon: 'fa-trash', danger: true, hidden: h.kind !== 'extra', onClick: () => remove(h) },
          ]}
        />
      ) : (
        <>
          <div className="px-3 pt-3 d-flex align-items-center gap-2">
            <span className="small fw-semibold">Año</span>
            <Select value={year} onChange={setYear} options={yearOptions} width="auto" size="sm" aria-label="Año" />
          </div>
          <DataTable
            columns={yearColumns}
            rows={days ?? []}
            rowKey={d => `${d.holidayId}-${d.date}`}
            loading={!days}
            mobileTitle={d => `${fmtDay(d.date)} · ${d.name}`}
            mobileSubtitle={d => weekday(d.date)}
            empty={{ icon: 'fa-calendar', title: 'Sin feriados', text: `No hay feriados en ${year}.` }}
          />
        </>
      )}

      <HolidayDrawer
        holiday={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); refresh(); }}
      />
    </SectionCard>
  );
}

// ─── Agregar / editar ───────────────────────────────────────────────────────
function HolidayDrawer({ holiday, onClose, onSaved }: {
  holiday: Holiday | 'new' | null; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const isNew = holiday === 'new';
  const current = holiday && holiday !== 'new' ? holiday : null;

  const [kind, setKind]     = useState<Kind>('fijo');
  const [name, setName]     = useState('');
  const [month, setMonth]   = useState('1');
  const [day, setDay]       = useState('1');
  const [date, setDate]     = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!holiday) return;
    setError(null);
    if (holiday === 'new') {
      setKind('fijo'); setName(''); setMonth('1'); setDay('1'); setDate('');
    } else {
      setKind(holiday.kind); setName(holiday.name);
      setMonth(String(holiday.month ?? 1)); setDay(String(holiday.day ?? 1)); setDate(holiday.date ?? '');
    }
  }, [holiday]);

  async function save() {
    if (!name.trim()) { setError('Escribe el nombre del feriado.'); return; }
    if (kind === 'extra' && !date) { setError('Elige la fecha.'); return; }
    setSaving(true); setError(null);
    const body = JSON.stringify({
      name: name.trim(), kind,
      month: kind === 'fijo' ? Number(month) : null,
      day: kind === 'fijo' ? Number(day) : null,
      date: kind === 'extra' ? date : null,
    });
    try {
      if (isNew) await apiFetch(`${API.landing}/landing/admin/holidays`, { method: 'POST', body });
      else if (current) await apiFetch(`${API.landing}/landing/admin/holidays/${current.id}`, { method: 'PUT', body });
      toast.success(isNew ? 'Feriado agregado.' : 'Feriado guardado.');
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar el feriado.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={!!holiday}
      onClose={onClose}
      title={isNew ? 'Agregar feriado' : 'Editar feriado'}
      description="No cuenta como día hábil en los plazos de las reclamaciones."
      dirty="auto"
      busy={saving}
      footer={
        <>
          <button type="button" className="btn btn-bugie-outline" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="button" className="btn btn-bugie" onClick={save} disabled={saving}>
            {saving
              ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Guardando…</>
              : <><i className="fa-solid fa-check me-2" aria-hidden="true" />Guardar</>}
          </button>
        </>
      }
    >
      <div className="d-grid gap-3">
        {error && (
          <div className="sa-note bx-tone-bad" role="alert">
            <i className="fa-solid fa-circle-exclamation" aria-hidden="true" /><span>{error}</span>
          </div>
        )}

        {isNew && (
          <Field label="Tipo" required>
            <Select value={kind} onChange={v => setKind(v as Kind)} options={KIND_OPTIONS} />
          </Field>
        )}

        <Field label="Nombre" required>
          <input className="form-control" maxLength={100} value={name} onChange={e => setName(e.target.value)} />
        </Field>

        {kind === 'fijo' && (
          <div className="bx-form-grid">
            <Field label="Día" required>
              <input className="form-control" type="number" min={1} max={31} step={1}
                     value={day} onChange={e => setDay(e.target.value)} />
            </Field>
            <Field label="Mes" required>
              <Select value={month} onChange={setMonth} options={MONTH_OPTIONS} />
            </Field>
          </div>
        )}

        {kind === 'extra' && (
          <Field label="Fecha" required help="Solo ese día de ese año (ej. un feriado decretado por el gobierno).">
            <input className="form-control" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </Field>
        )}

        {kind === 'movil' && (
          <p className="small bugie-muted mb-0">
            <i className="fa-solid fa-circle-info me-1" aria-hidden="true" />
            La fecha se calcula cada año a partir de la Pascua. Solo puedes cambiar el nombre o desactivarlo.
          </p>
        )}
      </div>
    </Drawer>
  );
}
