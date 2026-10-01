import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import BugieMap from '../../components/BugieMap';
import { API, apiFetch, ApiError } from '../../state/api';

interface Waypoint {
  id: string; address: string;
  lat: number; lng: number; sortOrder: number;
}

interface Trip {
  id: string;
  originAddress: string; destAddress: string;
  originLat: number;    originLng: number;
  destLat: number;      destLng: number;
  estimatedFare: number; paymentMethod: string;
  status: number;
  waypoints?: Waypoint[];
}

const PAY: Record<string, string> = { cash: 'Efectivo', yape: 'Yape', plin: 'Plin' };

export default function DriverTripInProgress() {
  const navigate = useNavigate();
  const [trip,    setTrip]    = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting,  setActing]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Trip | null>(`${API.trips}/trips/active`)
      .then(d => setTrip(d))
      .catch(() => setError('No se pudo cargar el viaje activo.'))
      .finally(() => setLoading(false));
  }, [navigate]);

  async function startTrip() {
    if (!trip) return;
    setActing(true);
    try {
      const d = await apiFetch<Trip>(`${API.trips}/trips/${trip.id}/start`, { method: 'PUT' });
      // Preservar waypoints — el endpoint /start no los devuelve
      setTrip({ ...d, waypoints: trip.waypoints });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al iniciar.');
    } finally { setActing(false); }
  }

  async function completeTrip() {
    if (!trip) return;
    setActing(true);
    try {
      await apiFetch(`${API.trips}/trips/${trip.id}/complete`, {
        method: 'PUT',
        body: JSON.stringify({ finalFare: trip.estimatedFare }),
      });
      navigate('/app/conductor/inicio');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al completar.');
      setActing(false);
    }
  }

  if (loading) return (
    <div className="d-flex justify-content-center py-5">
      <span className="spinner-border" />
    </div>
  );

  if (!trip) return (
    <>
      <PageHeader title="Viaje en curso" subtitle="Estado del viaje activo." icon="fa-solid fa-car-side" />
      <div className="bugie-card p-5 text-center">
        <div className="bugie-mini-icon mx-auto mb-3" style={{ width: 56, height: 56, fontSize: '1.5rem' }}>
          <i className="fa-solid fa-car-side" />
        </div>
        <div className="fw-semibold mb-2">No tienes viajes en curso</div>
        <div className="small bugie-muted mb-4">Cuando aceptes un viaje podrás verlo aquí.</div>
        <button className="btn btn-bugie text-white rounded-pill px-4"
          onClick={() => navigate('/app/conductor/solicitudes')}>
          <i className="fa-solid fa-bell me-2" />Ver solicitudes
        </button>
      </div>
    </>
  );

  const sortedWp = [...(trip.waypoints ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const wpCoords = sortedWp.map(w => ({ lat: w.lat, lng: w.lng }));
  const subtitle = trip.status === 3
    ? 'Lleva al pasajero a su destino.'
    : 'Confirma que el pasajero está a bordo.';

  return (
    <>
      <PageHeader title="Viaje en curso" subtitle={subtitle} icon="fa-solid fa-car-side" />
      {error && <div className="alert alert-danger small mb-3">{error}</div>}

      <div className="row g-3 mb-3">
        <div className="col-6">
          <div className="bugie-kpi">
            <div className="label">Tarifa</div>
            <div className="value">S/ {trip.estimatedFare.toFixed(2)}</div>
          </div>
        </div>
        <div className="col-6">
          <div className="bugie-kpi">
            <div className="label">Pago</div>
            <div className="value" style={{ fontSize: '1.4rem' }}>{PAY[trip.paymentMethod]}</div>
          </div>
        </div>
      </div>

      <div className="bugie-card mb-3">
        <div className="bugie-card-header">Ruta</div>
        <div className="bugie-card-body">

          {/* Paradas */}
          <div className="small mb-3">
            <div className="d-flex align-items-start gap-2 mb-1">
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#7C6AF7', display: 'inline-block', marginTop: 3, flexShrink: 0 }} />
              <span><span className="bugie-muted">Origen: </span><strong>{trip.originAddress}</strong></span>
            </div>
            {sortedWp.map((wp, i) => (
              <div key={wp.id} className="d-flex align-items-start gap-2 mb-1">
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#f59e0b', display: 'inline-block', marginTop: 3, flexShrink: 0 }} />
                <span><span className="bugie-muted">Parada {i + 1}: </span><strong>{wp.address}</strong></span>
              </div>
            ))}
            <div className="d-flex align-items-start gap-2">
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#C060C0', display: 'inline-block', marginTop: 3, flexShrink: 0 }} />
              <span><span className="bugie-muted">Destino: </span><strong>{trip.destAddress}</strong></span>
            </div>
          </div>

          {/* Mapa con waypoints */}
          <BugieMap
            height={420}
            showRoute
            origin={{ lat: trip.originLat, lng: trip.originLng }}
            destination={{ lat: trip.destLat, lng: trip.destLng }}
            waypoints={wpCoords}
          />
        </div>
      </div>

      <div className="d-grid gap-2">
        {trip.status === 2 && (
          <button className="btn btn-bugie text-white rounded-pill" onClick={startTrip} disabled={acting}>
            {acting
              ? <span className="spinner-border spinner-border-sm" />
              : <><i className="fa-solid fa-play me-2" />Pasajero a bordo — Iniciar viaje</>}
          </button>
        )}
        {trip.status === 3 && (
          <button className="btn btn-success rounded-pill" onClick={completeTrip} disabled={acting}>
            {acting
              ? <span className="spinner-border spinner-border-sm" />
              : <><i className="fa-solid fa-flag-checkered me-2" />Completar viaje</>}
          </button>
        )}
        <div className="mt-2">
          <div className="small bugie-muted text-center mb-2">Solo en caso de emergencia real</div>
          <a className="btn btn-danger rounded-pill w-100" href="/app/conductor/sos">
            <i className="fa-solid fa-triangle-exclamation me-2" />SOS — Emergencia
          </a>
        </div>
      </div>
    </>
  );
}