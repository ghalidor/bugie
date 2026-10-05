/// Notificación guardada en la bandeja del usuario (Trips,
/// GET /api/trips/notifications/me). Es el mismo aviso que llegó por push.
class AppNotification {
  final String id;
  final String title;
  final String body;

  /// data.type del push (ej. 'account', 'payout', 'trip_cancelled').
  final String? type;

  /// data.alert_type del push (ej. 'proposal', 'driver_approved').
  final String? alertType;

  /// Ruta a abrir al tocarla (se normaliza al rol con push_routes).
  final String? route;

  /// Resto de datos del push (trip_id, service, from...).
  final Map<String, String> data;

  /// Hora de Perú (el backend la manda sin zona).
  final DateTime? createdAt;
  final bool read;

  const AppNotification({
    required this.id,
    required this.title,
    required this.body,
    this.type,
    this.alertType,
    this.route,
    this.data = const {},
    this.createdAt,
    this.read = false,
  });

  String? get service => data['service'];
  String? get tripId => data['trip_id'] ?? data['tripId'];

  AppNotification copyWith({bool? read}) => AppNotification(
        id: id,
        title: title,
        body: body,
        type: type,
        alertType: alertType,
        route: route,
        data: data,
        createdAt: createdAt,
        read: read ?? this.read,
      );

  factory AppNotification.fromJson(Map<String, dynamic> j) {
    final rawData = j['data'];
    final data = <String, String>{};
    if (rawData is Map) {
      rawData.forEach((k, v) {
        if (v != null) data['$k'] = '$v';
      });
    }
    return AppNotification(
      id: '${j['id']}',
      title: (j['title'] as String?) ?? 'Bugie',
      body: (j['body'] as String?) ?? '',
      type: j['type'] as String?,
      alertType: j['alertType'] as String?,
      route: j['route'] as String?,
      data: data,
      createdAt: DateTime.tryParse('${j['createdAt'] ?? ''}'),
      read: j['read'] == true || j['readAt'] != null,
    );
  }
}

/// Página de notificaciones + total de no leídas.
class NotificationsPage {
  final List<AppNotification> items;
  final int total;
  final int page;
  final int pageSize;
  final int unread;

  const NotificationsPage({
    required this.items,
    required this.total,
    required this.page,
    required this.pageSize,
    required this.unread,
  });

  bool get hasMore => page * pageSize < total;

  factory NotificationsPage.fromJson(Map<String, dynamic> j) {
    final list = (j['items'] as List?) ?? [];
    return NotificationsPage(
      items: list
          .map((e) => AppNotification.fromJson((e as Map).cast<String, dynamic>()))
          .toList(),
      total: (j['total'] as num?)?.toInt() ?? 0,
      page: (j['page'] as num?)?.toInt() ?? 1,
      pageSize: (j['pageSize'] as num?)?.toInt() ?? 20,
      unread: (j['unread'] as num?)?.toInt() ?? 0,
    );
  }
}
