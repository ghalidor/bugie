import { KeyboardEvent, ReactNode, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useClickOutside, useLayer } from './hooks';

export type SelectValue = string | number;

export interface SelectOption<V extends SelectValue = string> {
  value: V;
  /** Texto visible (tambien se usa para buscar y para la letra inicial). */
  label: string;
  /** Clase FontAwesome sin prefijo, ej. 'fa-car'. */
  icon?: string;
  /** Linea secundaria opcional bajo el texto. */
  hint?: ReactNode;
  disabled?: boolean;
}

export interface SelectProps<V extends SelectValue = string> {
  /** Valor elegido. null/undefined o un valor que no esta en options = muestra el placeholder. */
  value: V | null | undefined;
  onChange: (value: V) => void;
  options: SelectOption<V>[];
  /** Texto cuando no hay valor. */
  placeholder?: string;
  disabled?: boolean;
  /** Pinta el control en rojo. Field lo marca solo con aria-invalid. */
  error?: boolean;
  size?: 'sm' | 'md';
  /** Buscador dentro de la lista. Por defecto se activa con mas de 8 opciones. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Icono fijo al inicio del boton (si la opcion elegida no tiene icono propio). */
  icon?: string;
  /** Ancho del boton: 'auto' se ajusta al texto (filtros, paginacion). Por defecto ocupa el 100%. */
  width?: 'full' | 'auto';
  id?: string;
  className?: string;
  title?: string;
  required?: boolean;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
}

interface Pos { top: number; left: number; width: number; maxHeight: number; up: boolean }

/**
 * Lista desplegable con diseno propio (reemplaza a <select>).
 * Teclado: flechas, Inicio/Fin, Enter o Espacio para elegir, Esc para cerrar
 * y la letra inicial para saltar a una opcion.
 */
export function Select<V extends SelectValue = string>({
  value, onChange, options, placeholder = 'Elige una opción', disabled, error, size = 'md',
  searchable, searchPlaceholder = 'Buscar…', icon, width = 'full', id, className = '', title, required,
  'aria-label': ariaLabel, 'aria-describedby': describedBy, 'aria-invalid': ariaInvalid,
}: SelectProps<V>) {
  const autoId = useId();
  const btnId = id ?? `${autoId}-btn`;
  const listId = `${autoId}-list`;
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<Pos | null>(null);
  const typed = useRef({ text: '', at: 0 });

  const withSearch = searchable ?? options.length > 8;
  const selectedIndex = options.findIndex(o => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;
  const invalid = error || ariaInvalid === true || ariaInvalid === 'true';

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return q ? options.filter(o => normalize(o.label).includes(q)) : options;
  }, [options, query]);

  function openList() {
    if (disabled) return;
    setQuery('');
    const i = options.findIndex(o => o.value === value && !o.disabled);
    setActive(i >= 0 ? i : options.findIndex(o => !o.disabled));
    setOpen(true);
  }

  function closeList(focusButton = true) {
    setOpen(false);
    setPos(null);
    if (focusButton) btnRef.current?.focus();
  }

  function choose(opt: SelectOption<V> | undefined) {
    if (!opt || opt.disabled) return;
    closeList();
    if (opt.value !== value) {
      onChange(opt.value);
      // Avisa a Modal/Drawer (dirty="auto") de que hubo un cambio.
      btnRef.current?.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  useLayer(open, () => closeList());
  useClickOutside([btnRef, panelRef], open, () => closeList(false));

  // Posicion de la lista (portal): debajo del boton, o arriba si no cabe.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const b = btnRef.current?.getBoundingClientRect();
      if (!b) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const mobile = vw < 576;
      const width = mobile ? vw - 24 : Math.min(Math.max(b.width, 200), vw - 16);
      const left = mobile ? 12 : Math.max(8, Math.min(b.left, vw - width - 8));
      const below = vh - b.bottom - 12;
      const above = b.top - 12;
      const up = below < 220 && above > below;
      const maxHeight = Math.min(340, Math.max(140, up ? above : below));
      setPos({ top: up ? b.top - 6 : b.bottom + 6, left, width, maxHeight, up });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  // Foco en el buscador al abrir.
  useEffect(() => {
    if (open && withSearch) setTimeout(() => searchRef.current?.focus({ preventScroll: true }), 0);
  }, [open, withSearch]);

  // Al buscar, marca la primera coincidencia.
  useEffect(() => {
    if (!open || !query) return;
    const first = filtered.findIndex(o => !o.disabled);
    setActive(first);
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mantiene visible la opcion activa.
  useEffect(() => {
    if (!open || active < 0) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open, pos]);

  const list = open ? filtered : options;

  function move(step: number) {
    if (list.length === 0) return;
    let i = active;
    for (let n = 0; n < list.length; n++) {
      i = (i + step + list.length) % list.length;
      if (!list[i].disabled) { setActive(i); return; }
    }
  }

  function edge(last: boolean) {
    const idx = list.map((o, i) => (o.disabled ? -1 : i)).filter(i => i >= 0);
    if (idx.length) setActive(last ? idx[idx.length - 1] : idx[0]);
  }

  /** Letra inicial: salta a la siguiente opcion que empieza con lo tecleado. */
  function typeAhead(ch: string) {
    const now = Date.now();
    const t = typed.current;
    t.text = now - t.at < 700 ? t.text + ch : ch;
    t.at = now;
    const q = normalize(t.text);
    const from = open ? active : selectedIndex;
    const n = options.length;
    for (let k = 1; k <= n; k++) {
      const i = (from + (t.text.length > 1 ? k - 1 : k) + n) % n;
      const o = options[i];
      if (!o.disabled && normalize(o.label).startsWith(q)) {
        if (open) setActive(i);
        else choose(o);
        return;
      }
    }
  }

  function onButtonKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openList();
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        typeAhead(e.key);
      }
      return;
    }
    onListKey(e);
  }

  function onListKey(e: KeyboardEvent<HTMLElement>) {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); move(1); break;
      case 'ArrowUp': e.preventDefault(); move(-1); break;
      case 'Home': if (!withSearch) { e.preventDefault(); edge(false); } break;
      case 'End': if (!withSearch) { e.preventDefault(); edge(true); } break;
      case 'Enter': e.preventDefault(); choose(list[active]); break;
      case ' ':
        if (!withSearch) { e.preventDefault(); choose(list[active]); }
        break;
      case 'Tab': e.preventDefault(); closeList(); break;
      default:
        if (!withSearch && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) typeAhead(e.key);
    }
  }

  const activeId = open && active >= 0 && list[active] ? `${autoId}-opt-${active}` : undefined;
  const shownIcon = selected?.icon ?? icon;

  return (
    <>
      <button
        ref={btnRef}
        id={btnId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={!withSearch ? activeId : undefined}
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        aria-required={required || undefined}
        title={title}
        disabled={disabled}
        className={[
          'form-select bx-select', size === 'sm' ? 'form-select-sm' : '',
          width === 'auto' ? 'bx-select-auto' : '', invalid ? 'is-invalid' : '',
          open ? 'is-open' : '', className,
        ].filter(Boolean).join(' ')}
        onClick={() => (open ? closeList() : openList())}
        onKeyDown={onButtonKey}
      >
        {shownIcon && <i className={`fa-solid ${shownIcon} bx-select-icon`} aria-hidden="true" />}
        <span className={`bx-select-value ${selected ? '' : 'is-placeholder'}`}>{selected ? selected.label : placeholder}</span>
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          className={`bx-select-panel ${pos?.up ? 'is-up' : ''}`}
          style={pos
            ? { left: pos.left, width: pos.width, ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }
            : { top: -9999, left: -9999 }}
          onMouseDown={e => { if (e.target !== searchRef.current) e.preventDefault(); }}
        >
          {withSearch && (
            <div className="bx-select-search">
              <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
              <input
                ref={searchRef}
                type="text"
                className="form-control form-control-sm"
                placeholder={searchPlaceholder}
                value={query}
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={activeId}
                aria-label={searchPlaceholder}
                autoComplete="off"
                onChange={e => setQuery(e.target.value)}
                onKeyDown={onListKey}
              />
            </div>
          )}
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-labelledby={ariaLabel ? undefined : btnId}
            aria-label={ariaLabel}
            className="bx-select-list"
            style={{ maxHeight: pos ? pos.maxHeight - (withSearch ? 52 : 0) : undefined }}
          >
            {filtered.length === 0 && <li className="bx-select-empty" role="presentation">Sin resultados</li>}
            {filtered.map((o, i) => {
              const isSel = o.value === value;
              return (
                <li
                  key={String(o.value)}
                  id={`${autoId}-opt-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={isSel}
                  aria-disabled={o.disabled || undefined}
                  className={`bx-select-opt ${i === active ? 'is-active' : ''} ${isSel ? 'is-selected' : ''} ${o.disabled ? 'is-disabled' : ''}`}
                  onMouseMove={() => { if (!o.disabled && i !== active) setActive(i); }}
                  onClick={() => choose(o)}
                >
                  {o.icon && <i className={`fa-solid ${o.icon} bx-select-opt-icon`} aria-hidden="true" />}
                  <span className="bx-select-opt-text">
                    <span className="l">{o.label}</span>
                    {o.hint && <span className="h">{o.hint}</span>}
                  </span>
                  {isSel && <i className="fa-solid fa-check bx-select-check" aria-hidden="true" />}
                </li>
              );
            })}
          </ul>
        </div>,
        document.body,
      )}
    </>
  );
}

/** Minusculas y sin tildes, para buscar "peru" y encontrar "Perú". */
function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
