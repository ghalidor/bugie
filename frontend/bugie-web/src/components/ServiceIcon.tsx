// Icono + etiqueta del tipo de servicio, igual que en la app:
//   Viaje -> fa-car    Envío -> fa-box

/** true si el viaje es un envío de paquete (serviceType 1 o category 'delivery'). */
export function isDeliveryTrip(t: { serviceType?: number | null; category?: string | null }): boolean {
  return t.serviceType === 1 || t.category === 'delivery';
}

export default function ServiceIcon({ delivery, showLabel = true, className = '' }: {
  delivery: boolean;
  showLabel?: boolean;
  className?: string;
}) {
  const label = delivery ? 'Envío' : 'Viaje';
  return (
    <span className={`badge rounded-pill ${className}`}
          title={label}
          style={{
            background: delivery ? 'rgba(245,158,11,0.15)' : 'rgba(124,106,247,0.15)',
            color:      delivery ? '#b45309' : '#7C6AF7',
            fontWeight: 600,
          }}>
      <i className={`fa-solid ${delivery ? 'fa-box' : 'fa-car'}${showLabel ? ' me-1' : ''}`} />
      {showLabel ? label : null}
    </span>
  );
}
