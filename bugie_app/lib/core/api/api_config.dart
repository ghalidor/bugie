import 'package:flutter_dotenv/flutter_dotenv.dart';

/// Indica qué servicio sirve una URL de imagen/archivo.
/// Cada servicio tiene su propio StaticFiles montado en /uploads del
/// respectivo puerto.
enum ApiService { auth, drivers, trips, payments, landing, rewards }

/// URLs de los 5 microservicios del backend Bugie.
/// Se leen del archivo .env en la raíz del proyecto.
class ApiConfig {
  static String get auth     => dotenv.env['API_AUTH']     ?? 'http://10.0.2.2:5001/api';
  static String get trips    => dotenv.env['API_TRIPS']    ?? 'http://10.0.2.2:5002/api';
  static String get drivers  => dotenv.env['API_DRIVERS']  ?? 'http://10.0.2.2:5003/api';
  static String get payments => dotenv.env['API_PAYMENTS'] ?? 'http://10.0.2.2:5004/api';
  static String get landing  => dotenv.env['API_LANDING']  ?? 'http://10.0.2.2:5005/api';
  static String get rewards  => dotenv.env['API_REWARDS']  ?? 'http://10.0.2.2:5006/api';

  /// URL base de la web pública de Bugie (sin "/" final). Se usa para abrir
  /// páginas web desde la app, ej. el Libro de Reclamaciones.
  static String get webBase {
    final raw = dotenv.env['WEB_BASE_URL'] ?? 'http://10.0.2.2:5173';
    return raw.endsWith('/') ? raw.substring(0, raw.length - 1) : raw;
  }

  static String _baseFor(ApiService s) {
    switch (s) {
      case ApiService.auth:     return auth;
      case ApiService.trips:    return trips;
      case ApiService.drivers:  return drivers;
      case ApiService.payments: return payments;
      case ApiService.landing:  return landing;
      case ApiService.rewards:  return rewards;
    }
  }

  /// Resuelve una URL de imagen/archivo que puede venir RELATIVA o ABSOLUTA.
  ///
  /// El backend devuelve URLs relativas (ej. "/uploads/profiles/{id}/x.jpg")
  /// para evitar problemas de IP/puerto entre celular y PC. Este helper le
  /// pone el prefijo del servicio adecuado.
  ///
  /// - Si la URL ya es absoluta (http://...) la devuelve tal cual.
  /// - Si es relativa (empieza con /) le pone como prefijo el host del servicio.
  /// - Si es null/vacía devuelve null.
  ///
  /// [service] indica qué microservicio sirve el archivo. Default: drivers
  /// (que era el único caso cuando se creó este helper). Para fotos de perfil
  /// de pasajeros (que viven en Auth) usar ApiService.auth.
  static String? resolveMediaUrl(String? url, {ApiService service = ApiService.drivers}) {
    if (url == null || url.isEmpty) return null;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;

    // Quitar sufijo "/api" si lo tiene, porque /uploads está en la raíz.
    final raw = _baseFor(service);
    final base = raw.endsWith('/api') ? raw.substring(0, raw.length - 4) : raw;
    final path = url.startsWith('/') ? url : '/$url';
    return '$base$path';
  }
}
