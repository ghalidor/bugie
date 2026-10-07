import 'dart:async';
import 'package:flutter/widgets.dart';
import '../../../core/api/api_client.dart';
import '../../../core/session/session.dart';
import 'notifications_repository.dart';

/// Contador global de notificaciones no leídas (badge de la campana).
///
/// - Se carga al iniciar sesión / abrir la app con sesión.
/// - Sube al llegar un push en primer plano (y se confirma con el backend).
/// - Se refresca al volver de la bandeja y al reanudar la app.
/// - Se limpia al cerrar sesión (escucha la Session).
///
/// Se conecta una vez en main.dart con [attach].
class NotificationsBadge with WidgetsBindingObserver {
  static final NotificationsBadge _instance = NotificationsBadge._();
  factory NotificationsBadge() => _instance;
  NotificationsBadge._();

  /// Número de notificaciones sin leer.
  final ValueNotifier<int> unread = ValueNotifier(0);

  NotificationsRepository? _repo;
  Session? _session;
  String? _userId;

  // Cada refresh lleva un número: si llega una respuesta vieja (o de otro
  // usuario) se descarta.
  int _seq = 0;

  bool get _canUse {
    final role = _session?.role;
    return _repo != null &&
        (_session?.isLoggedIn ?? false) &&
        (role == UserRole.passenger || role == UserRole.driver);
  }

  /// Conecta el servicio. Es seguro llamarlo más de una vez.
  void attach({required ApiClient api, required Session session}) {
    _repo = NotificationsRepository(api);
    if (_session == session) return;
    _session?.removeListener(_onSessionChanged);
    _session = session;
    session.addListener(_onSessionChanged);
    WidgetsBinding.instance.removeObserver(this);
    WidgetsBinding.instance.addObserver(this);
    _onSessionChanged();
  }

  /// Cambió la sesión: si entró otro usuario, recargar; si salió, limpiar.
  void _onSessionChanged() {
    final id = _session?.user?.userId;
    if (id == _userId) return; // ej. solo cambió la foto de perfil
    _userId = id;
    clear();
    if (id != null) refresh();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) refresh();
  }

  /// Pide al backend el número de no leídas.
  Future<void> refresh() async {
    if (!_canUse) return;
    final seq = ++_seq;
    final user = _userId;
    try {
      final n = await _repo!.getUnreadCount();
      if (seq != _seq || user != _userId) return;
      unread.value = n < 0 ? 0 : n;
    } catch (e) {
      debugPrint('Notificaciones: no se pudo leer el contador: $e');
    }
  }

  /// Sube cada vez que llega un aviso guardado en la bandeja (app en primer
  /// plano). La bandeja abierta lo escucha para refrescarse sola.
  final ValueNotifier<int> arrivals = ValueNotifier(0);

  /// Llegó un push guardado en la bandeja (app en primer plano).
  void onPushReceived() {
    if (!_canUse) return;
    unread.value = unread.value + 1;
    arrivals.value = arrivals.value + 1;
    refresh();
  }

  /// Marca una notificación como leída sin bloquear a quien llama (taps
  /// en push o banner). [wasUnread] baja el contador al instante.
  Future<void> markRead(String id, {bool wasUnread = false}) async {
    if (!_canUse) return;
    if (wasUnread && unread.value > 0) unread.value = unread.value - 1;
    try {
      await _repo!.markRead(id);
    } catch (e) {
      debugPrint('Notificaciones: no se pudo marcar como leída: $e');
    }
    await refresh();
  }

  /// Fija el contador (ej. tras "Marcar todas como leídas").
  void set(int value) {
    _seq++; // descarta respuestas en vuelo
    unread.value = value < 0 ? 0 : value;
  }

  /// Limpia el contador (cerrar sesión).
  void clear() {
    _seq++;
    unread.value = 0;
  }
}
