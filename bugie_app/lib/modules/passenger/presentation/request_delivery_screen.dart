import 'dart:async';
import 'package:flutter/material.dart';
import 'dart:io';
import 'package:image_picker/image_picker.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/services/default_location_service.dart';
import '../../../core/services/geocoding_service.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/widgets/bugie_map.dart';
import '../../trips/data/trips_repository.dart';
import '../../trips/domain/route_model.dart';
import '../../trips/domain/trip_model.dart';
import '../../favorites/data/favorites_repository.dart';
import '../../favorites/domain/favorite_address_model.dart';
import '../../../core/widgets/bugie_internal_header.dart';

/// Pantalla "Solicitar envío" — clon de Solicitar Viaje (por ahora igual) de la del web (RequestRide.tsx).
/// Soporta: autocomplete con Nominatim, paradas, mapa con tiles claros,
/// ruta real calculada por el backend, tarifa estimada y métodos de pago.
class RequestDeliveryScreen extends StatefulWidget {
  const RequestDeliveryScreen({super.key});

  @override
  State<RequestDeliveryScreen> createState() => _RequestDeliveryScreenState();
}

/// Cuál input está "activo" (recibe el siguiente click del mapa).
sealed class _Active {
  const _Active();
}
class _ActiveOrigin   extends _Active { const _ActiveOrigin(); }
class _ActiveDest     extends _Active { const _ActiveDest(); }
class _ActiveWaypoint extends _Active { final int index; const _ActiveWaypoint(this.index); }

class _Waypoint {
  String address;
  LatLng? coord;
  _Waypoint({this.address = '', this.coord});
}

class _RequestDeliveryScreenState extends State<RequestDeliveryScreen> {
  final _geocoding = GeocodingService();

  // Origen / destino
  String _originText = '';
  String _destText = '';
  LatLng? _originCoord;
  LatLng? _destCoord;
  final List<_Waypoint> _waypoints = [];

  // Pago
  String _payment = 'cash';

  // Sugerencias autocomplete
  List<GeoResult> _originSugg = [];
  List<GeoResult> _destSugg = [];
  final Map<int, List<GeoResult>> _wpSugg = {};

  // Cuál input está activo (para click en mapa)
  _Active _active = const _ActiveOrigin();

  // Info de ruta calculada por el backend
  RouteInfo? _routeInfo;
  bool _calculatingRoute = false;

  // Ubicación inicial del mapa
  LatLng? _mapCenter;
  double _mapZoom = 14;
  bool _loadingLocation = true;

  // ── Direcciones favoritas (atajos del destino) ─────────────────────────
  // Las cargamos al entrar. Si carga, se muestran como chips arriba del
  // campo de destino. Si falla, no rompemos la UX — solo no se muestran.
  List<FavoriteAddress> _favoriteAddresses = [];

  // Submit
  bool _submitting = false;

  // ---- Datos del paquete (envío) ----
  final _pkgDescCtrl = TextEditingController();
  final _pkgWeightCtrl = TextEditingController();
  final _pkgDetailsCtrl = TextEditingController();
  bool _pkgFragile = false;
  final List<XFile> _pkgPhotos = [];

  Future<void> _pickPackagePhotos() async {
    final imgs = await ImagePicker().pickMultiImage(imageQuality: 70);
    if (imgs.isNotEmpty) setState(() => _pkgPhotos.addAll(imgs));
  }

  Widget _photoThumb(int i) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: Image.file(File(_pkgPhotos[i].path),
              width: 72, height: 72, fit: BoxFit.cover),
        ),
        Positioned(
          top: -8, right: -8,
          child: GestureDetector(
            onTap: () => setState(() => _pkgPhotos.removeAt(i)),
            child: const CircleAvatar(
              radius: 11, backgroundColor: Colors.red,
              child: Icon(Icons.close, size: 14, color: Colors.white),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildPackageSection(BuildContext context) {
    final c = context.bugie;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(BugieRadius.md),
        border: Border.all(color: c.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Datos del paquete', style: BugieText.h3.copyWith(color: c.text)),
          const SizedBox(height: 4),
          Text('Sube fotos y describe lo que enviaras.',
              style: TextStyle(color: c.textMuted, fontSize: 13)),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8, runSpacing: 8,
            children: [
              for (int i = 0; i < _pkgPhotos.length; i++) _photoThumb(i),
              InkWell(
                onTap: _pickPackagePhotos,
                borderRadius: BorderRadius.circular(10),
                child: Container(
                  width: 72, height: 72,
                  decoration: BoxDecoration(
                    color: c.inputFill,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: c.inputBorder),
                  ),
                  child: Icon(Icons.add_a_photo_outlined, color: c.textMuted),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _pkgDescCtrl,
            decoration: const InputDecoration(labelText: 'Descripcion del paquete'),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _pkgWeightCtrl,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(labelText: 'Peso (kg)'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text('Fragil', style: TextStyle(color: c.text)),
                  value: _pkgFragile,
                  onChanged: (v) => setState(() => _pkgFragile = v),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _pkgDetailsCtrl,
            maxLines: 2,
            decoration: const InputDecoration(
                labelText: 'Detalles / condiciones (opcional)'),
          ),
        ],
      ),
    );
  }
  String? _error;

  // Tarifa propuesta por el pasajero. Se prellena con la sugerida del sistema,
  // pero el usuario puede editarla. Se envía al backend como `estimatedFare`.
  final TextEditingController _proposedFareCtrl = TextEditingController();
  /// True si el usuario editó manualmente el input. Si está activo, no
  /// sobrescribimos cuando recalculamos la tarifa sugerida.
  bool _userEditedFare = false;
  /// Última tarifa sugerida que prellenó el input. Sirve para saber
  /// si el usuario realmente la cambió.
  double? _lastSuggestedFare;

  // Debounce de geocoding
  final Map<String, Timer> _timers = {};

  @override
  void initState() {
    super.initState();
    _loadInitialLocation();
    _loadFavorites();
  }

  /// Carga las direcciones favoritas en background. Si falla, la lista
  /// queda vacía y la sección de chips no aparece — no rompe el flujo.
  Future<void> _loadFavorites() async {
    try {
      final favs = await context.read<FavoritesRepository>().getAddresses();
      if (mounted) setState(() => _favoriteAddresses = favs);
    } catch (_) {
      // Sin favoritos = no se muestran chips. No es un error que mostrar.
    }
  }

  /// Cuando el usuario toca un chip de favorito, lo aplicamos como destino.
  /// Es exactamente el mismo flujo que cuando elige una sugerencia del autocomplete.
  void _selectFavoriteAsDest(FavoriteAddress fav) {
    setState(() {
      _destText = fav.address;
      _destCoord = LatLng(fav.lat, fav.lng);
      _destSugg = [];
    });
    _recalculateRoute();
  }

  @override
  void dispose() {
    for (final t in _timers.values) {
      t.cancel();
    }
    _proposedFareCtrl.dispose();
    super.dispose();
  }

  /// Carga: 1) settings del backend, 2) GPS del usuario.
  /// Si el GPS responde, también pinea el origen automáticamente (con reverse
  /// geocoding para tener una dirección legible). El usuario puede sobreescribir
  /// tocando el mapa o tipeando en el input.
  Future<void> _loadInitialLocation() async {
    // 1. Default del backend
    final defLoc = await context.read<DefaultLocationService>().get();
    if (!mounted) return;
    setState(() {
      _mapCenter = defLoc.center;
      _mapZoom = defLoc.zoom;
    });

    // 2. GPS del usuario (si lo permite)
    try {
      final perm = await Geolocator.checkPermission();
      LocationPermission p = perm;
      if (p == LocationPermission.denied) {
        p = await Geolocator.requestPermission();
      }
      if (p == LocationPermission.denied ||
          p == LocationPermission.deniedForever) {
        if (mounted) setState(() => _loadingLocation = false);
        return;
      }
      final pos = await Geolocator.getCurrentPosition();
      final coord = LatLng(pos.latitude, pos.longitude);

      // Reverse geocoding para obtener una dirección legible.
      // Si falla, usamos "Mi ubicación actual" como texto por defecto.
      String address = 'Mi ubicación actual';
      try {
        final reversed = await _geocoding.reverse(coord.latitude, coord.longitude);
        if (reversed.isNotEmpty) address = reversed;
      } catch (_) {}

      if (!mounted) return;
      setState(() {
        _mapCenter = coord;
        _loadingLocation = false;

        // Auto-setear origen SOLO si el usuario no ha empezado a interactuar
        // con el campo origen todavía. Esto evita pisar lo que esté tipeando.
        if (_originCoord == null && _originText.isEmpty) {
          _originCoord = coord;
          _originText = address;
          // Como el origen ya está listo, cambiar el foco al destino para
          // que el siguiente click en el mapa caiga en ese campo.
          _active = const _ActiveDest();
        }
      });
    } catch (_) {
      if (mounted) setState(() => _loadingLocation = false);
    }
  }

  // ── Autocomplete ──────────────────────────────────────────────────────

  void _debounce(String key, Future<void> Function() fn) {
    _timers[key]?.cancel();
    _timers[key] = Timer(const Duration(milliseconds: 400), () async {
      await fn();
    });
  }

  void _onOriginTextChanged(String v) {
    setState(() {
      _originText = v;
      _originCoord = null;
    });
    if (v.length < 3) {
      setState(() => _originSugg = []);
      return;
    }
    _debounce('origin', () async {
      final res = await _geocoding.search(v);
      if (mounted) setState(() => _originSugg = res);
    });
  }

  void _onDestTextChanged(String v) {
    setState(() {
      _destText = v;
      _destCoord = null;
    });
    if (v.length < 3) {
      setState(() => _destSugg = []);
      return;
    }
    _debounce('dest', () async {
      final res = await _geocoding.search(v);
      if (mounted) setState(() => _destSugg = res);
    });
  }

  void _onWaypointTextChanged(int i, String v) {
    setState(() {
      _waypoints[i].address = v;
      _waypoints[i].coord = null;
    });
    if (v.length < 3) {
      setState(() => _wpSugg[i] = []);
      return;
    }
    _debounce('wp$i', () async {
      final res = await _geocoding.search(v);
      if (mounted) setState(() => _wpSugg[i] = res);
    });
  }

  void _selectOrigin(GeoResult r) {
    setState(() {
      _originText = r.shortAddress;
      _originCoord = LatLng(r.lat, r.lng);
      _originSugg = [];
      _active = const _ActiveDest();
    });
    _recalculateRoute();
  }

  void _selectDest(GeoResult r) {
    setState(() {
      _destText = r.shortAddress;
      _destCoord = LatLng(r.lat, r.lng);
      _destSugg = [];
    });
    _recalculateRoute();
  }

  void _selectWaypoint(int i, GeoResult r) {
    setState(() {
      _waypoints[i].address = r.shortAddress;
      _waypoints[i].coord = LatLng(r.lat, r.lng);
      _wpSugg[i] = [];
    });
    _recalculateRoute();
  }

  void _addWaypoint() {
    setState(() {
      _waypoints.add(_Waypoint());
      _active = _ActiveWaypoint(_waypoints.length - 1);
    });
  }

  void _removeWaypoint(int i) {
    setState(() {
      _waypoints.removeAt(i);
      _wpSugg.remove(i);
    });
    _recalculateRoute();
  }

  // ── Click en el mapa ──────────────────────────────────────────────────

  Future<void> _onMapTap(LatLng pos) async {
    final rev = await _geocoding.reverse(pos.latitude, pos.longitude);
    // Al tocar el mapa sí dejamos coords como respaldo si el reverse falla,
    // porque el usuario eligió ese punto explícitamente.
    final shortAddr = rev.isNotEmpty
        ? rev
        : '${pos.latitude.toStringAsFixed(5)}, ${pos.longitude.toStringAsFixed(5)}';

    setState(() {
      switch (_active) {
        case _ActiveOrigin():
          _originCoord = pos;
          _originText = shortAddr;
          _originSugg = [];
          _active = const _ActiveDest();
          break;
        case _ActiveDest():
          _destCoord = pos;
          _destText = shortAddr;
          _destSugg = [];
          break;
        case _ActiveWaypoint(:final index):
          if (index < _waypoints.length) {
            _waypoints[index].coord = pos;
            _waypoints[index].address = shortAddr;
            _wpSugg[index] = [];
          }
          break;
      }
    });
    _recalculateRoute();
  }

  // ── Ruta y tarifa ─────────────────────────────────────────────────────

  Future<void> _recalculateRoute() async {
    if (_originCoord == null || _destCoord == null) {
      setState(() => _routeInfo = null);
      return;
    }

    setState(() => _calculatingRoute = true);
    try {
      final repo = context.read<TripsRepository>();
      RouteInfo info;
      final wpCoords = _waypoints
          .where((w) => w.coord != null)
          .map((w) => w.coord!)
          .toList();

      if (wpCoords.isEmpty) {
        info = await repo.getRoute(
          originLat: _originCoord!.latitude,
          originLng: _originCoord!.longitude,
          destLat: _destCoord!.latitude,
          destLng: _destCoord!.longitude,
        );
      } else {
        info = await repo.getRouteWithWaypoints([
          _originCoord!,
          ...wpCoords,
          _destCoord!,
        ]);
      }
      if (mounted) {
        setState(() {
          _routeInfo = info;
          _syncProposedFareWithSuggested();
        });
      }
    } catch (_) {
      if (mounted) setState(() => _routeInfo = null);
    } finally {
      if (mounted) setState(() => _calculatingRoute = false);
    }
  }

  /// Tarifa estimada igual al web: max(5, km * 1.5).
  double? get _fare {
    if (_routeInfo == null || _routeInfo!.options.isEmpty) return null;
    final km = _routeInfo!.options.first.distanceKm;
    final fare = (km * 1.5);
    final r = fare < 5 ? 5.0 : fare;
    return double.parse(r.toStringAsFixed(2));
  }

  /// Mínimo permitido: 50% del estimado del sistema.
  double? get _minFare {
    if (_fare == null) return null;
    return double.parse((_fare! * 0.5).toStringAsFixed(2));
  }

  /// Lo que el usuario tipeó en el input de propuesta (puede ser null).
  double? get _proposedFareValue {
    final raw = _proposedFareCtrl.text.replaceAll(',', '.').trim();
    if (raw.isEmpty) return null;
    return double.tryParse(raw);
  }

  /// True si la propuesta actual es válida para enviar.
  bool get _isProposedFareValid {
    final v = _proposedFareValue;
    if (v == null || v <= 0) return false;
    if (_minFare != null && v < _minFare!) return false;
    return true;
  }

  /// Llamado cada vez que cambia la tarifa sugerida (al recalcular ruta).
  /// Prellena el input con la sugerida la primera vez. Si el usuario ya editó
  /// manualmente, no sobrescribe.
  void _syncProposedFareWithSuggested() {
    final f = _fare;
    if (f == null) return;
    if (!_userEditedFare) {
      _proposedFareCtrl.text = f.toStringAsFixed(2);
    }
    _lastSuggestedFare = f;
  }

  // ── Submit ─────────────────────────────────────────────────────────────

  Future<void> _submit() async {
    if (_originCoord == null || _destCoord == null) {
      setState(() => _error = 'Marca origen y destino.');
      return;
    }
    // Validar la tarifa propuesta
    final fareToSend = _proposedFareValue;
    if (fareToSend == null || fareToSend <= 0) {
      setState(() => _error = 'Ingresa una tarifa válida.');
      return;
    }
    if (_minFare != null && fareToSend < _minFare!) {
      setState(() =>
          _error = 'La tarifa mínima permitida es S/ ${_minFare!.toStringAsFixed(2)}.');
      return;
    }
    // Envío: validar datos mínimos del paquete.
    if (_pkgPhotos.isEmpty) {
      setState(() => _error = 'Agrega al menos una foto del paquete.');
      return;
    }
    if (_pkgDescCtrl.text.trim().isEmpty) {
      setState(() => _error = 'Describe el paquete.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final repo = context.read<TripsRepository>();
      final trip = await repo.create(
        originAddress: _originText,
        originLat: _originCoord!.latitude,
        originLng: _originCoord!.longitude,
        destAddress: _destText,
        destLat: _destCoord!.latitude,
        destLng: _destCoord!.longitude,
        estimatedFare: fareToSend,
        paymentMethod: _payment,
        waypoints: _waypoints
            .where((w) => w.coord != null)
            .map((w) => Waypoint(
                  address: w.address,
                  lat: w.coord!.latitude,
                  lng: w.coord!.longitude,
                ))
            .toList(),
        isDelivery: true,
        packageDescription: _pkgDescCtrl.text.trim(),
        packageWeightKg:
            double.tryParse(_pkgWeightCtrl.text.trim().replaceAll(',', '.')),
        packageIsFragile: _pkgFragile,
        packageDetails: _pkgDetailsCtrl.text.trim().isEmpty
            ? null
            : _pkgDetailsCtrl.text.trim(),
      );
      // Subir las fotos del paquete al envío recién creado.
      await repo.uploadPackagePhotos(
          trip.id, _pkgPhotos.map((x) => x.path).toList());
      if (!mounted) return;
      context.go('/passenger/tracking');
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'No se pudo crear el viaje.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  // ── UI ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    if (_loadingLocation && _mapCenter == null) {
      return Scaffold(
        appBar: const BugieInternalHeader(title: 'Solicitar envío'),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final markers = <BugieMarker>[
      if (_originCoord != null)
        BugieMarker(position: _originCoord!, kind: MarkerKind.origin),
      ..._waypoints.where((w) => w.coord != null).toList().asMap().entries.map(
            (e) => BugieMarker(
              position: e.value.coord!,
              kind: MarkerKind.waypoint,
              waypointIndex: e.key,
            ),
          ),
      if (_destCoord != null)
        BugieMarker(position: _destCoord!, kind: MarkerKind.destination),
    ];

    // Ruta principal: la primera opción del backend
    List<LatLng> routePoints = [];
    List<List<LatLng>> altRoutes = [];
    if (_routeInfo != null && _routeInfo!.options.isNotEmpty) {
      routePoints = _routeInfo!.options.first.coordinates;
      altRoutes = _routeInfo!.options.skip(1).map((o) => o.coordinates).toList();
    }

    return Scaffold(
      appBar: const BugieInternalHeader(title: 'Solicitar envío'),
      // El cuerpo es Stack: mapa de fondo + panel deslizable arriba.
      body: SafeArea(
        child: Stack(
          children: [
            // Mapa que ocupa toda la pantalla
            Positioned.fill(
              child: BugieMap(
                center: _mapCenter,
                zoom: _mapZoom,
                height: double.infinity,
                markers: markers,
                route: routePoints,
                alternativeRoutes: altRoutes,
                onMapTap: _onMapTap,
                fitBoundsOnMarkers: false, // panel cubre la parte de abajo
                // Botones (zoom +/- y centrar) por encima del panel deslizable.
                controlsBottomOffset:
                    MediaQuery.of(context).size.height * 0.42 + 16,
              ),
            ),

            // Spinner si está calculando ruta
            if (_calculatingRoute)
              Positioned(
                top: 12,
                left: 0, right: 0,
                child: Center(
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.black87,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        SizedBox(
                          width: 12, height: 12,
                          child: CircularProgressIndicator(
                              color: Colors.white, strokeWidth: 2),
                        ),
                        SizedBox(width: 8),
                        Text('Calculando ruta…',
                            style: TextStyle(
                                color: Colors.white, fontSize: 12)),
                      ],
                    ),
                  ),
                ),
              ),

            // Indicador del input activo (esquina superior derecha del mapa)
            Positioned(
              top: 12,
              right: 12,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: context.bugie.surface,
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: const [
                    BoxShadow(
                      color: Colors.black26, blurRadius: 4, offset: Offset(0, 2)),
                  ],
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.touch_app, size: 14, color: BugieColors.textMuted),
                    const SizedBox(width: 4),
                    Text('Click → ${_activeLabel()}',
                        style: const TextStyle(fontSize: 11)),
                  ],
                ),
              ),
            ),

            // Panel inferior deslizable (DraggableScrollableSheet)
            DraggableScrollableSheet(
              initialChildSize: 0.42,
              minChildSize: 0.16,
              maxChildSize: 0.92,
              builder: (context, scrollCtrl) => Container(
                decoration: BoxDecoration(
                  color: context.bugie.surface,
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
                  boxShadow: const [
                    BoxShadow(color: Colors.black26, blurRadius: 10),
                  ],
                ),
                child: ListView(
                  controller: scrollCtrl,
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                  children: [
                    // Manija
                    Center(
                      child: Container(
                        width: 40, height: 4,
                        margin: const EdgeInsets.only(bottom: 12),
                        decoration: BoxDecoration(
                          color: context.bugie.border,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),

                    if (_error != null) ...[
                      Container(
                        padding: const EdgeInsets.all(10),
                        margin: const EdgeInsets.only(bottom: 10),
                        decoration: BoxDecoration(
                          color: Colors.red.shade50,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(_error!,
                            style: const TextStyle(
                                color: BugieColors.danger, fontSize: 13)),
                      ),
                    ],

                    // Origen
                    _AddressField(
                      label: 'Origen',
                      color: BugieColors.mapOrigin,
                      value: _originText,
                      hasCoord: _originCoord != null,
                      suggestions: _originSugg,
                      onChanged: _onOriginTextChanged,
                      onSelected: _selectOrigin,
                      onFocus: () => setState(() => _active = const _ActiveOrigin()),
                    ),

                    // Paradas
                    ..._waypoints.asMap().entries.map((e) {
                      final i = e.key;
                      final wp = e.value;
                      return Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Container(
                                  width: 10, height: 10,
                                  decoration: const BoxDecoration(
                                      color: BugieColors.mapWaypoint,
                                      shape: BoxShape.circle),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text('Parada ${i + 1}',
                                      style: const TextStyle(fontSize: 13)),
                                ),
                                IconButton(
                                  icon: const Icon(Icons.close, size: 18),
                                  visualDensity: VisualDensity.compact,
                                  onPressed: () => _removeWaypoint(i),
                                ),
                              ],
                            ),
                            _AddressField(
                              label: '',
                              color: BugieColors.mapWaypoint,
                              value: wp.address,
                              hasCoord: wp.coord != null,
                              suggestions: _wpSugg[i] ?? const [],
                              onChanged: (v) => _onWaypointTextChanged(i, v),
                              onSelected: (r) => _selectWaypoint(i, r),
                              onFocus: () => setState(() => _active = _ActiveWaypoint(i)),
                            ),
                          ],
                        ),
                      );
                    }),

                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      icon: const Icon(Icons.add, size: 18),
                      label: const Text('Agregar parada'),
                      onPressed: _addWaypoint,
                    ),

                    const SizedBox(height: 12),

                    // ── Atajos: direcciones favoritas ──────────────────
                    // Solo se muestran si el usuario ya tiene direcciones
                    // guardadas (no aparece para usuarios nuevos sin favoritos).
                    if (_favoriteAddresses.isNotEmpty) ...[
                      Row(
                        children: [
                          Icon(Icons.favorite,
                              size: 14, color: Colors.red.shade400),
                          const SizedBox(width: 6),
                          const Text('Tus favoritos',
                              style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600)),
                        ],
                      ),
                      const SizedBox(height: 6),
                      SizedBox(
                        height: 36,
                        child: ListView.separated(
                          scrollDirection: Axis.horizontal,
                          itemCount: _favoriteAddresses.length,
                          separatorBuilder: (_, __) => const SizedBox(width: 6),
                          itemBuilder: (_, i) {
                            final fav = _favoriteAddresses[i];
                            final iconData = _favIconFor(fav.icon);
                            return ActionChip(
                              avatar: Icon(iconData,
                                  size: 16, color: BugieColors.primary),
                              label: Text(fav.label,
                                  style: const TextStyle(fontSize: 12)),
                              backgroundColor:
                                  BugieColors.primary.withOpacity(0.08),
                              onPressed: () => _selectFavoriteAsDest(fav),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(20),
                                side: BorderSide(
                                    color:
                                        BugieColors.primary.withOpacity(0.25)),
                              ),
                            );
                          },
                        ),
                      ),
                      const SizedBox(height: 10),
                    ],

                    // Destino
                    _AddressField(
                      label: 'Destino',
                      color: BugieColors.mapDestination,
                      value: _destText,
                      hasCoord: _destCoord != null,
                      suggestions: _destSugg,
                      onChanged: _onDestTextChanged,
                      onSelected: _selectDest,
                      onFocus: () => setState(() => _active = const _ActiveDest()),
                    ),
                    const SizedBox(height: 14),

                    // Método de pago
                    const Text('Método de pago',
                        style: TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 6),
                    SegmentedButton<String>(
                      segments: const [
                        ButtonSegment(value: 'cash', label: Text('Efectivo')),
                        ButtonSegment(value: 'yape', label: Text('Yape')),
                        ButtonSegment(value: 'plin', label: Text('Plin')),
                      ],
                      selected: {_payment},
                      onSelectionChanged: (s) =>
                          setState(() => _payment = s.first),
                    ),
                    const SizedBox(height: 14),

                    // Tarifa estimada + input "Tu propuesta"
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: context.bugie.surface,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: context.bugie.border),
                      ),
                      child: _fare == null
                          ? const Row(
                              children: [
                                Icon(Icons.route, size: 16, color: BugieColors.textMuted),
                                SizedBox(width: 6),
                                Expanded(
                                  child: Text(
                                      'Marca origen y destino para ver la tarifa',
                                      style: TextStyle(
                                          color: BugieColors.textMuted,
                                          fontSize: 12)),
                                ),
                              ],
                            )
                          : Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                // Línea 1: tarifa sugerida + km/min
                                Row(
                                  children: [
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          const Text('Tarifa sugerida',
                                              style: TextStyle(
                                                  fontSize: 11,
                                                  color: BugieColors.textMuted)),
                                          Text('S/ ${_fare!.toStringAsFixed(2)}',
                                              style: const TextStyle(
                                                  fontSize: 18,
                                                  fontWeight: FontWeight.bold)),
                                          if (_routeInfo!.isFallback)
                                            const Text('Distancia aproximada',
                                                style: TextStyle(
                                                    color: Colors.orange,
                                                    fontSize: 10)),
                                        ],
                                      ),
                                    ),
                                    Column(
                                      crossAxisAlignment: CrossAxisAlignment.end,
                                      children: [
                                        Text(
                                            '${_routeInfo!.options.first.distanceKm.toStringAsFixed(1)} km',
                                            style: const TextStyle(
                                                color: BugieColors.textMuted,
                                                fontSize: 12)),
                                        Text(
                                            '${_routeInfo!.options.first.durationMinutes.round()} min',
                                            style: const TextStyle(
                                                fontSize: 12,
                                                fontWeight: FontWeight.w600)),
                                      ],
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 12),
                                const Divider(height: 1),
                                const SizedBox(height: 12),

                                // Línea 2: input editable "Tu propuesta"
                                Row(
                                  children: const [
                                    Text('Tu propuesta',
                                        style: TextStyle(
                                            fontSize: 13,
                                            fontWeight: FontWeight.w600)),
                                    Text(' *',
                                        style: TextStyle(
                                            color: BugieColors.danger,
                                            fontWeight: FontWeight.bold)),
                                  ],
                                ),
                                const SizedBox(height: 6),
                                TextField(
                                  controller: _proposedFareCtrl,
                                  keyboardType:
                                      const TextInputType.numberWithOptions(
                                          decimal: true),
                                  onChanged: (_) {
                                    setState(() {
                                      // Marca como "editado por el usuario"
                                      // si difiere de la sugerida actual.
                                      final v = _proposedFareValue;
                                      if (v == null || _lastSuggestedFare == null) {
                                        _userEditedFare = true;
                                      } else {
                                        _userEditedFare =
                                            v != _lastSuggestedFare;
                                      }
                                    });
                                  },
                                  decoration: InputDecoration(
                                    prefixText: 'S/ ',
                                    isDense: true,
                                    hintText: _fare!.toStringAsFixed(2),
                                    border: OutlineInputBorder(
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    errorText: (!_isProposedFareValid &&
                                            _proposedFareCtrl.text.isNotEmpty)
                                        ? (_minFare != null
                                            ? 'Mínimo S/ ${_minFare!.toStringAsFixed(2)}'
                                            : 'Tarifa inválida')
                                        : null,
                                  ),
                                ),
                                if (_minFare != null) ...[
                                  const SizedBox(height: 4),
                                  Row(
                                    children: [
                                      const Icon(Icons.info_outline,
                                          size: 12,
                                          color: BugieColors.textMuted),
                                      const SizedBox(width: 4),
                                      Text(
                                        'Mínimo permitido: S/ ${_minFare!.toStringAsFixed(2)}',
                                        style: const TextStyle(
                                            fontSize: 11,
                                            color: BugieColors.textMuted),
                                      ),
                                    ],
                                  ),
                                ],
                                const SizedBox(height: 6),
                                const Text(
                                  'Los conductores podrán aceptar tu propuesta o enviarte una contrapropuesta.',
                                  style: TextStyle(
                                      fontSize: 11,
                                      color: BugieColors.textMuted),
                                ),
                              ],
                            ),
                    ),
                    const SizedBox(height: 14),

                    // Botón confirmar
                    _buildPackageSection(context),
                    const SizedBox(height: 14),
                    ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 16),
                      ),
                      onPressed: (_submitting ||
                              _originCoord == null ||
                              _destCoord == null ||
                              _fare == null ||
                              !_isProposedFareValid)
                          ? null
                          : _submit,
                      icon: _submitting
                          ? const SizedBox(
                              width: 18, height: 18,
                              child: CircularProgressIndicator(
                                  color: Colors.white, strokeWidth: 2))
                          : const Icon(Icons.directions_car),
                      label: Text(
                          _submitting ? 'Buscando conductor…' : 'Solicitar envío',
                          style: const TextStyle(fontSize: 16)),
                    ),
                    const SizedBox(height: 12),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _activeLabel() {
    return switch (_active) {
      _ActiveOrigin() => 'Origen',
      _ActiveDest() => 'Destino',
      _ActiveWaypoint(:final index) => 'Parada ${index + 1}',
    };
  }

  /// Convierte el string del icono guardado en BD (ej. "home", "work") al
  /// IconData de Material. Usa el mismo mapeo que la pantalla de favoritos
  /// para que la apariencia sea consistente entre listado y chips.
  IconData _favIconFor(String icon) {
    switch (icon) {
      case 'home':              return Icons.home;
      case 'work':
      case 'briefcase':         return Icons.work;
      case 'school':
      case 'graduation-cap':    return Icons.school;
      case 'shopping-cart':     return Icons.shopping_cart;
      case 'fitness':           return Icons.fitness_center;
      case 'restaurant':        return Icons.restaurant;
      case 'local_hospital':    return Icons.local_hospital;
      case 'heart':             return Icons.favorite;
      case 'star':              return Icons.star;
      case 'location_on':
      default:                  return Icons.location_on;
    }
  }
}

/// Campo de dirección con autocomplete (sugerencias de Nominatim).
class _AddressField extends StatelessWidget {
  final String label;
  final Color color;
  final String value;
  final bool hasCoord;
  final List<GeoResult> suggestions;
  final void Function(String) onChanged;
  final void Function(GeoResult) onSelected;
  final VoidCallback onFocus;

  const _AddressField({
    required this.label,
    required this.color,
    required this.value,
    required this.hasCoord,
    required this.suggestions,
    required this.onChanged,
    required this.onSelected,
    required this.onFocus,
  });

  @override
  Widget build(BuildContext context) {
    final controller = TextEditingController(text: value)
      ..selection = TextSelection.fromPosition(
        TextPosition(offset: value.length),
      );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (label.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Row(
              children: [
                Container(
                  width: 10, height: 10,
                  decoration: BoxDecoration(color: color, shape: BoxShape.circle),
                ),
                const SizedBox(width: 8),
                Text(label, style: const TextStyle(fontSize: 13)),
              ],
            ),
          ),
        TextField(
          controller: controller,
          onChanged: onChanged,
          onTap: onFocus,
          decoration: InputDecoration(
            hintText: 'Escribe una dirección…',
            isDense: true,
            suffixIcon: hasCoord
                ? const Icon(Icons.check_circle, color: BugieColors.success, size: 20)
                : null,
          ),
        ),
        if (suggestions.isNotEmpty)
          Container(
            margin: const EdgeInsets.only(top: 4),
            decoration: BoxDecoration(
              color: context.bugie.surface,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: context.bugie.border),
            ),
            constraints: const BoxConstraints(maxHeight: 200),
            child: ListView.separated(
              shrinkWrap: true,
              itemCount: suggestions.length,
              separatorBuilder: (_, __) =>
                  const Divider(height: 1, indent: 36),
              itemBuilder: (_, i) {
                final r = suggestions[i];
                return InkWell(
                  onTap: () => onSelected(r),
                  child: Padding(
                    padding: const EdgeInsets.all(10),
                    child: Row(
                      children: [
                        Icon(Icons.location_on, size: 16, color: color),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            r.displayName.split(',').take(3).join(','),
                            style: const TextStyle(fontSize: 13),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
      ],
    );
  }
}