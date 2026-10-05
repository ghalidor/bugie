import '../../../core/api/api_client.dart';
import '../../../core/api/api_config.dart';

/// Contacto de emergencia del usuario (pasajero o conductor).
/// Un contacto por usuario. Si el usuario activa un SOS y el contacto tiene
/// correo, Bugie le avisa por correo con la ubicación.
class EmergencyContact {
  final String fullName;
  final String phone;
  final String relationship;
  final String? email;

  const EmergencyContact({
    required this.fullName,
    required this.phone,
    required this.relationship,
    this.email,
  });

  factory EmergencyContact.fromJson(Map<String, dynamic> j) => EmergencyContact(
        fullName: (j['fullName'] ?? '').toString(),
        phone: (j['phone'] ?? '').toString(),
        relationship: (j['relationship'] ?? '').toString(),
        email: (j['email'] as String?)?.isNotEmpty == true ? j['email'] as String : null,
      );
}

/// Acceso a /api/auth/me/emergency-contact (API Auth, puerto 5001).
class EmergencyContactRepository {
  final ApiClient _api;
  EmergencyContactRepository(this._api);

  /// GET: devuelve el contacto o null si aún no registró uno.
  Future<EmergencyContact?> getMine() async {
    final json = await _api.get('${ApiConfig.auth}/auth/me/emergency-contact');
    if (json is! Map<String, dynamic>) return null;
    return EmergencyContact.fromJson(json);
  }

  /// PUT: crea o reemplaza el contacto. Devuelve el contacto guardado.
  Future<EmergencyContact> save(EmergencyContact c) async {
    final json = await _api.put(
      '${ApiConfig.auth}/auth/me/emergency-contact',
      body: {
        'fullName': c.fullName,
        'phone': c.phone,
        'relationship': c.relationship,
        'email': c.email,
      },
    );
    return json is Map<String, dynamic> ? EmergencyContact.fromJson(json) : c;
  }
}
