/// Dirección favorita del pasajero, atajo al solicitar viaje.
class FavoriteAddress {
  final String id;
  final String label;
  final String icon;
  final String address;
  final String? description;
  final double lat;
  final double lng;
  final int sortOrder;

  FavoriteAddress({
    required this.id,
    required this.label,
    required this.icon,
    required this.address,
    this.description,
    required this.lat,
    required this.lng,
    required this.sortOrder,
  });

  factory FavoriteAddress.fromJson(Map<String, dynamic> json) => FavoriteAddress(
        id:        json['id'] as String,
        label:     json['label'] as String? ?? '',
        icon:      json['icon'] as String? ?? 'location_on',
        address:   json['address'] as String? ?? '',
        description: json['description'] as String?,
        lat:       (json['lat'] as num).toDouble(),
        lng:       (json['lng'] as num).toDouble(),
        sortOrder: json['sortOrder'] as int? ?? 0,
      );
}
