import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRole } from '../../state/session';

// Esta pantalla ya no es necesaria cuando el usuario hace login real
// porque el rol viene directo de la API. Se mantiene como fallback
// por si alguien llega aquí sin sesión activa.
export default function RoleSelect() {
  const navigate  = useNavigate();
  const role      = getRole();

  // Si ya tiene sesión, redirigir directamente
  useEffect(() => {
    if (role === 'passenger') navigate('/app/pasajero/inicio', { replace: true });
    else if (role === 'driver') navigate('/app/conductor/inicio', { replace: true });
    else if (role === 'admin') navigate('/admin/dashboard', { replace: true });
  }, [role, navigate]);

  // Pantalla de selección manual (solo para demos sin API activa)
  function choose(r: 'passenger' | 'driver') {
    navigate(r === 'passenger' ? '/app/pasajero/inicio' : '/app/conductor/inicio');
  }

  return (
    <>
      <div className="mb-4">
        <div className="text-uppercase small fw-bold text-bugie-accent mb-2">Selecciona un rol</div>
        <h1 className="bugie-h3 mb-2">¿A qué experiencia quieres entrar?</h1>
        <p className="bugie-muted mb-0">Elige tu rol para continuar.</p>
      </div>
      <div className="row g-3">
        <div className="col-md-6">
          <button className="bugie-feature text-start w-100 h-100" type="button" onClick={() => choose('passenger')}>
            <div className="bugie-mini-icon mb-3"><i className="fa-solid fa-user" /></div>
            <div className="fw-bold mb-2">Pasajero</div>
            <div className="small bugie-muted">Solicitar viaje, seguimiento, pagos e historial.</div>
          </button>
        </div>
        <div className="col-md-6">
          <button className="bugie-feature text-start w-100 h-100" type="button" onClick={() => choose('driver')}>
            <div className="bugie-mini-icon mb-3"><i className="fa-solid fa-car-side" /></div>
            <div className="fw-bold mb-2">Conductor</div>
            <div className="small bugie-muted">Estado, documentos, ganancias e historial.</div>
          </button>
        </div>
      </div>
    </>
  );
}
