import { useImmersive } from '../hooks/useImmersive';
import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import PublicTopNav from '../components/PublicTopNav';
import Footer from '../components/Footer';
import useTheme from '../hooks/useTheme';

function setupReveal() {
  const els = Array.from(document.querySelectorAll<HTMLElement>(
    '[data-reveal],[data-reveal-left],[data-reveal-right],[data-reveal-group]'
  )).filter(el => !el.classList.contains('is-visible'));

  if (!els.length) return () => {};

  if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
    els.forEach(el => el.classList.add('is-visible'));
    return () => {};
  }

  const io = new IntersectionObserver(
    entries => entries.forEach(e => {
      if (e.isIntersecting) {
        (e.target as HTMLElement).classList.add('is-visible');
        io.unobserve(e.target);
      }
    }),
    { threshold: 0.1 }
  );

  els.forEach(el => io.observe(el));
  return () => io.disconnect();
}

export default function PublicLayout() {
  const location = useLocation();
  useImmersive();
  const [lang, setLang] = useState('es');
  const { theme, toggle } = useTheme();

  // Activar reveal al cambiar de página
  useEffect(() => {
    const cleanup = setupReveal();
    return cleanup;
  }, [location.pathname]);

  // Activar reveal también después de que carguen los datos de la API
  // usando un MutationObserver que detecta cuando se agrega contenido al DOM
  useEffect(() => {
    const timer = setTimeout(() => setupReveal(), 300);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  return (
    <div className="min-vh-100 d-flex flex-column">
      <PublicTopNav lang={lang} onLangChange={setLang} theme={theme} onThemeToggle={toggle} />
      <main className="flex-grow-1">
        <Outlet context={{ lang }} />
      </main>
      <Footer />
    </div>
  );
}
