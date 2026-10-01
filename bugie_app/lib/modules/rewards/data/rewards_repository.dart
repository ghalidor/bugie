import '../../../core/api/api_client.dart';
import '../../../core/api/api_config.dart';
import '../domain/rewards_model.dart';

/// Repositorio de puntos (puerto 5006).
///
/// El backend sabe si eres pasajero o conductor por el token, así que las
/// mismas llamadas sirven para los dos: devuelven el saldo, los niveles y el
/// catálogo que corresponden a tu tipo de cuenta.
class RewardsRepository {
  final ApiClient _api;
  RewardsRepository(this._api);

  String get _base => '${ApiConfig.rewards}/rewards';

  /// GET /api/rewards/me
  Future<RewardsPointsProfile> getProfile() async {
    final json = await _api.get('$_base/me');
    return RewardsPointsProfile.fromJson(json as Map<String, dynamic>);
  }

  /// GET /api/rewards/me/history
  Future<RewardsPage<RewardsTransaction>> getHistory({
    int page = 1,
    int pageSize = 20,
  }) async {
    final json = await _api.get('$_base/me/history?page=$page&pageSize=$pageSize');
    return _page(json, RewardsTransaction.fromJson);
  }

  /// GET /api/rewards/levels
  Future<List<RewardLevel>> getLevels() async {
    final json = await _api.get('$_base/levels');
    final list = (json as List?) ?? [];
    return list
        .map((e) => RewardLevel.fromJson((e as Map).cast<String, dynamic>()))
        .toList()
      ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
  }

  /// GET /api/rewards/catalog
  /// Cada item ya viene con si alcanza o no el saldo, calculado en el backend.
  Future<List<RewardCatalogItem>> getCatalog() async {
    final json = await _api.get('$_base/catalog');
    final list = (json as List?) ?? [];
    return list
        .map((e) => RewardCatalogItem.fromJson((e as Map).cast<String, dynamic>()))
        .toList();
  }

  /// POST /api/rewards/redeem
  /// Si no alcanza el saldo, falta nivel o se agotó, el backend responde 400
  /// con el motivo en el mensaje: se muestra tal cual al usuario.
  Future<RedeemResult> redeem(String catalogItemId) async {
    final json = await _api.post('$_base/redeem', body: {
      'catalogItemId': catalogItemId,
    });
    return RedeemResult.fromJson(json as Map<String, dynamic>);
  }

  /// GET /api/rewards/me/referral
  /// Mi código de invitación. Se crea la primera vez que se pide.
  Future<MyReferral> getMyReferral() async {
    final json = await _api.get('$_base/me/referral');
    return MyReferral.fromJson(json as Map<String, dynamic>);
  }

  /// POST /api/rewards/me/referral/invite
  Future<void> invite(String email) async {
    await _api.post('$_base/me/referral/invite', body: {'email': email.trim()});
  }

  /// GET /api/rewards/promotions
  /// Promociones vigentes, ya redactadas: qué gano y cuándo aplica.
  Future<List<ActivePromotion>> getPromotions() async {
    final json = await _api.get('$_base/promotions');
    final list = (json as List?) ?? [];
    return list
        .map((e) => ActivePromotion.fromJson((e as Map).cast<String, dynamic>()))
        .toList();
  }

  /// GET /api/rewards/raffles
  /// Sorteos abiertos y los ya sorteados donde tuve tickets.
  Future<List<UserRaffle>> getRaffles() async {
    final json = await _api.get('$_base/raffles');
    final list = (json as List?) ?? [];
    return list
        .map((e) => UserRaffle.fromJson((e as Map).cast<String, dynamic>()))
        .toList();
  }

  /// GET /api/rewards/me/redemptions
  /// [status]: active | used | expired | cancelled. null = todos.
  Future<RewardsPage<RewardRedemption>> getMyRedemptions({
    String? status,
    int page = 1,
    int pageSize = 50,
  }) async {
    final s = status == null ? '' : '&status=$status';
    final json = await _api.get(
        '$_base/me/redemptions?page=$page&pageSize=$pageSize$s');
    return _page(json, RewardRedemption.fromJson);
  }

  /// Convierte la respuesta paginada del backend.
  RewardsPage<T> _page<T>(
    dynamic json,
    T Function(Map<String, dynamic>) fromJson,
  ) {
    final map   = (json as Map?)?.cast<String, dynamic>() ?? {};
    final items = (map['items'] as List?) ?? [];
    return RewardsPage<T>(
      items:    items.map((e) => fromJson((e as Map).cast<String, dynamic>())).toList(),
      total:    (map['total']    as num?)?.toInt() ?? items.length,
      page:     (map['page']     as num?)?.toInt() ?? 1,
      pageSize: (map['pageSize'] as num?)?.toInt() ?? items.length,
    );
  }
}
