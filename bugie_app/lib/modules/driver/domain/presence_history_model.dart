/// Una conexión del conductor: desde que pasó la verificación facial
/// (check-in) hasta que se desconectó (check-out).
///
/// Las fechas llegan en hora de Perú SIN zona (ej. "2026-10-03T08:15:00"),
/// así que DateTime.parse las deja tal cual para mostrarlas.
class PresenceSession {
  final String id;

  /// URL relativa de la selfie (/uploads/...). Se resuelve con
  /// ApiConfig.resolveMediaUrl (servicio Drivers).
  final String photoUrl;
  final DateTime checkedInAt;

  /// Null si la conexión sigue activa.
  final DateTime? checkedOutAt;
  final int durationMinutes;
  final bool active;
  final double? faceQualityScore;

  PresenceSession({
    required this.id,
    required this.photoUrl,
    required this.checkedInAt,
    required this.checkedOutAt,
    required this.durationMinutes,
    required this.active,
    required this.faceQualityScore,
  });

  factory PresenceSession.fromJson(Map<String, dynamic> j) => PresenceSession(
        id:               j['id'].toString(),
        photoUrl:         j['photoUrl'] as String? ?? '',
        checkedInAt:      DateTime.parse(j['checkedInAt'].toString()),
        checkedOutAt:     j['checkedOutAt'] == null
            ? null
            : DateTime.parse(j['checkedOutAt'].toString()),
        durationMinutes:  (j['durationMinutes'] as num?)?.toInt() ?? 0,
        active:           j['active'] == true,
        faceQualityScore: (j['faceQualityScore'] as num?)?.toDouble(),
      );
}

/// Minutos conectados en Hoy / últimos 7 días / últimos 30 días.
class PresenceSummary {
  final int today;
  final int last7Days;
  final int last30Days;

  const PresenceSummary({
    this.today = 0,
    this.last7Days = 0,
    this.last30Days = 0,
  });

  factory PresenceSummary.fromJson(Map<String, dynamic>? j) => PresenceSummary(
        today:      (j?['today'] as num?)?.toInt() ?? 0,
        last7Days:  (j?['last7Days'] as num?)?.toInt() ?? 0,
        last30Days: (j?['last30Days'] as num?)?.toInt() ?? 0,
      );
}

/// Página del historial de conexiones (GET drivers/me/presence/history).
class PresenceHistoryPage {
  final List<PresenceSession> items;
  final int total;
  final int page;
  final int pageSize;
  final PresenceSummary summary;

  PresenceHistoryPage({
    required this.items,
    required this.total,
    required this.page,
    required this.pageSize,
    required this.summary,
  });

  factory PresenceHistoryPage.fromJson(Map<String, dynamic> j) =>
      PresenceHistoryPage(
        items: (j['items'] as List<dynamic>? ?? [])
            .map((e) => PresenceSession.fromJson(e as Map<String, dynamic>))
            .toList(),
        total:    (j['total'] as num?)?.toInt() ?? 0,
        page:     (j['page'] as num?)?.toInt() ?? 1,
        pageSize: (j['pageSize'] as num?)?.toInt() ?? 20,
        summary:  PresenceSummary.fromJson(j['summary'] as Map<String, dynamic>?),
      );

  bool get hasMore => page * pageSize < total;
}

/// Convierte minutos en un texto legible: "45 min", "2 h 05 min", "1 h".
String formatMinutes(int minutes) {
  if (minutes <= 0) return '0 min';
  final h = minutes ~/ 60;
  final m = minutes % 60;
  if (h == 0) return '$m min';
  if (m == 0) return '$h h';
  return '$h h ${m.toString().padLeft(2, '0')} min';
}
