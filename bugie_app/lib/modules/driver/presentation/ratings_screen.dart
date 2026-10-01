import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/widgets/bugie_internal_header.dart';
import '../../trips/data/trips_repository.dart';
import '../../trips/domain/rating_model.dart';

/// Pantalla "Mis calificaciones" del conductor.
/// Lista paginada con scroll infinito de las calificaciones recibidas.
/// Cada item muestra: estrellas, nombre del pasajero, fecha y comentario opcional.
class DriverRatingsScreen extends StatefulWidget {
  const DriverRatingsScreen({super.key});

  @override
  State<DriverRatingsScreen> createState() => _DriverRatingsScreenState();
}

class _DriverRatingsScreenState extends State<DriverRatingsScreen> {
  static const int _pageSize = 10;
  final List<Rating> _items = [];
  int _page = 1;
  int _total = 0;
  bool _loading = false;
  bool _initialLoading = true;
  bool _hasMore = true;
  String? _error;

  /// Promedio de las estrellas mostradas (para el header).
  /// Mientras no haya cargado, mostramos 0.0 / 0.
  double _avgStars = 0.0;

  @override
  void initState() {
    super.initState();
    _loadPage(reset: true);
  }

  Future<void> _loadPage({bool reset = false}) async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final repo = context.read<TripsRepository>();
      final page = reset ? 1 : _page;
      final res = await repo.getMyRatings(page: page, pageSize: _pageSize);
      if (!mounted) return;
      setState(() {
        if (reset) {
          _items.clear();
        }
        _items.addAll(res.items);
        _page = page + 1;
        _total = res.total;
        _hasMore = res.hasMore;
        _avgStars = _items.isEmpty
            ? 0.0
            : _items.map((r) => r.stars).reduce((a, b) => a + b) / _items.length;
        _loading = false;
        _initialLoading = false;
      });
    } catch (e) {
      if (mounted) setState(() {
        _error = 'No se pudieron cargar tus calificaciones.';
        _loading = false;
        _initialLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const BugieInternalHeader(title: 'Mis calificaciones'),
      body: _initialLoading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(_error!,
                            style: const TextStyle(color: BugieColors.danger)),
                        const SizedBox(height: 12),
                        ElevatedButton(
                          onPressed: () => _loadPage(reset: true),
                          child: const Text('Reintentar'),
                        ),
                      ],
                    ),
                  ),
                )
              : RefreshIndicator(
                  onRefresh: () => _loadPage(reset: true),
                  child: ListView.separated(
                    padding: const EdgeInsets.all(12),
                    physics: const AlwaysScrollableScrollPhysics(),
                    itemCount: _items.length + 2, // +1 header, +1 footer
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (_, i) {
                      // Header con resumen
                      if (i == 0) return _Summary(avg: _avgStars, total: _total);

                      // Footer: botón "Cargar más" o mensaje
                      if (i == _items.length + 1) {
                        if (_items.isEmpty) {
                          return const Padding(
                            padding: EdgeInsets.symmetric(vertical: 32),
                            child: Center(
                              child: Text(
                                'Aún no tienes calificaciones.',
                                style: TextStyle(color: BugieColors.textMuted),
                              ),
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
                                      width: 16, height: 16,
                                      child: CircularProgressIndicator(strokeWidth: 2))
                                  : const Icon(Icons.expand_more, size: 18),
                              label: Text(
                                  'Cargar más  (${_items.length} / $_total)'),
                            ),
                          );
                        }
                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          child: Center(
                            child: Text(
                              'Mostrando todas tus calificaciones',
                              style: TextStyle(
                                  color: BugieColors.textMuted, fontSize: 12),
                            ),
                          ),
                        );
                      }

                      // Items
                      return _RatingTile(rating: _items[i - 1]);
                    },
                  ),
                ),
    );
  }
}

/// Header con promedio + total.
class _Summary extends StatelessWidget {
  final double avg;
  final int total;
  const _Summary({required this.avg, required this.total});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            // Estrellas grandes con promedio
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      avg.toStringAsFixed(1),
                      style: const TextStyle(
                          fontSize: 32, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(width: 6),
                    const Icon(Icons.star,
                        color: Color(0xFFFBBF24), size: 28),
                  ],
                ),
                Text(
                  total == 0
                      ? 'Sin calificaciones aún'
                      : '$total calificación${total == 1 ? '' : 'es'} mostradas',
                  style: const TextStyle(
                      color: BugieColors.textMuted, fontSize: 12),
                ),
              ],
            ),
            const Spacer(),
            // Nota: el promedio aquí es de las calificaciones cargadas en esta
            // pantalla. El promedio "real" del conductor (que ve el admin) está
            // en Driver.Rating y se calcula con TODAS las calificaciones
            // históricas. Si querés mostrar ese, hace un endpoint extra.
          ],
        ),
      ),
    );
  }
}

/// Item individual de calificación.
class _RatingTile extends StatelessWidget {
  final Rating rating;
  const _RatingTile({required this.rating});

  @override
  Widget build(BuildContext context) {
    final date =
        DateFormat('dd MMM yyyy, HH:mm', 'es_PE').format(rating.createdAt);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                // Estrellas
                for (int s = 1; s <= 5; s++)
                  Icon(
                    s <= rating.stars ? Icons.star : Icons.star_border,
                    color: const Color(0xFFFBBF24),
                    size: 18,
                  ),
                const SizedBox(width: 8),
                Text(
                  '${rating.stars}/5',
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(Icons.person_outline,
                    size: 14, color: BugieColors.textMuted),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    rating.passengerName,
                    style: const TextStyle(fontSize: 13),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Text(
                  date,
                  style: const TextStyle(
                      fontSize: 12, color: BugieColors.textMuted),
                ),
              ],
            ),
            if (rating.comment != null && rating.comment!.isNotEmpty) ...[
              const SizedBox(height: 8),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: const Color(0xFFF8FAFC),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  rating.comment!,
                  style: const TextStyle(fontSize: 13),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
