import {
  ChangeEvent, CSSProperties, FocusEvent, KeyboardEvent, ReactNode, RefObject,
  useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import { DayPicker, type DateRange as DayRange, type Matcher } from 'react-day-picker';
import { es } from 'react-day-picker/locale/es';
import { addDays, endOfMonth, startOfMonth, subMonths } from 'date-fns';
import 'react-day-picker/style.css';
import './DateFields.scss';
import { useClickOutside, useLayer, useMediaQuery, useScrollLock } from './hooks';
import { Select, SelectOption } from './Select';

/*
 * Selectores de fecha y hora con el tema de Bugie (reemplazan a los inputs
 * nativos de fecha, hora y fecha-hora). Usan react-day-picker.
 * Los valores son los MISMOS strings que los inputs nativos:
 *   DateField      'YYYY-MM-DD' o ''
 *   DateRangeField { from: 'YYYY-MM-DD' | '', to: 'YYYY-MM-DD' | '' }
 *   TimeField      'HH:mm' o ''
 *   DateTimeField  'YYYY-MM-DDTHH:mm' o ''
 */

type AriaInvalid = boolean | 'true' | 'false';

interface CommonProps {
  id?: string;
  /** Nombre para formularios nativos (va en un input oculto con el valor). */
  name?: string;
  required?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: AriaInvalid;
}

/* ── Utilidades de fecha (todo en hora local, sin zonas) ─────────────── */

const pad = (n: number) => String(n).padStart(2, '0');

function makeYmd(y: number, m: number, d: number): string | null {
  const date = new Date(y, m - 1, d);
  if (y < 1000 || date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

function toDate(ymd?: string | null): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd ?? '');
  if (!m || !makeYmd(+m[1], +m[2], +m[3])) return undefined;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

const toYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 'YYYY-MM-DD' → 'dd/mm/aaaa' ('' si no es una fecha). */
function toDmy(ymd: string): string {
  const d = toDate(ymd);
  return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : '';
}

/** Lo que el usuario escribio ('7/10/2026', '07-10-2026', '2026/10/07') → 'YYYY-MM-DD' o null. */
function parseTyped(text: string): string | null {
  const t = text.trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return makeYmd(+m[3], +m[2], +m[1]);
  m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(t);
  if (m) return makeYmd(+m[1], +m[2], +m[3]);
  return null;
}

const inRange = (ymd: string, min?: string, max?: string) => (!min || ymd >= min) && (!max || ymd <= max);

function disabledDays(min?: string, max?: string): Matcher[] {
  const out: Matcher[] = [];
  const a = toDate(min);
  const b = toDate(max);
  if (a) out.push({ before: a });
  if (b) out.push({ after: b });
  return out;
}

/** Mes que se muestra al abrir: el de la fecha elegida, o hoy dentro de min/max. */
function initialMonth(selected: Date | undefined, min?: string, max?: string): Date {
  if (selected) return selected;
  const today = toYmd(new Date());
  if (min && today < min) return toDate(min)!;
  if (max && today > max) return toDate(max)!;
  return new Date();
}

/** Avisa a Modal/Drawer (dirty="auto") de que hubo un cambio. */
function notifyChange(el: HTMLElement | null) {
  el?.dispatchEvent(new Event('change', { bubbles: true }));
}

const SHEET_QUERY = '(max-width: 575.98px)';
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/* ── Popover (en pantallas angostas: hoja inferior) ──────────────────── */

interface PopoverProps {
  anchorRef: RefObject<HTMLElement>;
  panelRef: RefObject<HTMLDivElement>;
  /** focusBack = devolver el foco al campo (Esc, elegir). Clic fuera no lo mueve. */
  onClose: (focusBack: boolean) => void;
  label: string;
  className?: string;
  children: ReactNode;
}

function PickerPopover({ anchorRef, panelRef, onClose, label, className = '', children }: PopoverProps) {
  const sheet = useMediaQuery(SHEET_QUERY);
  const [pos, setPos] = useState<CSSProperties | null>(null);

  useLayer(true, () => onClose(true));
  useClickOutside([anchorRef, panelRef], true, () => onClose(false));
  useScrollLock(sheet);

  // Debajo del campo, o arriba si no cabe; nunca fuera de la pantalla.
  useLayoutEffect(() => {
    if (sheet) { setPos(null); return; }
    const place = () => {
      const a = anchorRef.current?.getBoundingClientRect();
      const p = panelRef.current;
      if (!a || !p) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const left = Math.max(8, Math.min(a.left, vw - p.offsetWidth - 8));
      const below = vh - a.bottom - 8;
      const above = a.top - 8;
      const up = below < p.offsetHeight + 6 && above > below;
      setPos(up ? { left, bottom: vh - a.top + 6 } : { left, top: a.bottom + 6 });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [sheet, anchorRef, panelRef]);

  // El Tab no sale del calendario mientras esta abierto.
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab' || !panelRef.current) return;
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.tabIndex >= 0);
    if (items.length === 0) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i < 0 || i === items.length - 1 ? 0 : i + 1);
    items[next].focus();
  }

  return createPortal(
    <>
      {sheet && <div className="bx-dp-backdrop" aria-hidden="true" />}
      <div
        ref={panelRef}
        role="dialog"
        aria-label={label}
        className={`bx-dp-panel ${sheet ? 'is-sheet' : ''} ${className}`}
        style={sheet ? undefined : (pos ?? { top: -9999, left: -9999 })}
        onKeyDown={onKeyDown}
        // Un clic en el calendario no le quita el foco al campo de texto.
        onMouseDown={e => { if (!(e.target as HTMLElement).closest('input, textarea')) e.preventDefault(); }}
      >
        {sheet && (
          <div className="bx-dp-sheet-head">
            <span>{label}</span>
            <button type="button" className="bx-dp-x" aria-label="Cerrar" onClick={() => onClose(true)}>
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          </div>
        )}
        {children}
      </div>
    </>,
    document.body,
  );
}

const dayPickerBase = {
  locale: es,
  weekStartsOn: 1 as const,
  fixedWeeks: true,
  showOutsideDays: true,
};

/* ══ DateField ═══════════════════════════════════════════════════════ */

export interface DateFieldProps extends CommonProps {
  /** 'YYYY-MM-DD' o ''. */
  value: string;
  onChange: (value: string) => void;
  /** 'YYYY-MM-DD': los dias fuera de min/max quedan deshabilitados. */
  min?: string;
  max?: string;
  placeholder?: string;
}

/**
 * Campo de fecha: se escribe dd/mm/aaaa o se elige en el calendario
 * (boton del icono, flecha abajo, o clic en el campo en pantallas anchas).
 */
export function DateField({
  value, onChange, min, max, placeholder = 'dd/mm/aaaa', id, name, required, disabled, size = 'md', className = '',
  'aria-label': ariaLabel, 'aria-describedby': describedBy, 'aria-invalid': ariaInvalid,
}: DateFieldProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const sheet = useMediaQuery(SHEET_QUERY);
  // 'focus' = el foco entra al calendario; 'keep' = se queda en el campo para seguir escribiendo.
  const [open, setOpen] = useState<null | 'focus' | 'keep'>(null);
  const [text, setText] = useState(() => toDmy(value));
  const invalid = ariaInvalid === true || ariaInvalid === 'true';

  useEffect(() => { setText(toDmy(value)); }, [value]);
  useEffect(() => { if (disabled) setOpen(null); }, [disabled]);

  function emit(v: string) {
    if (v === value) return;
    onChange(v);
    notifyChange(wrapRef.current);
  }

  function close(focusBack: boolean) {
    setOpen(null);
    if (focusBack) inputRef.current?.focus({ preventScroll: true });
  }

  function choose(day: Date) {
    const v = toYmd(day);
    setText(toDmy(v));
    emit(v);
    close(true);
  }

  function clear() {
    setText('');
    emit('');
    close(true);
  }

  function onType(e: ChangeEvent<HTMLInputElement>) {
    let t = e.target.value.replace(/[-.]/g, '/');
    // Agrega la barra sola despues del dia y del mes (solo al escribir hacia adelante).
    if (t.length > text.length && (/^\d{2}$/.test(t) || /^\d{1,2}\/\d{2}$/.test(t))) t += '/';
    setText(t);
    if (t.trim() === '') { emit(''); return; }
    const v = parseTyped(t);
    if (v && inRange(v, min, max)) emit(v);
  }

  function onInputBlur() {
    // Texto incompleto o fuera de rango: vuelve a la ultima fecha valida.
    const v = parseTyped(text);
    if (text.trim() !== '' && (!v || !inRange(v, min, max))) setText(toDmy(value));
  }

  function onInputKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' && !disabled) { e.preventDefault(); setOpen('focus'); }
  }

  function onWrapBlur(e: FocusEvent<HTMLDivElement>) {
    const to = e.relatedTarget as Node | null;
    if (!open || !to) return;
    if (wrapRef.current?.contains(to) || panelRef.current?.contains(to)) return;
    setOpen(null);
  }

  const today = toYmd(new Date());
  const selected = toDate(value);

  return (
    <div ref={wrapRef} className={`bx-date ${size === 'sm' ? 'is-sm' : ''} ${disabled ? 'is-disabled' : ''} ${className}`} onBlur={onWrapBlur}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={10}
        className={`form-control ${size === 'sm' ? 'form-control-sm' : ''} ${open ? 'is-open' : ''}`}
        placeholder={placeholder}
        value={text}
        required={required}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        onChange={onType}
        onBlur={onInputBlur}
        onKeyDown={onInputKey}
        onClick={() => { if (!sheet && !open && !disabled) setOpen('keep'); }}
      />
      <button
        type="button"
        className="bx-date-btn"
        aria-label={value ? `Cambiar fecha, elegida ${toDmy(value)}` : 'Elegir fecha'}
        aria-haspopup="dialog"
        aria-expanded={!!open}
        disabled={disabled}
        onClick={() => (open ? close(true) : setOpen('focus'))}
      >
        <i className="fa-regular fa-calendar" aria-hidden="true" />
      </button>
      {name && <input type="hidden" name={name} value={value} />}

      {open && (
        <PickerPopover anchorRef={wrapRef} panelRef={panelRef} onClose={close} label="Elegir fecha">
          <SingleCalendar key={open} selected={selected} min={min} max={max} autoFocus={open === 'focus'} onPick={choose} />
          <div className="bx-dp-foot">
            <button type="button" className="bx-dp-link" disabled={!inRange(today, min, max)} onClick={() => choose(new Date())}>Hoy</button>
            {!required && (
              <button type="button" className="bx-dp-link is-muted" disabled={!value && !text} onClick={clear}>Borrar</button>
            )}
          </div>
        </PickerPopover>
      )}
    </div>
  );
}

function SingleCalendar({ selected, min, max, autoFocus, onPick }: {
  selected: Date | undefined; min?: string; max?: string; autoFocus: boolean; onPick: (d: Date) => void;
}) {
  const [month, setMonth] = useState(() => initialMonth(selected, min, max));
  // Si se escribe una fecha con el calendario abierto, se muestra su mes.
  const selKey = selected ? toYmd(selected) : '';
  useEffect(() => { if (selected) setMonth(selected); }, [selKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <DayPicker
      {...dayPickerBase}
      mode="single"
      selected={selected}
      onSelect={(_, day) => onPick(day)}
      month={month}
      onMonthChange={setMonth}
      startMonth={toDate(min)}
      endMonth={toDate(max)}
      disabled={disabledDays(min, max)}
      autoFocus={autoFocus}
    />
  );
}

/* ══ DateRangeField ══════════════════════════════════════════════════ */

export interface DateRangeValue { from: string; to: string }

export interface DateRangeFieldProps extends Omit<CommonProps, 'name' | 'required'> {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  min?: string;
  max?: string;
  /** Atajos: Hoy, Ultimos 7 dias, Ultimos 30 dias, Este mes, Mes pasado. Por defecto si. */
  presets?: boolean;
  placeholder?: string;
}

interface Preset { label: string; from: string; to: string }

function buildPresets(min?: string, max?: string): Preset[] {
  const t = new Date();
  const prev = subMonths(t, 1);
  const list: [string, Date, Date][] = [
    ['Hoy', t, t],
    ['Últimos 7 días', addDays(t, -6), t],
    ['Últimos 30 días', addDays(t, -29), t],
    ['Este mes', startOfMonth(t), t],
    ['Mes pasado', startOfMonth(prev), endOfMonth(prev)],
  ];
  const out: Preset[] = [];
  for (const [label, a, b] of list) {
    let from = toYmd(a);
    let to = toYmd(b);
    if (min && from < min) from = min;
    if (max && to > max) to = max;
    if (from <= to) out.push({ label, from, to });
  }
  return out;
}

function rangeText(r: DateRangeValue): string {
  if (r.from && r.to) return r.from === r.to ? toDmy(r.from) : `${toDmy(r.from)} – ${toDmy(r.to)}`;
  if (r.from) return `Desde ${toDmy(r.from)}`;
  if (r.to) return `Hasta ${toDmy(r.to)}`;
  return '';
}

/** Rango desde–hasta en un solo calendario: primer clic = inicio, segundo = fin. */
export function DateRangeField({
  value, onChange, min, max, presets = true, placeholder = 'Cualquier fecha', id, disabled, size = 'md', className = '',
  'aria-label': ariaLabel, 'aria-describedby': describedBy, 'aria-invalid': ariaInvalid,
}: DateRangeFieldProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const text = rangeText(value);
  const invalid = ariaInvalid === true || ariaInvalid === 'true';

  function close(focusBack: boolean) {
    setOpen(false);
    if (focusBack) btnRef.current?.focus({ preventScroll: true });
  }

  function apply(r: DateRangeValue) {
    if (r.from !== value.from || r.to !== value.to) {
      onChange(r);
      notifyChange(btnRef.current);
    }
    close(true);
  }

  return (
    <>
      <button
        ref={btnRef}
        id={id}
        type="button"
        className={`form-control bx-dp-trigger ${size === 'sm' ? 'form-control-sm' : ''} ${open ? 'is-open' : ''} ${className}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel ? `${ariaLabel}: ${text || placeholder}` : undefined}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => (open ? close(true) : setOpen(true))}
        onKeyDown={e => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true); } }}
      >
        <i className="fa-regular fa-calendar bx-dp-trigger-icon" aria-hidden="true" />
        <span className={`bx-dp-trigger-text ${text ? '' : 'is-placeholder'}`}>{text || placeholder}</span>
      </button>

      {open && (
        <PickerPopover anchorRef={btnRef} panelRef={panelRef} onClose={close} label={ariaLabel ? `${ariaLabel}: elegir rango` : 'Elegir rango de fechas'} className="is-range">
          <RangeCalendar value={value} min={min} max={max} presets={presets} onApply={apply} />
        </PickerPopover>
      )}
    </>
  );
}

function RangeCalendar({ value, min, max, presets, onApply }: {
  value: DateRangeValue; min?: string; max?: string; presets: boolean; onApply: (r: DateRangeValue) => void;
}) {
  const [draft, setDraft] = useState<DayRange | undefined>(() => {
    const from = toDate(value.from);
    const to = toDate(value.to);
    return from || to ? { from, to } : undefined;
  });
  const [picking, setPicking] = useState(false);
  const [hover, setHover] = useState<Date | undefined>();
  const [month, setMonth] = useState(() => initialMonth(toDate(value.from) ?? toDate(value.to), min, max));
  const presetList = useMemo(() => (presets ? buildPresets(min, max) : []), [presets, min, max]);

  function onDay(day: Date) {
    if (!picking || !draft?.from) {
      setDraft({ from: day, to: undefined });
      setPicking(true);
      return;
    }
    const [a, b] = day < draft.from ? [day, draft.from] : [draft.from, day];
    onApply({ from: toYmd(a), to: toYmd(b) });
  }

  // Vista previa del rango mientras se elige el dia final.
  let preview: Matcher | undefined;
  if (picking && draft?.from && hover) {
    preview = hover < draft.from ? { from: hover, to: draft.from } : { from: draft.from, to: hover };
  }

  const hasValue = !!(value.from || value.to);

  return (
    <div className="bx-dp-range">
      {presetList.length > 0 && (
        <div className="bx-dp-presets" role="group" aria-label="Atajos">
          {presetList.map(p => (
            <button
              key={p.label}
              type="button"
              className={`bx-dp-preset ${!picking && p.from === value.from && p.to === value.to ? 'is-active' : ''}`}
              onClick={() => onApply({ from: p.from, to: p.to })}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
      <div className="bx-dp-range-main">
        <DayPicker
          {...dayPickerBase}
          mode="range"
          selected={draft}
          onSelect={(_, day) => onDay(day)}
          onDayMouseEnter={day => setHover(day)}
          onDayMouseLeave={() => setHover(undefined)}
          modifiers={{ preview }}
          modifiersClassNames={{ preview: 'bx-dp-preview' }}
          month={month}
          onMonthChange={setMonth}
          startMonth={toDate(min)}
          endMonth={toDate(max)}
          disabled={disabledDays(min, max)}
          autoFocus
        />
        <div className="bx-dp-foot">
          <span className="bx-dp-hint" aria-live="polite">{picking ? 'Elige el día final' : 'Elige el día inicial'}</span>
          {(hasValue || picking) && (
            <button type="button" className="bx-dp-link is-muted" onClick={() => onApply({ from: '', to: '' })}>Borrar</button>
          )}
          {picking && draft?.from && (
            <button type="button" className="bx-dp-link" onClick={() => onApply({ from: toYmd(draft.from!), to: '' })}>Aplicar</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══ TimeField ═══════════════════════════════════════════════════════ */

export interface TimeFieldProps extends CommonProps {
  /** 'HH:mm' o ''. */
  value: string;
  onChange: (value: string) => void;
  /** 'HH:mm'. */
  min?: string;
  max?: string;
  /** Paso en SEGUNDOS, como el input nativo (300 = cada 5 minutos). Por defecto 300. */
  step?: number;
}

const splitTime = (v?: string) => {
  const m = /^(\d{2}):(\d{2})/.exec(v ?? '');
  return m ? { h: m[1], m: m[2] } : { h: '', m: '' };
};

/** Hora y minutos con dos listas desplegables del tema. */
export function TimeField({
  value, onChange, min, max, step = 300, id, name, required, disabled, size = 'md', className = '',
  'aria-label': ariaLabel, 'aria-describedby': describedBy, 'aria-invalid': ariaInvalid,
}: TimeFieldProps) {
  const autoId = useId();
  const cur = splitTime(value);
  const lo = splitTime(min);
  const hi = splitTime(max);
  const minuteStep = Math.min(60, Math.max(1, Math.round(step / 60)));

  const minuteAllowed = (h: string, m: string) =>
    !((lo.h && h === lo.h && m < lo.m) || (hi.h && h === hi.h && m > hi.m));

  const hours: SelectOption[] = useMemo(() => Array.from({ length: 24 }, (_, i) => {
    const h = pad(i);
    return { value: h, label: h, disabled: (!!lo.h && h < lo.h) || (!!hi.h && h > hi.h) };
  }), [lo.h, hi.h]);

  const minutes: SelectOption[] = useMemo(() => {
    const list: string[] = [];
    for (let i = 0; i < 60; i += minuteStep) list.push(pad(i));
    // Un valor guardado que no calza con el paso igual se muestra.
    if (cur.m && !list.includes(cur.m)) list.push(cur.m);
    list.sort();
    return list.map(m => ({ value: m, label: m, disabled: cur.h ? !minuteAllowed(cur.h, m) : false }));
  }, [minuteStep, cur.h, cur.m, lo.h, lo.m, hi.h, hi.m]); // eslint-disable-line react-hooks/exhaustive-deps

  function emit(h: string, m: string) {
    const v = `${h}:${m}`;
    if (v !== value) onChange(v);
  }

  function setHour(h: string) {
    let m = cur.m;
    if (!m || !minuteAllowed(h, m)) m = minutes.find(o => minuteAllowed(h, o.value))?.value ?? '00';
    emit(h, m);
  }

  function setMinute(m: string) {
    const h = cur.h || hours.find(o => !o.disabled)?.value || '00';
    emit(h, m);
  }

  const hourLabel = ariaLabel ? `${ariaLabel}: horas` : (id ? undefined : 'Horas');
  const minuteLabel = ariaLabel ? `${ariaLabel}: minutos` : 'Minutos';

  return (
    <div className={`bx-time ${className}`} role="group" aria-label={ariaLabel}>
      <Select
        id={id ?? `${autoId}-h`}
        value={cur.h || null}
        onChange={setHour}
        options={hours}
        placeholder="--"
        searchable={false}
        size={size}
        disabled={disabled}
        required={required}
        aria-label={hourLabel}
        aria-describedby={describedBy}
        aria-invalid={ariaInvalid}
      />
      <span className="bx-time-sep" aria-hidden="true">:</span>
      <Select
        value={cur.m || null}
        onChange={setMinute}
        options={minutes}
        placeholder="--"
        searchable={false}
        size={size}
        disabled={disabled}
        required={required}
        aria-label={minuteLabel}
        aria-describedby={describedBy}
        aria-invalid={ariaInvalid}
      />
      {name && <input type="hidden" name={name} value={value} />}
    </div>
  );
}

/* ══ DateTimeField ═══════════════════════════════════════════════════ */

export interface DateTimeFieldProps extends CommonProps {
  /** 'YYYY-MM-DDTHH:mm' o '' (igual que datetime-local). Solo se emite completo. */
  value: string;
  onChange: (value: string) => void;
  /** 'YYYY-MM-DDTHH:mm'. */
  min?: string;
  max?: string;
  /** Paso de los minutos en SEGUNDOS (como el input nativo). Por defecto 300. */
  step?: number;
}

/** Fecha + hora juntas. Mientras falte una de las dos no se emite nada (como datetime-local). */
export function DateTimeField({
  value, onChange, min, max, step, id, name, required, disabled, size = 'md', className = '',
  'aria-label': ariaLabel, 'aria-describedby': describedBy, 'aria-invalid': ariaInvalid,
}: DateTimeFieldProps) {
  const [date, setDate] = useState(() => value.slice(0, 10));
  const [time, setTime] = useState(() => value.slice(11, 16));

  useEffect(() => {
    setDate(value.slice(0, 10));
    setTime(value.slice(11, 16));
  }, [value]);

  function update(d: string, t: string) {
    setDate(d);
    setTime(t);
    if (d && t) {
      const v = `${d}T${t}`;
      if (v !== value) onChange(v);
    } else if (!d && value) {
      onChange('');
    }
  }

  const minDate = min?.slice(0, 10);
  const maxDate = max?.slice(0, 10);

  return (
    <div className={`bx-datetime ${className}`} role="group" aria-label={ariaLabel}>
      <DateField
        id={id}
        value={date}
        onChange={d => update(d, d ? time : '')}
        min={minDate}
        max={maxDate}
        required={required}
        disabled={disabled}
        size={size}
        aria-label={ariaLabel ? `${ariaLabel}: fecha` : undefined}
        aria-describedby={describedBy}
        aria-invalid={ariaInvalid}
      />
      <TimeField
        value={time}
        onChange={t => update(date, t)}
        min={date && minDate === date ? min?.slice(11, 16) : undefined}
        max={date && maxDate === date ? max?.slice(11, 16) : undefined}
        step={step}
        required={required}
        disabled={disabled}
        size={size}
        aria-label={ariaLabel ? `${ariaLabel}: hora` : 'Hora'}
        aria-describedby={describedBy}
        aria-invalid={ariaInvalid}
      />
      {name && <input type="hidden" name={name} value={date && time ? `${date}T${time}` : ''} />}
    </div>
  );
}
