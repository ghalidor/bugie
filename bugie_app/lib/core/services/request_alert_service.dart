import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:go_router/go_router.dart';

import '../../modules/notifications/data/notifications_badge.dart';
import 'alert_feedback.dart';

/// Una solicitud nueva recibida por push (app abierta, conductor).
@immutable
class IncomingRequestAlert {
  final String? tripId;
  final bool isDelivery;
  final bool isScheduled;
  final String title;
  final String body;

  /// Precio ("S/ 12.50"). Sale de data.fare si el backend lo manda; si no,
  /// se toma del texto del push.
  final String? price;
  final String? origin;
  final String? destination;

  /// Distancia ya formateada ("2.3 km"), solo si viene en data.
  final String? distance;
  final String? notificationId;

  const IncomingRequestAlert({
    required this.tripId,
    required this.isDelivery,
    required this.isScheduled,
    required this.title,
    required this.body,
    this.price,
    this.origin,
    this.destination,
    this.distance,
    this.notificationId,
  });

  /// Arma la solicitud con los datos del push.
  ///
  /// Hoy el backend (CreateTripHandler.NotifyDriversAsync) manda:
  ///   title "Nueva solicitud de viaje/envío" (o "... programado"),
  ///   body  "S/ 12.50 · [Programado dd/MM HH:mm ·] [Paquete: x ·] Origen",
  ///   data  { trip_id, tripId, alert_type: proposal, service, from,
  ///           route: /driver/requests }.
  /// Si en el futuro manda fare / origin / destination / distance_km en
  /// data, se usan esos.
  factory IncomingRequestAlert.fromPush({
    required Map<String, dynamic> data,
    required String title,
    required String body,
  }) {
    String? s(String k) {
      final v = data[k]?.toString().trim();
      return (v == null || v.isEmpty) ? null : v;
    }

    final parts = body
        .split(RegExp(r'\s*[·•]\s*'))
        .map((p) => p.trim())
        .where((p) => p.isNotEmpty)
        .toList();

    String? price;
    final fare = double.tryParse(
        (s('fare') ?? s('estimated_fare') ?? '').replaceAll(',', '.'));
    if (fare != null) {
      price = 'S/ ${fare.toStringAsFixed(2)}';
    } else {
      final m = RegExp(r'S/\.?\s*(\d+(?:[.,]\d{1,2})?)').firstMatch(body);
      if (m != null) price = 'S/ ${m.group(1)!.replaceAll(',', '.')}';
    }

    // Origen: el último tramo del texto que no sea precio/programado/paquete.
    String? origin = s('origin') ?? s('origin_address');
    if (origin == null && parts.length > 1) {
      final last = parts.last;
      final lower = last.toLowerCase();
      if (!last.startsWith('S/') &&
          !lower.startsWith('programado') &&
          !lower.startsWith('paquete')) {
        origin = last;
      }
    }

    String? distance;
    final km = double.tryParse((s('distance_km') ?? '').replaceAll(',', '.'));
    if (km != null) {
      distance = '${km.toStringAsFixed(km < 10 ? 1 : 0)} km';
    }

    return IncomingRequestAlert(
      tripId: s('trip_id') ?? s('tripId'),
      isDelivery: s('service') == 'delivery',
      isScheduled: title.toLowerCase().contains('programad'),
      title: title,
      body: body,
      price: price,
      origin: origin,
      destination: s('destination') ?? s('destination_address'),
      distance: distance,
      notificationId: s('notification_id'),
    );
  }
}

/// Estado del panel: las solicitudes pendientes y hasta cuándo se muestra.
@immutable
class RequestAlertState {
  final List<IncomingRequestAlert> items;
  final DateTime shownAt;
  final DateTime until;
  const RequestAlertState(this.items, this.shownAt, this.until);

  IncomingRequestAlert get latest => items.last;
  int get count => items.length;
  Duration get total => until.difference(shownAt);
}

/// Aviso GRANDE de solicitud nueva para el conductor con la app abierta.
///
/// FcmService llama a [push] cuando llega el push de solicitud nueva;
/// RequestAlertPanel (montado en main.dart encima de toda la app) escucha
/// [state]. Mientras está visible suena/vibra en bucle (AlertFeedback,
/// según preferencias) hasta que el conductor lo toque o se acabe el tiempo.
class RequestAlertService {
  static final RequestAlertService _instance = RequestAlertService._();
  factory RequestAlertService() => _instance;
  RequestAlertService._();

  /// Tiempo que el panel queda en pantalla (se reinicia si llega otra).
  static const visibleFor = Duration(seconds: 25);

  final ValueNotifier<RequestAlertState?> state = ValueNotifier(null);

  GoRouter? _router;
  Timer? _timer;

  String _lastPath = '';

  void attachRouter(GoRouter router) {
    _router?.routerDelegate.removeListener(_onRoute);
    _router = router;
    router.routerDelegate.addListener(_onRoute);
  }

  /// Si el conductor entra por su cuenta a las solicitudes, el panel ya
  /// cumplió su función: se cierra.
  void _onRoute() {
    final path =
        _router?.routerDelegate.currentConfiguration.uri.path ?? '';
    if (path == _lastPath) return;
    _lastPath = path;
    if (state.value != null &&
        (path == '/driver/requests' || path.startsWith('/driver/incoming/'))) {
      close();
    }
  }

  /// Nueva solicitud: se agrega (sin repetir el mismo viaje) y se reinicia
  /// el contador.
  void push(IncomingRequestAlert req) {
    final current = state.value?.items ?? const <IncomingRequestAlert>[];
    final items = [
      ...current.where((r) => req.tripId == null || r.tripId != req.tripId),
      req,
    ];
    final now = DateTime.now();
    state.value = RequestAlertState(items, now, now.add(visibleFor));

    _timer?.cancel();
    _timer = Timer(visibleFor, close);
    AlertFeedback().startRequestLoop(maxTime: visibleFor);
  }

  /// "Ahora no" / se acabó el tiempo / logout.
  void close() {
    _timer?.cancel();
    _timer = null;
    AlertFeedback().stopRequestLoop();
    state.value = null;
  }

  /// "Ver solicitud": con una sola solicitud abre su detalle; con varias,
  /// la lista de solicitudes.
  void open() {
    final s = state.value;
    close();
    if (s == null) return;
    for (final r in s.items) {
      final id = r.notificationId;
      if (id != null) NotificationsBadge().markRead(id);
    }
    final id = s.count == 1 ? s.latest.tripId : null;
    final target = id != null && id.isNotEmpty
        ? '/driver/incoming/$id'
        : '/driver/requests';
    final router = _router;
    if (router == null) return;
    // push (no go): así "atrás" vuelve a donde estaba el conductor.
    final here = router.routerDelegate.currentConfiguration.uri.path;
    if (here == target) return;
    router.push(target);
  }
}
