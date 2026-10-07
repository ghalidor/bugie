import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/services/in_app_alert_service.dart';
import '../../../core/services/push_routes.dart';
import '../../../core/services/trips_hub_service.dart';
import '../../../core/session/session.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/widgets/alert_banner.dart';
import '../../../core/widgets/bugie_internal_header.dart';
import '../data/notifications_badge.dart';
import '../data/notifications_repository.dart';
import '../domain/notification_model.dart';

/// Bandeja de notificaciones (/passenger/notifications y
/// /driver/notifications). Muestra los mismos avisos que llegaron por push,
/// con el mismo ícono y color que los banners.
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  static const int _pageSize = 20;
  final List<AppNotification> _items = [];
  final _scroll = ScrollController();
  int _page = 1;
  int _unread = 0;
  bool _loading = false;
  bool _initialLoading = true;
  bool _hasMore = true;
  bool _markingAll = false;
  String? _error;

  /// Junta en una sola recarga los avisos que llegan casi a la vez (el
  /// mismo aviso puede llegar por push y por el hub).
  Timer? _arrivalDebounce;
  bool _refreshingTop = false;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
    // Con la bandeja abierta, un aviso nuevo (push en primer plano o su
    // espejo por el hub) la refresca sola.
    NotificationsBadge().arrivals.addListener(_onArrival);
    TripsHubService().userNotification.addListener(_onArrival);
    _loadPage(reset: true);
  }

  @override
  void dispose() {
    NotificationsBadge().arrivals.removeListener(_onArrival);
    TripsHubService().userNotification.removeListener(_onArrival);
    _arrivalDebounce?.cancel();
    _scroll.dispose();
    super.dispose();
  }

  void _onArrival() {
    if (!mounted) return;
    _arrivalDebounce?.cancel();
    _arrivalDebounce =
        Timer(const Duration(milliseconds: 600), _refreshTop);
  }

  /// Trae la primera página y agrega arriba solo los avisos que aún no
  /// están (sin duplicar ni perder las páginas ya cargadas).
  Future<void> _refreshTop() async {
    if (!mounted || _refreshingTop || _initialLoading) return;
    _refreshingTop = true;
    try {
      final res = await context
          .read<NotificationsRepository>()
          .getMine(page: 1, pageSize: _pageSize);
      if (!mounted) return;
      final ids = _items.map((e) => e.id).toSet();
      final fresh = res.items.where((e) => !ids.contains(e.id)).toList();
      if (fresh.isEmpty) return;
      setState(() {
        _items.insertAll(0, fresh);
        _unread = res.unread;
        _error = null;
      });
      NotificationsBadge().set(res.unread);
      _markSeen(fresh);
    } catch (_) {
      // Sin red: se verá al volver a abrir o al deslizar para recargar.
    } finally {
      _refreshingTop = false;
    }
  }

  /// Carga la siguiente página cuando faltan ~300 px para el final.
  void _onScroll() {
    if (!_hasMore || _loading || _error != null) return;
    if (_scroll.position.pixels >= _scroll.position.maxScrollExtent - 300) {
      _loadPage();
    }
  }

  Future<void> _loadPage({bool reset = false}) async {
    if (_loading) return;
    setState(() {
      _loading = true;
      if (reset) _error = null;
    });
    try {
      final page = reset ? 1 : _page;
      final res = await context
          .read<NotificationsRepository>()
          .getMine(page: page, pageSize: _pageSize);
      if (!mounted) return;
      setState(() {
        if (reset) _items.clear();
        // Evita duplicados si llegaron avisos nuevos entre páginas.
        final ids = _items.map((e) => e.id).toSet();
        _items.addAll(res.items.where((e) => !ids.contains(e.id)));
        _page = page + 1;
        _hasMore = res.hasMore && res.items.isNotEmpty;
        _unread = res.unread;
        _error = null;
        _loading = false;
        _initialLoading = false;
      });
      NotificationsBadge().set(res.unread);
      _markSeen(res.items);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'No se pudieron cargar tus notificaciones.';
        _loading = false;
        _initialLoading = false;
      });
    }
  }

  /// Los avisos que se muestran en pantalla cuentan como vistos: se marcan
  /// leídos en el backend y baja el número de la campana. En esta visita
  /// siguen resaltados para que se note cuáles eran nuevos.
  Future<void> _markSeen(List<AppNotification> shown) async {
    final ids = shown.where((n) => !n.read).map((n) => n.id).toList();
    if (ids.isEmpty) return;
    final repo = context.read<NotificationsRepository>();
    NotificationsBadge().set(NotificationsBadge().unread.value - ids.length);
    if (mounted) setState(() => _unread = (_unread - ids.length).clamp(0, 1 << 30));
    try {
      await Future.wait(ids.map(repo.markRead));
    } catch (_) {
      // No crítico: la campana se corrige con el próximo refresco.
    }
    await NotificationsBadge().refresh();
  }

  /// Tocar: marcar leída (optimista) y abrir su pantalla, si tiene.
  void _open(AppNotification n) {
    final i = _items.indexWhere((e) => e.id == n.id);
    if (!n.read && i >= 0) {
      setState(() {
        _items[i] = n.copyWith(read: true);
        if (_unread > 0) _unread--;
      });
      NotificationsBadge().markRead(n.id, wasUnread: true);
    }

    final router = GoRouter.of(context);
    final role = context.read<Session>().role;
    final target = resolvePushRoute(
      router: router,
      role: role,
      route: n.route,
      pushType: n.type,
      tripId: n.tripId,
      reasonCode: n.data['reason_code'],
    );
    if (target == null) return;
    // El inicio del rol reemplaza la pila; el resto se abre encima de la
    // bandeja para poder volver.
    if (target == '/driver' || target == '/passenger') {
      context.go(target);
    } else {
      context.push(target);
    }
  }

  Future<void> _markAllRead() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Marcar todas como leídas'),
        content: const Text('Todas tus notificaciones quedarán como leídas.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancelar')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Sí, marcar')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _markingAll = true);
    try {
      await context.read<NotificationsRepository>().markAllRead();
      if (!mounted) return;
      setState(() {
        for (var i = 0; i < _items.length; i++) {
          if (!_items[i].read) _items[i] = _items[i].copyWith(read: true);
        }
        _unread = 0;
        _markingAll = false;
      });
      NotificationsBadge().set(0);
    } catch (e) {
      if (!mounted) return;
      setState(() => _markingAll = false);
      final msg = e is ApiException
          ? e.message
          : 'No se pudieron marcar tus notificaciones.';
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final hasUnread = _unread > 0 || _items.any((e) => !e.read);
    return Scaffold(
      backgroundColor: c.bg,
      appBar: BugieInternalHeader(
        title: 'Notificaciones',
        showBell: false,
        actions: [
          if (hasUnread)
            IconButton(
              tooltip: 'Marcar todas como leídas',
              onPressed: _markingAll ? null : _markAllRead,
              icon: _markingAll
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : Icon(Icons.done_all, color: c.text),
            ),
        ],
      ),
      body: _initialLoading
          ? const Center(child: CircularProgressIndicator())
          : (_error != null && _items.isEmpty)
              ? _ErrorView(
                  message: _error!,
                  onRetry: () => _loadPage(reset: true),
                )
              : RefreshIndicator(
                  onRefresh: () => _loadPage(reset: true),
                  child: _items.isEmpty
                      ? ListView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          children: const [_EmptyView()],
                        )
                      : ListView.separated(
                          controller: _scroll,
                          padding: const EdgeInsets.all(12),
                          physics: const AlwaysScrollableScrollPhysics(),
                          itemCount: _items.length + 1, // +1 pie
                          separatorBuilder: (_, __) => const SizedBox(height: 8),
                          itemBuilder: (_, i) {
                            if (i == _items.length) return _footer(context);
                            final n = _items[i];
                            return _NotificationTile(
                              notification: n,
                              onTap: () => _open(n),
                            );
                          },
                        ),
                ),
    );
  }

  Widget _footer(BuildContext context) {
    final c = context.bugie;
    if (_error != null) {
      // Falló al cargar más: reintentar sin perder lo cargado.
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Column(
          children: [
            Text(_error!, style: const TextStyle(color: BugieColors.danger)),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: _loading ? null : () => _loadPage(),
              icon: const Icon(Icons.refresh, size: 18),
              label: const Text('Reintentar'),
            ),
          ],
        ),
      );
    }
    if (_hasMore) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 16),
        child: Center(
          child: SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(strokeWidth: 2)),
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Center(
        child: Text(
          'No hay más notificaciones',
          style: TextStyle(color: c.textMuted, fontSize: 12),
        ),
      ),
    );
  }
}

class _NotificationTile extends StatelessWidget {
  final AppNotification notification;
  final VoidCallback onTap;
  const _NotificationTile({required this.notification, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final n = notification;
    final type = alertTypeFor(
        type: n.type, alertType: n.alertType, route: n.route);
    final color = alertColor(type);
    final unread = !n.read;

    return Material(
      color: unread ? BugieColors.primary.withValues(alpha: 0.07) : c.surface,
      borderRadius: BorderRadius.circular(BugieRadius.sm),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(BugieRadius.sm),
        child: Container(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(BugieRadius.sm),
            border: Border.all(
              color: unread
                  ? BugieColors.primary.withValues(alpha: 0.25)
                  : c.border,
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                ),
                child: Icon(alertIcon(type, service: n.service),
                    color: color, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(
                            n.title,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: c.text,
                              fontSize: 14,
                              fontWeight:
                                  unread ? FontWeight.w700 : FontWeight.w600,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          relativeTime(n.createdAt),
                          style: TextStyle(color: c.textMuted, fontSize: 11.5),
                        ),
                      ],
                    ),
                    if (n.body.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(
                        n.body,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: unread ? c.text : c.textMuted,
                          fontSize: 13,
                          height: 1.3,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              // Punto de "no leída".
              if (unread)
                Container(
                  margin: const EdgeInsets.only(left: 8, top: 4),
                  width: 9,
                  height: 9,
                  decoration: const BoxDecoration(
                    color: BugieColors.primary,
                    shape: BoxShape.circle,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Hora actual en Perú (UTC-5, sin horario de verano), sin zona, para
/// compararla con createdAt que el backend manda en hora de Perú.
DateTime _nowPeru() {
  final u = DateTime.now().toUtc().subtract(const Duration(hours: 5));
  return DateTime(u.year, u.month, u.day, u.hour, u.minute, u.second);
}

/// "ahora", "hace 5 min", "hoy 14:20", "ayer 18:30", "12 sep" o
/// "12 sep 2025".
String relativeTime(DateTime? at) {
  if (at == null) return '';
  final t = DateTime(at.year, at.month, at.day, at.hour, at.minute, at.second);
  final now = _nowPeru();
  final diff = now.difference(t);
  if (diff.inMinutes < 1) return 'ahora';
  if (diff.inMinutes < 60) return 'hace ${diff.inMinutes} min';

  final hhmm = DateFormat('HH:mm').format(t);
  final today = DateTime(now.year, now.month, now.day);
  final day = DateTime(t.year, t.month, t.day);
  final days = today.difference(day).inDays;
  if (days <= 0) return 'hoy $hhmm';
  if (days == 1) return 'ayer $hhmm';
  if (t.year == now.year) return DateFormat('d MMM', 'es_PE').format(t);
  return DateFormat('d MMM yyyy', 'es_PE').format(t);
}

class _EmptyView extends StatelessWidget {
  const _EmptyView();

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 80, horizontal: 24),
      child: Column(
        children: [
          Icon(Icons.notifications_off_outlined, size: 52, color: c.textMuted),
          const SizedBox(height: 12),
          Text(
            'No tienes notificaciones',
            textAlign: TextAlign.center,
            style: TextStyle(
                color: c.text, fontSize: 15, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 4),
          Text(
            'Aquí verás los avisos de tus viajes, envíos y tu cuenta.',
            textAlign: TextAlign.center,
            style: TextStyle(color: c.textMuted, fontSize: 13),
          ),
        ],
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorView({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off_outlined,
                size: 48, color: BugieColors.danger),
            const SizedBox(height: 10),
            Text(message,
                textAlign: TextAlign.center,
                style: const TextStyle(color: BugieColors.danger)),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              style: BugieButtons.compactOutlinedStyle(context),
              onPressed: onRetry,
              icon: const Icon(Icons.refresh, size: 16),
              label: const Text('Reintentar'),
            ),
          ],
        ),
      ),
    );
  }
}
