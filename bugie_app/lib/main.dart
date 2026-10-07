import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'core/ui/app_messenger.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';

import 'core/api/api_client.dart';
import 'core/services/default_location_service.dart';
import 'core/services/active_trip_service.dart';
import 'core/services/admin_settings_service.dart';
import 'core/services/fcm_service.dart';
import 'core/services/in_app_alert_service.dart';
import 'core/services/location_tracking_service.dart';
import 'core/services/network_status_service.dart';
import 'core/services/notification_prefs.dart';
import 'core/services/request_alert_service.dart';
import 'core/services/trips_hub_service.dart';
import 'core/session/session.dart';
import 'core/theme/bugie_theme.dart';
import 'core/theme/theme_controller.dart';
import 'core/widgets/active_trip_strip.dart';
import 'core/widgets/alert_banner.dart';
import 'core/widgets/offline_banner.dart';
import 'core/widgets/request_alert_panel.dart';
import 'modules/auth/data/auth_repository.dart';
import 'modules/driver/data/driver_repository.dart';
import 'modules/payments/data/payments_repository.dart';
import 'modules/rewards/data/rewards_repository.dart';
import 'modules/sos/data/sos_repository.dart';
import 'modules/favorites/data/favorites_repository.dart';
import 'modules/notifications/data/notifications_badge.dart';
import 'modules/notifications/data/notifications_repository.dart';
import 'modules/presence/data/presence_repository.dart';
import 'modules/trips/data/trips_repository.dart';
import 'router/app_router.dart';

/// Handler que corre cuando llega un push y la app está CERRADA o en
/// background. Tiene que ser top-level (no método de clase) y estar
/// marcado con @pragma. No podemos navegar acá — solo logueamos.
@pragma('vm:entry-point')
Future<void> _firebaseBackgroundHandler(RemoteMessage message) async {
  // Inicializa Firebase en el isolate de background.
  await Firebase.initializeApp();
  // El sistema operativo se encarga de mostrar la notif.
  // Si necesitamos hacer algo (ej. cachear data), va acá.
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Cargar .env (URLs de las APIs)
  await dotenv.load(fileName: '.env');

  // Inicializar Firebase. Si falla (ej. android sin google-services.json
  // configurado), atrapamos para que la app igual arranque sin push.
  try {
    await Firebase.initializeApp();
    FirebaseMessaging.onBackgroundMessage(_firebaseBackgroundHandler);
  } catch (e) {
    debugPrint('Firebase init falló: $e — la app seguirá sin push');
  }

  // Cargar locale para fechas en español
  await initializeDateFormatting('es_PE', null);

  // Cargar sesión guardada
  final session = Session();
  await session.load();

  // Cargar el modo de tema guardado (claro / oscuro / sistema)
  final themeController = ThemeController();
  await themeController.load();

  // Preferencias de notificación (sonido, vibración, solicitudes).
  await NotificationPrefs().load();

  runApp(BugieApp(session: session, themeController: themeController));
}

class BugieApp extends StatelessWidget {
  final Session session;
  final ThemeController themeController;
  const BugieApp({
    super.key,
    required this.session,
    required this.themeController,
  });

  @override
  Widget build(BuildContext context) {
    final apiClient = ApiClient(session);
    // Singleton de tracking: lo comparten las pantallas y el logout.
    final locationTracking = LocationTrackingService();

    return MultiProvider(
      providers: [
        // Sesión
        ChangeNotifierProvider.value(value: session),

        // Tema (claro / oscuro / sistema)
        ChangeNotifierProvider.value(value: themeController),

        // Preferencias de notificación (singleton, ver NotificationPrefs).
        ChangeNotifierProvider.value(value: NotificationPrefs()),

        // Cliente HTTP único
        Provider.value(value: apiClient),

        // Servicios de soporte
        Provider(create: (_) => DefaultLocationService(apiClient)),
        Provider(create: (_) => AdminSettingsService(apiClient)),

        // Tracking de ubicación (singleton de la app). Cualquier pantalla
        // que necesite enviar ubicación lo arranca y lo para por sí misma.
        Provider.value(value: locationTracking),

        // Repositorios — uno por módulo
        Provider(
          create: (_) => AuthRepository(
            apiClient,
            session,
            tracking: locationTracking,
          ),
        ),
        Provider(create: (_) => TripsRepository(apiClient)),
        Provider(create: (_) => DriverRepository(apiClient)),
        Provider(create: (_) => PaymentsRepository(apiClient)),
        Provider(create: (_) => RewardsRepository(apiClient)),
        Provider(create: (_) => SosRepository(apiClient)),
        Provider(create: (_) => FavoritesRepository(apiClient)),
        Provider(create: (_) => PresenceRepository(apiClient)),
        Provider(create: (_) => NotificationsRepository(apiClient)),
      ],
      // OJO: este Builder NO debe depender del tema (ni de nada que cambie):
      // si se reconstruye, se crea OTRO GoRouter y la app vuelve al splash.
      // Por eso el tema se escucha más abajo con un Consumer.
      child: Builder(
        builder: (context) {
          final router = createRouter(session);

          // Conectar el router al servicio de alertas in-app para que
          // los banners puedan navegar al tocarlos.
          InAppAlertService().attachRouter(router, session: session);
          // Panel grande de "solicitud nueva" (conductor).
          RequestAlertService().attachRouter(router);
          // Viaje activo del conductor o pasajero (franja "Viaje en curso · Volver").
          ActiveTripService().attach(
            router: router,
            session: session,
            trips: context.read<TripsRepository>(),
          );

          // Canal en tiempo real con Trips (hub SignalR). Las pantallas del
          // viaje se suscriben; se desconecta al cerrar sesión y en segundo
          // plano.
          TripsHubService().attach(session: session);

          // Franja "Sin conexión. Reintentando…" (fallas de red del
          // ApiClient y del hub).
          NetworkStatusService().attach();

          // Contador de notificaciones sin leer (campana). Antes de FCM para
          // que un push tocado con la app cerrada pueda marcarse como leído.
          NotificationsBadge().attach(api: apiClient, session: session);

          // Inicializar FCM. Lo hacemos acá (después de crear router y
          // ApiClient) para que el servicio pueda navegar al tocar
          // notificaciones y registrar el token contra el backend.
          // Es seguro llamar varias veces — el FcmService es singleton.
          // Si Firebase no se inicializó (ej. faltan archivos config),
          // el init falla silenciosamente y la app sigue normal.
          FcmService()
              .init(api: apiClient, router: router, session: session)
              .catchError((e) {
            debugPrint('FcmService.init falló: $e');
          });

          return Consumer<ThemeController>(
            builder: (context, themeCtrl, _) => MaterialApp.router(
              scaffoldMessengerKey: rootMessengerKey,
              title: 'Bugie',
              theme: BugieTheme.light(),
              darkTheme: BugieTheme.dark(),
              themeMode: themeCtrl.mode,
              debugShowCheckedModeBanner: false,
              routerConfig: router,
              // El builder envuelve toda la app con un Stack que monta el
              // AlertOverlay encima. Los banners aparecen sobre cualquier
              // pantalla, incluyendo BottomSheets y Dialogs.
              builder: (context, child) {
                return Stack(
                  children: [
                    // Franja "Viaje en curso · Volver" arriba de todas las
                    // pantallas mientras el usuario tenga un viaje activo y,
                    // debajo, "Sin conexión. Reintentando…" si no hay red.
                    ActiveTripFrame(
                      child: OfflineFrame(
                          child: child ?? const SizedBox.shrink()),
                    ),
                    const AlertOverlay(),
                    const RequestAlertPanel(),
                  ],
                );
              },
            ),
          );
        },
      ),
    );
  }
}
