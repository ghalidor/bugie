import { useEffect, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import { API, apiFetch, ApiError } from '../../state/api';

interface ActiveTrip { id: string; originAddress: string; destAddress: string; }

export default function PassengerSOS() {
  const [activeTrip, setActiveTrip] = useState<ActiveTrip | null>(null);
  const [sending,    setSending]    = useState(false);
  const [sent,       setSent]       = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  // Cargar el viaje activo para autocompletar el tripId
  useEffect(() => {
    apiFetch<ActiveTrip | null>(`${API.trips}/trips/active`)
      .then(setActiveTrip)
      .catch(() => {});
  }, []);

  async function activate() {
    setSending(true); setError(null);
    try {
      const pos = await new Promise<{ lat: number; lng: number }>(resolve =>
        navigator.geolocation.getCurrentPosition(
          p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
          () => resolve({ lat: -8.109052, lng: -79.021534 })
        )
      );

      if (!activeTrip) {
        setError('No tienes un viaje activo. El SOS solo se puede activar durante un viaje en curso.');
        setSending(false);
        return;
      }

      await apiFetch(`${API.trips}/sos`, {
        method: 'POST',
        body: JSON.stringify({ tripId: activeTrip.id, lat: pos.lat, lng: pos.lng }),
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al activar SOS.');
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <PageHeader
        title="SOS / Emergencia"
        subtitle="Alerta inmediata al centro de monitoreo y Policía Nacional."
        icon="fa-solid fa-triangle-exclamation"
      />

      {sent ? (
        <div className="alert alert-success text-center py-4">
          <i className="fa-solid fa-circle-check fa-3x text-success mb-3 d-block" />
          <div className="fw-bold fs-5 mb-2">Alerta SOS enviada</div>
          <div className="small bugie-muted">
            El centro de monitoreo de Bugie recibió tu ubicación y está coordinando respuesta.
            Mantén la calma — ayuda está en camino.
          </div>
        </div>
      ) : (
        <>
          {/* Viaje activo */}
          {activeTrip ? (
            <div className="alert alert-info small mb-3">
              <i className="fa-solid fa-circle-info me-2" />
              Viaje activo detectado: <strong>{activeTrip.originAddress} → {activeTrip.destAddress}</strong>
            </div>
          ) : (
            <div className="alert alert-warning small mb-3">
              <i className="fa-solid fa-triangle-exclamation me-2" />
              No tienes un viaje activo. El SOS se activa durante un viaje en curso.
            </div>
          )}

          <div className="alert alert-danger mb-3">
            <i className="fa-solid fa-triangle-exclamation me-2" />
            <strong>Solo para emergencias reales.</strong> Al activar, el centro de monitoreo
            y la Policía Nacional son notificados con tu ubicación GPS.
          </div>

          {error && (
            <div className="alert alert-warning small mb-3">
              <i className="fa-solid fa-circle-exclamation me-2" />{error}
            </div>
          )}

          <div className="d-grid mb-3">
            <button
              className="btn btn-danger rounded-pill py-3 fw-bold fs-5"
              onClick={activate}
              disabled={sending || !activeTrip}
            >
              {sending
                ? <><span className="spinner-border spinner-border-sm me-2" />Enviando alerta…</>
                : <><i className="fa-solid fa-triangle-exclamation me-2" />ACTIVAR SOS</>
              }
            </button>
          </div>

          {/* A dónde va la alerta */}
          <div className="bugie-card mb-3">
            <div className="bugie-card-header">¿A dónde llega tu alerta?</div>
            <div className="bugie-card-body d-grid gap-2">
              {[
                ['fa-headset',        'Centro de monitoreo Bugie', 'Supervisión 24/7 — reciben tu ubicación en segundos'],
                ['fa-shield-halved',  'Policía Nacional',          'Coordinación directa para respuesta inmediata'],
                ['fa-location-dot',   'Tu posición GPS',           'Se comparte automáticamente con los servicios'],
              ].map(([icon, title, desc]) => (
                <div key={title} className="d-flex gap-3 align-items-start">
                  <div className="bugie-mini-icon" style={{ flexShrink: 0 }}>
                    <i className={`fa-solid ${icon}`} />
                  </div>
                  <div>
                    <div className="fw-semibold small">{title}</div>
                    <div className="small bugie-muted">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Contactos de emergencia */}
          <div className="bugie-card">
            <div className="bugie-card-header">Contactos de emergencia</div>
            <div className="bugie-card-body d-grid gap-2">
              <a className="bugie-list-item text-decoration-none" href="tel:105">
                <div className="bugie-mini-icon"><i className="fa-solid fa-phone text-danger" /></div>
                <div><div className="fw-semibold">Policía Nacional</div><div className="small bugie-muted">105</div></div>
              </a>
              <a className="bugie-list-item text-decoration-none" href="tel:116">
                <div className="bugie-mini-icon"><i className="fa-solid fa-truck-medical text-danger" /></div>
                <div><div className="fw-semibold">SAMU / Bomberos</div><div className="small bugie-muted">116</div></div>
              </a>
            </div>
          </div>
        </>
      )}
    </>
  );
}
