class Vehicle {
  final String id;
  final String driverId;
  final String plate;
  final String brand;
  final String model;
  final int year;
  final String color;
  final bool isActive;
  /// URL pública de la foto del vehículo. Null si todavía no se ha subido.
  final String? photoUrl;

  Vehicle({
    required this.id,
    required this.driverId,
    required this.plate,
    required this.brand,
    required this.model,
    required this.year,
    required this.color,
    required this.isActive,
    this.photoUrl,
  });

  factory Vehicle.fromJson(Map<String, dynamic> j) => Vehicle(
        id:       j['id'].toString(),
        driverId: j['driverId']?.toString() ?? '',
        plate:    j['plate'] ?? '',
        brand:    j['brand'] ?? '',
        model:    j['model'] ?? '',
        year:     (j['year'] ?? 0) as int,
        color:    j['color'] ?? '',
        isActive: j['isActive'] == true,
        photoUrl: j['photoUrl'] as String?,
      );
}
