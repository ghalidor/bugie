import { useLayoutEffect, useRef } from 'react';

/**
 * Numero que "sube" hasta su valor (count-up) con easing.
 *
 *  - Anima la primera vez que aparece en pantalla (desde 0) y cada vez que
 *    cambia el valor (desde el valor que se esta viendo).
 *  - Respeta el formato: pasa `format` (ej. money -> "S/ 12.50") o `decimals`.
 *  - Con "menos movimiento" muestra el valor final sin interpolar.
 *  - El lector de pantalla solo lee el valor final.
 *
 * Uso: <CountUp value={total} format={money} />
 */
export interface CountUpProps {
  value: number | null | undefined;
  /** Formato del numero ya redondeado (ej. money, fmtPoints). */
  format?: (n: number) => string;
  /** Decimales de los valores intermedios (el valor final se muestra tal cual). Por defecto 0. */
  decimals?: number;
  /** Duracion en ms. */
  duration?: number;
  className?: string;
}

function prefersReduced(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function roundTo(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

export function CountUp({ value, format, decimals = 0, duration = 900, className = '' }: CountUpProps) {
  const target = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const ref = useRef<HTMLSpanElement>(null);
  // Valor que se esta viendo ahora (null = aun no se mostro nunca).
  const shown = useRef<number | null>(null);
  const fmtRef = useRef(format);
  fmtRef.current = format;

  // El valor final se formatea sin redondear (no altera S/ 12.50 ni decimales).
  const render = (n: number, final = false) => {
    const r = final ? n : roundTo(n, decimals);
    return fmtRef.current ? fmtRef.current(r) : r.toFixed(decimals);
  };
  const finalText = render(target, true);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = shown.current ?? 0;

    if (prefersReduced() || from === target) {
      el.textContent = render(target, true);
      shown.current = target;
      return;
    }

    let raf = 0;
    let io: IntersectionObserver | null = null;

    const run = () => {
      const t0 = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / duration);
        const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
        const cur = p >= 1 ? target : from + (target - from) * eased;
        shown.current = cur;
        el.textContent = render(cur, p >= 1);
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    if (shown.current === null && typeof IntersectionObserver !== 'undefined') {
      // Primera vez: arranca en 0 y anima cuando entra en pantalla.
      el.textContent = render(0);
      io = new IntersectionObserver(entries => {
        if (entries.some(e => e.isIntersecting)) { io?.disconnect(); io = null; run(); }
      });
      io.observe(el);
    } else {
      run();
    }

    return () => { cancelAnimationFrame(raf); io?.disconnect(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration, decimals]);

  return (
    <span className={`bx-countup ${className}`}>
      <span ref={ref} aria-hidden="true" />
      <span className="visually-hidden">{finalText}</span>
    </span>
  );
}
