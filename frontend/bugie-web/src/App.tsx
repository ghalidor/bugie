import { Routes, Route, Navigate } from 'react-router-dom';

import PublicLayout from './layouts/PublicLayout';
import AuthLayout from './layouts/AuthLayout';
import AppShell from './layouts/AppShell';
import RequireRole from './router/RequireRole';
import RequireVerified from './router/RequireVerified';

import NotFound from './pages/NotFound';

// Public pages
import Home from './pages/public/Home';
import Company from './pages/public/Company';
import Safety from './pages/public/Safety';
import Community from './pages/public/Community';
import Contact from './pages/public/Contact';
import Faq from './pages/public/Faq';
import Terms from './pages/public/Terms';
import Privacy from './pages/public/Privacy';
import ComplaintsBook from './pages/public/ComplaintsBook';
import ComplaintStatus from './pages/public/ComplaintStatus';
import EarnWithBugie from './pages/public/EarnWithBugie';

// Auth
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import RegisterDriver from './pages/auth/RegisterDriver';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';
import RoleSelect from './pages/auth/RoleSelect';

// Passenger
import PassengerDashboard from './pages/passenger/Dashboard';
import PassengerRequestRide from './pages/passenger/RequestRide';
import PassengerTracking from './pages/passenger/Tracking';
import PassengerTrips from './pages/passenger/Trips';
import PassengerPayments from './pages/passenger/Payments';
import PassengerProfile from './pages/passenger/Profile';
import PassengerSOS from './pages/passenger/SOS';
import PassengerVerification from './pages/passenger/Verification';

// Driver
import DriverDashboard from './pages/driver/Dashboard';
import DriverEarnings from './pages/driver/Earnings';
import DriverTrips from './pages/driver/Trips';
import DriverRatings from './pages/driver/MyRatings';
import DriverConnections from './pages/driver/MyConnections';
import DriverDocuments from './pages/driver/Documents';
import DriverProfile from './pages/driver/Profile';
import DriverVehicles from './pages/driver/Vehicles';
import DriverSOS from './pages/driver/SOS';

// Puntos (compartida por pasajero y conductor)
import RewardsPage from './pages/rewards/RewardsPage';

export default function App() {
  return (
    <Routes>
      <Route path="/libro-reclamaciones" element={<ComplaintsBook />} />
      <Route path="/libro-reclamaciones/consulta/:code" element={<ComplaintStatus />} />

      {/* Public */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/empresa" element={<Company />} />
        <Route path="/seguridad" element={<Safety />} />
        <Route path="/comunidad" element={<Community />} />
        <Route path="/gana-con-bugie" element={<EarnWithBugie />} />
        <Route path="/contacto" element={<Contact />} />
        <Route path="/faq" element={<Faq />} />
        <Route path="/terminos" element={<Terms />} />
        <Route path="/privacidad" element={<Privacy />} />
        <Route path="/noticias" element={<Navigate to="/comunidad" replace />} />
      </Route>

      {/* Auth */}
      <Route element={<AuthLayout />}>
        <Route path="/auth/login" element={<Login />} />
        <Route path="/auth/registro" element={<Register />} />
        <Route path="/auth/registro-conductor" element={<RegisterDriver />} />
        <Route path="/auth/recuperar" element={<ForgotPassword />} />
        <Route path="/auth/restablecer" element={<ResetPassword />} />
        <Route path="/auth/rol" element={<RoleSelect />} />
      </Route>

      {/* App (protected) */}
      <Route element={<AppShell />}>

        {/* Pasajero */}
        <Route element={<RequireRole allowed={['passenger']} />}>
          <Route path="/app/pasajero" element={<Navigate to="/app/pasajero/inicio" replace />} />
          <Route path="/app/pasajero/inicio"        element={<PassengerDashboard />} />
          <Route path="/app/pasajero/verificacion"  element={<PassengerVerification />} />
          <Route path="/app/pasajero/perfil"        element={<PassengerProfile />} />
          <Route path="/app/pasajero/puntos"        element={<RewardsPage />} />

          {/* Pasajero verificado puede solicitar */}
          <Route element={<RequireVerified />}>
            <Route path="/app/pasajero/solicitar"    element={<PassengerRequestRide />} />
            <Route path="/app/pasajero/seguimiento"  element={<PassengerTracking />} />
            <Route path="/app/pasajero/viajes"       element={<PassengerTrips />} />
            <Route path="/app/pasajero/pagos"        element={<PassengerPayments />} />
            <Route path="/app/pasajero/sos"          element={<PassengerSOS />} />
          </Route>
        </Route>

        {/* Conductor */}
        <Route element={<RequireRole allowed={['driver']} />}>
          <Route path="/app/conductor"            element={<Navigate to="/app/conductor/inicio" replace />} />

          {/* La web del conductor es solo de consulta: conectarse, ver
              solicitudes y gestionar viajes se hace en la app Bugie. */}
          <Route path="/app/conductor/inicio"     element={<DriverDashboard />} />
          <Route path="/app/conductor/ganancias"  element={<DriverEarnings />} />
          <Route path="/app/conductor/puntos"     element={<RewardsPage />} />
          <Route path="/app/conductor/viajes"     element={<DriverTrips />} />
          <Route path="/app/conductor/calificaciones" element={<DriverRatings />} />
          <Route path="/app/conductor/conexiones" element={<DriverConnections />} />
          <Route path="/app/conductor/documentos" element={<DriverDocuments />} />
          <Route path="/app/conductor/vehiculos"  element={<DriverVehicles />} />
          <Route path="/app/conductor/perfil"     element={<DriverProfile />} />
          <Route path="/app/conductor/sos"        element={<DriverSOS />} />
        </Route>
      </Route>

      {/* Back-compat redirects */}
      <Route path="/pasajero/*"  element={<Navigate to="/app/pasajero" replace />} />
      <Route path="/conductor/*" element={<Navigate to="/app/conductor" replace />} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}