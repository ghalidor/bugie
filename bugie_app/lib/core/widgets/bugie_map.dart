import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
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

  /// Opcional: acción al tocar el marcador (ej. abrir una solicitud).
  final VoidCallback? onTap;

  /// Opcional: dibujo propio del marcador en lugar del pin estándar.
  /// Se ancla igual que el pin (abajo al centro apunta a [position]).
  final Widget? child;

  /// Tamaño del marcador (solo importa si se usa [child]).
  final double width;
  final double height;

  const BugieMarker({
    required this.position,
    this.label,
    this.kind = MarkerKind.defaultPin,
    this.waypointIndex,
    this.onTap,
    this.child,
    this.width = 44,
    this.height = 56,
  });
}

/// Círculo sobre el mapa (ej. zonas con más pedidos). El radio va en metros.
/// Con [pulse] = true late suavemente (crece y se desvanece un poco); si el
/// celular tiene "Quitar animaciones" activado, queda quieto.
class BugieMapCircle {
  final LatLng center;
  final double radiusMeters;
  final Color color;
  final Color? borderColor;
  final double borderWidth;
  final bool pulse;

  const BugieMapCircle({
    required this.center,
    required this.radiusMeters,
    required this.color,
    this.borderColor,
    this.borderWidth = 0,
    this.pulse = false,
  });
}

/// Línea extra para dibujar sobre el mapa (ej. "ruta del sistema" punteada
/// o "recorrido real" continuo en el detalle de un viaje).
/// Se dibujan en el orden de la lista (la última queda encima) y cuentan
/// para el encuadre automático.
class BugieMapLine {
  final List<LatLng> points;
  final Color color;
  final double width;
  /// true = línea discontinua (guiones).
  final bool dashed;

  const BugieMapLine({
    required this.points,
    required this.color,
    this.width = 4,
    this.dashed = false,
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

  /// Líneas extra con color/estilo propio (ver [BugieMapLine]).
  final List<BugieMapLine> lines;

  /// Círculos extra (zonas). Se dibujan debajo de los marcadores.
  final List<BugieMapCircle> circles;

  /// Si true, encuadra marcadores + rutas + líneas apenas el mapa está listo
  /// (sin esperar a que cambie algo). Útil en mapas de solo lectura.
  final bool fitOnReady;

  final void Function(LatLng pos)? onMapTap;
  final double height;

  /// Si true, hace fitBounds automáticamente cuando hay 2+ markers.
  final bool fitBoundsOnMarkers;

  /// Offset desde abajo para la columna de botones (zoom in/out, foco).
  /// Útil cuando un BottomSheet o panel cubre la parte inferior del mapa
  /// y los botones quedan tapados. Default 10px (pegados al fondo).
  final double controlsBottomOffset;

  /// Margen al encuadrar (botón "Centrar" y encuadre automático). Útil
  /// cuando una hoja inferior tapa parte del mapa: se pasa un margen
  /// inferior mayor para que la ruta quede en la zona visible.
  final EdgeInsets fitPadding;

  /// Mi posición (opcional) para el botón "Centrar mapa". Si no se pasa, se
  /// usa el marcador "Tú" (conductor) o la última ubicación conocida del GPS.
  final LatLng? myLocation;

  /// Si false, "Centrar mapa" no suma mi posición al encuadre (ej. editor de
  /// direcciones, donde solo importa el pin elegido).
  final bool fitIncludesMyLocation;

  const BugieMap({
    super.key,
    this.center,
    this.zoom = 14,
    this.markers = const [],
    this.route = const [],
    this.alternativeRoutes = const [],
    this.alertLine = const [],
    this.lines = const [],
    this.circles = const [],
    this.fitOnReady = false,
    this.onMapTap,
    this.height = 320,
    this.fitBoundsOnMarkers = true,
    this.controlsBottomOffset = 10,
    this.fitPadding = const EdgeInsets.all(50),
    this.myLocation,
    this.fitIncludesMyLocation = true,
  });

  @override
  State<BugieMap> createState() => _BugieMapState();
}

class _BugieMapState extends State<BugieMap>
    with SingleTickerProviderStateMixin {
  final MapController _controller = MapController();

  /// Último tamaño del mapa (null hasta el primer build).
  Size? _mapSize;

  /// Espera a que el tamaño se estabilice (giro, plegado, una franja que
  /// aparece/desaparece) antes de recolocar la cámara.
  Timer? _resizeTimer;

  /// Latido de los círculos con pulse. Se crea solo si hace falta.
  AnimationController? _pulse;

  @override
  void dispose() {
    _resizeTimer?.cancel();
    _pulse?.dispose();
    super.dispose();
  }

  /// El mapa cambió de tamaño. Con flutter_map 7 las teselas (y los pines)
  /// se quedaban dibujados con el tamaño anterior: recuadro gris en el resto
  /// hasta que el usuario movía el mapa. Cuando el tamaño se estabiliza se
  /// mueve la cámara (eso lo obliga a redibujar todo con el tamaño nuevo) y,
  /// si hay un viaje en pantalla, se vuelve a encuadrar para la nueva forma.
  void _onSizeChanged() {
    _resizeTimer?.cancel();
    _resizeTimer = Timer(const Duration(milliseconds: 180), () {
      if (!mounted) return;
      try {
        final cam = _controller.camera;
        // Dos movimientos mínimos: el segundo deja la cámara como estaba.
        _controller.move(cam.center, cam.zoom + 0.0001);
        _controller.move(cam.center, cam.zoom);
      } catch (_) {
        return; // el mapa aún no está listo
      }
      if (widget.fitBoundsOnMarkers && _hasTripContext) _fitAll();
    });
  }

  /// Devuelve el controlador del latido si algún círculo late y las
  /// animaciones están permitidas; si no, lo detiene y devuelve null.
  AnimationController? _pulseController(BuildContext context) {
    final wantPulse = widget.circles.any((c) => c.pulse) &&
        !(MediaQuery.maybeDisableAnimationsOf(context) ?? false);
    if (!wantPulse) {
      _pulse?.stop();
      return null;
    }
    final ctrl = _pulse ??= AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2200),
    );
    if (!ctrl.isAnimating) ctrl.repeat();
    return ctrl;
  }

  CircleLayer _circleLayer(double t) {
    // t va de 0 a 1: el círculo crece hasta +18% y baja su opacidad.
    final wave = Curves.easeInOut.transform(t < 0.5 ? t * 2 : (1 - t) * 2);
    return CircleLayer(
      circles: widget.circles.map((c) {
        final grow = c.pulse ? 1 + 0.18 * wave : 1.0;
        final fade = c.pulse ? 1 - 0.35 * wave : 1.0;
        return CircleMarker(
          point: c.center,
          radius: c.radiusMeters * grow,
          useRadiusInMeter: true,
          color: c.color.withValues(alpha: (c.color.a * fade).clamp(0.0, 1.0)),
          borderColor: c.borderColor ?? Colors.transparent,
          borderStrokeWidth: c.borderWidth,
        );
      }).toList(),
    );
  }

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
    // Cambiaron las líneas extra (llegó una ruta o un recorrido nuevo)
    if (old.lines.length != widget.lines.length) return true;
    for (int i = 0; i < widget.lines.length; i++) {
      if (old.lines[i].points.length != widget.lines[i].points.length) {
        return true;
      }
    }
    return false;
  }

  /// ¿La pantalla muestra un viaje? (ruta, líneas o pines de origen /
  /// destino / paradas). Los pines de demanda o "Tú" no cuentan.
  bool get _hasTripContext =>
      widget.route.length >= 2 ||
      widget.lines.any((l) => l.points.length >= 2) ||
      widget.markers.any((m) =>
          m.kind == MarkerKind.origin ||
          m.kind == MarkerKind.destination ||
          m.kind == MarkerKind.waypoint);

  /// Mi posición: la que pasa el padre, el marcador "Tú" (conductor en sus
  /// pantallas) o la última conocida del GPS (sin pedir permisos).
  Future<LatLng?> _myPosition() async {
    if (widget.myLocation != null) return widget.myLocation;
    try {
      final perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied ||
          perm == LocationPermission.deniedForever) {
        return null;
      }
      final p = await Geolocator.getLastKnownPosition();
      return p == null ? null : LatLng(p.latitude, p.longitude);
    } catch (_) {
      return null;
    }
  }

  /// Botón "Centrar mapa" (mismo comportamiento en todas las pantallas):
  ///  - Con viaje (ruta o pines de viaje): encuadra todo + mi posición.
  ///  - Sin viaje (inicio): centra en mi ubicación.
  Future<void> _onCenterPressed() async {
    if (_hasTripContext) {
      final me = widget.fitIncludesMyLocation ? await _myPosition() : null;
      if (!mounted) return;
      _fitAll(extra: me);
      return;
    }
    LatLng? me = widget.myLocation;
    if (me == null) {
      for (final m in widget.markers) {
        if (m.kind == MarkerKind.driver) {
          me = m.position;
          break;
        }
      }
    }
    me ??= await _myPosition();
    if (!mounted) return;
    if (me == null) {
      _fitAll();
      return;
    }
    try {
      final zoom = _controller.camera.zoom < 15 ? 15.0 : _controller.camera.zoom;
      _controller.move(me, zoom);
    } catch (_) {}
  }

  void _fitAll({LatLng? extra}) {
    final pts = <LatLng>[
      ...widget.markers.map((m) => m.position),
      ...widget.route,
      for (final l in widget.lines) ...l.points,
      if (extra != null) extra,
    ];
    if (pts.isEmpty) return;
    // Un solo punto (ej. la ubicación actual en el inicio): centrar en él
    // manteniendo el zoom actual. Antes esto no hacía nada (requería 2+).
    if (pts.length == 1) {
      try {
        _controller.move(pts.first, _controller.camera.zoom);
      } catch (_) {}
      return;
    }
    try {
      final bounds = LatLngBounds.fromPoints(pts);
      _controller.fitCamera(
        CameraFit.bounds(
          bounds: bounds,
          padding: widget.fitPadding,
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
        child: LayoutBuilder(builder: (context, box) {
          // Si cambió el tamaño (giro, plegado, pantalla dividida), se
          // recoloca la cámara (ver _onSizeChanged).
          if (box.hasBoundedWidth &&
              box.hasBoundedHeight &&
              box.maxWidth > 0 &&
              box.maxHeight > 0) {
            final size = Size(
                box.maxWidth.roundToDouble(), box.maxHeight.roundToDouble());
            if (_mapSize != null && _mapSize != size) _onSizeChanged();
            _mapSize = size;
          }
          final initialCenter = _resolvedCenter!;
          final initialZoom = _resolvedZoom ?? widget.zoom;
          return Stack(
          children: [
            FlutterMap(
              mapController: _controller,
              options: MapOptions(
                initialCenter: initialCenter,
                initialZoom: initialZoom,
                onMapReady: widget.fitOnReady ? _fitAll : null,
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

                // Líneas extra (ruta del sistema, recorrido real, etc.)
                if (widget.lines.any((l) => l.points.length >= 2))
                  PolylineLayer(
                    polylines: widget.lines
                        .where((l) => l.points.length >= 2)
                        .map((l) => Polyline(
                              points: l.points,
                              strokeWidth: l.width,
                              color: l.color,
                              pattern: l.dashed
                                  ? StrokePattern.dashed(
                                      segments: const [10.0, 7.0])
                                  : const StrokePattern.solid(),
                            ))
                        .toList(),
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

                // Círculos (zonas). Si alguno late, se repinta con la animación.
                if (widget.circles.isNotEmpty)
                  Builder(builder: (context) {
                    final ctrl = _pulseController(context);
                    if (ctrl == null) return _circleLayer(0);
                    return AnimatedBuilder(
                      animation: ctrl,
                      builder: (_, __) => _circleLayer(ctrl.value),
                    );
                  }),

                // Marcadores
                MarkerLayer(
                  markers: widget.markers.map((m) {
                    Widget pin = m.child ??
                        _PinWidget(
                          color: _colorFor(m.kind),
                          kind: m.kind,
                          waypointIndex: m.waypointIndex,
                        );
                    if (m.onTap != null) {
                      pin = GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTap: m.onTap,
                        child: Semantics(
                          button: true,
                          label: m.label,
                          child: pin,
                        ),
                      );
                    }
                    return Marker(
                      point: m.position,
                      width: m.child != null ? m.width : 44,
                      height: m.child != null ? m.height : 56,
                      alignment: Alignment.topCenter,
                      child: pin,
                    );
                  }).toList(),
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
                  // Zoom in (+) y zoom out (-) juntos en una sola pastilla.
                  _MapControlGroup(children: [
                    _MapControlButton(
                      icon: Icons.add,
                      tooltip: 'Acercar',
                      onTap: () {
                        // Sube 1 nivel sin pasar de 20 (límite de los tiles).
                        final next =
                            (_controller.camera.zoom + 1).clamp(3.0, 20.0);
                        _controller.move(_controller.camera.center, next);
                      },
                    ),
                    _MapControlButton(
                      icon: Icons.remove,
                      tooltip: 'Alejar',
                      onTap: () {
                        final next =
                            (_controller.camera.zoom - 1).clamp(3.0, 20.0);
                        _controller.move(_controller.camera.center, next);
                      },
                    ),
                  ]),
                  const SizedBox(height: 8),
                  // Centrar mapa: con viaje encuadra todo; sin viaje, a mí.
                  _MapControlGroup(children: [
                    _MapControlButton(
                      icon: Icons.my_location_rounded,
                      tooltip: 'Centrar mapa',
                      onTap: _onCenterPressed,
                    ),
                  ]),
                ],
              ),
            ),
          ],
          );
        }),
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
/// Pastilla que agrupa botones del mapa (fondo según el tema, borde sutil).
class _MapControlGroup extends StatelessWidget {
  final List<Widget> children;
  const _MapControlGroup({required this.children});

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Material(
      color: c.surface.withValues(alpha: 0.96),
      elevation: 3,
      shadowColor: Colors.black45,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: c.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = 0; i < children.length; i++) ...[
            if (i > 0) Container(width: 28, height: 1, color: c.border),
            children[i],
          ],
        ],
      ),
    );
  }
}

/// Botón de 44x44 para los controles del mapa (zoom +/- y centrar).
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
      child: InkWell(
        onTap: onTap,
        child: SizedBox(
          width: 44,
          height: 44,
          child: Icon(icon, color: context.bugie.text, size: 22),
        ),
      ),
    );
  }
}
