import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

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

  AlertData({
    required this.type,
    required this.title,
    required this.body,
    this.route,
    this.actionLabel,
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

  /// Setea el router una vez en main.dart, después de crearlo.
  void attachRouter(GoRouter router) {
    _router = router;
  }

  /// Muestra una nueva alerta. Sonido + vibración automáticos según el tipo.
  void show(AlertData data) {
    // Si ya hay una alerta con mismo title+body+type, no duplicar.
    final current = alerts.value;
    final isDup = current.any((a) =>
        a.title == data.title && a.body == data.body && a.type == data.type);
    if (isDup) return;

    alerts.value = [...current, data];
    _playFeedback(data.type);
  }

  /// Descarta una alerta por id.
  void dismiss(String id) {
    alerts.value = alerts.value.where((a) => a.id != id).toList();
  }

  /// Llamado por el banner cuando el usuario lo toca. Si la alerta tiene
  /// `route`, navegamos ahí. Siempre descarta la alerta tras la acción.
  void handleTap(AlertData data) {
    dismiss(data.id);
    final route = data.route;

    // Rol actual según dónde está el usuario. Evita depender de rutas que el
    // backend a veces manda mal (caían en "página no encontrada").
    final loc =
        _router?.routerDelegate.currentConfiguration.uri.path ?? '';
    final isDriver = loc.startsWith('/driver');

    String? target;
    switch (data.type) {
      case AlertType.proposal:
      case AlertType.trip:
        // Propuesta/viaje: el pasajero responde en seguimiento; el conductor,
        // en sus solicitudes entrantes.
        target = isDriver ? '/driver/requests' : '/passenger/tracking';
        break;
      default:
        // Otros tipos (documentos, SOS, en línea) usan su propia ruta local.
        target = (route != null && route.isNotEmpty) ? route : null;
    }

    if (target != null && target.isNotEmpty) {
      _router?.go(target);
    }
  }

  /// Descarta todas las alertas (ej. al hacer logout).
  void clear() {
    alerts.value = [];
  }

  /// Feedback háptico + sonido. SOS es más intenso.
  void _playFeedback(AlertType type) {
    switch (type) {
      case AlertType.sos:
        HapticFeedback.heavyImpact();
        SystemSound.play(SystemSoundType.alert);
        Future.delayed(const Duration(milliseconds: 200), () {
          HapticFeedback.heavyImpact();
        });
        Future.delayed(const Duration(milliseconds: 400), () {
          HapticFeedback.heavyImpact();
        });
        break;
      case AlertType.trip:
      case AlertType.proposal:
      case AlertType.warning:
        HapticFeedback.mediumImpact();
        SystemSound.play(SystemSoundType.alert);
        break;
      case AlertType.accepted:
        HapticFeedback.lightImpact();
        break;
    }
  }
}