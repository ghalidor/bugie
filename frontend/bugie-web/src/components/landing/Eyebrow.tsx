import type { ReactNode } from 'react';

/** Antetítulo en mayúsculas y color de acento ("SEGURIDAD", "CONTACTO"…).
    `className` reemplaza el margen inferior por defecto (mb-2). */
export default function Eyebrow({ children, className = 'mb-2' }: { children: ReactNode; className?: string }) {
  const cls = ['text-uppercase small fw-bold text-bugie-accent', className].filter(Boolean).join(' ');
  return <div className={cls}>{children}</div>;
}
