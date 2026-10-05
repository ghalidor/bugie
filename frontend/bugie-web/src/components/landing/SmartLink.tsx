import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface Props {
  href: string;
  className?: string;
  children: ReactNode;
  /** Fuerza enlace externo (pestaña nueva). Si no se indica, se decide
      por la URL: las que empiezan con "http" son externas. */
  external?: boolean;
}

/** Enlace que usa React Router para rutas internas y <a target="_blank">
    para direcciones externas (los enlaces que llegan del gestor pueden ser
    de cualquiera de los dos tipos). */
export default function SmartLink({ href, className, children, external }: Props) {
  const isExternal = external ?? href.startsWith('http');
  return isExternal
    ? <a className={className} href={href} target="_blank" rel="noreferrer">{children}</a>
    : <Link className={className} to={href}>{children}</Link>;
}
