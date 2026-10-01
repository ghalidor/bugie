import 'dart:async';
import 'dart:convert';
import 'dart:io' show SocketException;
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import '../session/session.dart';
import 'api_exception.dart';

/// Cliente HTTP único de la app.
/// Replica el comportamiento de `apiFetch` en state/api.ts del web:
///   - Mete el JWT en el header Authorization automáticamente.
///   - Si el backend devuelve 401, limpia la sesión.
///   - Aplica timeout (10s default) para no colgarse en red lenta.
///   - Devuelve el JSON parseado o lanza ApiException.
///     · ApiException con status 4xx/5xx → respuesta del backend.
///     · ApiException.network → timeout / sin conexión / error de socket.
///
/// TODOS los repositorios pasan por aquí. Nunca llamar a `http` directo.
class ApiClient {
  final Session _session;

  /// Timeout por defecto para cada request. 10s es suficiente incluso
  /// en redes móviles peruanas malas, sin colgar la UI eternamente.
  static const Duration _defaultTimeout = Duration(seconds: 10);

  ApiClient(this._session);

  // ── GET ──────────────────────────────────────────────────────────────────
  Future<dynamic> get(String url) async {
    return _send(() async => http.get(
          Uri.parse(url),
          headers: await _headers(),
        ));
  }

  // ── POST ─────────────────────────────────────────────────────────────────
  Future<dynamic> post(String url, {Map<String, dynamic>? body}) async {
    return _send(() async => http.post(
          Uri.parse(url),
          headers: await _headers(),
          body: body == null ? null : jsonEncode(body),
        ));
  }

  // ── PUT ──────────────────────────────────────────────────────────────────
  Future<dynamic> put(String url, {Map<String, dynamic>? body}) async {
    return _send(() async => http.put(
          Uri.parse(url),
          headers: await _headers(),
          body: body == null ? null : jsonEncode(body),
        ));
  }

  // ── DELETE ───────────────────────────────────────────────────────────────
  Future<dynamic> delete(String url) async {
    return _send(() async => http.delete(
          Uri.parse(url),
          headers: await _headers(),
        ));
  }

  // ── POST multipart (subida de archivos) ──────────────────────────────────
  /// Sube un archivo con campos de formulario.
  /// Timeout más alto (30s) porque las subidas tardan más por red móvil.
  Future<dynamic> postMultipart(
    String url, {
    required Map<String, String> fields,
    required String filePath,
    String fileField = 'file',
  }) async {
    return _sendCustom(() async {
      final token = await _session.getToken();
      final request = http.MultipartRequest('POST', Uri.parse(url));
      if (token != null) {
        request.headers['Authorization'] = 'Bearer $token';
      }
      request.fields.addAll(fields);
      request.files.add(await http.MultipartFile.fromPath(
        fileField,
        filePath,
        contentType: _mediaTypeFor(filePath),
      ));
      final streamed = await request.send();
      return http.Response.fromStream(streamed);
    }, timeout: const Duration(seconds: 30));
  }

  /// Sube VARIOS archivos en un solo request multipart.
  /// [files] es una lista de (nombreDeCampo -> rutaDelArchivo). Permite mezclar
  /// campos distintos (ej. 'main' + varios 'secondary') y campos de texto.
  Future<dynamic> postMultipartMany(
    String url, {
    Map<String, String> fields = const {},
    required List<MapEntry<String, String>> files,
  }) async {
    return _sendCustom(() async {
      final token = await _session.getToken();
      final request = http.MultipartRequest('POST', Uri.parse(url));
      if (token != null) {
        request.headers['Authorization'] = 'Bearer $token';
      }
      request.fields.addAll(fields);
      for (final e in files) {
        request.files.add(await http.MultipartFile.fromPath(
          e.key,
          e.value,
          contentType: _mediaTypeFor(e.value),
        ));
      }
      final streamed = await request.send();
      return http.Response.fromStream(streamed);
    }, timeout: const Duration(seconds: 60));
  }

  /// Devuelve el MediaType según la extensión del archivo.
  /// Cubre los formatos aceptados por el backend: jpeg, png, webp, pdf.
  MediaType _mediaTypeFor(String filePath) {
    final ext = filePath.split('.').last.toLowerCase();
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return MediaType('image', 'jpeg');
      case 'png':
        return MediaType('image', 'png');
      case 'webp':
        return MediaType('image', 'webp');
      case 'pdf':
        return MediaType('application', 'pdf');
      default:
        return MediaType('image', 'jpeg');
    }
  }

  // ── Envío con timeout + manejo uniforme de errores de red ───────────────

  /// Envuelve cualquier request HTTP con:
  ///   1. Timeout (10s default).
  ///   2. Captura de SocketException → ApiException.network.
  ///   3. Captura de TimeoutException → ApiException.network.
  /// Cualquier otro error se rethrow tal cual.
  Future<dynamic> _send(
    Future<http.Response> Function() request, {
    Duration timeout = _defaultTimeout,
  }) async {
    return _sendCustom(request, timeout: timeout);
  }

  Future<dynamic> _sendCustom(
    Future<http.Response> Function() request, {
    required Duration timeout,
  }) async {
    try {
      final res = await request().timeout(timeout);
      return _handle(res);
    } on TimeoutException {
      throw ApiException.network(
          'La conexión está tardando demasiado. Verifica tu internet.');
    } on SocketException {
      throw ApiException.network('Sin conexión a internet.');
    } on http.ClientException catch (e) {
      // Errores del paquete http (DNS falla, conexión cerrada, etc.)
      throw ApiException.network('Error de red: ${e.message}');
    }
  }

  // ── Headers con JWT ──────────────────────────────────────────────────────
  Future<Map<String, String>> _headers() async {
    final token = await _session.getToken();
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  // ── Manejo de respuesta y errores (= apiFetch del web) ──────────────────
  dynamic _handle(http.Response res) {
    // 204 No Content
    if (res.statusCode == 204) return null;

    // 401 — limpia sesión (la pantalla decide qué hacer)
    if (res.statusCode == 401) {
      _session.clear();
      final msg = _extractError(res.body) ?? 'No autorizado';
      throw ApiException(401, msg);
    }

    // 4xx / 5xx
    if (res.statusCode < 200 || res.statusCode >= 300) {
      final msg = _extractError(res.body) ?? 'Error ${res.statusCode}';
      throw ApiException(res.statusCode, msg);
    }

    // OK: parsear JSON o devolver null si está vacío
    if (res.body.isEmpty || res.body == 'null') return null;
    try {
      return jsonDecode(res.body);
    } catch (_) {
      return res.body;
    }
  }

  String? _extractError(String body) {
    try {
      final j = jsonDecode(body);
      if (j is Map) {
        return (j['error'] ?? j['message'])?.toString();
      }
    } catch (_) {}
    return null;
  }
}