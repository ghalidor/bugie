import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/utils/auto_refresh.dart';
import '../../trips/data/trips_repository.dart';
import '../../trips/domain/incident_model.dart';
import '../../trips/domain/trip_model.dart';
import '../../../core/widgets/bugie_internal_header.dart';
import '../../../core/widgets/service_badge.dart';
import '../../passenger/presentation/trip_detail_screen.dart';

/// Historial de viajes del conductor con opción de reportar/ver incidencias.
/// Misma lógica que el web bugie-web/driver/Trips.tsx:
///   - Carga el historial.
///   - Pide incidencias propias (una por viaje) para saber si el botón dice
///     "Reportar incidencia" (nunca reportada) o "Ver mi incidencia" (ya existe).
///   - El botón solo aparece en viajes terminados (completed + cancelled).
class DriverTripsScreen extends StatefulWidget {
  const DriverTripsScreen({super.key});

  @override
  State<DriverTripsScreen> createState() => _DriverTripsScreenState();
}

class _DriverTripsScreenState extends State<DriverTripsScreen>
    with AutoRefreshOnReturn {
  List<Trip> _trips = [];
  /// Map tripId → incidencia propia del usuario actual (null si no la ha reportado).
  Map<String, Incident?> _myIncidents = {};
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  Future<void> onAutoRefresh() => _load();

  Future<void> _load() async {
    try {
      final repo = context.read<TripsRepository>();
      final list = await repo.getHistory();
      if (!mounted) return;

      // Pedir incidencias solo de viajes TERMINADOS (donde tiene sentido reportar).
      final terminatedIds = list
          .where((t) =>
              t.status == TripStatus.completed ||
              t.status == TripStatus.cancelled)
          .map((t) => t.id)
          .toList();

      final inc = terminatedIds.isEmpty
          ? <String, Incident?>{}
          : await repo
              .getMyIncidentsByTrips(terminatedIds)
              .catchError((_) => <String, Incident?>{});

      if (!mounted) return;
      setState(() {
        _trips = list;
        _myIncidents = inc;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// Abre el modal de incidencia. Si ya existe, solo muestra la ya reportada
  /// (no se puede editar — misma regla que el web). Si no existe, permite reportar.
  Future<void> _openIncidentModal(Trip trip) async {
    final existing = _myIncidents[trip.id];
    final result = await showModalBottomSheet<Incident>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _IncidentSheet(trip: trip, existing: existing),
    );
    if (result != null && mounted) {
      setState(() => _myIncidents[trip.id] = result);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Incidencia reportada')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const BugieInternalHeader(
          title: 'Mis viajes',
          showBack: false,
          leadingIcon: Icons.directions_car),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _trips.isEmpty
                ? const Center(
                    child: Text('Aún no has hecho viajes',
                        style: TextStyle(color: BugieColors.textMuted)))
                : RefreshIndicator(
                    onRefresh: _load,
                    child: ListView.separated(
                      padding: const EdgeInsets.fromLTRB(12, 12, 12, 32),
                      itemCount: _trips.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (_, i) {
                        final t = _trips[i];
                        return _TripCard(
                          trip: t,
                          incident: _myIncidents[t.id],
                          onIncidentTap: () => _openIncidentModal(t),
                        );
                      },
                    ),
                  ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Card de un viaje. Muestra el botón de incidencia solo si el viaje terminó.
// ─────────────────────────────────────────────────────────────────────────

class _TripCard extends StatelessWidget {
  final Trip trip;
  final Incident? incident;
  final VoidCallback onIncidentTap;

  const _TripCard({
    required this.trip,
    required this.incident,
    required this.onIncidentTap,
  });

  @override
  Widget build(BuildContext context) {
    final isComp = trip.status == TripStatus.completed;
    final color = isComp ? BugieColors.success : BugieColors.textMuted;
    final date = DateFormat('dd MMM yyyy, HH:mm', 'es_PE').format(trip.createdAt);
    // Botón de incidencia solo si el viaje terminó (completed o cancelled).
    final canReport = trip.status == TripStatus.completed ||
        trip.status == TripStatus.cancelled;
    final hasIncident = incident != null;

    return Card(
      clipBehavior: Clip.antiAlias,
      // Tocar la card abre el detalle (con la galería de fotos si es envío).
      child: InkWell(
        onTap: () => Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => TripDetailScreen(trip: trip, viewerIsDriver: true),
        )),
        child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(isComp ? Icons.check_circle : Icons.cancel, color: color),
                const SizedBox(width: 8),
                Flexible(
                  child: Text(TripStatus.labelForDriver(trip.status),
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          color: color, fontWeight: FontWeight.bold)),
                ),
                const SizedBox(width: 6),
                ServiceBadge(isDelivery: trip.isDelivery, compact: true),
                const Spacer(),
                Text(
                  'S/ ${(trip.finalFare ?? trip.estimatedFare).toStringAsFixed(2)}',
                  style: const TextStyle(
                      fontWeight: FontWeight.bold, fontSize: 16),
                ),
              ],
            ),
            // Envío: qué paquete se llevó.
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
                          style: const TextStyle(fontWeight: FontWeight.w600))),
                ],
              ),
            ],
            const SizedBox(height: 8),
            Text(trip.originAddress,
                maxLines: 1, overflow: TextOverflow.ellipsis),
            Text(trip.destAddress,
                maxLines: 1, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 4),
            Text(date,
                style: const TextStyle(
                    fontSize: 12, color: BugieColors.textMuted)),

            // Calificación que dejó el pasajero (solo viajes completados).
            if (isComp && trip.passengerStars != null) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  const Text('Calificación: ',
                      style: TextStyle(
                          fontSize: 13, color: BugieColors.textMuted)),
                  ...List.generate(
                    5,
                    (i) => Icon(
                      i < trip.passengerStars! ? Icons.star : Icons.star_border,
                      size: 16,
                      color: Colors.amber,
                    ),
                  ),
                ],
              ),
            ] else if (isComp) ...[
              const SizedBox(height: 6),
              const Text('El pasajero aún no te calificó',
                  style: TextStyle(
                      fontSize: 12,
                      fontStyle: FontStyle.italic,
                      color: BugieColors.textMuted)),
            ],

            // Botón de incidencia (solo para viajes terminados).
            if (canReport) ...[
              const SizedBox(height: 10),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: onIncidentTap,
                  style: OutlinedButton.styleFrom(
                    foregroundColor:
                        hasIncident ? const Color(0xFFB45309) : BugieColors.primary,
                    side: BorderSide(
                      color: hasIncident
                          ? const Color(0xFFB45309)
                          : BugieColors.primary,
                    ),
                  ),
                  icon: Icon(
                    hasIncident ? Icons.warning_amber : Icons.flag_outlined,
                    size: 18,
                  ),
                  label: Text(
                    hasIncident ? 'Ver mi incidencia' : 'Reportar incidencia',
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Modal de incidencia. Dos modos:
//   - VER: si ya hay una, muestra texto + fecha (no se puede editar).
//   - REPORTAR: si no hay, muestra textarea + botón "Reportar".
// ─────────────────────────────────────────────────────────────────────────

class _IncidentSheet extends StatefulWidget {
  final Trip trip;
  final Incident? existing;
  const _IncidentSheet({required this.trip, required this.existing});

  @override
  State<_IncidentSheet> createState() => _IncidentSheetState();
}

class _IncidentSheetState extends State<_IncidentSheet> {
  final _controller = TextEditingController();
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final text = _controller.text.trim();
    if (text.isEmpty) {
      setState(() => _error = 'Describe brevemente la incidencia.');
      return;
    }
    setState(() { _saving = true; _error = null; });
    try {
      final created = await context
          .read<TripsRepository>()
          .reportIncident(widget.trip.id, text);
      if (mounted) Navigator.pop(context, created);
    } on ApiException catch (e) {
      if (mounted) setState(() { _error = e.message; _saving = false; });
    } catch (_) {
      if (mounted) setState(() {
        _error = 'No se pudo reportar. Intenta de nuevo.';
        _saving = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final existing = widget.existing;
    final isView = existing != null;

    return SafeArea(
      child: Padding(
        // Padding por el teclado; el contenido hace scroll para que los
        // botones nunca queden cortados en pantallas chicas.
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom,
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 20, 16, 20),
          child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                isView ? Icons.warning_amber : Icons.flag_outlined,
                color: isView ? const Color(0xFFB45309) : BugieColors.primary,
              ),
              const SizedBox(width: 8),
              Text(
                isView ? 'Mi incidencia' : 'Reportar incidencia',
                style: const TextStyle(
                    fontSize: 18, fontWeight: FontWeight.bold),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            '${widget.trip.originAddress} → ${widget.trip.destAddress}',
            style: const TextStyle(fontSize: 12, color: BugieColors.textMuted),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 16),

          if (isView) ...[
            // Modo VER: muestra la incidencia ya reportada
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFB45309).withOpacity(0.08),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: const Color(0xFFB45309).withOpacity(0.3)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(existing.description,
                      style: const TextStyle(fontSize: 14)),
                  const SizedBox(height: 8),
                  Text(
                    'Reportado el ${DateFormat('dd MMM yyyy, HH:mm', 'es_PE').format(existing.createdAt)}',
                    style: const TextStyle(
                        fontSize: 11, color: BugieColors.textMuted),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Cerrar'),
              ),
            ),
          ] else ...[
            // Modo REPORTAR: textarea + botón
            const Text(
              'Cuéntanos qué pasó. El equipo de soporte lo revisará.',
              style: TextStyle(fontSize: 13, color: BugieColors.textMuted),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _controller,
              maxLines: 5,
              maxLength: 500,
              decoration: const InputDecoration(
                hintText: 'Describe la situación...',
                border: OutlineInputBorder(),
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 4),
              Text(_error!,
                  style: const TextStyle(
                      fontSize: 12, color: BugieColors.danger)),
            ],
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: _saving ? null : () => Navigator.pop(context),
                    child: const Text('Cancelar'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: ElevatedButton(
                    onPressed: _saving ? null : _submit,
                    child: _saving
                        ? const SizedBox(
                            width: 18, height: 18,
                            child: CircularProgressIndicator(
                                color: Colors.white, strokeWidth: 2),
                          )
                        : const Text('Reportar'),
                  ),
                ),
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
