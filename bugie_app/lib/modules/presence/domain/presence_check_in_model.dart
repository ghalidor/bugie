/// Resultado de un check-in del conductor (verificación facial para ponerse online).
class PresenceCheckIn {
  final String   id;
  /// URL relativa devuelta por el backend (ej. /uploads/drivers/.../abc.jpg).
  /// El cliente la combina con la base de la API para mostrar la imagen.
  final String   photoUrl;
  final DateTime checkedInAt;

  PresenceCheckIn({
    required this.id,
    required this.photoUrl,
    required this.checkedInAt,
  });

  factory PresenceCheckIn.fromJson(Map<String, dynamic> j) => PresenceCheckIn(
        id:          j['id'] as String,
        photoUrl:    j['photoUrl'] as String? ?? '',
        checkedInAt: DateTime.parse(j['checkedInAt'] as String),
      );
}
