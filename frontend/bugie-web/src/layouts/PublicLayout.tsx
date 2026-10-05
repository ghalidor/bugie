import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import PublicTopNav from '../components/PublicTopNav';
import Footer from '../components/Footer';
import HelpFab from '../components/landing/HelpFab';
import LandingSeo from '../components/landing/LandingSeo';
import useTheme from '../hooks/useTheme';
import { useImmersive } from '../hooks/useImmersive';
import '../styles/landing.scss';

/** Marco de las páginas públicas: menú superior, contenido y pie.
    El idioma elegido en el menú se pasa a las páginas por el Outlet. */
export default function PublicLayout() {
  useImmersive();
  const [lang, setLang] = useState('es');
  const { theme, toggle } = useTheme();

  return (
    <div className="min-vh-100 d-flex flex-column">
      <PublicTopNav lang={lang} onLangChange={setLang} theme={theme} onThemeToggle={toggle} />
      <main className="flex-grow-1">
        <Outlet context={{ lang }} />
      </main>
      <Footer />
      <LandingSeo />
      <HelpFab />
    </div>
  );
}
