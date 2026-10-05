import { RefObject, useEffect, useRef, useState } from 'react';

/** Puntos de quiebre de Bootstrap (ancho minimo de cada uno). */
export const BREAKPOINTS = { sm: 576, md: 768, lg: 992, xl: 1200, xxl: 1400 } as const;

/** true mientras la media query se cumpla. Ej: useMediaQuery('(min-width: 768px)'). */
export function useMediaQuery(query: string): boolean {
  const get = () => typeof window !== 'undefined' && window.matchMedia(query).matches;
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** true en pantallas menores a md (768px): moviles. */
export function useIsMobile(): boolean {
  return !useMediaQuery(`(min-width: ${BREAKPOINTS.md}px)`);
}

/** Devuelve el valor despues de `delay` ms sin cambios (para buscadores). */
export function useDebouncedValue<T>(value: T, delay = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/** true si el usuario pidio menos movimiento en su sistema. */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/**
 * Mantiene montado un elemento durante su animacion de salida.
 * Devuelve { mounted, closing }: renderiza mientras `mounted` y agrega la
 * clase de salida mientras `closing`.
 */
export function usePresence(open: boolean, exitMs = 200) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (open) { setMounted(true); setClosing(false); return; }
    if (!mounted) return;
    setClosing(true);
    const t = setTimeout(() => { setMounted(false); setClosing(false); }, exitMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return { mounted, closing };
}

/* ── Pila de capas: Esc cierra solo la capa de arriba ───────────────── */
const layerStack: number[] = [];
let layerSeq = 0;

/** Registra una capa (modal, drawer, tour) mientras `active`. Esc llama a onEscape solo si es la de arriba. */
export function useLayer(active: boolean, onEscape?: () => void) {
  const cb = useRef(onEscape);
  cb.current = onEscape;
  useEffect(() => {
    if (!active) return;
    const id = ++layerSeq;
    layerStack.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && layerStack[layerStack.length - 1] === id) {
        e.stopPropagation();
        cb.current?.();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const i = layerStack.indexOf(id);
      if (i >= 0) layerStack.splice(i, 1);
    };
  }, [active]);
}

/* ── Bloqueo del scroll de la pagina mientras hay una capa abierta ──── */
let lockCount = 0;
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (lockCount++ === 0) {
      // En la web el que hace scroll es <body> (html tiene overflow hidden),
      // por eso se mide tambien la barra del body.
      const sb = Math.max(
        window.innerWidth - document.documentElement.clientWidth,
        document.body.offsetWidth - document.body.clientWidth,
      );
      document.body.style.overflow = 'hidden';
      if (sb > 0) document.body.style.paddingRight = `${sb}px`;
    }
    return () => {
      if (--lockCount === 0) {
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
      }
    };
  }, [active]);
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Atrapa el foco del teclado dentro de `ref` mientras `active` y lo devuelve al cerrar. */
export function useFocusTrap(ref: RefObject<HTMLElement>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const prev = document.activeElement as HTMLElement | null;
    const node = ref.current;
    // Enfocar el primer campo (o el contenedor) al abrir.
    const t = setTimeout(() => {
      if (!node) return;
      const auto = node.querySelector<HTMLElement>('[data-autofocus]');
      const first = auto ?? node.querySelector<HTMLElement>('input:not([disabled]), textarea:not([disabled]), select:not([disabled])') ?? node;
      first.focus({ preventScroll: true });
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.offsetParent !== null);
      if (items.length === 0) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === node)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      prev?.focus?.({ preventScroll: true });
    };
  }, [active, ref]);
}

/** Cierra algo al hacer clic fuera de los elementos dados. */
export function useClickOutside(refs: RefObject<HTMLElement>[], active: boolean, onOutside: () => void) {
  const cb = useRef(onOutside);
  cb.current = onOutside;
  useEffect(() => {
    if (!active) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (refs.every(r => !r.current || !r.current.contains(t))) cb.current();
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}

/** Lee/escribe en localStorage sin romper si esta bloqueado. */
export const storage = {
  get(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string) {
    try { localStorage.setItem(key, value); } catch { /* sin almacenamiento */ }
  },
  remove(key: string) {
    try { localStorage.removeItem(key); } catch { /* sin almacenamiento */ }
  },
};

/**
 * Paginacion en el navegador para listas que la API devuelve completas.
 * Vuelve a la pagina 1 cuando cambia `resetKey` (por ejemplo, un filtro).
 *   const { page, setPage, items } = useClientPage(lista, 10, filtro);
 *   <Pagination page={page} pageSize={10} total={lista.length} onPageChange={setPage} />
 */
export function useClientPage<T>(list: T[], pageSize: number, resetKey?: unknown) {
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [resetKey]);
  const pages = Math.max(1, Math.ceil(list.length / pageSize));
  const current = Math.min(page, pages);
  const items = list.slice((current - 1) * pageSize, current * pageSize);
  return { page: current, setPage, items };
}
