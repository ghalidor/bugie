import { useState } from 'react';
import PageHeader from '../../components/PageHeader';
import { API, apiFetch, ApiError } from '../../state/api';

const TRUJILLO = { lat: -8.109052, lng: -79.021534 };

export default function DriverSOS() {
  const [tripId,  setTripId]  = useState('');
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function activate() {
    if (!tripId) { setError('Ingresa el ID del viaje activo.'); return; }
    setSending(true); setError(null);
    try {
      const pos: { lat: number; lng: number } = await new Promise(resolve =>
        navigator.geolocation.getCurrentPosition(
          p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
          () => resolve(TRUJILLO)
        )
      );
      await apiFetch(`${API.trips}/sos`, { method: 'POST', body: JSON.stringify({ tripId, lat: pos.lat, lng: pos.lng }) });
      setSent(true);
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Error al activar SOS.'); }
    finally { setSending(false); }
  }

  return (
    <>
      <PageHeader title="SOS / Emergencia" subtitle="El centro de monitoreo responde en menos de 2 minutos." icon="fa-solid fa-triangle-exclamation" />

      {sent ? (
        <div className="alert alert-success text-center py-4">
          <i className="fa-solid fa-circle-check fa-2x mb-3 d-block" />
          <div className="fw-bold fs-5 mb-2">Alerta SOS enviada</div>
          <div className="small">El centro de monitoreo fue notificado. Mantén la calma.</div>
        </div>
      ) : (
        <>
          <div className="alert alert-danger mb-3 small">
            <i className="fa-solid fa-triangle-exclamation me-2" />
            <strong>Solo para emergencias reales.</strong> Notifica al monitoreo y la Policía Nacional.
          </div>

          <div className="bugie-card p-3 mb-3">
            <label className="form-label">ID del viaje activo</label>
            <input className="form-control mb-3" placeholder="ID del viaje" value={tripId} onChange={e => setTripId(e.target.value)} />
            {error && <div className="text-danger small mb-3">{error}</div>}
            <div className="d-grid">
              <button className="btn btn-danger rounded-pill py-3 fw-bold fs-5" onClick={activate} disabled={sending}>
                {sending ? <><span className="spinner-border spinner-border-sm me-2" />Enviando…</> : <><i className="fa-solid fa-triangle-exclamation me-2" />ACTIVAR SOS</>}
              </button>
            </div>
          </div>

          <div className="bugie-card p-3">
            <div className="fw-semibold mb-3">Contactos de emergencia</div>
            <a className="bugie-list-item text-decoration-none mb-2" href="tel:105">
              <i className="fa-solid fa-phone text-danger" style={{ width: 20 }} />
              <div><div className="fw-semibold">Policía Nacional</div><div className="small bugie-muted">105</div></div>
            </a>
            <a className="bugie-list-item text-decoration-none" href="tel:116">
              <i className="fa-solid fa-truck-medical text-danger" style={{ width: 20 }} />
              <div><div className="fw-semibold">SAMU / Bomberos</div><div className="small bugie-muted">116</div></div>
            </a>
          </div>
        </>
      )}
    </>
  );
}
