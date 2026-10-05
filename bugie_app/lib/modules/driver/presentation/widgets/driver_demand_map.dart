import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';

import '../../../../core/theme/bugie_theme.dart';
import '../../../../core/widgets/bugie_map.dart';
import '../../data/driver_demand.dart';

/// Mapa del inicio del conductor:
///  - su posición,
///  - círculos en las zonas con más pedidos (tamaño/opacidad según la
///    cantidad, con un latido suave),
///  - si está en línea, pines de las solicitudes cercanas (tocar → detalle),
///  - una barra de estado arriba ("En línea · N pedidos cerca" / ...).
class DriverDemandMap extends StatelessWidget {
  /// Centro inicial del mapa (se fija una vez para no mover el mapa en cada
  /// refresco si el conductor hizo zoom o lo arrastró).
  final LatLng? center;

  /// Posición actual del conductor (puede moverse en cada refresco).
  final LatLng? driverPos;
  final DriverDemand? demand;
  final bool online;
  final bool loading;

  /// Texto si no se pudo consultar (sin ubicación, sin red...). null = ok.
  final String? problem;
  final void Function(NearbyRequest r) onTapRequest;
  final VoidCallback? onTapStatus;

  const DriverDemandMap({
    super.key,
    required this.center,
    required this.driverPos,
    required this.demand,
    required this.online,
    required this.onTapRequest,
    this.loading = false,
    this.problem,
    this.onTapStatus,
  });

  static const _zoneColor = BugieColors.accent;

  List<BugieMapCircle> _circles() {
    // "Radar" alrededor de tu posición mientras estás en línea (verde, como "Tú").
    final radar = <BugieMapCircle>[
      if (online && driverPos != null)
        BugieMapCircle(
          center: driverPos!,
          radiusMeters: 600,
          color: BugieColors.success.withValues(alpha: 0.12),
          borderColor: BugieColors.success.withValues(alpha: 0.55),
          borderWidth: 1.5,
          pulse: true,
        ),
    ];
    final zones = demand?.zones ?? const <DemandZone>[];
    if (zones.isEmpty) return radar;
    final maxCount = zones.map((z) => z.count).fold<int>(1, math.max);
    return radar + zones.where((z) => z.count > 0).map((z) {
      final ratio = z.count / maxCount; // 0..1
      return BugieMapCircle(
        center: LatLng(z.lat, z.lng),
        // De 220 m a ~900 m según cuántos pedidos tenga la zona.
        radiusMeters: 220 + 680 * math.sqrt(ratio),
        color: _zoneColor.withValues(alpha: 0.12 + 0.22 * ratio),
        borderColor: _zoneColor.withValues(alpha: 0.35 + 0.35 * ratio),
        borderWidth: 1.5,
        pulse: true,
      );
    }).toList();
  }

  List<BugieMarker> _markers() {
    final list = <BugieMarker>[];
    if (online) {
      for (final r in demand?.nearby ?? const <NearbyRequest>[]) {
        list.add(BugieMarker(
          position: LatLng(r.originLat, r.originLng),
          label: r.isDelivery
              ? 'Envío, S/ ${r.estimatedFare.toStringAsFixed(2)}'
              : 'Viaje, S/ ${r.estimatedFare.toStringAsFixed(2)}',
          width: 84,
          height: 64,
          onTap: () => onTapRequest(r),
          child: _RequestPin(
            key: ValueKey('pin-${r.id}'),
            request: r,
          ),
        ));
      }
    }
    // Tu posición: auto en círculo verde, dibujado al final para quedar encima de los pedidos, con la etiqueta "Tú" visible.
    if (driverPos != null) {
      list.add(BugieMarker(
        position: driverPos!,
        kind: MarkerKind.driver,
        label: 'Tú',
        width: 56,
        height: 64,
        child: const _MeMarker(),
      ));
    }
    return list;
  }

  @override
  Widget build(BuildContext context) {
    final nearby = demand?.nearby.length ?? 0;
    final String status;
    final IconData icon;
    final Color color;
    if (problem != null) {
      status = problem!;
      icon = Icons.location_off_outlined;
      color = BugieColors.warning;
    } else if (!online) {
      status = 'Conéctate para recibir solicitudes';
      icon = Icons.power_settings_new;
      color = BugieColors.textMuted;
    } else if (nearby == 0) {
      status = 'En línea · Sin solicitudes cerca por ahora';
      icon = Icons.radar;
      color = BugieColors.success;
    } else {
      status = 'En línea · $nearby ${nearby == 1 ? 'solicitud' : 'solicitudes'} cerca';
      icon = Icons.local_fire_department;
      color = BugieColors.success;
    }

    return LayoutBuilder(
      builder: (context, constraints) => Stack(
        children: [
          BugieMap(
            center: center,
            zoom: 14,
            height: constraints.maxHeight,
            fitBoundsOnMarkers: false,
            markers: _markers(),
            circles: _circles(),
          ),
          Positioned(
            left: 10,
            right: 10,
            top: 10,
            child: Align(
              alignment: Alignment.topLeft,
              child: _StatusBar(
                text: status,
                icon: icon,
                color: color,
                loading: loading,
                onTap: onTapStatus,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Barra de estado sobre el mapa. Cambia con un fundido + deslizamiento.
class _StatusBar extends StatelessWidget {
  final String text;
  final IconData icon;
  final Color color;
  final bool loading;
  final VoidCallback? onTap;
  const _StatusBar({
    required this.text,
    required this.icon,
    required this.color,
    required this.loading,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final noAnim = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    return AnimatedSwitcher(
      duration: noAnim ? Duration.zero : const Duration(milliseconds: 300),
      transitionBuilder: (child, anim) => FadeTransition(
        opacity: anim,
        child: SlideTransition(
          position: Tween(begin: const Offset(0, -0.3), end: Offset.zero)
              .animate(anim),
          child: child,
        ),
      ),
      child: Material(
        key: ValueKey(text),
        color: c.surface.withValues(alpha: 0.94),
        elevation: 3,
        borderRadius: BorderRadius.circular(999),
        child: InkWell(
          borderRadius: BorderRadius.circular(999),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 18, color: color),
                const SizedBox(width: 8),
                Flexible(
                  child: Text(
                    text,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: c.text,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                if (loading) ...[
                  const SizedBox(width: 8),
                  const SizedBox(
                    width: 12,
                    height: 12,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Pin de una solicitud cercana: etiqueta con la tarifa + gota con ícono
/// (auto = viaje, caja = envío). Entra con un pequeño rebote.
class _RequestPin extends StatelessWidget {
  final NearbyRequest request;
  const _RequestPin({super.key, required this.request});

  @override
  Widget build(BuildContext context) {
    final noAnim = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    final color = request.isDelivery ? BugieColors.accent : BugieColors.primary;

    final pin = FittedBox(
      // Con letra grande, se achica dentro de su caja en vez de desbordar.
      fit: BoxFit.scaleDown,
      alignment: Alignment.bottomCenter,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(999),
              boxShadow: const [
                BoxShadow(
                    color: Colors.black38, blurRadius: 4, offset: Offset(0, 1)),
              ],
            ),
            child: Text(
              'S/ ${request.estimatedFare.toStringAsFixed(0)}',
              maxLines: 1,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 12,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          const SizedBox(height: 2),
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(
              color: Colors.white,
              shape: BoxShape.circle,
              border: Border.all(color: color, width: 3),
              boxShadow: const [
                BoxShadow(
                    color: Colors.black38, blurRadius: 4, offset: Offset(0, 2)),
              ],
            ),
            child: Icon(
              request.isDelivery ? Icons.inventory_2 : Icons.person_pin_circle,
              size: 16,
              color: color,
            ),
          ),
          Container(
            width: 3,
            height: 8,
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
        ],
      ),
    );

    if (noAnim) return pin;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 450),
      curve: Curves.easeOutBack,
      builder: (_, t, child) => Transform.scale(
        scale: t,
        alignment: Alignment.bottomCenter,
        child: child,
      ),
      child: pin,
    );
  }
}

/// Marcador de la posición del conductor: etiqueta "Tú" sobre un auto verde
/// (los pedidos son azules).
class _MeMarker extends StatelessWidget {
  const _MeMarker();

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(
            color: BugieColors.success,
            borderRadius: BorderRadius.circular(999),
          ),
          child: const Text('Tú',
              style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700)),
        ),
        const SizedBox(height: 3),
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: BugieColors.success,
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white, width: 3),
            boxShadow: const [BoxShadow(color: Color(0x40000000), blurRadius: 6, offset: Offset(0, 2))],
          ),
          child: const Icon(Icons.directions_car, color: Colors.white, size: 18),
        ),
      ],
    );
  }
}
