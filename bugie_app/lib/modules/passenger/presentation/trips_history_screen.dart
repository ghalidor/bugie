import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:go_router/go_router.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/utils/auto_refresh.dart';
import '../../trips/data/trips_repository.dart';
import '../../trips/domain/incident_model.dart';
import '../../trips/domain/rating_model.dart';
import '../../trips/domain/trip_model.dart';
import '../../favorites/data/favorites_repository.dart';
import '../../../core/widgets/bugie_internal_header.dart';
import '../../../core/widgets/service_badge.dart';
import '../../../core/widgets/schedule_picker.dart';

/// Historial de viajes del pasajero con opción de reportar/ver incidencias.
/// Misma lógica que el conductor — el backend distingue rol automáticamente
/// usando el JWT del usuario, así que el mismo endpoint sirve para los dos.
class PassengerTripsScreen extends StatefulWidget {
  /// 0 = viaje, 1 = envío.
  final int serviceType;
  const PassengerTripsScreen({super.key, this.serviceType = 0});

  @override
  State<PassengerTripsScreen> createState() => _PassengerTripsScreenState();
}

class _PassengerTripsScreenState extends State<PassengerTripsScreen>
    with AutoRefreshOnReturn {
  /// Tamaño de página: cuántos viajes se muestran por carga.
  static const int _pageSize = 10;

  /// Lista COMPLETA de viajes que devolvió el backend.
  /// La pantalla solo renderiza los primeros [_visibleCount].
  List<Trip> _trips = [];
  /// Cuántos viajes están actualmente visibles. Empieza en [_pageSize] y
  /// crece de [_pageSize] en [_pageSize] cada vez que tocan "Ver más".
  int _visibleCount = _pageSize;
  /// Map tripId → incidencia propia del pasajero (null si no la reportó).
  Map<String, Incident?> _myIncidents = {};
  /// Map tripId → calificación del pasajero al conductor (null si no calificó).
  /// El historial se carga en paralelo a las incidencias para mostrar las
  /// estrellas en la card del viaje.
  Map<String, Rating?> _myRatings = {};
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  /// Recarga sola al volver a la pantalla o al reanudar la app. Conserva
  /// cuántos viajes estaban visibles ("Ver más").
  @override
  Future<void> onAutoRefresh() => _load(keepVisible: true);

  Future<void> _load({bool keepVisible = false}) async {
    try {
      final repo = context.read<TripsRepository>();
      final all = await repo.getHistory();
      final list =
          all.where((t) => t.serviceType == widget.serviceType).toList();
      if (!mounted) return;

      // Orden: 1) buscando conductor (pending), 2) en curso (accepted/inProgress),
      // 3) terminados (completado/cancelado). Dentro de cada grupo, más reciente primero.
      int orderKey(int status) {
        // 0 = necesita acción (buscando conductor / negociando tarifa)
        if (status == TripStatus.pending ||
            status == TripStatus.negotiating) return 0;
        // 1 = en curso (aceptado / en curso / SOS)
        if (status == TripStatus.accepted ||
            status == TripStatus.inProgress ||
            status == TripStatus.sosActive) return 1;
        // 2 = terminados (completado / cancelado)
        return 2;
      }
      list.sort((a, b) {
        final ka = orderKey(a.status), kb = orderKey(b.status);
        if (ka != kb) return ka.compareTo(kb);
        return b.createdAt.compareTo(a.createdAt);
      });

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

      // Ratings: una sola llamada batch para todos los viajes completados.
      // Antes hacía N requests en paralelo, ahora 1 sola.
      final completedIds = list
          .where((t) => t.status == TripStatus.completed)
          .map((t) => t.id)
          .toList();
      final ratings = completedIds.isEmpty
          ? <String, Rating?>{}
          : await repo
              .getRatingsByTrips(completedIds)
              .catchError((_) => <String, Rating?>{});

      if (!mounted) return;
      setState(() {
        _trips = list;
        _myIncidents = inc;
        _myRatings = ratings;
        if (!keepVisible) _visibleCount = _pageSize;   // reset al refrescar
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// Abre el modal de calificación. Solo se permite si el viaje está completado
  /// y aún no fue calificado.
  Future<void> _openRatingModal(Trip trip) async {
    final result = await showModalBottomSheet<Rating>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _RatingSheet(trip: trip),
    );
    if (result != null && mounted) {
      setState(() => _myRatings[trip.id] = result);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('¡Gracias por calificar!')),
      );
    }
  }

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

  /// Al tocar una card:
  /// - En curso (buscando/en camino/en curso) -> seguimiento (re-entra al
  ///   viaje activo, donde se negocia precio y se ve al conductor).
  /// - Terminado (completado/cancelado) -> detalle SOLO LECTURA.
  void _openTrip(Trip t) {
    // Solo los TERMINADOS (completado/cancelado) van al detalle de solo lectura.
    // Todo lo demás (buscando, NEGOCIANDO, aceptado, en curso, SOS) va a
    // seguimiento, donde el pasajero puede contraproponer, cancelar y ver al
    // conductor. (El bug era que 'negociando'=7 caía al detalle bloqueado.)
    final terminated = t.status == TripStatus.completed ||
        t.status == TripStatus.cancelled;
    if (terminated) {
      context.push('/passenger/trip-detail', extra: t);
    } else {
      context.push('/passenger/tracking');
    }
  }

  @override
  Widget build(BuildContext context) {
    final totalTrips = _trips.length;
    final visibleTrips = totalTrips <= _visibleCount
        ? _trips
        : _trips.sublist(0, _visibleCount);
    final hasMore = totalTrips > _visibleCount;

    return Scaffold(
      appBar: BugieInternalHeader(
          title: widget.serviceType == 1 ? 'Mis envíos' : 'Mis viajes',
          showBack: false,
          leadingIcon: serviceIcon(widget.serviceType == 1)),
      body: SafeArea(
        child: Column(
          children: [
            // Botón para guardar / gestionar direcciones (abre el modal en
            // la pantalla de direcciones guardadas).
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
              child: SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: () => context.push('/passenger/favorites'),
                  icon: const Icon(Icons.bookmark_add_outlined, size: 18),
                  label: const Text('Direcciones guardadas'),
                ),
              ),
            ),
            Expanded(
              child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _trips.isEmpty
                ? Center(
                    child: Text(
                        widget.serviceType == 1
                            ? 'Aún no tienes envíos'
                            : 'Aún no tienes viajes',
                        style: TextStyle(color: BugieColors.textMuted)))
                : RefreshIndicator(
                    onRefresh: _load,
                    child: ListView.separated(
                      padding: const EdgeInsets.fromLTRB(12, 12, 12, 32),
                      // +1 al final si hay más para mostrar el botón "Ver más"
                      itemCount: visibleTrips.length + (hasMore ? 1 : 0),
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (_, i) {
                        // Último item = botón "Ver más" si quedan páginas
                        if (i == visibleTrips.length && hasMore) {
                          return _LoadMoreButton(
                            shownCount: visibleTrips.length,
                            totalCount: totalTrips,
                            onTap: () {
                              setState(() {
                                _visibleCount = (_visibleCount + _pageSize)
                                    .clamp(0, totalTrips);
                              });
                            },
                          );
                        }
                        final t = visibleTrips[i];
                        return _TripCard(
                          trip: t,
                          incident: _myIncidents[t.id],
                          rating: _myRatings[t.id],
                          onIncidentTap: () => _openIncidentModal(t),
                          onRatingTap: () => _openRatingModal(t),
                          onTap: () => _openTrip(t),
                        );
                      },
                    ),
                  ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Card del viaje (pasajero): muestra botón de incidencia solo si terminó.
// ─────────────────────────────────────────────────────────────────────────

class _TripCard extends StatelessWidget {
  final Trip trip;
  final Incident? incident;
  final Rating? rating;
  final VoidCallback onIncidentTap;
  final VoidCallback onRatingTap;
  final VoidCallback onTap;

  const _TripCard({
    required this.trip,
    required this.incident,
    required this.rating,
    required this.onIncidentTap,
    required this.onRatingTap,
    required this.onTap,
  });

  static Color _statusColor(int s) {
    if (s == TripStatus.completed) return BugieColors.success;
    if (s == TripStatus.cancelled) return BugieColors.danger;
    if (s == TripStatus.pending) return BugieColors.primary;
    return BugieColors.info; // accepted / inProgress
  }

  static IconData _statusIcon(int s, bool isDelivery) {
    if (s == TripStatus.completed) return Icons.check_circle;
    if (s == TripStatus.cancelled) return Icons.cancel;
    if (s == TripStatus.pending) return Icons.search;
    return serviceIcon(isDelivery);
  }

  @override
  Widget build(BuildContext context) {
    final isComp = trip.status == TripStatus.completed;
    final color = _statusColor(trip.status);
    final date = DateFormat('dd MMM yyyy, HH:mm', 'es_PE').format(trip.createdAt);
    final canReport = trip.status == TripStatus.completed ||
        trip.status == TripStatus.cancelled;
    final hasIncident = incident != null;

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
                  child: Text(TripStatus.labelForPassenger(trip.status),
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: color, fontWeight: FontWeight.bold)),
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
            // Programado: para cuándo era.
            if (trip.scheduledAt != null) ...[
              const SizedBox(height: 6),
              ScheduledBadge(
                  at: trip.scheduledAt!, compact: true, forLabel: true),
            ],
            // Envío: qué paquete se mandó.
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
            Row(
              children: [
                const Icon(Icons.trip_origin,
                    size: 14, color: BugieColors.primary),
                const SizedBox(width: 6),
                Expanded(
                    child: Text(trip.originAddress,
                        maxLines: 1, overflow: TextOverflow.ellipsis)),
              ],
            ),
            Row(
              children: [
                const Icon(Icons.location_on,
                    size: 14, color: BugieColors.mapDestination),
                const SizedBox(width: 6),
                Expanded(
                    child: Text(trip.destAddress,
                        maxLines: 1, overflow: TextOverflow.ellipsis)),
              ],
            ),
            const SizedBox(height: 4),
            Text(date,
                style: const TextStyle(
                    fontSize: 12, color: BugieColors.textMuted)),

            // Botón de incidencia: solo en viajes terminados.
            if (canReport) ...[
              const SizedBox(height: 10),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: onIncidentTap,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: hasIncident
                        ? const Color(0xFFB45309)
                        : BugieColors.primary,
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
              // Botón calificar: solo en viajes COMPLETED.
              // Si ya calificó, muestra las estrellas en lugar del botón.
              if (isComp) ...[
                const SizedBox(height: 8),
                if (rating != null)
                  // Ya calificó: muestra las estrellas en un container suave.
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 10),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFEF3C7),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: const Color(0xFFFBBF24)),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.check_circle,
                            color: Color(0xFFB45309), size: 16),
                        const SizedBox(width: 6),
                        const Text(
                          'Tu calificación:',
                          style: TextStyle(
                              color: Color(0xFFB45309), fontSize: 13),
                        ),
                        const SizedBox(width: 6),
                        // Pintamos las 5 estrellas: llenas hasta rating.stars,
                        // vacías el resto.
                        for (int s = 1; s <= 5; s++)
                          Icon(
                            s <= rating!.stars
                                ? Icons.star
                                : Icons.star_border,
                            color: const Color(0xFFFBBF24),
                            size: 16,
                          ),
                      ],
                    ),
                  )
                else
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: onRatingTap,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFFB45309),
                        side: const BorderSide(color: Color(0xFFFBBF24)),
                      ),
                      icon: const Icon(Icons.star_outline, size: 18),
                      label: const Text('Calificar al conductor'),
                    ),
                  ),
              ],
            ],
          ],
        ),
      ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Modal de incidencia (idéntico al del conductor).
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

    return Padding(
      padding: EdgeInsets.only(
        left: 16, right: 16, top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
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
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFB45309).withOpacity(0.08),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                    color: const Color(0xFFB45309).withOpacity(0.3)),
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
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Botón "Ver más" para paginar. Aparece al final de la lista solo cuando
// hay más viajes que los mostrados actualmente. Cada toque agrega 10 más.
// ─────────────────────────────────────────────────────────────────────────

class _LoadMoreButton extends StatelessWidget {
  final int shownCount;
  final int totalCount;
  final VoidCallback onTap;

  const _LoadMoreButton({
    required this.shownCount,
    required this.totalCount,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: OutlinedButton.icon(
        onPressed: onTap,
        icon: const Icon(Icons.expand_more, size: 18),
        label: Text('Ver más  ($shownCount / $totalCount)'),
        style: OutlinedButton.styleFrom(
          padding: const EdgeInsets.symmetric(vertical: 12),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Modal de calificación: 5 estrellas tappables + comentario opcional.
// Se invoca cuando el pasajero toca "Calificar al conductor" en un viaje
// completado que aún no calificó.
// ─────────────────────────────────────────────────────────────────────────

class _RatingSheet extends StatefulWidget {
  final Trip trip;
  const _RatingSheet({required this.trip});

  @override
  State<_RatingSheet> createState() => _RatingSheetState();
}

class _RatingSheetState extends State<_RatingSheet> {
  int _stars = 0;            // 0 = aún no eligió, 1..5 elegidas
  final _ctrl = TextEditingController();
  bool _sending = false;
  String? _error;

  // ── Estado de favorito del conductor (corazón en el modal) ─────────────
  // Si el viaje no tiene driverId (raro), el corazón no se muestra.
  // Carga inicial: preguntamos al backend si ya está marcado como favorito.
  bool _isFavorite = false;
  bool _favLoaded = false;     // false = todavía estamos cargando
  bool _favToggling = false;   // true durante el POST/DELETE para evitar dobles clics

  @override
  void initState() {
    super.initState();
    _loadFavoriteState();
  }

  /// Consulta al backend si el conductor está en favoritos.
  /// Si falla (offline, error), dejamos el corazón vacío sin avisar al usuario.
  Future<void> _loadFavoriteState() async {
    final driverUserId = widget.trip.driverId;
    if (driverUserId == null) {
      // Viaje sin conductor asignado: no mostramos corazón.
      setState(() => _favLoaded = true);
      return;
    }
    try {
      final repo = context.read<FavoritesRepository>();
      final isFav = await repo.isFavorite(driverUserId);
      if (mounted) setState(() {
        _isFavorite = isFav;
        _favLoaded  = true;
      });
    } catch (_) {
      if (mounted) setState(() => _favLoaded = true);
    }
  }

  /// Toggle del corazón. Cambia el estado local primero (UX rápida) y luego
  /// llama al backend. Si falla, revierte el estado y muestra snackbar.
  Future<void> _toggleFavorite() async {
    final driverUserId = widget.trip.driverId;
    if (driverUserId == null || _favToggling) return;

    final prev = _isFavorite;
    setState(() {
      _isFavorite = !prev;
      _favToggling = true;
    });

    try {
      final repo = context.read<FavoritesRepository>();
      if (!prev) {
        await repo.addDriver(driverUserId);
      } else {
        await repo.removeDriver(driverUserId);
      }
    } catch (_) {
      // Revertir cambio
      if (mounted) {
        setState(() => _isFavorite = prev);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No se pudo actualizar el favorito.')),
        );
      }
    } finally {
      if (mounted) setState(() => _favToggling = false);
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_stars < 1) {
      setState(() => _error = 'Selecciona al menos 1 estrella.');
      return;
    }
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final repo = context.read<TripsRepository>();
      final r = await repo.rateTrip(
        widget.trip.id,
        _stars,
        _ctrl.text.trim().isEmpty ? null : _ctrl.text.trim(),
      );
      if (mounted) Navigator.of(context).pop(r);
    } on ApiException catch (e) {
      if (mounted) setState(() {
        _error = e.message;
        _sending = false;
      });
    } catch (_) {
      if (mounted) setState(() {
        _error = 'No se pudo enviar la calificación.';
        _sending = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final viewInsets = MediaQuery.of(context).viewInsets;
    return Padding(
      padding: EdgeInsets.only(bottom: viewInsets.bottom),
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: const BoxDecoration(
          color: BugieColors.surface,
          borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Center(
              child: Text(
                'Calificar al conductor',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
            ),
            const SizedBox(height: 4),
            const Center(
              child: Text(
                '¿Cómo fue tu viaje?',
                style: TextStyle(fontSize: 13, color: BugieColors.textMuted),
              ),
            ),
            const SizedBox(height: 16),
            // 5 estrellas tappables. Toque sobre una estrella → la marca y las
            // anteriores. Toque sobre la misma estrella ya seleccionada → no
            // cambia nada (no quitamos para evitar errores accidentales).
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (int s = 1; s <= 5; s++)
                  IconButton(
                    iconSize: 42,
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    onPressed: _sending ? null : () => setState(() => _stars = s),
                    icon: Icon(
                      s <= _stars ? Icons.star : Icons.star_border,
                      color: const Color(0xFFFBBF24),
                    ),
                  ),
              ],
            ),
            if (_stars > 0)
              Center(
                child: Text(
                  _starsLabel(_stars),
                  style: const TextStyle(
                      fontSize: 13, color: BugieColors.textMuted),
                ),
              ),
            const SizedBox(height: 16),

            // ── Marcar como favorito ────────────────────────────────────
            // Solo aparece si:
            //   - El viaje tiene driverId (asignado).
            //   - Ya cargamos el estado inicial (evita parpadeo).
            if (widget.trip.driverId != null && _favLoaded) ...[
              InkWell(
                onTap: _favToggling ? null : _toggleFavorite,
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(
                    color: _isFavorite
                        ? Colors.red.withOpacity(0.08)
                        : Colors.grey.withOpacity(0.05),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: _isFavorite
                          ? Colors.red.withOpacity(0.3)
                          : Colors.grey.withOpacity(0.2),
                    ),
                  ),
                  child: Row(
                    children: [
                      _favToggling
                          ? const SizedBox(
                              width: 20, height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : Icon(
                              _isFavorite ? Icons.favorite : Icons.favorite_border,
                              color: _isFavorite ? Colors.red : Colors.grey.shade600,
                              size: 22,
                            ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _isFavorite
                                  ? 'En tus conductores favoritos'
                                  : 'Marcar como favorito',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: _isFavorite ? Colors.red : Colors.black87,
                              ),
                            ),
                            Text(
                              _isFavorite
                                  ? 'Toca para quitar'
                                  : 'Lo verás destacado en futuros viajes',
                              style: TextStyle(
                                fontSize: 11,
                                color: Colors.grey.shade600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
            ],

            TextField(
              controller: _ctrl,
              maxLines: 3,
              maxLength: 500,
              enabled: !_sending,
              decoration: const InputDecoration(
                labelText: 'Comentario (opcional)',
                hintText: 'Cuéntanos cómo fue tu experiencia...',
                border: OutlineInputBorder(),
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(
                _error!,
                style: const TextStyle(color: BugieColors.danger, fontSize: 13),
              ),
            ],
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: _sending ? null : () => Navigator.of(context).pop(),
                    child: const Text('Cancelar'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: _sending ? null : _submit,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFFFBBF24),
                      foregroundColor: Colors.black87,
                    ),
                    icon: _sending
                        ? const SizedBox(
                            width: 16, height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.send, size: 18),
                    label: const Text('Enviar'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _starsLabel(int n) {
    switch (n) {
      case 1: return 'Muy mal viaje';
      case 2: return 'Regular';
      case 3: return 'Aceptable';
      case 4: return 'Bueno';
      case 5: return '¡Excelente!';
      default: return '';
    }
  }
}
