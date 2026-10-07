import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/widgets/empty_state.dart';
import '../../../core/widgets/negotiation/action_buttons.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/widgets/bugie_internal_header.dart';
import '../../../core/widgets/schedule_picker.dart';
import '../../../core/widgets/service_badge.dart';
import '../../trips/data/trips_repository.dart';
import '../../trips/domain/trip_model.dart';

/// "Programados" del conductor: viajes y envíos programados que ya aceptó,
/// ordenados por hora. No cuentan como viaje activo hasta que faltan 30 min
/// (puede seguir haciendo viajes normales). Cuando llega su momento aparece
/// el botón "Iniciar", que lleva a la pantalla del viaje en curso.
class DriverScheduledScreen extends StatefulWidget {
  /// true cuando se abre como ruta suelta (/driver/scheduled), con flecha atrás.
  final bool showBack;
  const DriverScheduledScreen({super.key, this.showBack = false});

  @override
  State<DriverScheduledScreen> createState() => _DriverScheduledScreenState();
}

class _DriverScheduledScreenState extends State<DriverScheduledScreen> {
  List<Trip> _items = [];
  bool _loading = true;
  String? _error;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _load();
    // Refresca para que el botón "Iniciar" aparezca cuando llegue la hora.
    _timer = Timer.periodic(const Duration(seconds: 30), (_) => _load());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final list = await context.read<TripsRepository>().getScheduled();
      // Solo los que tiene asignados (aceptados), por hora.
      final mine = list
          .where((t) => t.status == TripStatus.accepted && t.scheduledAt != null)
          .toList()
        ..sort((a, b) => a.scheduledAt!.compareTo(b.scheduledAt!));
      if (mounted) {
        setState(() {
          _items = mine;
          _loading = false;
          _error = null;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() { _loading = false; _error = e.message; });
    } catch (_) {
      if (mounted) setState(() { _loading = false; _error = 'No se pudo cargar tus programados.'; });
    }
  }

  void _start(Trip t) {
    context.push('/driver/trip-in-progress').then((_) {
      if (mounted) _load();
    });
  }

  Future<void> _cancel(Trip t) async {
    final noun = t.isDelivery ? 'envío' : 'viaje';
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text('Cancelar el $noun programado'),
        content: Text('Avisaremos al ${t.isDelivery ? 'cliente' : 'pasajero'} que cancelaste.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('No')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: BugieColors.danger),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Sí, cancelar'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      final after = await context.read<TripsRepository>()
          .cancel(t.id, reason: 'El conductor canceló el programado');
      // Antes de su hora el programado no se cancela: vuelve a buscar
      // conductor (ya no es mío) y sale de la lista al recargar.
      if (mounted && after != null && after.driverId == null) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text(
                'Cancelaste el viaje programado; se buscará otro conductor.')));
      }
      await _load();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Scaffold(
      backgroundColor: c.bg,
      appBar: BugieInternalHeader(
        title: 'Programados',
        showBack: widget.showBack,
        leadingIcon: widget.showBack ? null : Icons.event,
      ),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : RefreshIndicator(
                onRefresh: _load,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                  children: [
                    if (_error != null) ...[
                      Text(_error!, style: const TextStyle(color: BugieColors.danger)),
                      const SizedBox(height: 8),
                    ],
                    const InfoNote(
                      text: 'Tus programados no te bloquean: puedes seguir haciendo viajes normales. '
                          'Podrás iniciar cada uno desde 30 minutos antes de su hora.',
                    ),
                    const SizedBox(height: 16),
                    if (_items.isEmpty)
                      const EmptyState(
                        icon: Icons.event_available_outlined,
                        title: 'Sin programados por ahora',
                        message:
                            'Cuando aceptes un viaje o envío programado, aparecerá aquí con su fecha y hora.',
                      )
                    else
                      for (final t in _items) ...[
                        _ScheduledCard(
                          trip: t,
                          onStart: () => _start(t),
                          onCancel: () => _cancel(t),
                        ),
                        const SizedBox(height: 12),
                      ],
                  ],
                ),
              ),
      ),
    );
  }
}

class _ScheduledCard extends StatelessWidget {
  final Trip trip;
  final VoidCallback onStart;
  final VoidCallback onCancel;
  const _ScheduledCard({required this.trip, required this.onStart, required this.onCancel});

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final at = trip.scheduledAt!;
    final ready = trip.scheduledActive;
    final from = at.subtract(const Duration(minutes: 30));
    final fromText =
        '${from.hour.toString().padLeft(2, '0')}:${from.minute.toString().padLeft(2, '0')}';

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Flexible(child: ScheduledBadge(at: at)),
                const SizedBox(width: 6),
                ServiceBadge(isDelivery: trip.isDelivery, compact: true),
                const Spacer(),
                Text('S/ ${trip.estimatedFare.toStringAsFixed(2)}',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: c.text)),
              ],
            ),
            if ((trip.passengerName ?? '').isNotEmpty) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  Icon(Icons.person, size: 16, color: c.textMuted),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(trip.passengerName!,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontWeight: FontWeight.w600, color: c.text)),
                  ),
                ],
              ),
            ],
            if (trip.isDelivery && (trip.packageDescription ?? '').isNotEmpty) ...[
              const SizedBox(height: 4),
              Text('Paquete: ${trip.packageDescription}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 13, color: c.text)),
            ],
            const SizedBox(height: 8),
            _Line(color: BugieColors.mapOrigin, text: trip.originAddress),
            const SizedBox(height: 4),
            _Line(color: BugieColors.mapDestination, text: trip.destAddress),
            const SizedBox(height: 10),
            // "Cancelar" (contorno rojo) junto a "Iniciar", mismo alto (46).
            Row(
              children: [
                Expanded(
                  flex: 2,
                  child: SecondaryActionButton(
                    label: 'Cancelar',
                    color: BugieColors.danger,
                    onPressed: onCancel,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  flex: 3,
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      minimumSize: const Size(0, 46),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 10),
                    ),
                    onPressed: ready ? onStart : null,
                    icon: const Icon(Icons.play_arrow, size: 18),
                    label: Text(ready ? 'Iniciar' : 'Desde las $fromText',
                        maxLines: 1, overflow: TextOverflow.ellipsis),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Line extends StatelessWidget {
  final Color color;
  final String text;
  const _Line({required this.color, required this.text});

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
