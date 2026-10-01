import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../core/session/session.dart';

// Auth
import '../modules/auth/presentation/splash_screen.dart';
import '../modules/auth/presentation/welcome_screen.dart';
import '../modules/auth/presentation/login_screen.dart';
import '../modules/auth/presentation/register_screen.dart';
import '../modules/auth/presentation/forgot_password_screen.dart';

// Pasajero
import '../modules/passenger/presentation/passenger_shell.dart';
import '../modules/passenger/presentation/request_ride_screen.dart';
import '../modules/passenger/presentation/request_delivery_screen.dart';
import '../modules/passenger/presentation/service_selector_screen.dart';
import '../modules/passenger/presentation/tracking_screen.dart';
import '../modules/passenger/presentation/trips_history_screen.dart';
import '../modules/passenger/presentation/trip_detail_screen.dart';
import '../modules/trips/domain/trip_model.dart';
import '../modules/passenger/presentation/payments_screen.dart';
import '../modules/rewards/presentation/rewards_screen.dart';
import '../modules/passenger/presentation/profile_screen.dart' as p_profile;
import '../modules/favorites/presentation/favorites_screen.dart';
import '../modules/passenger/presentation/sos_screen.dart';
import '../modules/passenger/presentation/verification_screen.dart';

// Conductor
import '../modules/driver/presentation/driver_shell.dart';
import '../modules/driver/presentation/go_online_screen.dart';
import '../modules/driver/presentation/incoming_requests_screen.dart';
import '../modules/driver/presentation/incoming_request_detail_screen.dart';
import '../modules/driver/presentation/trip_in_progress_screen.dart';
import '../modules/driver/presentation/earnings_screen.dart';
import '../modules/driver/presentation/trips_history_screen.dart' as d_trips;
import '../modules/driver/presentation/documents_screen.dart';
import '../modules/driver/presentation/vehicles_screen.dart';
import '../modules/driver/presentation/profile_screen.dart' as d_profile;
import '../modules/driver/presentation/ratings_screen.dart';
import '../modules/driver/presentation/sos_screen.dart' as d_sos;

/// Router central de la app.
/// Usa redirect() para proteger rutas según la sesión y el rol.
GoRouter createRouter(Session session) {
  return GoRouter(
    initialLocation: '/splash',
    refreshListenable: session,
    redirect: (context, state) {
      final loc = state.matchedLocation;
      final loggedIn = session.isLoggedIn;
      final role = session.role;

      // El splash NUNCA se redirige — siempre se ve al arrancar la app
      // y él mismo navega a `/` cuando termina la animación.
      if (loc == '/splash') return null;

      // Rutas públicas: las que se pueden ver SIN sesión.
      // '/' (Welcome) está aquí porque es la pantalla inicial — pero si el
      // usuario ya está logueado, NO debe quedarse ahí: hay que redirigir
      // al dashboard que corresponde a su rol.
      const publicPaths = ['/', '/login', '/register', '/forgot-password'];
      final isPublic = publicPaths.contains(loc);

      // No logueado y quiere zona privada → bienvenida
      if (!loggedIn && !isPublic) return '/';

      // Logueado y va a una pantalla pública (incluyendo Welcome '/') →
      // mandarlo a su dashboard. Antes excluíamos '/' con `loc != '/'`,
      // lo que hacía que cada vez que abrías la app vieras la pantalla
      // de bienvenida con botones de login aunque ya estuvieras logueado.
      if (loggedIn && isPublic) {
        if (role == UserRole.driver)    return '/driver';
        if (role == UserRole.passenger) return '/passenger';
        // admin no debería estar en mobile, pero por completitud:
        // dejarlo en '/' si llegó aquí.
      }

      // Pasajero entrando a /driver/* o viceversa
      if (loggedIn && loc.startsWith('/driver') && role != UserRole.driver) {
        return '/passenger';
      }
      if (loggedIn && loc.startsWith('/passenger') && role != UserRole.passenger) {
        return '/driver';
      }

      return null; // sin redirect
    },
    routes: [
      // Splash inicial — se ve siempre al arrancar la app antes de
      // tomar decisiones de routing. Se autodestruye a los 1.8s.
      GoRoute(path: '/splash',           builder: (_, __) => const SplashScreen()),
      // Públicas
      GoRoute(path: '/',                 builder: (_, __) => const WelcomeScreen()),
      GoRoute(path: '/login',            builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/register',         builder: (_, __) => const RegisterScreen()),
      GoRoute(path: '/forgot-password',  builder: (_, __) => const ForgotPasswordScreen()),

      // Pasajero
      GoRoute(path: '/passenger',          builder: (_, __) => const PassengerShell()),
      GoRoute(path: '/passenger/service',  builder: (_, __) => const ServiceSelectorScreen()),
      GoRoute(path: '/passenger/request',  builder: (_, __) => const RequestRideScreen()),
      GoRoute(path: '/passenger/delivery', builder: (_, __) => const RequestDeliveryScreen()),
      GoRoute(path: '/passenger/tracking', builder: (_, __) => const PassengerTrackingScreen()),
      GoRoute(path: '/passenger/trips',    builder: (_, __) => const PassengerTripsScreen()),
      GoRoute(
        path: '/passenger/trip-detail',
        builder: (context, state) =>
            TripDetailScreen(trip: state.extra as Trip),
      ),
      GoRoute(path: '/passenger/payments', builder: (_, __) => const PassengerPaymentsScreen()),
      GoRoute(path: '/passenger/rewards',  builder: (_, __) => const RewardsScreen()),
      GoRoute(path: '/passenger/profile',      builder: (_, __) => const p_profile.PassengerProfileScreen()),
      GoRoute(path: '/passenger/favorites',    builder: (_, __) => const FavoritesScreen()),
      GoRoute(path: '/passenger/verification', builder: (_, __) => const PassengerVerificationScreen()),
      GoRoute(path: '/passenger/sos',          builder: (_, __) => const PassengerSosScreen()),

      // Conductor
      GoRoute(path: '/driver',                   builder: (_, __) => const DriverShell()),
      GoRoute(path: '/driver/go-online',         builder: (_, __) => const GoOnlineScreen()),
      GoRoute(path: '/driver/requests',          builder: (_, __) => const IncomingRequestsScreen()),
      // Detalle de una solicitud entrante con mapa fullscreen.
      // Acepta el tripId como parámetro de URL.
      GoRoute(
        path: '/driver/incoming/:id',
        builder: (_, state) => IncomingRequestDetailScreen(
          tripId: state.pathParameters['id']!,
        ),
      ),
      GoRoute(path: '/driver/trip-in-progress',  builder: (_, __) => const TripInProgressScreen()),
      GoRoute(path: '/driver/earnings',          builder: (_, __) => const EarningsScreen()),
      GoRoute(path: '/driver/rewards',           builder: (_, __) => const RewardsScreen()),
      GoRoute(path: '/driver/trips',             builder: (_, __) => const d_trips.DriverTripsScreen()),
      GoRoute(path: '/driver/ratings',           builder: (_, __) => const DriverRatingsScreen()),
      GoRoute(path: '/driver/documents',         builder: (_, __) => const DriverDocumentsScreen()),
      GoRoute(path: '/driver/vehicles',          builder: (_, __) => const DriverVehiclesScreen()),
      GoRoute(path: '/driver/profile',           builder: (_, __) => const d_profile.DriverProfileScreen()),
      GoRoute(path: '/driver/sos',               builder: (_, __) => const d_sos.DriverSosScreen()),
    ],
    errorBuilder: (context, state) => Scaffold(
      appBar: AppBar(title: const Text('No encontrado')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 64, color: Colors.grey),
            const SizedBox(height: 12),
            Text('Ruta no encontrada: ${state.uri}'),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () => context.go('/'),
              child: const Text('Inicio'),
            ),
          ],
        ),
      ),
    ),
  );
}
