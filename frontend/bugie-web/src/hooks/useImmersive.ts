/**
 * useImmersive — efectos de la landing (solo lo usa PublicLayout):
 * - Aparición al hacer scroll: a los elementos con [data-reveal] se les
 *   agrega .is-visible cuando entran en pantalla (la animación está en
 *   index.scss).
 * - Inclinación 3D de las tarjetas .bugie-tilt al pasar el mouse.
 *
 * Un MutationObserver vuelve a buscar elementos cada vez que cambia el DOM:
 * así funciona al navegar entre páginas y con el contenido que llega
 * después desde la API.
 */
import { useEffect } from 'react';

export function useImmersive() {
  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    // ── Aparición al hacer scroll ────────────────────────────
    const io = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      }),
      { threshold: 0.1 }
    );

    function observeReveals() {
      document.querySelectorAll('[data-reveal]:not(.is-visible)').forEach(el => {
        // Con movimiento reducido se muestran de una vez, sin esperar el scroll.
        if (reduced) el.classList.add('is-visible');
        else io.observe(el);
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

    // Inicializar
    observeReveals();
    setupTilt();

    // Re-observar cuando el DOM cambia (navegación SPA, datos de la API)
    const mo = new MutationObserver(() => {
      observeReveals();
      setupTilt();
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);
}
