import { useEffect, useRef, useState } from 'react';

/**
 * Small “count up” for landing metrics.
 * - No libs
 * - Starts when element is visible
 */
export function useCountUpOnView(target: number, opts?: { durationMs?: number }) {
  const durationMs = opts?.durationMs ?? 900;
  const ref = useRef<HTMLSpanElement | null>(null);
  const [value, setValue] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (prefersReduced) {
      setValue(target);
      return;
    }

    let started = false;
    let raf = 0;

    const start = () => {
      if (started) return;
      started = true;

      const t0 = performance.now();
      const from = 0;

      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / durationMs);
        // easeOutCubic
        const eased = 1 - Math.pow(1 - p, 3);
        setValue(Math.round(from + (target - from) * eased));
        if (p < 1) raf = requestAnimationFrame(tick);
      };

      raf = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            start();
            io.disconnect();
          }
        });
      },
      { threshold: 0.35 }
    );

    io.observe(el);
    return () => {
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [target, durationMs]);

  return { ref, value };
}
