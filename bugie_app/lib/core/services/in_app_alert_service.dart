import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:go_router/go_router.dart';
import '../../modules/notifications/data/notifications_badge.dart';
import '../session/session.dart';
import 'alert_feedback.dart';
import 'notification_prefs.dart';
import 'request_alert_service.dart';
import 'push_routes.dart';

/// Tipo de alerta que determina color, ícono y comportamiento.
enum AlertType {
  /// Azul. Solicitudes nuevas / informativos.
  trip,

  /// Naranja. El otro lado mandó una contrapropuesta de precio.
  proposal,

  /// Verde. El viaje fue aceptado / confirmado.
  accepted,

  /// Rojo. SOS o incidente crítico.
  sos,

  /// Ambar. Advertencia persistente (ej. faltan documentos).
  warning,

  /// Verde. El conductor llegó al punto de recojo (alert_type 'arrived').
  arrived,

  /// Rosa. Novedades de un envío: paquete recogido, entregado
  /// (alert_type 'delivery').
  delivery,

  /// Rojo. El conductor se desvió de la ruta (type 'route_deviation').
  /// No se cierra solo.
  deviation,

  /// Ambar. Puntos por vencer / vencidos (type 'points_expiring' /
  /// 'points_expired', enviados por Rewards).
  points,

  /// Verde. Bugie le pagó al conductor (type 'payout').
  payout,

  /// Gris. Viaje cancelado o conductor quitado de un programado
  /// (type 'trip_cancelled' / 'trip_republished').
  cancelled,

  /// Verde. Cuenta del conductor aprobada (type 'account',
  /// alert_type 'driver_approved').
  accountApproved,

  /// Rojo. Cuenta del conductor rechazada o un documento rechazado
  /// (alert_type 'driver_rejected' / 'document_rejected').
  accountRejected,

  /// Ambar. Un documento del conductor está por vencer
  /// (alert_type 'document_expiring').
  documentExpiring,

  /// Rojo. Cuenta del conductor suspendida (alert_type 'driver_suspended').
  accountSuspended,

  /// Verde. Cuenta del conductor reactivada (alert_type 'driver_reactivated').
  accountReactivated,

  /// Ambar. Respuesta a la solicitud de revisión: se mantiene la
  /// suspensión o el rechazo (alert_type 'review_kept').
  reviewKept,
}

/// Tipo visual de un aviso a partir de los datos del push (o de una
/// notificación guardada): primero data.type (avisos específicos), luego
/// data.alert_type y, si no viene, inferido desde la ruta. Lo usan los
/// banners en primer plano y la bandeja de notificaciones para que se vean
/// iguales.
AlertType alertTypeFor({String? type, String? alertType, String? route}) {
  return (type == 'account' ? _accountType(alertType) : null) ??
      _typeFromPushType(type) ??
      _parseAlertType(alertType) ??
      _inferAlertType(route);
}

/// Texto del botón de acción del banner según el tipo.
String? alertActionLabel(AlertType type) {
  switch (type) {
    case AlertType.trip:      return 'Ver';
    case AlertType.proposal:  return 'Responder';
    case AlertType.accepted:  return 'Abrir';
    case AlertType.sos:       return 'Atender';
    case AlertType.warning:   return 'Subir';
    case AlertType.arrived:   return 'Ver';
    case AlertType.delivery:  return 'Ver';
    case AlertType.deviation: return 'Ver mapa';
    case AlertType.points:    return 'Mis puntos';
    case AlertType.payout:    return 'Ver';
    case AlertType.cancelled: return null;
    case AlertType.accountApproved:  return 'Ver';
    case AlertType.accountRejected:  return 'Revisar';
    case AlertType.documentExpiring: return 'Renovar';
    case AlertType.accountSuspended:   return 'Ver';
    case AlertType.accountReactivated: return 'Ver';
    case AlertType.reviewKept:         return 'Ver';
  }
}

/// Avisos con estilo propio según data.type.
AlertType? _typeFromPushType(String? t) {
  switch (t) {
    case 'route_deviation':  return AlertType.deviation;
    case 'points_expiring':
    case 'points_expired':   return AlertType.points;
    case 'payout':           return AlertType.payout;
    case 'trip_cancelled':
    case 'trip_republished': return AlertType.cancelled;
    default:                 return null;
  }
}

/// Avisos de cuenta del conductor (type 'account') según data.alert_type.
AlertType? _accountType(String? alertType) {
  switch (alertType) {
    case 'driver_approved':   return AlertType.accountApproved;
    case 'driver_rejected':
    case 'document_rejected': return AlertType.accountRejected;
    case 'document_expiring': return AlertType.documentExpiring;
    case 'driver_suspended':  return AlertType.accountSuspended;
    case 'driver_reactivated': return AlertType.accountReactivated;
    case 'review_kept':       return AlertType.reviewKept;
    default:                  return null;
  }
}

AlertType? _parseAlertType(String? s) {
  switch (s) {
    case 'trip':     return AlertType.trip;
    case 'proposal': return AlertType.proposal;
    case 'accepted': return AlertType.accepted;
    case 'sos':      return AlertType.sos;
    case 'arrived':  return AlertType.arrived;
    case 'delivery': return AlertType.delivery;
    default:         return null;
  }
}

AlertType _inferAlertType(String? route) {
  if (route == null) return AlertType.trip;
  if (route.contains('sos'))               return AlertType.sos;
  if (route.contains('proposal'))          return AlertType.proposal;
  if (route.contains('rewards'))           return AlertType.points;
  if (route.contains('trip-in-progress') || route.contains('trip-active')) {
    return AlertType.accepted;
  }
  return AlertType.trip;
}

/// Datos de una alerta en cola para mostrar.
@immutable
class AlertData {
  final String id;
  final AlertType type;
  final String title;
  final String body;

  /// Ruta a la que navegar si el usuario toca el banner.
  final String? route;

  /// Texto del botón de acción. Si null no se muestra botón.
  final String? actionLabel;

  /// Servicio del aviso (data.service del push): 'ride' | 'delivery'.
  /// Null si el push no lo trae.
  final String? service;

  /// De quién viene (data.from del push): 'passenger' | 'driver' | 'bugie'.
  /// Null si el push no lo trae.
  final String? from;

  /// Si no es null, la alerta se descarta sola tras este tiempo.
  final Duration? autoDismiss;

  /// Id de la notificación guardada en el backend (data.notification_id
  /// del push). Al tocar el banner se marca como leída.
  final String? notificationId;

  /// true: el aviso no suena ni vibra (el que lo muestra ya lo hizo).
  final bool silent;

  bool get isDelivery => service == 'delivery';

  AlertData({
    required this.type,
    required this.title,
    required this.body,
    this.route,
    this.actionLabel,
    this.service,
    this.from,
    this.autoDismiss,
    this.notificationId,
    this.silent = false,
  }) : id = '${DateTime.now().microsecondsSinceEpoch}'
              '_${UniqueKey().toString()}';
}

/// Servicio centralizado de alertas in-app.
///
/// Cómo usar:
///   1) En main.dart: `InAppAlertService().attachRouter(router);`
///   2) Envolver MaterialApp.builder con AlertOverlay.
///   3) Desde cualquier lugar: `InAppAlertService().show(AlertData(...))`.
class InAppAlertService {
  static final InAppAlertService _instance = InAppAlertService._();
  factory InAppAlertService() => _instance;
  InAppAlertService._();

  /// Lista observable de alertas activas. AlertOverlay escucha esto.
  final ValueNotifier<List<AlertData>> alerts = ValueNotifier([]);

  /// Router usado para navegar al tocar un banner con `route`.
  GoRouter? _router;

  /// Sesión: para saber el rol al resolver rutas.
  Session? _session;

  /// Setea el router (y la sesión) una vez en main.dart, después de crearlo.
  void attachRouter(GoRouter router, {Session? session}) {
    _router = router;
    _session = session ?? _session;
  }

  /// Muestra una nueva alerta. Sonido + vibración según el tipo y las
  /// preferencias del usuario (ver AlertFeedback).
  void show(AlertData data) {
    // Si ya hay una alerta con mismo title+body+type, no duplicar.
    final current = alerts.value;
    final isDup = current.any((a) =>
        a.title == data.title && a.body == data.body && a.type == data.type);
    if (isDup) return;

    alerts.value = [...current, data];
    _playFeedback(data);

    final ttl = data.autoDismiss;
    if (ttl != null) Timer(ttl, () => dismiss(data.id));
  }

  /// Descarta una alerta por id.
  void dismiss(String id) {
    alerts.value = alerts.value.where((a) => a.id != id).toList();
  }

  /// Llamado por el banner cuando el usuario lo toca. Si la alerta tiene
  /// `route`, navegamos ahí. Siempre descarta la alerta tras la acción.
  void handleTap(AlertData data) {
    dismiss(data.id);

    // Marcar la notificación como leída sin esperar (no bloquea la navegación).
    final notifId = data.notificationId;
    if (notifId != null && notifId.isNotEmpty) {
      NotificationsBadge().markRead(notifId);
    }

    // Rol: el de la sesión; si no hay, según dónde está el usuario.
    final loc = _router?.routerDelegate.currentConfiguration.uri.path ?? '';
    final role = _session?.role ??
        (loc.startsWith('/driver')
            ? UserRole.driver
            : loc.startsWith('/passenger')
                ? UserRole.passenger
                : null);
    final isDriver = role == UserRole.driver;

    // 1) La ruta del aviso, ajustada al rol y validada contra el router
    //    (antes algunas caían en "página no encontrada", ej. "/rewards").
    var target = resolvePushRoute(router: _router, role: role, route: data.route);

    // 2) Sin ruta: destino por tipo de aviso.
    if (target == null) {
      switch (data.type) {
        case AlertType.proposal:
        case AlertType.trip:
          // Propuesta/viaje: el pasajero responde en seguimiento; el
          // conductor, en sus solicitudes entrantes.
          target = isDriver ? '/driver/requests' : '/passenger/tracking';
          break;
        case AlertType.arrived:
        case AlertType.delivery:
        case AlertType.deviation:
          if (role == UserRole.passenger) target = '/passenger/tracking';
          break;
        case AlertType.points:
          if (role != null) target = isDriver ? '/driver/rewards' : '/passenger/rewards';
          break;
        case AlertType.payout:
          if (isDriver) target = '/driver/earnings';
          break;
        case AlertType.accountApproved:
        case AlertType.accountSuspended:
        case AlertType.accountReactivated:
        case AlertType.reviewKept:
          if (isDriver) target = '/driver';
          break;
        case AlertType.accountRejected:
        case AlertType.documentExpiring:
          if (isDriver) target = '/driver/documents';
          break;
        default:
          target = null;
      }
    }

    if (target != null && target.isNotEmpty) {
      _router?.go(target);
    }
  }

  /// Descarta todas las alertas (ej. al hacer logout).
  void clear() {
    alerts.value = [];
    RequestAlertService().close();
    NotificationPrefs.driverOnline.value = null;
  }

  /// Sonido + vibración según el tipo y las preferencias del usuario
  /// (NotificationPrefs): sin sonido / sin vibración si los apagó.
  void _playFeedback(AlertData data) {
    if (data.silent) return;
    final fb = AlertFeedback();
    switch (data.type) {
      case AlertType.sos:
      case AlertType.deviation:
      case AlertType.accountRejected:
      case AlertType.accountSuspended:
        fb.alert(level: FeedbackLevel.strong);
        break;
      case AlertType.proposal:
        fb.proposal();
        break;
      case AlertType.trip:
      case AlertType.warning:
      case AlertType.arrived:
      case AlertType.delivery:
      case AlertType.points:
      case AlertType.cancelled:
      case AlertType.documentExpiring:
      case AlertType.reviewKept:
        fb.alert();
        break;
      case AlertType.accepted:
      case AlertType.payout:
      case AlertType.accountApproved:
      case AlertType.accountReactivated:
        fb.alert(level: FeedbackLevel.soft);
        break;
    }
  }
}