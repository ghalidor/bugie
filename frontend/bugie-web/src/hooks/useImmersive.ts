/**
 * useImmersive — efectos scroll inmersivos para la landing
 * - Parallax en capas
 * - 3D tilt en cards
 * - Scroll progress bar
 * - Barra de progreso
 */
import { useEffect } from 'react';

export function useImmersive() {
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ── Scroll progress bar ──────────────────────────────────
    let progressBar = document.querySelector<HTMLElement>('.bugie-scroll-progress');
    if (!progressBar) {
      progressBar = document.createElement('div');
      progressBar.className = 'bugie-scroll-progress';
      document.body.appendChild(progressBar);
    }

    // ── Parallax ─────────────────────────────────────────────
    function onScroll() {
      const y = window.scrollY;
      const maxY = document.body.scrollHeight - window.innerHeight;
      const pct = maxY > 0 ? (y / maxY) * 100 : 0;

      if (progressBar) progressBar.style.width = `${pct}%`;

      if (reduced) return;

      document.querySelectorAll<HTMLElement>('.bugie-parallax-slow').forEach(el => {
        el.style.transform = `translateY(${y * 0.08}px)`;
      });
      document.querySelectorAll<HTMLElement>('.bugie-parallax-med').forEach(el => {
        el.style.transform = `translateY(${y * 0.18}px)`;
      });
      document.querySelectorAll<HTMLElement>('.bugie-parallax-fast').forEach(el => {
        el.style.transform = `translateY(${y * 0.32}px)`;
      });
    }

    // ── 3D Tilt en cards ─────────────────────────────────────
    const tiltEls: HTMLElement[] = [];

    function setupTilt() {
      if (reduced) return;
      document.querySelectorAll<HTMLElement>('.bugie-tilt').forEach(el => {
        if (tiltEls.includes(el)) return;
        tiltEls.push(el);

        el.addEventListener('mousemove', (e) => {
          const rect = el.getBoundingClientRect();
          const cx   = rect.left + rect.width  / 2;
          const cy   = rect.top  + rect.height / 2;
          const dx   = (e.clientX - cx) / (rect.width  / 2);
          const dy   = (e.clientY - cy) / (rect.height / 2);
          const rotX = -dy * 8;
          const rotY =  dx * 8;
          el.style.transform = `perspective(900px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale(1.02)`;
        });

        el.addEventListener('mouseleave', () => {
          el.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) scale(1)';
        });
      });
    }

    // ── IntersectionObserver para reveals ────────────────────
    const revealAttrs = [
      '[data-reveal]',
      '[data-reveal-left]',
      '[data-reveal-right]',
      '[data-reveal-scale]',
      '[data-reveal-rotate]',
      '[data-reveal-blur]',
    ];

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );

    function observeReveals() {
      document.querySelectorAll(revealAttrs.join(',')).forEach(el => io.observe(el));
    }

    // ── Partículas generadas dinámicamente ───────────────────
    function spawnParticles() {
      if (reduced) return;
      document.querySelectorAll<HTMLElement>('.bugie-particles').forEach(container => {
        if (container.children.length > 0) return; // ya tiene
        const count = 12;
        for (let i = 0; i < count; i++) {
          const p = document.createElement('div');
          p.className = 'bugie-particle';
          const size = Math.random() * 120 + 40;
          p.style.cssText = [
            `width: ${size}px`,
            `height: ${size}px`,
            `left: ${Math.random() * 100}%`,
            `animation-duration: ${Math.random() * 20 + 15}s`,
            `animation-delay: ${Math.random() * -20}s`,
            i % 3 === 0
              ? `background: var(--bugie-accent)`
              : `background: var(--bugie-primary)`,
          ].join(';');
          container.appendChild(p);
        }
      });
    }

    // Inicializar
    window.addEventListener('scroll', onScroll, { passive: true });
    observeReveals();
    setupTilt();
    spawnParticles();
    onScroll();

    // Re-observar cuando el DOM cambia (SPA navigation)
    const mo = new MutationObserver(() => {
      observeReveals();
      setupTilt();
      spawnParticles();
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      io.disconnect();
      mo.disconnect();
      progressBar?.remove();
    };
  }, []);
}
