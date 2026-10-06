import 'dart:async';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:go_router/go_router.dart';
import '../../modules/notifications/data/notifications_badge.dart';
import '../api/api_client.dart';
import '../api/api_config.dart';
import '../session/session.dart';
import 'active_trip_service.dart';
import 'in_app_alert_service.dart';
import 'notification_prefs.dart';
import 'push_routes.dart';
import 'request_alert_service.dart';
import 'trips_hub_service.dart';

/// Servicio centralizado de Firebase Cloud Messaging.
///
/// Responsabilidades:
///   1. Pedir permisos de notificación al usuario (Android 13+ / iOS).
///   2. Obtener el token FCM del dispositivo y enviarlo al backend
///      (POST /api/auth/me/fcm-token) al iniciar sesión, al abrir la app con
///      sesión y cuando Firebase lo rota (onTokenRefresh). Al cerrar sesión
///      se borra SOLO el de este celular (DELETE /api/auth/me/fcm-token?token=).
///   3. Escuchar mensajes entrantes:
///        - background/cerrada: el sistema muestra la notificación nativa
///          (el backend manda notification + data; no mostramos otra local
///          para que no salga duplicada).
///        - foreground: Android/iOS NO muestran la notificación del sistema,
///          así que mostramos un banner in-app (AlertBanner) vía
///          InAppAlertService. Una sola alerta por push.
///   4. Manejar taps en la notificación: navega a data.route normalizada al
///      rol actual (ver push_routes.dart). Si la app estaba cerrada, espera a
///      que termine el splash para navegar.
///
/// Se llama desde main.dart después de Firebase.initializeApp().
/// Aviso "tu conductor llego" recibido por push. La pantalla de seguimiento
/// del pasajero lo escucha y muestra el popup.
class DriverArrivedEvent {
  final String? tripId;
  final DateTime at;
  DriverArrivedEvent(this.tripId) : at = DateTime.now();
}

/// Aviso "viaje cancelado" recibido por push. Las pantallas del viaje
/// (pasajero y conductor) lo escuchan para refrescar y mostrar el motivo.
class TripCancelledEvent {
  final String? tripId;
  final DateTime at;
  TripCancelledEvent(this.tripId) : at = DateTime.now();
}

/// Cualquier push de un viaje (lleva data.trip_id): propuesta nueva,
/// oferta aceptada/retirada/vencida, conductor asignado, viaje reabierto o
/// cancelado... Las pantallas de negociación (seguimiento del pasajero,
/// Solicitudes y detalle de la solicitud del conductor) lo escuchan para
/// recargar si corresponde al viaje que muestran.
class TripPushEvent {
  /// data.type (null en avisos sin type, ej. propuesta nueva).
  final String? type;
  final String? tripId;
  /// data completa del push (cancelled_by, reason_code, expires_at...).
  final Map<String, dynamic> data;
  /// true si el usuario TOCÓ la notificación (no solo llegó).
  final bool opened;
  final DateTime at;
  TripPushEvent(this.type, this.tripId, this.data, {this.opened = false})
      : at = DateTime.now();

  /// Viaje inmediato que Bugie canceló porque nadie lo aceptó a tiempo.
  bool get isNoDriverTimeout =>
      type == 'trip_cancelled' &&
      data['cancelled_by'] == 'system' &&
      data['reason_code'] == 'no_driver_timeout';
}

/// Aviso de cuenta del conductor (type 'account'): aprobado, rechazado,
/// documento rechazado o por vencer. Las pantallas del conductor (inicio,
/// disponibilidad, documentos) lo escuchan para volver a pedir su estado.
class DriverAccountEvent {
  /// data.alert_type: 'driver_approved' | 'driver_rejected' |
  /// 'driver_suspended' | 'driver_reactivated' | 'review_kept' |
  /// 'document_rejected' | 'document_expiring'.
  final String? alertType;
  final DateTime at;
  DriverAccountEvent(this.alertType) : at = DateTime.now();

  bool get isApproved => alertType == 'driver_approved';

  /// Cambió el estado de la cuenta (aprobada, rechazada, suspendida,
  /// reactivada o respuesta a la solicitud de revisión).
  bool get isStatusChange =>
      alertType == 'driver_approved' ||
      alertType == 'driver_rejected' ||
      alertType == 'driver_suspended' ||
      alertType == 'driver_reactivated' ||
      alertType == 'review_kept';
}

/// true si el push es una SOLICITUD NUEVA para el conductor.
///
/// El backend (Trips: CreateTripHandler.NotifyDriversAsync) la manda SIN
/// data.type, con alert_type = 'proposal' y route = '/driver/requests'
/// (es el único aviso con esa ruta). También se acepta un futuro
/// type = 'new_request'.
bool isNewRequestPush(Map<String, dynamic> data) {
  if (data['type'] == 'new_request') return true;
  return (data['type'] == null || data['type'] == '') &&
      data['route'] == '/driver/requests';
}

/// true si el push debe usar el canal "bugie_requests" (solicitud nueva al
/// conductor o propuesta/contraoferta de precio). Es la misma regla que
/// debería usar el backend para elegir el ChannelId.
bool isRequestChannelPush(Map<String, dynamic> data) =>
    isNewRequestPush(data) ||
    (data['alert_type'] == 'proposal' &&
        (data['route'] ?? '').toString().isNotEmpty);

class FcmService {
  /// Ultimo aviso de cuenta del conductor (aprobado, rechazado, documentos).
  static final ValueNotifier<DriverAccountEvent?> driverAccount = ValueNotifier(null);

  /// Ultimo aviso de viaje cancelado.
  static final ValueNotifier<TripCancelledEvent?> tripCancelled = ValueNotifier(null);

  /// Ultimo aviso de llegada del conductor (lo escucha tracking_screen).
  static final ValueNotifier<DriverArrivedEvent?> driverArrived = ValueNotifier(null);

  /// Ultimo push de un viaje (ver TripPushEvent).
  static final ValueNotifier<TripPushEvent?> tripEvent = ValueNotifier(null);

  /// Avisa a las pantallas abiertas que llegó (o se tocó) un push de viaje.
  static void _emitTripEvent(RemoteMessage msg, {bool opened = false}) {
    final tripId = (msg.data['trip_id'] ?? msg.data['tripId']) as String?;
    if (tripId == null || tripId.isEmpty) return;
    tripEvent.value = TripPushEvent(
        msg.data['type'] as String?, tripId, msg.data,
        opened: opened);
  }

  /// Canal Android de alta prioridad. Trips lo manda explícito
  /// (ChannelId=bugie_high_priority); Rewards no lo manda, así que también
  /// está declarado como canal por defecto en AndroidManifest.xml.
  static const _channel = AndroidNotificationChannel(
    'bugie_high_priority',
    'Avisos de viaje',
    description: 'Llegada del conductor, estado del viaje y otros avisos.',
    importance: Importance.high,
    playSound: true,
    enableVibration: true,
  );

  /// Canal Android para lo urgente: solicitudes nuevas al conductor y
  /// propuestas/contraofertas al pasajero. Importancia máxima (sale como
  /// aviso flotante), sonido propio (res/raw/bugie_request.wav) y vibración
  /// insistente.
  ///
  /// LIMITACIÓN Android 8+: el sonido y la vibración de un canal quedan
  /// fijos al crearlo; después solo el usuario puede cambiarlos desde los
  /// ajustes del celular (Ajustes > Apps > Bugie > Notificaciones). Por eso
  /// las preferencias de la app (NotificationPrefs) se aplican a los avisos
  /// DENTRO de la app (primer plano); con la app cerrada manda lo que diga
  /// el canal. Hoy el backend (Trips/FcmSender) envía todo con
  /// ChannelId = "bugie_high_priority": para que las solicitudes usen este
  /// canal con la app cerrada, FcmSender debe elegir el ChannelId según
  /// el aviso (ver requestsChannelId).
  static const requestsChannelId = 'bugie_requests';
  static final _requestsChannel = AndroidNotificationChannel(
    requestsChannelId,
    'Solicitudes y ofertas',
    description: 'Solicitudes nuevas (conductor) y ofertas de conductores '
        '(pasajero).',
    importance: Importance.max,
    playSound: true,
    sound: const RawResourceAndroidNotificationSound('bugie_request'),
    enableVibration: true,
    vibrationPattern: Int64List.fromList(const [0, 400, 150, 400, 150, 600]),
  );

  static final FcmService _instance = FcmService._internal();
  factory FcmService() => _instance;
  FcmService._internal();

  // Getter (no campo): si Firebase no se inicializó, FirebaseMessaging.instance
  // lanza excepción; como getter solo falla dentro de los try, y así
  // FcmService() se puede crear siempre (ej. en logout).
  FirebaseMessaging get _messaging => FirebaseMessaging.instance;

  // Router al que delegamos navegaciones desde notif taps.
  GoRouter? _router;
  // Cliente API para mandar el token al backend.
  ApiClient? _api;
  // Sesión: para saber el rol (rutas) y si hay usuario logueado.
  Session? _session;

  // Evita registrar los listeners dos veces si init() se llama de nuevo
  // (eso duplicaba banners y navegaciones).
  bool _initialized = false;

  // Ruta pendiente de un push tocado con la app cerrada: se abre cuando el
  // splash termina y el usuario ya está en su inicio.
  String? _pendingRoute;

  /// Inicialización completa. Es seguro llamarla más de una vez: las
  /// siguientes llamadas solo actualizan router/api/sesión.
  Future<void> init({
    required ApiClient api,
    required GoRouter router,
    Session? session,
  }) async {
    _api = api;
    _router = router;
    _session = session ?? _session;
    if (_initialized) return;
    _initialized = true;

    // 0) Crear el canal de alta prioridad para que el aviso salga destacado.
    if (defaultTargetPlatform == TargetPlatform.android) {
      try {
        final android = FlutterLocalNotificationsPlugin()
            .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
        await android?.createNotificationChannel(_channel);
        await android?.createNotificationChannel(_requestsChannel);
      } catch (e) {
        debugPrint('FCM: no se pudo crear el canal: $e');
      }
    }

    // 1) Listeners PRIMERO: así no se pierde un tap aunque el usuario aún
    //    no haya respondido el permiso.
    //    Foreground: banner in-app. Tap con app en background: navegar.
    FirebaseMessaging.onMessage.listen(_handleForegroundMessage);
    FirebaseMessaging.onMessageOpenedApp.listen(_handleMessageOpenedApp);

    // 2) Si la app se abrió DESDE una notif (estaba terminada).
    try {
      final initialMsg = await _messaging.getInitialMessage();
      if (initialMsg != null) _handleMessageOpenedApp(initialMsg);
    } catch (e) {
      debugPrint('FCM: getInitialMessage falló: $e');
    }

    // 3) Pedir permiso (Android 13+ POST_NOTIFICATIONS e iOS muestran el
    //    prompt nativo). Si lo niega, igual registramos el token: los
    //    banners in-app con la app abierta siguen funcionando.
    try {
      final settings = await _messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
      if (settings.authorizationStatus == AuthorizationStatus.denied) {
        debugPrint('FCM: permiso de notificaciones denegado por el usuario');
      }
    } catch (e) {
      debugPrint('FCM: requestPermission falló: $e');
    }

    // 4) Token actual al backend (si ya hay sesión). Si no hay sesión, se
    //    registra al iniciar sesión (AuthRepository → registerToken).
    await _registerTokenWithBackend();

    // 5) Rotación del token (Firebase puede rotarlo).
    _messaging.onTokenRefresh.listen((_) => _registerTokenWithBackend());
  }

  /// Llamar despues de iniciar sesion o registrarse: asocia este celular
  /// al usuario para que le lleguen los avisos (push).
  Future<void> registerToken() => _registerTokenWithBackend();

  /// Logout: borra SOLO el token de este celular, para que no le sigan
  /// llegando notificaciones aqui. Sus otros celulares siguen recibiendo.
  /// Debe llamarse ANTES de borrar la sesión (el endpoint pide JWT).
  Future<void> unregister() async {
    _pendingRoute = null;
    try {
      final token = await _messaging.getToken();
      // Sin token no llamamos: DELETE sin ?token= borra TODOS los
      // celulares del usuario.
      if (token == null || token.isEmpty) return;
      await _api?.delete(
          '${ApiConfig.auth}/auth/me/fcm-token?token=${Uri.encodeQueryComponent(token)}');
    } catch (_) {
      // No es crítico — si falla, el token quedará huérfano hasta que
      // sea reemplazado por el del próximo login.
    }
  }

  // ─────────────────────────────────────────────────────────────────

  Future<void> _registerTokenWithBackend() async {
    // Sin sesión el endpoint responde 401 (y el ApiClient limpiaría la
    // sesión): no llamamos.
    if (_session != null && !_session!.isLoggedIn) return;
    try {
      final token = await _messaging.getToken();
      if (token == null || _api == null) return;
      await _api!.post('${ApiConfig.auth}/auth/me/fcm-token', body: {
        'token': token,
        'platform': defaultTargetPlatform == TargetPlatform.iOS
            ? 'ios' : 'android',
      });
    } catch (e) {
      debugPrint('FCM: no se pudo registrar token con el backend: $e');
    }
  }

  /// Ruta del push ya ajustada al rol actual y validada contra el router.
  String? _routeOf(RemoteMessage msg) => resolvePushRoute(
        router: _router,
        role: _session?.role,
        route: msg.data['route'] as String?,
        pushType: msg.data['type'] as String?,
        tripId: (msg.data['trip_id'] ?? msg.data['tripId']) as String?,
        reasonCode: msg.data['reason_code'] as String?,
      );

  /// Id de la notificación guardada en el backend (solo la traen los
  /// avisos que Trips guarda en la bandeja).
  String? _notificationIdOf(RemoteMessage msg) {
    final id = msg.data['notification_id'] as String?;
    return (id == null || id.isEmpty) ? null : id;
  }

  void _handleForegroundMessage(RemoteMessage msg) {
    final pushType = msg.data['type'] as String?;

    // Nuevo aviso guardado en la bandeja: sube el contador de la campana.
    final notifId = _notificationIdOf(msg);
    if (notifId != null) NotificationsBadge().onPushReceived();
    // El mismo aviso llega también por el hub (UserNotification): se marca
    // como visto para que no dispare otra recarga.
    TripsHubService().markNotificationSeen(notifId);

    // Conductor: cualquier aviso puede cambiar su viaje activo (confirmado,
    // cancelado...). Se vuelve a consultar para la franja "Viaje en curso".
    if (_session?.role == UserRole.driver) ActiveTripService().refresh();

    // Las pantallas de negociación recargan si es su viaje.
    _emitTripEvent(msg);

    // Llego el conductor: con la app abierta se va al seguimiento y se
    // muestra el popup (no hace falta el banner).
    if (pushType == 'driver_arrived') {
      final route = _routeOf(msg);
      if (route != null) _router?.go(route);
      driverArrived.value = DriverArrivedEvent(msg.data['trip_id'] as String?);
      return;
    }

    // Viaje cancelado: las pantallas del viaje refrescan y muestran el motivo.
    if (pushType == 'trip_cancelled') {
      tripCancelled.value = TripCancelledEvent(msg.data['trip_id'] as String?);
      // Pasajero: nadie aceptó su pedido → se abre el seguimiento de ese
      // viaje con "Nadie aceptó tu pedido…" y el botón para volver a pedir.
      if (_session?.role == UserRole.passenger &&
          msg.data['reason_code'] == 'no_driver_timeout') {
        final route = _routeOf(msg);
        if (route != null && !_currentPath().startsWith('/passenger/tracking')) {
          _router?.go(route);
        }
      }
    }

    // Cuenta del conductor: las pantallas del conductor refrescan su estado
    // (ej. aprobado → se habilita "Conectarme" sin reiniciar la app).
    if (pushType == 'account') {
      driverAccount.value =
          DriverAccountEvent(msg.data['alert_type'] as String?);
    }

    final notif = msg.notification;
    final title = notif?.title ?? msg.data['title'] as String? ?? 'Bugie';
    final body  = notif?.body  ?? msg.data['body']  as String? ?? '';
    final route = _routeOf(msg);

    // Solicitud nueva al conductor: panel grande con sonido en bucle. Si
    // está desconectado y activó "No molestar", solo un aviso sin sonido.
    var silent = false;
    if (isNewRequestPush(msg.data) && _session?.role == UserRole.driver) {
      // Con un viaje activo no puede aceptar otra: en vez del panel grande
      // con sonido en bucle, sale como aviso normal sin sonido.
      if (!ActiveTripService().hasActive &&
          !NotificationPrefs().mutedForRequests) {
        RequestAlertService().push(IncomingRequestAlert.fromPush(
          data: msg.data,
          title: title,
          body: body,
        ));
        return;
      }
      silent = true;
    }

    // Tipo visual: primero por data.type (avisos específicos), luego por
    // data.alert_type y, si no viene, inferido desde la ruta.
    final type = alertTypeFor(
      type: pushType,
      alertType: msg.data['alert_type'] as String?,
      route: msg.data['route'] as String?,
    );

    InAppAlertService().show(AlertData(
      type: type,
      title: title,
      body: body,
      route: route,
      actionLabel: alertActionLabel(type),
      service: msg.data['service'] as String?,
      from: (msg.data['from_role'] ?? msg.data['from']) as String?,
      // Los avisos de push se van solos; los críticos se quedan hasta
      // que el usuario los cierre.
      autoDismiss: (type == AlertType.sos || type == AlertType.deviation)
          ? null
          : const Duration(seconds: 8),
      notificationId: _notificationIdOf(msg),
      silent: silent,
    ));
  }

  void _handleMessageOpenedApp(RemoteMessage msg) {
    final pushType = msg.data['type'] as String?;

    // Tocó el aviso del sistema: marcarlo como leído sin bloquear la navegación.
    final notifId = _notificationIdOf(msg);
    if (notifId != null) NotificationsBadge().markRead(notifId);
    final route = _routeOf(msg);
    if (route != null) _navigateWhenReady(route);
    _emitTripEvent(msg, opened: true);

    // Toco el aviso "tu conductor llego": al abrir el seguimiento se muestra el popup.
    if (pushType == 'driver_arrived') {
      driverArrived.value = DriverArrivedEvent(msg.data['trip_id'] as String?);
    }
    if (pushType == 'trip_cancelled') {
      tripCancelled.value = TripCancelledEvent(msg.data['trip_id'] as String?);
    }
    // Cuenta del conductor: si las pantallas ya estaban abiertas, refrescan.
    if (pushType == 'account') {
      driverAccount.value =
          DriverAccountEvent(msg.data['alert_type'] as String?);
    }
  }

  // ── Navegación diferida (app abierta desde una notificación) ─────────

  String _currentPath() =>
      _router?.routerDelegate.currentConfiguration.uri.path ?? '';

  /// true si el usuario ya está dentro de la app (no en splash/bienvenida/login).
  bool _isInsideApp(String path) =>
      path.startsWith('/driver') || path.startsWith('/passenger');

  void _navigateWhenReady(String route) {
    final router = _router;
    if (router == null) return;
    if (_isInsideApp(_currentPath())) {
      router.go(route);
      return;
    }
    // Splash aún corriendo: el splash hace go('/') al terminar y pisaría
    // nuestra navegación. Esperamos a que el usuario llegue a su inicio.
    _pendingRoute = route;
    router.routerDelegate.removeListener(_flushPending);
    router.routerDelegate.addListener(_flushPending);
  }

  void _flushPending() {
    final router = _router;
    final route = _pendingRoute;
    if (router == null || route == null) {
      router?.routerDelegate.removeListener(_flushPending);
      return;
    }
    if (!_isInsideApp(_currentPath())) return; // seguir esperando
    _pendingRoute = null;
    router.routerDelegate.removeListener(_flushPending);
    // Fuera del frame actual del router.
    scheduleMicrotask(() => router.go(route));
  }
}
