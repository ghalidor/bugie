import type { ReactNode } from 'react';

/** Contenedor estándar de las páginas internas de la landing
    (empresa, seguridad, contacto, legales…). */
export default function LandingPage({ children }: { children: ReactNode }) {
  return (
    <div className="bugie-section-sm">
      <div className="container bugie-container">
        {children}
      </div>
    </div>
  );
}
