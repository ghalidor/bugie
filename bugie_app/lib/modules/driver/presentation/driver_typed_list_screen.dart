import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../core/theme/bugie_theme.dart';
import '../../../core/utils/auto_refresh.dart';
import '../../../core/widgets/bugie_internal_header.dart';
import '../../../core/widgets/service_badge.dart';
import '../../../core/widgets/schedule_picker.dart';
import '../../passenger/presentation/trip_detail_screen.dart';
import '../../trips/data/trips_repository.dart';
import '../../trips/domain/trip_model.dart';

/// Lista del conductor filtrada por tipo de servicio (viaje o envío).
///
/// Combina en UNA sola lista:
///   - Solicitudes entrantes (pending, de /trips/pending)   -> arriba.
///   - Sus propios registros (aceptado/en curso/terminado, de /trips/history).
/// Ordenadas por estado: solicitudes -> en curso -> terminados.
///
/// Al tocar una SOLICITUD va al detalle para negociar (/driver/incoming/:id).
/// Los terminados (completado/cancelado) abren el detalle de solo lectura
/// (TripDetailScreen) con la galería de fotos si es envío.
class DriverTypedListScreen extends StatefulWidget {
  /// 0 = viaje, 1 = envío, null = ambos.
  final int? serviceType;
  final String title;
  final IconData icon;

  /// true = solo la lista, sin Scaffold ni cabecera (para incrustarla en
  /// otra pantalla, ej. "Mis viajes y envíos").
  final bool embedded;

  const DriverTypedListScreen({
    super.key,
    required this.serviceType,
    required this.title,
    required this.icon,
    this.embedded = false,
  });

  @override
  State<DriverTypedListScreen> createState() => _DriverTypedListScreenState();
}

class _DriverTypedListScreenState extends State<DriverTypedListScreen>
    with AutoRefreshOnReturn {
  List<Trip> _items = [];
  bool _loading = true;
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    _load();
    // El shell mantiene esta pestaña viva (IndexedStack), así que refrescamos
    // en segundo plano para que las solicitudes nuevas aparezcan sin salir/entrar.
    _pollTimer = Timer.periodic(const Duration(seconds: 5), (_) => _load());
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  @override
  Future<void> onAutoRefresh() => _load();

  Future<void> _load() async {
    try {
      final repo = context.read<TripsRepository>();

      // Dos fuentes: solicitudes disponibles + historial propio del conductor.
      final results = await Future.wait([
        repo.getPending().catchError((_) => <Trip>[]),
        repo.getHistory().catchError((_) => <Trip>[]),
      ]);
      final pending = results[0];
      final history = results[1];

      // Filtramos por tipo (viaje / envío) y unimos evitando duplicados por id.
      final byId = <String, Trip>{};
      for (final t in [...pending, ...history]) {
        if (widget.serviceType == null ||
            t.serviceType == widget.serviceType) {
          byId[t.id] = t;
        }
      }
      final list = byId.values.toList();

      // Orden: 1) solicitudes (pending), 2) en curso (accepted/inProgress),
      // 3) terminados. Dentro de cada grupo, más reciente primero.
      int key(int s) {
        if (s == TripStatus.pending) return 0;
        if (s == TripStatus.accepted || s == TripStatus.inProgress) return 1;
        return 2;
      }
      list.sort((a, b) {
        final ka = key(a.status), kb = key(b.status);
        if (ka != kb) return ka.compareTo(kb);
        return b.createdAt.compareTo(a.createdAt);
      });

      if (mounted) setState(() {
        _items = list;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _openItem(Trip t) {
    final s = t.status;
    if (s == TripStatus.pending || s == TripStatus.negotiating) {
      // Solicitud (nueva o en negociación) -> detalle para negociar/aceptar.
      context.push('/driver/incoming/${t.id}').then((_) {
        if (mounted) _load();
      });
    } else if (s == TripStatus.accepted && t.isFutureScheduled) {
      // Programado aceptado que aún no llega su hora: lista de Programados.
      context.push('/driver/scheduled').then((_) {
        if (mounted) _load();
      });
    } else if (s == TripStatus.accepted ||
        s == TripStatus.inProgress ||
        s == TripStatus.sosActive) {
      // Su viaje/envío activo -> pantalla de viaje en curso.
      context.push('/driver/trip-in-progress').then((_) {
        if (mounted) _load();
      });
    } else if (s == TripStatus.completed || s == TripStatus.cancelled) {
      // Terminados: detalle de solo lectura (fotos, recojo, entrega, motivo).
      Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => TripDetailScreen(trip: t, viewerIsDriver: true),
      ));
    }
  }

  String get _emptyText {
    switch (widget.serviceType) {
      case 0:
        return 'No hay viajes ni solicitudes';
      case 1:
        return 'No hay envíos ni solicitudes';
      default:
        return 'No hay viajes, envíos ni solicitudes';
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final list = _buildList(c);
    if (widget.embedded) return list;
    return Scaffold(
      backgroundColor: c.bg,
      appBar: BugieInternalHeader(
        title: widget.title,
        showBack: false,
        leadingIcon: widget.icon,
      ),
      body: SafeArea(child: list),
    );
  }

  Widget _buildList(BugieColorsExt c) {
    return _loading
            ? const Center(child: CircularProgressIndicator())
            : _items.isEmpty
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(
                        _emptyText,
                        textAlign: TextAlign.center,
                        style: TextStyle(color: c.textMuted),
                      ),
                    ),
                  )
                : RefreshIndicator(
                    onRefresh: _load,
                    child: ListView.separated(
                      padding: const EdgeInsets.fromLTRB(12, 12, 12, 32),
                      itemCount: _items.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (_, i) {
                        final t = _items[i];
                        return _DriverItemCard(
                          trip: t,
                          onTap: () => _openItem(t),
                        );
                      },
                    ),
                  );
  }
}

/// Card de un ítem (viaje/envío) del conductor, con su estado.
class _DriverItemCard extends StatelessWidget {
  final Trip trip;
  final VoidCallback onTap;
  const _DriverItemCard({required this.trip, required this.onTap});

  static Color _statusColor(int s) {
    if (s == TripStatus.completed) return BugieColors.success;
    if (s == TripStatus.cancelled) return BugieColors.danger;
    if (s == TripStatus.sosActive) return BugieColors.danger;
    if (s == TripStatus.pending) return BugieColors.primary;    // solicitud nueva
    if (s == TripStatus.negotiating) return BugieColors.warning; // negociando
    return BugieColors.info; // aceptado / en curso
  }

  static IconData _statusIcon(int s, bool isDelivery) {
    if (s == TripStatus.completed) return Icons.check_circle;
    if (s == TripStatus.cancelled) return Icons.cancel;
    if (s == TripStatus.sosActive) return Icons.emergency;
    if (s == TripStatus.pending) return Icons.notifications_active;
    if (s == TripStatus.negotiating) return Icons.forum; // negociando
    return serviceIcon(isDelivery);
  }

  /// Etiqueta pensada para el conductor.
  static String _statusLabel(int s) {
    switch (s) {
      case TripStatus.pending:
        return 'Solicitud';
      case TripStatus.negotiating:
        return 'Negociando';
      case TripStatus.accepted:
        return 'Aceptado — en camino';
      case TripStatus.inProgress:
        return 'En curso';
      case TripStatus.sosActive:
        return 'SOS activo';
      case TripStatus.completed:
        return 'Completado';
      case TripStatus.cancelled:
        return 'Cancelado';
      default:
        return 'Estado desconocido';
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final color = _statusColor(trip.status);
    final isPending = trip.status == TripStatus.pending ||
        trip.status == TripStatus.negotiating;
    final isFinished = trip.status == TripStatus.completed ||
        trip.status == TripStatus.cancelled;
    final fare = trip.finalFare ?? trip.estimatedFare;

    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(_statusIcon(trip.status, trip.isDelivery), color: color),
                  const SizedBox(width: 8),
                  Flexible(
                    child: Text(
                        trip.status == TripStatus.accepted && trip.isFutureScheduled
                            ? 'Programado — aceptado'
                            : _statusLabel(trip.status),
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            color: color, fontWeight: FontWeight.bold)),
                  ),
                  const SizedBox(width: 6),
                  ServiceBadge(isDelivery: trip.isDelivery, compact: true),
                  const Spacer(),
                  Text('S/ ${fare.toStringAsFixed(2)}',
                      style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                          color: c.text)),
                ],
              ),
              // Envío: qué paquete es (y si es frágil).
              if (trip.isDelivery &&
                  (trip.packageDescription ?? '').trim().isNotEmpty) ...[
                const SizedBox(height: 6),
                Row(
                  children: [
                    const Icon(Icons.inventory_2,
                        size: 14, color: BugieColors.accent),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(trip.packageDescription!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: c.text)),
                    ),
                    if (trip.packageIsFragile) ...[
                      const SizedBox(width: 6),
                      const Text('Frágil',
                          style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: BugieColors.danger)),
                    ],
                  ],
                ),
              ],
              // Programado: fecha y hora del recojo.
              if (trip.scheduledAt != null) ...[
                const SizedBox(height: 6),
                ScheduledBadge(at: trip.scheduledAt!, compact: true),
              ],
              const SizedBox(height: 8),
              _AddressLine(
                  color: BugieColors.mapOrigin,
                  text: trip.originAddress),
              const SizedBox(height: 4),
              _AddressLine(
                  color: BugieColors.mapDestination,
                  text: trip.destAddress),
              if (isPending || isFinished) ...[
                const SizedBox(height: 10),
                Row(
                  children: [
                    Icon(Icons.touch_app, size: 14, color: c.textMuted),
                    const SizedBox(width: 6),
                    Text(
                        isPending
                            ? 'Toca para negociar y aceptar'
                            : 'Toca para ver el detalle',
                        style: TextStyle(fontSize: 12, color: c.textMuted)),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _AddressLine extends StatelessWidget {
  final Color color;
  final String text;
  const _AddressLine({required this.color, required this.text});

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Row(
      children: [
        Container(
          width: 9,
          height: 9,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(text,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 13, color: c.text)),
        ),
      ],
    );
  }
}
