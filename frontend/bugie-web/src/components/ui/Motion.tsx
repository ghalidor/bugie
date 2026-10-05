import { ReactNode, RefObject, useLayoutEffect, useRef, useState } from 'react';

/* Utilidades de animacion de listas (solo transform/opacity).
   Todas respetan "menos movimiento": el CSS desactiva las animaciones y
   useFlip no mueve nada. */

const reducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export type PresenceState = 'enter' | 'idle' | 'exit';
export interface PresenceEntry<T> { key: string; item: T; state: PresenceState; }

/**
 * Lista con entrada/salida animada.
 *  - Los elementos nuevos llegan con state 'enter' (no en la primera carga).
 *  - Los que desaparecen quedan con state 'exit' durante `exitMs` y luego se quitan.
 * Renderiza `entries` en lugar de `items` y usa la clase segun `state`.
 */
export function usePresenceList<T>(items: T[], getKey: (item: T) => string, exitMs = 260, enterMs = 1400) {
  const [entries, setEntries] = useState<PresenceEntry<T>[]>(
    () => items.map(item => ({ key: getKey(item), item, state: 'idle' as PresenceState })));
  const timers = useRef<Map<string, number>>(new Map());
  const keyFn = useRef(getKey);
  keyFn.current = getKey;

  useLayoutEffect(() => {
    setEntries(prev => {
      const nextKeys = new Set(items.map(i => keyFn.current(i)));
      const prevMap = new Map(prev.map(e => [e.key, e]));
      const out: PresenceEntry<T>[] = [];

      // Orden: el de la lista nueva; los que salen se quedan en su lugar.
      items.forEach(item => {
        const key = keyFn.current(item);
        const old = prevMap.get(key);
        out.push({ key, item, state: old ? (old.state === 'exit' ? 'idle' : old.state) : 'enter' });
      });
      prev.forEach((e, idx) => {
        if (nextKeys.has(e.key)) return;
        const pos = Math.min(idx, out.length);
        out.splice(pos, 0, e.state === 'exit' ? e : { ...e, state: 'exit' });
      });
      // Sin cambios reales: devolver la misma lista (evita renders en bucle).
      const same = out.length === prev.length
        && out.every((e, i) => e.key === prev[i].key && e.item === prev[i].item && e.state === prev[i].state);
      return same ? prev : out;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // Temporizadores: quitar los que salen y apagar el resaltado de los nuevos.
  useLayoutEffect(() => {
    entries.forEach(e => {
      if (e.state === 'idle' || timers.current.has(e.key + e.state)) return;
      const id = window.setTimeout(() => {
        timers.current.delete(e.key + e.state);
        setEntries(list => e.state === 'exit'
          ? list.filter(x => !(x.key === e.key && x.state === 'exit'))
          : list.map(x => (x.key === e.key && x.state === 'enter' ? { ...x, state: 'idle' } : x)));
      }, e.state === 'exit' ? exitMs : enterMs);
      timers.current.set(e.key + e.state, id);
    });
  }, [entries, exitMs, enterMs]);

  useLayoutEffect(() => () => { timers.current.forEach(id => clearTimeout(id)); timers.current.clear(); }, []);

  return entries;
}

/**
 * FLIP: cuando cambia la lista, los hijos con [data-flip-key] se deslizan
 * (transform) desde su posicion anterior en vez de saltar.
 */
export function useFlip(containerRef: RefObject<HTMLElement>, deps: unknown) {
  const last = useRef<Map<string, number>>(new Map());

  useLayoutEffect(() => {
    const box = containerRef.current;
    if (!box) return;
    const els = Array.from(box.querySelectorAll<HTMLElement>(':scope > [data-flip-key]'));
    // Posicion relativa al contenedor (no cambia con el scroll)
    const top0 = box.getBoundingClientRect().top;
    const now = new Map<string, number>();
    els.forEach(el => now.set(el.dataset.flipKey!, el.getBoundingClientRect().top - top0));

    if (!reducedMotion()) {
      els.forEach(el => {
        const before = last.current.get(el.dataset.flipKey!);
        const after = now.get(el.dataset.flipKey!)!;
        if (before == null || before === after) return;
        const dy = before - after;
        el.animate(
          [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }],
          { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' },
        );
      });
    }
    last.current = now;
  }, [deps, containerRef]);
}

/**
 * Destello breve cuando cambia `value`.
 * `good(prev, next)` decide el color: verde si es bueno, ambar si no.
 */
export function FlashOnChange({ value, good, children, className = '' }: {
  value: number;
  good: (prev: number, next: number) => boolean;
  children: ReactNode;
  className?: string;
}) {
  const prev = useRef(value);
  const [flash, setFlash] = useState<{ n: number; tone: 'good' | 'warn' } | null>(null);

  useLayoutEffect(() => {
    if (prev.current !== value) {
      const tone = good(prev.current, value) ? 'good' : 'warn';
      prev.current = value;
      setFlash(f => ({ n: (f?.n ?? 0) + 1, tone }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <span key={flash?.n ?? 0} className={`bx-flash ${flash ? `is-${flash.tone}` : ''} ${className}`}>
      {children}
    </span>
  );
}
