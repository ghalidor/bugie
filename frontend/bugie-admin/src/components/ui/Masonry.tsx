import { Children, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Tarjetas acomodadas como rompecabezas: cada una va a la columna mas corta
 * (respetando el orden) y la ultima de cada columna se estira hasta el final,
 * asi no quedan huecos ni columnas disparejas.
 *
 *   <Masonry minColumnWidth={380}>
 *     <SectionCard .../>
 *     <SectionCard .../>
 *   </Masonry>
 */
export interface MasonryProps {
  children: ReactNode;
  /** Ancho minimo de cada columna en px (define cuantas columnas caben). */
  minColumnWidth?: number;
  /** Separacion entre tarjetas en px. */
  gap?: number;
  className?: string;
}

/** Alto "natural" de la tarjeta: lo que ocupa su contenido, aunque este estirada. */
function naturalHeight(el: HTMLElement): number {
  const cs = getComputedStyle(el);
  let h = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
        + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
  for (const child of Array.from(el.children) as HTMLElement[]) {
    const c = getComputedStyle(child);
    if (c.position === 'absolute' || c.position === 'fixed') continue;
    // Un hijo que crece (flex-grow) tambien esta estirado: se mide su contenido.
    const own = parseFloat(c.flexGrow) > 0 ? naturalHeight(child) : child.offsetHeight;
    h += own + parseFloat(c.marginTop) + parseFloat(c.marginBottom);
  }
  return h;
}

export function Masonry({ children, minColumnWidth = 380, gap = 16, className = '' }: MasonryProps) {
  const items = Children.toArray(children);
  const wrapRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [cols, setCols] = useState(1);
  const [heights, setHeights] = useState<number[]>([]);

  // Cuantas columnas caben segun el ancho disponible.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const calc = () => setCols(Math.max(1, Math.floor((el.clientWidth + gap) / (minColumnWidth + gap))));
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [gap, minColumnWidth]);

  // Reparto: cada tarjeta a la columna mas corta. Se prueba en el orden original
  // y de la mas alta a la mas baja, y se queda el que deja columnas mas parejas.
  // Dentro de cada columna se respeta el orden original.
  const n = Math.min(cols, Math.max(1, items.length));
  const measured = heights.length === items.length;
  const pack = (order: number[]) => {
    const cols2: number[][] = Array.from({ length: n }, () => []);
    const sums = new Array(n).fill(0);
    order.forEach((i, k) => {
      const target = measured ? sums.indexOf(Math.min(...sums)) : k % n;
      cols2[target].push(i);
      sums[target] += (heights[i] ?? 0) + gap;
    });
    return { columns: cols2.map(c => c.sort((x, y) => x - y)), spread: Math.max(...sums) - Math.min(...sums) };
  };
  const inOrder = items.map((_, i) => i);
  let best = pack(inOrder);
  if (measured) {
    const tallestFirst = pack([...inOrder].sort((x, y) => heights[y] - heights[x]));
    if (tallestFirst.spread < best.spread) best = tallestFirst;
  }
  const columns = best.columns;
  const layoutKey = columns.map(c => c.join(',')).join('|');

  // Alto natural de cada tarjeta. Se vuelve a medir si cambia el tamano o el
  // contenido de cualquier tarjeta (p. ej. un mapa que aparece despues).
  useLayoutEffect(() => {
    let frame = 0;
    const measure = () => setHeights(prev => {
      const next = itemRefs.current.slice(0, items.length).map(w => {
        const card = w?.firstElementChild as HTMLElement | null;
        return card ? Math.round(naturalHeight(card)) : 0;
      });
      return next.length === prev.length && next.every((h, i) => h === prev[i]) ? prev : next;
    });
    const schedule = () => { window.clearTimeout(frame); frame = window.setTimeout(measure, 30); };
    measure();
    const ro = new ResizeObserver(schedule);
    itemRefs.current.slice(0, items.length).forEach(w => {
      const card = w?.firstElementChild;
      if (!card) return;
      // Hijos y nietos: un cuerpo estirado no cambia de tamano aunque cambie su contenido.
      Array.from(card.children).forEach(ch => {
        ro.observe(ch);
        Array.from(ch.children).forEach(g => ro.observe(g));
      });
    });
    const mo = new MutationObserver(schedule);
    if (wrapRef.current) mo.observe(wrapRef.current, { childList: true, subtree: true, characterData: true });
    return () => { window.clearTimeout(frame); ro.disconnect(); mo.disconnect(); };
  }, [items.length, layoutKey]);

  return (
    <div ref={wrapRef} className={`bx-masonry ${className}`} style={{ gap }}>
      {columns.map((col, c) => (
        <div key={c} className="bx-masonry-col" style={{ gap }}>
          {col.map((i, pos) => (
            <div key={i} ref={el => { itemRefs.current[i] = el; }}
                 className={`bx-masonry-item${columns.length > 1 && pos === col.length - 1 ? ' is-last' : ''}`}>
              {items[i]}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
