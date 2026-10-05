import { useEffect, useState } from 'react';
import { API, apiFetch, ApiError } from '../../state/api';
import { usePlatformConfig } from '../../hooks/usePlatformConfig';
import { Field, Notice, Page, SectionCard, Skeleton, useConfirm } from '../../components/ui';

const TRUJILLO = { lat: -8.109052, lng: -79.021534 };

interface ActiveTrip { id: string; originAddress: string; destAddress: string; }

export default function DriverSOS() {
  const confirm = useConfirm();
  const { sosResponseMin } = usePlatformConfig();
  const [tripId,  setTripId]  = useState('');
  const [active,  setActive]  = useState<ActiveTrip | null>(null);
  const [loadingTrip, setLoadingTrip] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // El viaje activo se detecta solo (antes había que escribir su ID a mano).
  useEffect(() => {
    apiFetch<ActiveTrip | null>(`${API.trips}/trips/active`)
      .then(t => { setActive(t); if (t) setTripId(t.id); })
      .catch(() => {})
      .finally(() => setLoadingTrip(false));
  }, []);

  async function activate() {
    if (!tripId) { setError('Ingresa el ID del viaje activo.'); return; }
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
    <Page
      title="SOS / Emergencia"
      subtitle={`El centro de monitoreo responde en menos de ${sosResponseMin} ${sosResponseMin === 1 ? 'minuto' : 'minutos'}.`}
      icon="fa-triangle-exclamation"
    >
      {sent ? (
        <SectionCard>
          <div className="bx-hero-state bx-tone-ok" role="status">
            <span className="ico" aria-hidden="true"><i className="fa-solid fa-circle-check" /></span>
            <h2>Alerta SOS enviada</h2>
            <p>Se alertó al centro de monitoreo y a los administradores de Bugie. Si registraste un contacto de emergencia, le enviamos un correo. Mantén la calma.</p>
          </div>
        </SectionCard>
      ) : (
        <>
          <SectionCard>
            <div className="bx-stack">
              <Notice tone="bad" icon="fa-triangle-exclamation" title="Solo para emergencias reales">
                Alerta al centro de monitoreo y a los administradores de Bugie con tu ubicación, y envía un correo a tu contacto de emergencia si lo registraste.
              </Notice>

              {loadingTrip ? (
                <Skeleton height={48} />
              ) : active ? (
                <Notice tone="info" icon="fa-car" title="Viaje activo detectado">
                  {active.originAddress} → {active.destAddress}
                </Notice>
              ) : (
                <Notice tone="warn" title="No encontramos un viaje activo">
                  Si estás en un viaje iniciado en la app, ingresa su ID abajo.
                </Notice>
              )}

              {!loadingTrip && (
                <details open={!active}>
                  <summary className="small fw-semibold" style={{ cursor: 'pointer' }}>
                    {active ? 'Usar otro ID de viaje' : 'ID del viaje'}
                  </summary>
                  <div className="mt-2">
                    <Field label="ID del viaje activo" error={error && !tripId ? error : undefined}>
                      <input className="form-control" placeholder="ID del viaje" value={tripId}
                             onChange={e => setTripId(e.target.value)} autoComplete="off" />
                    </Field>
                  </div>
                </details>
              )}

              {error && tripId && <Notice tone="warn">{error}</Notice>}

              <div className="d-grid">
                <button className="btn btn-danger rounded-pill py-3 fw-bold fs-5" onClick={activate} disabled={sending || loadingTrip}>
                  {sending
                    ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Enviando…</>
                    : <><i className="fa-solid fa-triangle-exclamation me-2" aria-hidden="true" />ACTIVAR SOS</>}
                </button>
              </div>
            </div>
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
        </>
      )}
    </Page>
  );
}
