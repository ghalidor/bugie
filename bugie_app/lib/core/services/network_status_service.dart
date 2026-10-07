import 'dart:async';
import 'dart:io' show Socket;

import 'package:flutter/widgets.dart';

import '../api/api_config.dart';

/// Estado de la conexión con el servidor (sin paquetes extra).
///
/// Se entera por:
///  - el ApiClient: cada respuesta cuenta como "hay conexión"; un timeout,
///    error de socket o 502/503/504 cuenta como falla,
///  - el hub (TripsHubService): si pierde la conexión pide comprobar ya.
///
/// Tras [_failuresToShow] fallas seguidas marca [offline] (la franja
/// "Sin conexión. Reintentando…" de OfflineFrame) y, mientras tanto, prueba
/// cada [_probeEvery] si el servidor vuelve a responder (abre un socket al
/// host de Trips). Con la primera respuesta buena se quita sola.
class NetworkStatusService with WidgetsBindingObserver {
  static final NetworkStatusService _instance = NetworkStatusService._();
  factory NetworkStatusService() => _instance;
  NetworkStatusService._();

  /// true mientras no hay red o el servidor no responde.
  final ValueNotifier<bool> offline = ValueNotifier(false);

  static const _failuresToShow = 2;
  static const _probeEvery = Duration(seconds: 5);
  static const _probeTimeout = Duration(seconds: 5);

  int _failures = 0;
  Timer? _probeTimer;
  bool _probing = false;
  bool _foreground = true;
  bool _attached = false;

  /// Llamar una vez al arrancar la app (main.dart).
  void attach() {
    if (_attached) return;
    _attached = true;
    WidgetsBinding.instance.addObserver(this);
  }

  /// El servidor respondió.
  void reportSuccess() {
    _failures = 0;
    _probeTimer?.cancel();
    _probeTimer = null;
    if (offline.value) offline.value = false;
  }

  /// No hubo respuesta (sin red, timeout o servidor caído).
  void reportFailure() {
    _failures++;
    if (_failures >= _failuresToShow && !offline.value) offline.value = true;
    _scheduleProbe();
  }

  /// Algo indica que la conexión pudo caerse (p. ej. el hub se desconectó):
  /// se comprueba ya.
  void checkNow() {
    _probeTimer?.cancel();
    _probeTimer = null;
    _probe();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _foreground = true;
      if (_failures > 0) checkNow();
    } else if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.hidden) {
      // En segundo plano no se gasta batería probando.
      _foreground = false;
      _probeTimer?.cancel();
      _probeTimer = null;
    }
  }

  void _scheduleProbe() {
    if (_probeTimer != null || !_foreground) return;
    _probeTimer = Timer(_probeEvery, () {
      _probeTimer = null;
      _probe();
    });
  }

  Future<void> _probe() async {
    if (_probing || !_foreground) return;
    _probing = true;
    final ok = await _reachable();
    _probing = false;
    if (ok) {
      reportSuccess();
    } else {
      reportFailure();
    }
  }

  /// Abre (y cierra) un socket al host de Trips: si conecta, hay red y el
  /// servidor está arriba. No usa la API (no toca la sesión).
  Future<bool> _reachable() async {
    final uri = Uri.tryParse(ApiConfig.trips);
    if (uri == null || uri.host.isEmpty) return true;
    try {
      final socket =
          await Socket.connect(uri.host, uri.port, timeout: _probeTimeout);
      socket.destroy();
      return true;
    } catch (_) {
      return false;
    }
  }
}
