import '../../../core/api/api_client.dart';
import '../../../core/api/api_config.dart';
import '../domain/notification_model.dart';

/// Repositorio de la bandeja de notificaciones (Trips, puerto 5002).
/// El backend sabe quién eres por el token: sirve igual para pasajero y
/// conductor.
class NotificationsRepository {
  final ApiClient _api;
  NotificationsRepository(this._api);

  String get _base => '${ApiConfig.trips}/trips/notifications';

  /// GET /api/trips/notifications/me (pageSize máximo 50).
  Future<NotificationsPage> getMine({int page = 1, int pageSize = 20}) async {
    final json = await _api.get('$_base/me?page=$page&pageSize=$pageSize');
    return NotificationsPage.fromJson(
        (json as Map?)?.cast<String, dynamic>() ?? const {});
  }

  /// GET /api/trips/notifications/me/unread-count
  Future<int> getUnreadCount() async {
    final json = await _api.get('$_base/me/unread-count');
    return ((json as Map?)?['unread'] as num?)?.toInt() ?? 0;
  }

  /// POST /api/trips/notifications/{id}/read → 204.
  Future<void> markRead(String id) =>
      _api.post('$_base/${Uri.encodeComponent(id)}/read');

  /// POST /api/trips/notifications/me/read-all → { updated }.
  Future<int> markAllRead() async {
    final json = await _api.post('$_base/me/read-all');
    return ((json as Map?)?['updated'] as num?)?.toInt() ?? 0;
  }
}
