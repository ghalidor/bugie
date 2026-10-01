import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import '../services/default_location_service.dart';
import '../theme/bugie_theme.dart';

/// Tipos de marcador, igual al BugieMap.tsx del web.
enum MarkerKind { origin, destination, waypoint, driver, defaultPin }

class BugieMarker {
  final LatLng position;
  final String? label;
  final MarkerKind kind;
  final int? waypointIndex; // para mostrar P1, P2, ...

  const BugieMarker({
    required this.position,
    this.label,
    this.kind = MarkerKind.defaultPin,
    this.waypointIndex,
  });
}

/// Mapa Bugie usando flutter_map + OpenStreetMap (CARTO Dark Matter).
/// Tiles oscuros con filtro de brillo+contraste para legibilidad.
/// Soporta dibujo de ruta real.
///
/// Si no se pasa `center`, intenta leer la configuración global
/// (DefaultLocationService → /landing/settings) y, si falla, cae a Trujillo.
class BugieMap extends StatefulWidget {
  /// Fallback duro si ni el padre ni el backend dan un centro.
  /// Igual al fallback del web (useMapConfig.ts).
  static final fallbackCenter = LatLng(-8.109052, -79.021534);
  static const double fallbackZoom = 14;

  final LatLng? center;
  final double zoom;
  final List<BugieMarker> markers;

  /// Lista de puntos (en orden) para dibujar la ruta principal.
  /// Si tiene 2+ puntos, se dibuja una polilínea sólida.
  final List<LatLng> route;

  /// Lista de polilíneas alternativas (se dibujan punteadas, en gris).
  final List<List<LatLng>> alternativeRoutes;

  /// Línea de alerta: 2 puntos (conductor → punto más cercano de la ruta)
  /// que se pintan en rojo para indicar visualmente el desvío.
  /// Solo se dibuja si tiene exactamente 2 puntos.
  final List<LatLng> alertLine;

  final void Function(LatLng pos)? onMapTap;
  final double height;

  /// Si true, hace fitBounds automáticamente cuando hay 2+ markers.
  final bool fitBoundsOnMarkers;

  /// Offset desde abajo para la columna de botones (zoom in/out, foco).
  /// Útil cuando un BottomSheet o panel cubre la parte inferior del mapa
  /// y los botones quedan tapados. Default 10px (pegados al fondo).
  final double controlsBottomOffset;

  const BugieMap({
    super.key,
    this.center,
    this.zoom = 14,
    this.markers = const [],
    this.route = const [],
    this.alternativeRoutes = const [],
    this.alertLine = const [],
    this.onMapTap,
    this.height = 320,
    this.fitBoundsOnMarkers = true,
    this.controlsBottomOffset = 10,
  });

  @override
  State<BugieMap> createState() => _BugieMapState();
}

class _BugieMapState extends State<BugieMap> {
  final MapController _controller = MapController();

  /// Centro/zoom resueltos (del padre, del servicio, o fallback).
  LatLng? _resolvedCenter;
  double? _resolvedZoom;

  @override
  void initState() {
    super.initState();
    if (widget.center != null) {
      _resolvedCenter = widget.center;
      _resolvedZoom = widget.zoom;
    } else {
      _loadDefaultFromService();
    }
  }

  /// Lee la configuración del admin (lat/lng/zoom guardados en landing/settings).
  /// Si falla, usa el fallback duro.
  Future<void> _loadDefaultFromService() async {
    try {
      final svc = context.read<DefaultLocationService>();
      final cfg = await svc.get();
      if (!mounted) return;
      setState(() {
        _resolvedCenter = cfg.center;
        _resolvedZoom = cfg.zoom;
      });
    } catch (_) {
      // Sin provider o error de red → fallback.
      if (!mounted) return;
      setState(() {
        _resolvedCenter = BugieMap.fallbackCenter;
        _resolvedZoom = BugieMap.fallbackZoom;
      });
    }
  }

  @override
  void didUpdateWidget(BugieMap old) {
    super.didUpdateWidget(old);
    // Si cambió el centro pasado por el padre, mover el mapa.
    final newCenter = widget.center;
    if (newCenter != null &&
        (old.center?.latitude != newCenter.latitude ||
            old.center?.longitude != newCenter.longitude)) {
      _resolvedCenter = newCenter;
      _resolvedZoom = widget.zoom;
      // Esperar al siguiente frame para evitar conflicto con build.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        try {
          _controller.move(newCenter, widget.zoom);
        } catch (_) {}
      });
    }

    // Hacer fitBounds SOLO si cambia la estructura de los markers o de la ruta.
    // Si solo se movió un marker existente (ej. el conductor por polling),
    // NO re-encuadramos — eso pisaría el zoom/pan que hizo el usuario.
    if (widget.fitBoundsOnMarkers && _structureChanged(old)) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _fitAll());
    }
  }

  /// True si cambió la "topología" del mapa: se agregaron/quitaron markers,
  /// o cambiaron de tipo, o cambió la longitud de la ruta.
  /// Movimientos de un marker existente (mismo tipo, otra posición) NO cuentan
  /// como cambio estructural.
  bool _structureChanged(BugieMap old) {
    // Cambió la cantidad o el tipo de markers
    if (old.markers.length != widget.markers.length) return true;
    for (int i = 0; i < widget.markers.length; i++) {
      if (old.markers[i].kind != widget.markers[i].kind) return true;
    }
    // Cambió la cantidad de puntos de la ruta (ruta nueva o recalculada)
    if (old.route.length != widget.route.length) return true;
    return false;
  }

  void _fitAll() {
    final pts = <LatLng>[
      ...widget.markers.map((m) => m.position),
      ...widget.route,
    ];
    if (pts.isEmpty) return;
    // Un solo punto (ej. la ubicación actual en el inicio): centrar en él
    // manteniendo el zoom actual. Antes esto no hacía nada (requería 2+).
    if (pts.length == 1) {
      _controller.move(pts.first, _controller.camera.zoom);
      return;
    }
    try {
      final bounds = LatLngBounds.fromPoints(pts);
      _controller.fitCamera(
        CameraFit.bounds(
          bounds: bounds,
          padding: const EdgeInsets.all(50),
        ),
      );
    } catch (_) {}
  }

  Color _colorFor(MarkerKind k) {
    switch (k) {
      case MarkerKind.origin:      return BugieColors.mapOrigin;
      case MarkerKind.destination: return BugieColors.mapDestination;
      case MarkerKind.waypoint:    return BugieColors.mapWaypoint;
      case MarkerKind.driver:      return BugieColors.success;
      case MarkerKind.defaultPin:  return BugieColors.mapOrigin;
    }
  }

  @override
  Widget build(BuildContext context) {
    // Mientras carga la config del backend, mostramos un placeholder centrado.
    if (_resolvedCenter == null) {
      return SizedBox(
        height: widget.height,
        child: const Center(child: CircularProgressIndicator(strokeWidth: 2)),
      );
    }
    final initialCenter = _resolvedCenter!;
    final initialZoom = _resolvedZoom ?? widget.zoom;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    // Teselas de OpenStreetMap, que NO piden clave. Antes se usaba
    // basemaps.cartocdn.com, que empezo a exigirla y devolvia imagenes con el
    // aviso "API key required" dentro del propio mapa.
    //
    // OSM solo tiene version clara, asi que en tema oscuro se invierten los
    // colores con un ColorFilter aplicado SOLO a las teselas: los marcadores
    // y las rutas se dibujan encima y conservan su color.
    const tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

    return SizedBox(
      height: widget.height,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: Stack(
          children: [
            FlutterMap(
              mapController: _controller,
              options: MapOptions(
                initialCenter: initialCenter,
                initialZoom: initialZoom,
                onTap: widget.onMapTap == null
                    ? null
                    : (_, pos) => widget.onMapTap!(pos),
                interactionOptions: const InteractionOptions(
                  flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
                ),
              ),
              children: [
                // Tiles OSCUROS (CARTO Dark Matter) con filtro de brillo+contraste.
                // La tesela de OSM es CLARA. Para el tema oscuro se invierte:
                // multiplicador negativo (-1) más desplazamiento 255 da el
                // negativo de la imagen, que es como se hacen los mapas
                // oscuros a partir de uno claro.
                //
                // El azul se invierte un poco menos (-0.95 con 250) para que
                // el agua no quede naranja chillón.
                //
                // Se aplica SOLO a las teselas: los marcadores y las rutas se
                // dibujan encima y conservan su color.
                ColorFiltered(
                  colorFilter: isDark
                      ? const ColorFilter.matrix(<double>[
                          -1, 0, 0, 0, 255,
                          0, -1, 0, 0, 255,
                          0, 0, -0.95, 0, 250,
                          0, 0, 0, 1, 0,
                        ])
                      : const ColorFilter.matrix(<double>[
                          1, 0, 0, 0, 0,
                          0, 1, 0, 0, 0,
                          0, 0, 1, 0, 0,
                          0, 0, 0, 1, 0,
                        ]),
                  child: TileLayer(
                    urlTemplate: tileUrl,
                    // OSM sirve desde a, b y c. No tiene subdominio d.
                    subdomains: const ['a', 'b', 'c'],
                    userAgentPackageName: 'pe.bugie.app',
                    maxZoom: 20,
                  ),
                ),

                // Rutas alternativas (gris punteadas, debajo)
                if (widget.alternativeRoutes.isNotEmpty)
                  PolylineLayer(
                    polylines: widget.alternativeRoutes
                        .where((r) => r.length >= 2)
                        .map((r) => Polyline(
                              points: r,
                              strokeWidth: 3,
                              color: Colors.white.withOpacity(0.4),
                              pattern: StrokePattern.dashed(segments: const [8.0, 5.0]),
                            ))
                        .toList(),
                  ),

                // Ruta principal (sólida, color Bugie púrpura)
                if (widget.route.length >= 2)
                  PolylineLayer(
                    polylines: [
                      Polyline(
                        points: widget.route,
                        strokeWidth: 5,
                        color: BugieColors.mapOrigin,
                      ),
                    ],
                  ),

                // Línea de alerta: conductor → punto más cercano de la ruta.
                // Roja punteada para llamar la atención sobre el desvío.
                if (widget.alertLine.length == 2)
                  PolylineLayer(
                    polylines: [
                      Polyline(
                        points: widget.alertLine,
                        strokeWidth: 3,
                        color: BugieColors.danger,
                        pattern: StrokePattern.dashed(
                            segments: const [6.0, 4.0]),
                      ),
                    ],
                  ),

                // Marcadores
                MarkerLayer(
                  markers: widget.markers
                      .map((m) => Marker(
                            point: m.position,
                            width: 44,
                            height: 56,
                            alignment: Alignment.topCenter,
                            child: _PinWidget(
                              color: _colorFor(m.kind),
                              kind: m.kind,
                              waypointIndex: m.waypointIndex,
                            ),
                          ))
                      .toList(),
                ),
              ],
            ),

            // Columna de controles flotantes (zoom in, zoom out, foco).
            // Antes solo había el botón de foco y solo aparecía con 2+ pines;
            // ahora la columna entera está siempre visible para que el
            // usuario pueda hacer zoom in/out y recentrar en cualquier momento.
            Positioned(
              right: 10,
              bottom: widget.controlsBottomOffset,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Zoom in (+)
                  _MapControlButton(
                    icon: Icons.add,
                    tooltip: 'Acercar',
                    onTap: () {
                      // Sube 1 nivel sin pasar de 20 (límite de los tiles CARTO).
                      final next = (_controller.camera.zoom + 1).clamp(3.0, 20.0);
                      _controller.move(_controller.camera.center, next);
                    },
                  ),
                  const SizedBox(height: 6),
                  // Zoom out (-)
                  _MapControlButton(
                    icon: Icons.remove,
                    tooltip: 'Alejar',
                    onTap: () {
                      final next = (_controller.camera.zoom - 1).clamp(3.0, 20.0);
                      _controller.move(_controller.camera.center, next);
                    },
                  ),
                  const SizedBox(height: 6),
                  // Foco: re-encuadra todo lo que esté en pantalla.
                  // Si hay 2+ pines, _fitAll los acomoda; si hay solo 1 lo centra.
                  _MapControlButton(
                    icon: Icons.center_focus_strong,
                    tooltip: 'Centrar',
                    onTap: _fitAll,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Pin estilo "gota de agua" con sombra. Si es waypoint, muestra el número.
class _PinWidget extends StatelessWidget {
  final Color color;
  final MarkerKind kind;
  final int? waypointIndex;
  const _PinWidget({
    required this.color,
    this.kind = MarkerKind.defaultPin,
    this.waypointIndex,
  });

  @override
  Widget build(BuildContext context) {
    // Pin especial para conductor: círculo verde con auto adentro y "colita"
    // que apunta al punto exacto. Idéntico visualmente al admin web.
    if (kind == MarkerKind.driver) {
      return _DriverCarPin(color: color);
    }

    // Pin clásico de location_on para origen / destino / waypoints.
    return Stack(
      alignment: Alignment.topCenter,
      children: [
        Icon(
          Icons.location_on,
          color: color,
          size: 44,
          shadows: const [
            Shadow(
              color: Colors.white24,
              offset: Offset(0, 0),
              blurRadius: 8,
            ),
            Shadow(
              color: Colors.black54,
              offset: Offset(0, 2),
              blurRadius: 4,
            ),
          ],
        ),
        if (waypointIndex != null)
          Positioned(
            top: 6,
            child: Container(
              width: 18,
              height: 18,
              alignment: Alignment.center,
              decoration: const BoxDecoration(
                color: Colors.white,
                shape: BoxShape.circle,
              ),
              child: Text(
                '${waypointIndex! + 1}',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                  color: color,
                ),
              ),
            ),
          )
        else
          Positioned(
            top: 11,
            child: Container(
              width: 12,
              height: 12,
              decoration: const BoxDecoration(
                color: Colors.white,
                shape: BoxShape.circle,
              ),
            ),
          ),
      ],
    );
  }
}

/// Pin del conductor: círculo coloreado con ícono de auto y palito que
/// apunta a la coordenada exacta. Replica visualmente el ícono del
/// monitoreo del admin (BugieMapAdmin.tsx · makeDriverIcon).
class _DriverCarPin extends StatelessWidget {
  final Color color;
  const _DriverCarPin({required this.color});

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Halo + círculo central con ícono de auto
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            // Halo translúcido (mismo efecto que opacity 0.2 del SVG admin)
            color: color.withOpacity(0.25),
            shape: BoxShape.circle,
          ),
          child: Center(
            child: Container(
              width: 26,
              height: 26,
              decoration: BoxDecoration(
                color: color,
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.3),
                    offset: const Offset(0, 1),
                    blurRadius: 3,
                  ),
                ],
              ),
              child: const Icon(
                Icons.directions_car,
                color: Colors.white,
                size: 16,
              ),
            ),
          ),
        ),
        // Palito que apunta al lugar exacto (line del SVG admin)
        Container(
          width: 3,
          height: 11,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
      ],
    );
  }
}
/// Botón cuadrado blanco con sombra para los controles del mapa (zoom +/- y foco).
class _MapControlButton extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;
  const _MapControlButton({
    required this.icon,
    required this.tooltip,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Material(
        color: Colors.white,
        elevation: 4,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        child: InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(10),
            child: Icon(icon, color: BugieColors.primary, size: 22),
          ),
        ),
      ),
    );
  }
}
