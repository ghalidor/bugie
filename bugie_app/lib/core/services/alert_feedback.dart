import 'dart:async';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:vibration/vibration.dart';

import 'notification_prefs.dart';

/// Intensidad del aviso (decide el patrón de vibración).
enum FeedbackLevel { soft, normal, strong }

/// Sonido y vibración de los avisos DENTRO de la app, siempre según
/// [NotificationPrefs]:
///   - sonido off   → no suena nada.
///   - vibración off → no vibra.
///
/// Sonidos (assets/sounds/):
///   - bugie_chime.wav:   "ding" corto para avisos normales.
///   - bugie_request.wav: dos tonos para solicitudes nuevas / propuestas.
///
/// El audio usa el canal de NOTIFICACIONES del celular (Android) y la
/// categoría "ambient" (iOS): respeta el modo silencio y no corta la música
/// ni la navegación que el conductor tenga sonando (solo la baja un momento).
class AlertFeedback {
  static final AlertFeedback _instance = AlertFeedback._();
  factory AlertFeedback() => _instance;
  AlertFeedback._();

  static const _chimeAsset = 'sounds/bugie_chime.wav';
  static const _requestAsset = 'sounds/bugie_request.wav';

  AudioPlayer? _player;
  Timer? _loop;
  bool? _hasVibrator;

  NotificationPrefs get _prefs => NotificationPrefs();

  static final _ctx = AudioContext(
    android: const AudioContextAndroid(
      contentType: AndroidContentType.sonification,
      usageType: AndroidUsageType.notification,
      audioFocus: AndroidAudioFocus.gainTransientMayDuck,
    ),
    iOS: AudioContextIOS(category: AVAudioSessionCategory.ambient),
  );

  AudioPlayer _ensurePlayer() =>
      _player ??= AudioPlayer(playerId: 'bugie_alerts')
        ..setReleaseMode(ReleaseMode.stop);

  // ── Avisos sueltos ─────────────────────────────────────────────────

  /// Aviso normal: "ding" + vibración según la intensidad.
  void alert({FeedbackLevel level = FeedbackLevel.normal}) {
    if (_prefs.sound) _play(_chimeAsset);
    if (_prefs.vibration) _vibrate(level);
  }

  /// Propuesta / contraoferta: sonido de solicitud + vibración doble.
  void proposal() {
    if (_prefs.sound) _play(_requestAsset);
    if (_prefs.vibration) _vibrate(FeedbackLevel.strong);
  }

  // ── Solicitud nueva (se repite hasta que se atienda) ───────────────

  /// Suena y vibra cada pocos segundos hasta [stopRequestLoop] o [maxTime].
  /// Respeta "No molestar cuando estoy desconectado".
  void startRequestLoop({Duration maxTime = const Duration(seconds: 25)}) {
    stopRequestLoop();
    if (_prefs.mutedForRequests) return;
    if (!_prefs.sound && !_prefs.vibration) return;

    final until = DateTime.now().add(maxTime);
    void tick() {
      if (_prefs.sound) {
        _play(_prefs.requestSound ? _requestAsset : _chimeAsset);
      }
      if (_prefs.vibration) {
        _vibratePattern(const [0, 400, 150, 400, 150, 600]);
      }
    }

    tick();
    _loop = Timer.periodic(const Duration(milliseconds: 3200), (t) {
      if (DateTime.now().isAfter(until)) {
        stopRequestLoop();
        return;
      }
      tick();
    });
  }

  void stopRequestLoop() {
    _loop?.cancel();
    _loop = null;
    _player?.stop().catchError((_) {});
    Vibration.cancel().catchError((_) {});
  }

  bool get isLooping => _loop != null;

  // ── Botón "Probar" de Configuración ────────────────────────────────

  /// Prueba lo que el usuario tiene activado. [request]: prueba el sonido
  /// de solicitud (conductor).
  void test({bool request = false}) {
    if (_prefs.sound) {
      _play(request && _prefs.requestSound ? _requestAsset : _chimeAsset);
    }
    if (_prefs.vibration) {
      request
          ? _vibratePattern(const [0, 400, 150, 400, 150, 600])
          : _vibrate(FeedbackLevel.normal);
    }
  }

  // ── Internos ───────────────────────────────────────────────────────

  Future<void> _play(String asset) async {
    try {
      final p = _ensurePlayer();
      await p.stop();
      await p.play(AssetSource(asset), ctx: _ctx, volume: 1.0);
    } catch (e) {
      // Sin audio (ej. plugin no disponible): al menos el sonido del sistema.
      debugPrint('AlertFeedback: no se pudo reproducir $asset: $e');
      SystemSound.play(SystemSoundType.alert);
    }
  }

  Future<bool> _canVibrate() async {
    if (_hasVibrator != null) return _hasVibrator!;
    try {
      _hasVibrator = await Vibration.hasVibrator();
    } catch (_) {
      _hasVibrator = false;
    }
    return _hasVibrator!;
  }

  void _vibrate(FeedbackLevel level) {
    switch (level) {
      case FeedbackLevel.soft:
        HapticFeedback.lightImpact();
        break;
      case FeedbackLevel.normal:
        _vibratePattern(const [0, 250]);
        break;
      case FeedbackLevel.strong:
        _vibratePattern(const [0, 350, 150, 350, 150, 350]);
        break;
    }
  }

  Future<void> _vibratePattern(List<int> pattern) async {
    if (await _canVibrate()) {
      try {
        await Vibration.vibrate(pattern: pattern);
        return;
      } catch (_) {}
    }
    HapticFeedback.heavyImpact();
  }
}
