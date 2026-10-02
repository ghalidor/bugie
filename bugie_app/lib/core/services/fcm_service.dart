import 'dart:async';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:go_router/go_router.dart';
import '../api/api_client.dart';
import '../api/api_config.dart';
import 'in_app_alert_service.dart';

/// Servicio centralizado de Firebase Cloud Messaging.
///
/// Responsabilidades:
///   1. Pedir permisos de notificación al usuario (Android 13+ / iOS).
///   2. Obtener el token FCM del dispositivo y enviarlo al backend
///      (POST /api/auth/me/fcm-token) para que cuando llegue una
///      solicitud el backend sepa a quién mandarle el push.
///   3. Escuchar mensajes entrantes:
///        - background: el sistema muestra la notif nativa automáticamente.
///        - foreground: mostramos un banner in-app (AlertBanner) sobre la
///          UI actual, vía InAppAlertService.
///   4. Manejar taps en la notificación: si trae `route`, navegamos ahí
///      vía GoRouter (ej. al detalle del viaje o a la lista).
///
/// Se llama una vez desde main.dart después de Firebase.initializeApp().
/// Aviso "tu conductor llego" recibido por push. La pantalla de seguimiento
/// del pasajero lo escucha y muestra el popup.
class DriverArrivedEvent {
  final String? tripId;
  final DateTime at;
  DriverArrivedEvent(this.tripId) : at = DateTime.now();
}

class FcmService {
  /// Ultimo aviso de llegada del conductor (lo escucha tracking_screen).
  static final ValueNotifier<DriverArrivedEvent?> driverArrived = ValueNotifier(null);

  /// Canal Android de alta prioridad (el backend manda ChannelId=bugie_high_priority).
  static const _channel = AndroidNotificationChannel(
    'bugie_high_priority',
    'Avisos de viaje',
    description: 'Solicitudes, llegada del conductor y avisos del viaje.',
    importance: Importance.high,
  );

  static final FcmService _instance = FcmService._internal();
  factory FcmService() => _instance;
  FcmService._internal();

  final _messaging = FirebaseMessaging.instance;

  // Router al que delegamos navegaciones desde notif taps.
  // Lo setea main.dart después de crear el GoRouter.
  GoRouter? _router;
  // Cliente API para mandar el token al backend.
  ApiClient? _api;

  /// Inicialización completa. Llamar UNA vez desde main.dart después
  /// de Firebase.initializeApp() y de crear el ApiClient/router.
  Future<void> init({
    required ApiClient api,
    required GoRouter router,
  }) async {
    _api = api;
    _router = router;

    // 0) Crear el canal de alta prioridad para que el aviso salga destacado.
    if (defaultTargetPlatform == TargetPlatform.android) {
      try {
        await FlutterLocalNotificationsPlugin()
            .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
            ?.createNotificationChannel(_channel);
      } catch (e) {
        debugPrint('FCM: no se pudo crear el canal: $e');
      }
    }

    // 1) Pedir permiso (Android 13+ y iOS muestran prompt nativo).
    final settings = await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );
    if (settings.authorizationStatus == AuthorizationStatus.denied) {
      // El usuario rechazó las notificaciones. No insistimos; el usuario
      // podrá habilitarlas más tarde desde ajustes del sistema.
      debugPrint('FCM: permiso denegado por el usuario');
      return;
    }

    // 2) Foreground: mostrar banner in-app (estilo iOS).
    //    Background: el sistema muestra la notif nativa automáticamente
    //    (no hace falta flutter_local_notifications).
    FirebaseMessaging.onMessage.listen(_handleForegroundMessage);

    // 3) Tap en notif cuando la app estaba en background.
    FirebaseMessaging.onMessageOpenedApp.listen(_handleMessageOpenedApp);

    // 4) Si la app se abrió DESDE una notif (estaba terminada).
    final initialMsg = await _messaging.getInitialMessage();
    if (initialMsg != null) {
      // Delay para asegurar que el router ya esté listo.
      Future.delayed(const Duration(milliseconds: 500), () {
        _handleMessageOpenedApp(initialMsg);
      });
    }

    // 5) Obtener el token actual y mandarlo al backend (si ya hay sesion).
    //    Si no hay sesion todavia, se registra al iniciar sesion (registerToken).
    await _registerTokenWithBackend();

    // 6) Escuchar rotación del token (Firebase puede rotarlo).
    _messaging.onTokenRefresh.listen((_) => _registerTokenWithBackend());
  }

  /// Llamar despues de iniciar sesion o registrarse: asocia este celular
  /// al usuario para que le lleguen los avisos (push).
  Future<void> registerToken() => _registerTokenWithBackend();

  /// Logout: borra SOLO el token de este celular, para que no le sigan
  /// llegando notificaciones aqui. Sus otros celulares siguen recibiendo.
  Future<void> unregister() async {
    try {
      final token = await _messaging.getToken();
      final query = token == null ? '' : '?token=${Uri.encodeQueryComponent(token)}';
      await _api?.delete('${ApiConfig.auth}/auth/me/fcm-token$query');
    } catch (_) {
      // No es crítico — si falla, el token quedará huérfano hasta que
      // sea reemplazado por el del próximo login.
    }
  }

  // ─────────────────────────────────────────────────────────────────

  Future<void> _registerTokenWithBackend() async {
    try {
      final token = await _messaging.getToken();
      if (token == null || _api == null) return;
      await _api!.post('${ApiConfig.auth}/auth/me/fcm-token', body: {
        'token': token,
        // Solo Android por ahora. Si activamos iOS, distinguimos acá.
        'platform': defaultTargetPlatform == TargetPlatform.iOS
            ? 'ios' : 'android',
      });
    } catch (e) {
      debugPrint('FCM: no se pudo registrar token con el backend: $e');
    }
  }

  void _handleForegroundMessage(RemoteMessage msg) {
    // Llego el conductor: con la app abierta se va al seguimiento y se
    // muestra el popup (no hace falta el banner).
    if (msg.data['type'] == 'driver_arrived') {
      _router?.go('/passenger/tracking');
      driverArrived.value = DriverArrivedEvent(msg.data['trip_id'] as String?);
      return;
    }

    final notif = msg.notification;
    final title = notif?.title ?? msg.data['title'] as String? ?? 'Bugie';
    final body  = notif?.body  ?? msg.data['body']  as String? ?? '';
    final route = msg.data['route'] as String?;

    // Tipo de alerta: lo trae el backend en data.alert_type. Si no viene,
    // intentamos inferirlo desde la ruta. Default: trip.
    final typeStr = msg.data['alert_type'] as String?;
    final type = _parseType(typeStr) ?? _inferType(route);

    // Texto del botón de acción según tipo (opcional).
    final action = _actionLabelFor(type);

    InAppAlertService().show(AlertData(
      type: type,
      title: title,
      body: body,
      route: route,
      actionLabel: action,
    ));
  }

  AlertType? _parseType(String? s) {
    switch (s) {
      case 'trip':     return AlertType.trip;
      case 'proposal': return AlertType.proposal;
      case 'accepted': return AlertType.accepted;
      case 'sos':      return AlertType.sos;
      default:         return null;
    }
  }

  AlertType _inferType(String? route) {
    if (route == null) return AlertType.trip;
    if (route.contains('sos'))               return AlertType.sos;
    if (route.contains('proposal'))          return AlertType.proposal;
    if (route.contains('trip-in-progress') ||
        route.contains('trip-active'))       return AlertType.accepted;
    return AlertType.trip;
  }

  String? _actionLabelFor(AlertType type) {
    switch (type) {
      case AlertType.trip:     return 'Ver';
      case AlertType.proposal: return 'Responder';
      case AlertType.accepted: return 'Abrir';
      case AlertType.sos:      return 'Atender';
      case AlertType.warning:  return 'Subir';
    }
  }

  void _handleMessageOpenedApp(RemoteMessage msg) {
    final route = msg.data['route'] as String?;
    if (route != null && route.isNotEmpty) {
      _router?.go(route);
    }
    // Toco el aviso "tu conductor llego": al abrir el seguimiento se muestra el popup.
    if (msg.data['type'] == 'driver_arrived') {
      driverArrived.value = DriverArrivedEvent(msg.data['trip_id'] as String?);
    }
  }
}