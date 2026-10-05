// Indica de quién viene un aviso, igual que en la app:
//   pasajero/cliente -> fa-user   conductor -> fa-id-badge   Bugie/admin -> fa-shield-halved

const FROM: Record<string, { icon: string; label: string; color: string }> = {
  passenger: { icon: 'fa-user',          label: 'Pasajero',  color: '#2563eb' },
  driver:    { icon: 'fa-id-badge',      label: 'Conductor', color: '#0d9488' },
  admin:     { icon: 'fa-shield-halved', label: 'Bugie',     color: '#7C6AF7' },
};

export default function FromBadge({ by, className = '' }: { by: string | null | undefined; className?: string }) {
  // Cualquier valor desconocido se trata como aviso de Bugie
  const f = FROM[by ?? ''] ?? FROM.admin;
  return (
    <span className={`badge rounded-pill ${className}`}
          style={{ background: `color-mix(in srgb, ${f.color} 14%, transparent)`, color: f.color, fontWeight: 600 }}>
      <i className={`fa-solid ${f.icon} me-1`} aria-hidden="true" />{f.label}
    </span>
  );
}
