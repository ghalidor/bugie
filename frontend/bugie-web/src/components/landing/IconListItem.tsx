interface Props {
  icon: string;
  title: string;
  text: string;
  /** Título en letra pequeña. */
  small?: boolean;
}

/** Fila .bugie-list-item: ícono a la izquierda, título y descripción. */
export default function IconListItem({ icon, title, text, small = false }: Props) {
  return (
    <div className="bugie-list-item">
      <div className="bugie-mini-icon"><i className={`fa-solid ${icon}`} /></div>
      <div>
        <div className={small ? 'fw-semibold small' : 'fw-semibold'}>{title}</div>
        <div className="small bugie-muted">{text}</div>
      </div>
    </div>
  );
}
