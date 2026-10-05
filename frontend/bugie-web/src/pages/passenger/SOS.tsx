import { useEffect, useState } from 'react';
import { API, apiFetch, ApiError } from '../../state/api';
import { usePlatformConfig } from '../../hooks/usePlatformConfig';
import { Notice, Page, SectionCard, Skeleton, useConfirm } from '../../components/ui';

interface ActiveTrip { id: string; originAddress: string; destAddress: string; }

export default function PassengerSOS() {
  const confirm = useConfirm();
  const { sosResponseMin } = usePlatformConfig();
  const [activeTrip, setActiveTrip] = useState<ActiveTrip | null>(null);
  const [loadingTrip, setLoadingTrip] = useState(true);
  const [sending,    setSending]    = useState(false);
  const [sent,       setSent]       = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  // Cargar el viaje activo para autocompletar el tripId
  useEffect(() => {
    apiFetch<ActiveTrip | null>(`${API.trips}/trips/active`)
      .then(setActiveTrip)
      .catch(() => {})
      .finally(() => setLoadingTrip(false));
  }, []);

  async function activate() {
    if (!activeTrip) {
      setError('No tienes un viaje activo. El SOS solo se puede activar durante un viaje en curso.');
      return;
    }
    const ok = await confirm({
      title: '¿Activar la alerta SOS?',
      message: 'Se enviará tu ubicación al centro de monitoreo de Bugie. Úsalo solo en una emergencia real.',
      confirmText: 'Sí, activar SOS',
      cancelText: 'No',
      tone: 'danger',
    });
    if (!ok) return;

    setSending(true); setError(null);
    try {
      const pos = await new Promise<{ lat: number; lng: number }>(resolve =>
        navigator.geolocation.getCurrentPosition(
          p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
          () => resolve({ lat: -8.109052, lng: -79.021534 })
        )
      );

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
    <Page
      title="SOS / Emergencia"
      subtitle={`Alerta inmediata al centro de monitoreo de Bugie. Respuesta en menos de ${sosResponseMin} min.`}
      icon="fa-triangle-exclamation"
    >
      {sent ? (
        <SectionCard>
          <div className="bx-hero-state bx-tone-ok" role="status">
            <span className="ico" aria-hidden="true"><i className="fa-solid fa-circle-check" /></span>
            <h2>Alerta SOS enviada</h2>
            <p>
              Se alertó al centro de monitoreo y a los administradores de Bugie con tu ubicación.
              Si registraste un contacto de emergencia, le enviamos un correo. Mantén la calma.
            </p>
          </div>
        </SectionCard>
      ) : (
        <>
          <SectionCard>
            <div className="bx-stack">
              {loadingTrip ? (
                <Skeleton height={48} />
              ) : activeTrip ? (
                <Notice tone="info" icon="fa-car" title="Viaje activo detectado">
                  {activeTrip.originAddress} → {activeTrip.destAddress}
                </Notice>
              ) : (
                <Notice tone="warn" title="No tienes un viaje activo">
                  El SOS se activa durante un viaje en curso.
                </Notice>
              )}

              <Notice tone="bad" icon="fa-triangle-exclamation" title="Solo para emergencias reales">
                Al activar, se alerta al centro de monitoreo y a los administradores de Bugie con tu
                ubicación GPS, y se envía un correo a tu contacto de emergencia si lo registraste.
              </Notice>

              {error && <Notice tone="warn">{error}</Notice>}

              <div className="d-grid">
                <button className="btn btn-danger rounded-pill py-3 fw-bold fs-5" onClick={activate} disabled={sending || !activeTrip}>
                  {sending
                    ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Enviando alerta…</>
                    : <><i className="fa-solid fa-triangle-exclamation me-2" aria-hidden="true" />ACTIVAR SOS</>}
                </button>
              </div>
            </div>
          </SectionCard>

          <div className="bx-split">
            <SectionCard title="¿A dónde llega tu alerta?" icon="fa-tower-broadcast" flush>
              <ul className="bx-list">
                {[
                  ['fa-headset',       'Centro de monitoreo Bugie', 'Supervisión 24/7: reciben tu ubicación en segundos'],
                  ['fa-user-shield',   'Administradores de Bugie',  'Reciben la alerta y atienden el caso'],
                  ['fa-envelope',      'Tu contacto de emergencia', 'Le enviamos un correo si lo registraste en tu perfil'],
                  ['fa-location-dot',  'Tu posición GPS',           'Se comparte automáticamente con el centro de monitoreo y los administradores'],
                ].map(([icon, title, desc]) => (
                  <li key={title} className="bx-list-item">
                    <span className="bx-list-icon" aria-hidden="true"><i className={`fa-solid ${icon}`} /></span>
                    <span className="bx-list-text">
                      <span className="bx-list-title">{title}</span>
                      <span className="bx-list-sub d-block">{desc}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </SectionCard>

            <SectionCard title="Números de emergencia" icon="fa-phone" flush>
              <div className="bx-list">
                <a className="bx-list-item" href="tel:105">
                  <span className="bx-list-icon bx-tone-bad" aria-hidden="true"><i className="fa-solid fa-phone" /></span>
                  <span className="bx-list-text">
                    <span className="bx-list-title">Policía Nacional</span>
                    <span className="bx-list-sub d-block">Llamar al 105</span>
                  </span>
                  <i className="fa-solid fa-chevron-right chev" aria-hidden="true" />
                </a>
                <a className="bx-list-item" href="tel:116">
                  <span className="bx-list-icon bx-tone-bad" aria-hidden="true"><i className="fa-solid fa-truck-medical" /></span>
                  <span className="bx-list-text">
                    <span className="bx-list-title">SAMU / Bomberos</span>
                    <span className="bx-list-sub d-block">Llamar al 116</span>
                  </span>
                  <i className="fa-solid fa-chevron-right chev" aria-hidden="true" />
                </a>
              </div>
            </SectionCard>
          </div>
        </>
      )}
    </Page>
  );
}
