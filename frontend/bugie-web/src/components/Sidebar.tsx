import { NavLink } from 'react-router-dom';

function Item({ to, iconClass, label }: { to: string; iconClass: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `bugie-sidebar-link ${isActive ? 'active' : ''}`}
      end
    >
      <i className={`${iconClass} bugie-sidebar-icon`} />
      <span>{label}</span>
    </NavLink>
  );
}

export default function Sidebar({ path }: { path: string }) {
  const isPassenger = path.startsWith('/app/pasajero');
  const isDriver    = path.startsWith('/app/conductor');

  return (
    <>
      {isPassenger && (
        <div className="bugie-card mb-3">
          <div className="bugie-card-body">
            <div className="small text-uppercase fw-bold bugie-muted mb-3">Pasajero</div>
            <div className="d-grid gap-2">
              <Item to="/app/pasajero/inicio"       iconClass="fa-solid fa-house"             label="Inicio" />
              <Item to="/app/pasajero/solicitar"    iconClass="fa-solid fa-route"             label="Solicitar viaje" />
              <Item to="/app/pasajero/seguimiento"  iconClass="fa-solid fa-location-dot"      label="Seguimiento" />
              <Item to="/app/pasajero/viajes"       iconClass="fa-solid fa-clock-rotate-left" label="Historial" />
              <Item to="/app/pasajero/pagos"        iconClass="fa-solid fa-credit-card"       label="Pagos" />
              <Item to="/app/pasajero/puntos"       iconClass="fa-solid fa-star"              label="Mis puntos" />
              <Item to="/app/pasajero/verificacion" iconClass="fa-solid fa-id-card"           label="Verificación" />
              <Item to="/app/pasajero/perfil"       iconClass="fa-solid fa-user"              label="Perfil" />
              <Item to="/app/pasajero/sos"          iconClass="fa-solid fa-shield-halved"     label="SOS / Seguridad" />
            </div>
          </div>
        </div>
      )}

      {isDriver && (
        <div className="bugie-card mb-3">
          <div className="bugie-card-body">
            <div className="small text-uppercase fw-bold bugie-muted mb-3">Conductor</div>
            <div className="d-grid gap-2">
              <Item to="/app/conductor/inicio"      iconClass="fa-solid fa-car"                label="Inicio" />
              <Item to="/app/conductor/en-linea"    iconClass="fa-solid fa-signal"             label="Disponibilidad" />
              <Item to="/app/conductor/solicitudes" iconClass="fa-solid fa-list-check"         label="Solicitudes" />
              <Item to="/app/conductor/viaje"       iconClass="fa-solid fa-route"              label="Viaje en curso" />
              <Item to="/app/conductor/ganancias"   iconClass="fa-solid fa-money-bill-trend-up" label="Ganancias" />
              <Item to="/app/conductor/puntos"      iconClass="fa-solid fa-star"               label="Mis puntos" />
              <Item to="/app/conductor/viajes"      iconClass="fa-solid fa-clock-rotate-left"  label="Historial" />
              <Item to="/app/conductor/calificaciones" iconClass="fa-solid fa-star"            label="Mis calificaciones" />
              <Item to="/app/conductor/documentos"  iconClass="fa-solid fa-id-card"            label="Documentos" />
              <Item to="/app/conductor/perfil"      iconClass="fa-solid fa-user"               label="Perfil" />
              <Item to="/app/conductor/sos"         iconClass="fa-solid fa-shield-halved"      label="SOS / Seguridad" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}