import 'dart:async';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/services/geocoding_service.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/widgets/bugie_internal_header.dart';
import '../../../core/widgets/bugie_map.dart';
import '../data/favorites_repository.dart';
import '../domain/favorite_address_model.dart';

/// Vista para crear/editar una dirección favorita.
/// Estilo "solicitar viaje": el mapa ocupa toda la pantalla y las acciones
/// van en un panel inferior deslizable. El pin arranca en la ubicación actual.
class AddressEditorScreen extends StatefulWidget {
  final FavoriteAddress? edit;
  const AddressEditorScreen({super.key, this.edit});

  @override
  State<AddressEditorScreen> createState() => _AddressEditorScreenState();
}

class _AddressEditorScreenState extends State<AddressEditorScreen> {
  final _labelCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  final _searchCtrl = TextEditingController();

  GeoResult? _picked; // ubicación elegida (con lat/lng)
  LatLng? _pinCoord;
  String _icon = 'home';
  bool _saving = false;
  bool _locating = true; // obteniendo GPS inicial
  String? _error;

  List<GeoResult> _suggestions = [];
  bool _searching = false;
  Timer? _debounce;

  static const _iconChoices = [
    {'key': 'home', 'icon': Icons.home, 'label': 'Casa'},
    {'key': 'work', 'icon': Icons.work, 'label': 'Trabajo'},
    {'key': 'school', 'icon': Icons.school, 'label': 'Universidad'},
    {'key': 'shopping-cart', 'icon': Icons.shopping_cart, 'label': 'Compras'},
    {'key': 'fitness', 'icon': Icons.fitness_center, 'label': 'Gimnasio'},
    {'key': 'restaurant', 'icon': Icons.restaurant, 'label': 'Restaurante'},
    {'key': 'local_hospital', 'icon': Icons.local_hospital, 'label': 'Hospital'},
    {'key': 'heart', 'icon': Icons.favorite, 'label': 'Favorito'},
    {'key': 'star', 'icon': Icons.star, 'label': 'Importante'},
    {'key': 'location_on', 'icon': Icons.location_on, 'label': 'Otro'},
  ];

  @override
  void initState() {
    super.initState();
    final e = widget.edit;
    if (e != null) {
      _labelCtrl.text = e.label;
      _descCtrl.text = e.description ?? '';
      _icon = e.icon;
      _searchCtrl.text = e.address;
      _picked = GeoResult(displayName: e.address, lat: e.lat, lng: e.lng);
      _pinCoord = LatLng(e.lat, e.lng);
      _locating = false;
    } else {
      _initFromGps();
    }
  }

  /// Arranca el pin en la ubicación actual del celular.
  Future<void> _initFromGps() async {
    try {
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.denied ||
          perm == LocationPermission.deniedForever) {
        if (mounted) {
          setState(() {
            _locating = false;
            _pinCoord = BugieMap.fallbackCenter;
          });
        }
        return;
      }
      final pos = await Geolocator.getCurrentPosition();
      final coord = LatLng(pos.latitude, pos.longitude);
      if (!mounted) return;
      setState(() {
        _pinCoord = coord;
        _locating = false;
      });
      _reverseInto(coord);
    } catch (_) {
      if (mounted) {
        setState(() {
          _locating = false;
          _pinCoord = BugieMap.fallbackCenter;
        });
      }
    }
  }

  /// Reverse-geocode del punto -> deja la dirección lista para guardar.
  Future<void> _reverseInto(LatLng pos) async {
    setState(() {
      _picked = GeoResult(
          displayName: 'Ubicación marcada en el mapa',
          lat: pos.latitude,
          lng: pos.longitude);
    });
    try {
      final addr = await GeocodingService().reverse(pos.latitude, pos.longitude);
      if (mounted && addr.trim().isNotEmpty) {
        setState(() {
          _picked = GeoResult(
              displayName: addr, lat: pos.latitude, lng: pos.longitude);
          _searchCtrl.text = addr;
        });
      }
    } catch (_) {}
  }

  void _onMapTap(LatLng pos) {
    setState(() {
      _pinCoord = pos;
      _suggestions = [];
    });
    _reverseInto(pos);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _labelCtrl.dispose();
    _descCtrl.dispose();
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _search(String q) async {
    if (q.trim().length < 3) {
      setState(() => _suggestions = []);
      return;
    }
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () async {
      setState(() => _searching = true);
      try {
        final results = await GeocodingService().search(q);
        if (mounted) setState(() => _suggestions = results);
      } catch (_) {
        // si falla el geocoder, no rompemos la UX
      } finally {
        if (mounted) setState(() => _searching = false);
      }
    });
  }

  Future<void> _save() async {
    setState(() => _error = null);
    if (_labelCtrl.text.trim().isEmpty) {
      setState(() => _error = 'La etiqueta es obligatoria.');
      return;
    }
    if (_picked == null) {
      setState(() =>
          _error = 'Marca un punto en el mapa o busca una dirección.');
      return;
    }
    setState(() => _saving = true);
    try {
      final repo = context.read<FavoritesRepository>();
      if (widget.edit != null) {
        await repo.updateAddress(
          id: widget.edit!.id,
          label: _labelCtrl.text.trim(),
          icon: _icon,
          address: _picked!.displayName,
          lat: _picked!.lat,
          lng: _picked!.lng,
          description:
              _descCtrl.text.trim().isEmpty ? null : _descCtrl.text.trim(),
        );
      } else {
        await repo.addAddress(
          label: _labelCtrl.text.trim(),
          icon: _icon,
          address: _picked!.displayName,
          lat: _picked!.lat,
          lng: _picked!.lng,
          description:
              _descCtrl.text.trim().isEmpty ? null : _descCtrl.text.trim(),
        );
      }
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'No se pudo guardar.');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Scaffold(
      backgroundColor: c.bg,
      appBar: BugieInternalHeader(
          title: widget.edit != null ? 'Editar dirección' : 'Nueva dirección'),
      body: SafeArea(
        child: Stack(
          children: [
            // ── Mapa a pantalla completa ─────────────────────────────
            Positioned.fill(
              child: _locating
                  ? const Center(child: CircularProgressIndicator())
                  : BugieMap(
                      height: double.infinity,
                      center: _pinCoord ?? BugieMap.fallbackCenter,
                      zoom: 16,
                      markers: _pinCoord != null
                          ? [
                              BugieMarker(
                                  position: _pinCoord!,
                                  kind: MarkerKind.destination)
                            ]
                          : const [],
                      onMapTap: _onMapTap,
                      // "Centrar mapa" encuadra solo el pin elegido.
                      fitIncludesMyLocation: false,
                      controlsBottomOffset:
                          MediaQuery.of(context).size.height * 0.40 + 16,
                    ),
            ),

            // ── Panel inferior con las acciones ──────────────────────
            DraggableScrollableSheet(
              initialChildSize: 0.42,
              minChildSize: 0.18,
              maxChildSize: 0.88,
              builder: (ctx, scrollCtrl) {
                return Container(
                  decoration: BoxDecoration(
                    color: c.surface,
                    borderRadius:
                        const BorderRadius.vertical(top: Radius.circular(20)),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.08),
                        blurRadius: 12,
                        offset: const Offset(0, -2),
                      ),
                    ],
                  ),
                  child: ListView(
                    controller: scrollCtrl,
                    padding: const EdgeInsets.fromLTRB(16, 10, 16, 20),
                    children: [
                      // Handle
                      Center(
                        child: Container(
                          width: 40,
                          height: 4,
                          decoration: BoxDecoration(
                            color: c.border,
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),

                      // Dirección detectada del pin
                      Row(
                        children: [
                          const Icon(Icons.place,
                              color: BugieColors.mapDestination, size: 18),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              _picked?.displayName ??
                                  'Toca el mapa para marcar la ubicación',
                              style: TextStyle(
                                  fontWeight: FontWeight.w600, color: c.text),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),

                      // Buscador (opcional, para relocalizar el pin)
                      TextField(
                        controller: _searchCtrl,
                        decoration: InputDecoration(
                          labelText: 'Buscar dirección',
                          hintText: 'Empieza a escribir...',
                          prefixIcon: const Icon(Icons.search),
                          border: const OutlineInputBorder(),
                          isDense: true,
                          suffixIcon: _searching
                              ? const Padding(
                                  padding: EdgeInsets.all(12),
                                  child: SizedBox(
                                      width: 18,
                                      height: 18,
                                      child: CircularProgressIndicator(
                                          strokeWidth: 2)),
                                )
                              : null,
                        ),
                        onChanged: _search,
                      ),
                      if (_suggestions.isNotEmpty)
                        Container(
                          margin: const EdgeInsets.only(top: 4),
                          decoration: BoxDecoration(
                            border: Border.all(color: c.border),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Column(
                            children: _suggestions.map((s) {
                              return ListTile(
                                dense: true,
                                leading: const Icon(Icons.place, size: 18),
                                title: Text(s.shortAddress,
                                    style: const TextStyle(fontSize: 13)),
                                subtitle: Text(s.displayName,
                                    style: const TextStyle(fontSize: 11),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis),
                                onTap: () {
                                  setState(() {
                                    _picked = s;
                                    _pinCoord = LatLng(s.lat, s.lng);
                                    _searchCtrl.text = s.displayName;
                                    _suggestions = [];
                                  });
                                },
                              );
                            }).toList(),
                          ),
                        ),
                      const SizedBox(height: 12),

                      // Etiqueta
                      TextField(
                        controller: _labelCtrl,
                        decoration: const InputDecoration(
                          labelText: 'Etiqueta',
                          hintText: 'Casa, Trabajo, etc.',
                          prefixIcon: Icon(Icons.label),
                          border: OutlineInputBorder(),
                          isDense: true,
                          counterText: '',
                        ),
                        maxLength: 60,
                      ),
                      const SizedBox(height: 12),

                      // Descripción (opcional)
                      TextField(
                        controller: _descCtrl,
                        decoration: const InputDecoration(
                          labelText: 'Descripción (opcional)',
                          hintText: 'Ej. Portón azul, 2do piso...',
                          prefixIcon: Icon(Icons.notes),
                          border: OutlineInputBorder(),
                          isDense: true,
                          counterText: '',
                        ),
                        maxLength: 120,
                      ),
                      const SizedBox(height: 12),

                      // Ícono
                      Text('Ícono',
                          style: TextStyle(
                              fontWeight: FontWeight.w600, color: c.text)),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: _iconChoices.map((choice) {
                          final isSelected = _icon == choice['key'];
                          return GestureDetector(
                            onTap: () => setState(
                                () => _icon = choice['key'] as String),
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 12, vertical: 8),
                              decoration: BoxDecoration(
                                color: isSelected
                                    ? BugieColors.primary.withOpacity(0.15)
                                    : c.bg2,
                                borderRadius: BorderRadius.circular(20),
                                border: Border.all(
                                  color: isSelected
                                      ? BugieColors.primary
                                      : Colors.transparent,
                                  width: 2,
                                ),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(choice['icon'] as IconData,
                                      size: 18,
                                      color: isSelected
                                          ? BugieColors.primary
                                          : c.textMuted),
                                  const SizedBox(width: 6),
                                  Text(choice['label'] as String,
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: isSelected
                                            ? BugieColors.primary
                                            : c.text,
                                      )),
                                ],
                              ),
                            ),
                          );
                        }).toList(),
                      ),

                      if (_error != null) ...[
                        const SizedBox(height: 12),
                        Text(_error!,
                            style: const TextStyle(
                                color: Colors.red, fontSize: 13)),
                      ],

                      const SizedBox(height: 18),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              onPressed:
                                  _saving ? null : () => Navigator.pop(context),
                              child: const Text('Cancelar'),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: ElevatedButton(
                              onPressed: _saving ? null : _save,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: BugieColors.primary,
                                foregroundColor: Colors.white,
                              ),
                              child: _saving
                                  ? const SizedBox(
                                      width: 18,
                                      height: 18,
                                      child: CircularProgressIndicator(
                                          strokeWidth: 2, color: Colors.white))
                                  : const Text('Guardar'),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
