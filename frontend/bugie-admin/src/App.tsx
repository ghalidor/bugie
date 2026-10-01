import { Routes, Route, Navigate } from 'react-router-dom'
import AuthLayout from './layouts/AuthLayout'
import AdminShell from './layouts/AdminShell'

import Login from './pages/auth/Login'

import Dashboard from './pages/admin/Dashboard'
import LiveMap from './pages/admin/LiveMap'
import Users from './pages/admin/Users'
import Drivers from './pages/admin/Drivers'
import DriverDetail from './pages/admin/DriverDetail'
import DriverVerification from './pages/admin/DriverVerification'
import Passengers from './pages/admin/Passengers'
import PassengerDetail from './pages/admin/PassengerDetail'
import Trips from './pages/admin/Trips'
import Payments from './pages/admin/Payments'
import SOSCenter from './pages/admin/SOSCenter'
import Settings from './pages/admin/Settings'
import LandingManager from './pages/admin/landing/LandingManager'
import CommunityManager from './pages/admin/CommunityManager'
import LegalDocuments from './pages/admin/LegalDocuments'
import Security from './pages/admin/Security'
import Faq from './pages/admin/Faq'
import DriverRanking from './pages/admin/DriverRanking'
import Messages from './pages/admin/Messages'
import RewardsAdmin from './pages/admin/rewards/RewardsAdmin'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/admin" replace />} />

      <Route element={<AuthLayout />}>
        <Route path="/auth/login" element={<Login />} />
      </Route>

      <Route element={<AdminShell />}>
        <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="/admin/dashboard" element={<Dashboard />} />
        <Route path="/admin/monitoreo" element={<LiveMap />} />
        <Route path="/admin/usuarios" element={<Users />} />

        <Route path="/admin/pasajeros" element={<Passengers />} />
        <Route path="/admin/pasajeros/:userId" element={<PassengerDetail />} />

        <Route path="/admin/conductores" element={<Drivers />} />
        <Route path="/admin/conductores/:driverId" element={<DriverDetail />} />
        <Route path="/admin/verificacion" element={<DriverVerification />} />

        <Route path="/admin/viajes" element={<Trips />} />
        <Route path="/admin/pagos" element={<Payments />} />
        <Route path="/admin/puntos" element={<RewardsAdmin />} />
        <Route path="/admin/sos" element={<SOSCenter />} />
        <Route path="/admin/configuracion" element={<Settings />} />
        <Route path="/admin/mensajes" element={<Messages />} />
        <Route path="/admin/landing"   element={<LandingManager />} />
        <Route path="/admin/comunidad" element={<CommunityManager />} />
        <Route path="/admin/legales"   element={<LegalDocuments />} />
        <Route path="/admin/faq"       element={<Faq />} />
        <Route path="/admin/reportes/ranking-conductores" element={<DriverRanking />} />
        <Route path="/admin/seguridad" element={<Security />} />

        <Route path="/admin/noticias" element={<Navigate to="/admin/comunidad" replace />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}