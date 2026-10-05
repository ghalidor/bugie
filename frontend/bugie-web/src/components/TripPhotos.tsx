import { useEffect, useState } from 'react';
import { API, apiFetch, ApiError, tripsFileUrl } from '../state/api';

// Foto de un envío (GET /trips/{id}/photos)
interface TripPhoto {
  id: string;
  url: string;
  kind: number;      // 0 paquete, 1 recojo, 2 recojo adicional, 3 entrega
  createdAt: string;
}

const KIND_LABEL: Record<number, string> = {
  0: 'Paquete',
  1: 'Recojo',
  2: 'Recojo (adicional)',
  3: 'Entrega',
};

/**
 * Galería de fotos de un envío. Cambia `refreshKey` para volver a pedirlas
 * (por ejemplo cuando el conductor verifica el recojo o confirma la entrega).
 * Al hacer clic, la foto se abre en grande en otra pestaña.
 */
export default function TripPhotos({ tripId, refreshKey }: { tripId: string; refreshKey?: string | number | null }) {
  const [photos,  setPhotos]  = useState<TripPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    apiFetch<TripPhoto[]>(`${API.trips}/trips/${tripId}/photos`)
      .then(d => { if (alive) { setPhotos(d ?? []); setError(null); } })
      .catch(err => { if (alive) setError(err instanceof ApiError ? err.message : 'No se pudieron cargar las fotos.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tripId, refreshKey]);

  if (loading) return (
    <div className="small bugie-muted"><span className="spinner-border spinner-border-sm me-2" />Cargando fotos…</div>
  );
  if (error) return <div className="small text-danger">{error}</div>;
  if (photos.length === 0) return <div className="small bugie-muted">Todavía no hay fotos.</div>;

  // Ordenadas por tipo (paquete, recojo, entrega) y luego por fecha
  const sorted = [...photos].sort((a, b) => a.kind - b.kind || a.createdAt.localeCompare(b.createdAt));

  return (
    <div className="d-flex flex-wrap gap-2">
      {sorted.map(p => {
        const src = tripsFileUrl(p.url);
        return (
          <a key={p.id} href={src} target="_blank" rel="noopener noreferrer"
             title="Ver foto en grande"
             className="text-decoration-none"
             style={{ width: 96 }}>
            <img src={src} alt={KIND_LABEL[p.kind] ?? 'Foto'}
                 style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--bugie-border)', display: 'block' }} />
            <div className="small bugie-muted text-center mt-1" style={{ fontSize: '0.72rem' }}>
              {KIND_LABEL[p.kind] ?? 'Foto'}
            </div>
          </a>
        );
      })}
    </div>
  );
}
