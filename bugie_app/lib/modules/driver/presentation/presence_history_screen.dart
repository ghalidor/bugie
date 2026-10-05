import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../../core/api/api_config.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/widgets/bugie_internal_header.dart';
import '../data/driver_repository.dart';
import '../domain/presence_history_model.dart';

/// Pantalla "Mis conexiones" del conductor.
/// Muestra el resumen de horas conectado (Hoy / 7 días / 30 días) y la
/// lista de conexiones con la selfie de verificación, entrada, salida y
/// duración. Scroll infinito + pull-to-refresh.
class DriverPresenceHistoryScreen extends StatefulWidget {
  const DriverPresenceHistoryScreen({super.key});

  @override
  State<DriverPresenceHistoryScreen> createState() =>
      _DriverPresenceHistoryScreenState();
}

class _DriverPresenceHistoryScreenState
    extends State<DriverPresenceHistoryScreen> {
  static const int _pageSize = 20;
  final List<PresenceSession> _items = [];
  final _scroll = ScrollController();
  PresenceSummary _summary = const PresenceSummary();
  int _page = 1;
  int _total = 0;
  bool _loading = false;
  bool _initialLoading = true;
  bool _hasMore = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
    _loadPage(reset: true);
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
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
      final repo = context.read<DriverRepository>();
      final page = reset ? 1 : _page;
      final res =
          await repo.getMyPresenceHistory(page: page, pageSize: _pageSize);
      if (!mounted) return;
      setState(() {
        if (reset) _items.clear();
        _items.addAll(res.items);
        _summary = res.summary;
        _page = page + 1;
        _total = res.total;
        _hasMore = res.hasMore;
        _error = null;
        _loading = false;
        _initialLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'No se pudieron cargar tus conexiones.';
        _loading = false;
        _initialLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const BugieInternalHeader(title: 'Mis conexiones'),
      body: _initialLoading
          ? const Center(child: CircularProgressIndicator())
          : (_error != null && _items.isEmpty)
              ? _ErrorView(
                  message: _error!,
                  onRetry: () => _loadPage(reset: true),
                )
              : RefreshIndicator(
                  onRefresh: () => _loadPage(reset: true),
                  child: ListView.separated(
                    controller: _scroll,
                    padding: const EdgeInsets.all(12),
                    physics: const AlwaysScrollableScrollPhysics(),
                    itemCount: _items.length + 2, // +1 resumen, +1 pie
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (_, i) {
                      if (i == 0) return _SummaryCard(summary: _summary);
                      if (i == _items.length + 1) return _footer(context);
                      return _SessionTile(session: _items[i - 1]);
                    },
                  ),
                ),
    );
  }

  Widget _footer(BuildContext context) {
    final c = context.bugie;
    if (_items.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 16),
        child: Column(
          children: [
            Icon(Icons.wifi_tethering_off, size: 48, color: c.textMuted),
            const SizedBox(height: 10),
            Text(
              'Aún no tienes conexiones registradas.',
              textAlign: TextAlign.center,
              style: TextStyle(color: c.textMuted),
            ),
            const SizedBox(height: 4),
            Text(
              'Cada vez que te pongas en línea con tu verificación facial, '
              'aparecerá aquí.',
              textAlign: TextAlign.center,
              style: TextStyle(color: c.textMuted, fontSize: 12),
            ),
          ],
        ),
      );
    }
    if (_error != null) {
      // Falló al cargar más: botón para reintentar sin perder lo cargado.
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
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: OutlinedButton.icon(
          onPressed: _loading ? null : () => _loadPage(),
          icon: _loading
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.expand_more, size: 18),
          label: Text('Cargar más  (${_items.length} / $_total)'),
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Center(
        child: Text(
          'Mostrando todas tus conexiones',
          style: TextStyle(color: c.textMuted, fontSize: 12),
        ),
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
            Text(message, style: const TextStyle(color: BugieColors.danger)),
            const SizedBox(height: 12),
            ElevatedButton(onPressed: onRetry, child: const Text('Reintentar')),
          ],
        ),
      ),
    );
  }
}

/// Resumen de tiempo conectado: Hoy / 7 días / 30 días.
class _SummaryCard extends StatelessWidget {
  final PresenceSummary summary;
  const _SummaryCard({required this.summary});

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    Widget cell(String label, int minutes) => Expanded(
          child: Column(
            children: [
              Text(
                formatMinutes(minutes),
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: c.text,
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 2),
              Text(label,
                  style: TextStyle(color: c.textMuted, fontSize: 12)),
            ],
          ),
        );

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.timer_outlined,
                    size: 18, color: BugieColors.primary),
                const SizedBox(width: 6),
                Text('Tiempo conectado',
                    style: TextStyle(
                        color: c.text, fontWeight: FontWeight.w600)),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                cell('Hoy', summary.today),
                cell('7 días', summary.last7Days),
                cell('30 días', summary.last30Days),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Una conexión: selfie, fecha, entrada, salida (o "Conectado ahora") y duración.
class _SessionTile extends StatelessWidget {
  final PresenceSession session;
  const _SessionTile({required this.session});

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final s = session;
    final date = DateFormat("EEEE d 'de' MMMM yyyy", 'es_PE').format(s.checkedInAt);
    final hour = DateFormat('HH:mm', 'es_PE');
    final photo = ApiConfig.resolveMediaUrl(s.photoUrl);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            // Miniatura de la selfie (tocar = ver grande)
            GestureDetector(
              onTap: photo == null
                  ? null
                  : () => Navigator.of(context).push(MaterialPageRoute(
                        builder: (_) => _SelfieViewer(url: photo),
                      )),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: SizedBox(
                  width: 56,
                  height: 56,
                  child: photo == null
                      ? Container(
                          color: c.surface2,
                          child: Icon(Icons.person, color: c.textMuted),
                        )
                      : Image.network(
                          photo,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => Container(
                            color: c.surface2,
                            child: Icon(Icons.broken_image_outlined,
                                color: c.textMuted),
                          ),
                        ),
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _capitalize(date),
                    style: TextStyle(
                        color: c.text,
                        fontWeight: FontWeight.w600,
                        fontSize: 14),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Icon(Icons.login, size: 14, color: c.textMuted),
                      const SizedBox(width: 4),
                      Text(hour.format(s.checkedInAt),
                          style: TextStyle(color: c.text, fontSize: 13)),
                      const SizedBox(width: 12),
                      if (s.active || s.checkedOutAt == null)
                        const _LiveChip()
                      else ...[
                        Icon(Icons.logout, size: 14, color: c.textMuted),
                        const SizedBox(width: 4),
                        Text(hour.format(s.checkedOutAt!),
                            style: TextStyle(color: c.text, fontSize: 13)),
                      ],
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Duración: ${formatMinutes(s.durationMinutes)}',
                    style: TextStyle(color: c.textMuted, fontSize: 12),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  static String _capitalize(String s) =>
      s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);
}

class _LiveChip extends StatelessWidget {
  const _LiveChip();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: BugieColors.success.withOpacity(0.15),
        borderRadius: BorderRadius.circular(999),
      ),
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.circle, size: 8, color: BugieColors.success),
          SizedBox(width: 4),
          Text(
            'Conectado ahora',
            style: TextStyle(
              color: BugieColors.success,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

/// Selfie a pantalla completa con zoom.
class _SelfieViewer extends StatelessWidget {
  final String url;
  const _SelfieViewer({required this.url});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: const Text('Verificación facial'),
      ),
      body: Center(
        child: InteractiveViewer(
          minScale: 1,
          maxScale: 5,
          child: Image.network(
            url,
            fit: BoxFit.contain,
            errorBuilder: (_, __, ___) => const Icon(
                Icons.broken_image_outlined,
                color: Colors.white54,
                size: 48),
          ),
        ),
      ),
    );
  }
}
