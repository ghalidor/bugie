import type { ReactNode } from 'react';

interface Props {
  title: ReactNode;
  children: ReactNode;
  /** Clases extra de la tarjeta (p. ej. 'h-100'). */
  className?: string;
  /** Clases extra del cuerpo (p. ej. 'p-4'). */
  bodyClassName?: string;
}

/** Tarjeta .bugie-card con encabezado y cuerpo. */
export default function TitledCard({ title, children, className, bodyClassName }: Props) {
  return (
    <div className={['bugie-card', className].filter(Boolean).join(' ')}>
      <div className="bugie-card-header">{title}</div>
      <div className={['bugie-card-body', bodyClassName].filter(Boolean).join(' ')}>{children}</div>
    </div>
  );
}
