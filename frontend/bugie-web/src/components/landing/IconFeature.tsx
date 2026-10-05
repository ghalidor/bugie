interface Props {
  icon: string;
  title: string;
  text: string;
  /** Clases extra de la tarjeta (p. ej. 'h-100', 'bugie-tilt'). */
  className?: string;
  /** true: título como <h3> grande y texto como párrafo (tarjetas de valor del inicio). */
  heading?: boolean;
}

/** Tarjeta .bugie-feature con ícono, título y texto. */
export default function IconFeature({ icon, title, text, className, heading = false }: Props) {
  const cls = ['bugie-feature', className].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <div className="bugie-mini-icon mb-3"><i className={`fa-solid ${icon}`} /></div>
      {heading ? (
        <>
          <h3 className="bugie-h3 mb-2">{title}</h3>
          <p className="bugie-muted mb-0">{text}</p>
        </>
      ) : (
        <>
          <div className="fw-bold mb-2">{title}</div>
          <div className="small bugie-muted">{text}</div>
        </>
      )}
    </div>
  );
}
