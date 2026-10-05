import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';

import '../services/active_trip_service.dart';
import '../theme/bugie_theme.dart';

/// Envuelve toda la app (MaterialApp.builder) y, mientras el conductor tenga
/// un viaje activo, muestra arriba la franja fija "Viaje en curso · Volver".
///
/// - Aparece en todas las pantallas (pestañas del menú y pantallas internas)
///   y se oculta mientras la pantalla del viaje está abierta.
/// - Al tocarla abre la pantalla del viaje (/driver/trip-in-progress).
/// - Entra deslizándose; sin animación si el celular las quitó.
/// - Ocupa el lugar de la barra de estado: el contenido de abajo pierde ese
///   margen superior mientras la franja está visible, así nada se tapa.
class ActiveTripFrame extends StatefulWidget {
  final Widget child;
  const ActiveTripFrame({super.key, required this.child});

  @override
  State<ActiveTripFrame> createState() => _ActiveTripFrameState();
}

class _ActiveTripFrameState extends State<ActiveTripFrame>
    with SingleTickerProviderStateMixin {
  final _svc = ActiveTripService();
  late final Listenable _changes =
      Listenable.merge([_svc.active, _svc.tripScreens]);

  late final AnimationController _show = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 340),
    reverseDuration: const Duration(milliseconds: 220),
  );

  DateTime? _lastTap;

  bool get _visible => _svc.active.value != null && _svc.tripScreens.value == 0;

  @override
  void initState() {
    super.initState();
    _show.value = _visible ? 1 : 0;
    _changes.addListener(_onChange);
  }

  @override
  void dispose() {
    _changes.removeListener(_onChange);
    _show.dispose();
    super.dispose();
  }

  void _onChange() {
    if (!mounted) return;
    // La pantalla del viaje se registra en su initState/dispose (durante un
    // build): en ese caso se espera al final del frame.
    if (SchedulerBinding.instance.schedulerPhase ==
        SchedulerPhase.persistentCallbacks) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _onChange());
      return;
    }
    final noAnim = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    final target = _visible ? 1.0 : 0.0;
    if (noAnim) {
      _show.value = target;
    } else if (target == 1) {
      _show.forward();
    } else {
      _show.reverse();
    }
    setState(() {}); // texto (viaje / envío)
  }

  void _open() {
    // Evita abrir dos veces la pantalla con un doble toque.
    final now = DateTime.now();
    if (_lastTap != null &&
        now.difference(_lastTap!) < const Duration(milliseconds: 900)) {
      return;
    }
    _lastTap = now;
    _svc.openTrip();
  }

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final topPad = mq.padding.top;
    // Pantallas bajas (celular en horizontal): franja más delgada.
    final barH = mq.size.height < 480 ? 38.0 : 46.0;
    final full = topPad + barH;
    final isDelivery = _svc.active.value?.isDelivery ?? false;

    return AnimatedBuilder(
      animation: _show,
      child: widget.child,
      builder: (context, child) {
        final t = Curves.easeOutCubic.transform(_show.value);
        final h = full * t;
        // Mientras la franja crece, el contenido va cediendo su margen de la
        // barra de estado (sin saltos).
        final childTop = math.max(0.0, topPad - h);
        final childViewTop = math.max(0.0, mq.viewPadding.top - h);
        return Column(
          children: [
            SizedBox(
              height: h,
              child: h <= 0
                  ? null
                  : ClipRect(
                      child: OverflowBox(
                        alignment: Alignment.bottomCenter,
                        minHeight: full,
                        maxHeight: full,
                        child: _StripBar(
                          topPad: topPad,
                          height: barH,
                          isDelivery: isDelivery,
                          onTap: _open,
                        ),
                      ),
                    ),
            ),
            Expanded(
              child: MediaQuery(
                data: mq.copyWith(
                  padding: mq.padding.copyWith(top: childTop),
                  viewPadding: mq.viewPadding.copyWith(top: childViewTop),
                ),
                child: child!,
              ),
            ),
          ],
        );
      },
    );
  }
}

class _StripBar extends StatelessWidget {
  final double topPad;
  final double height;
  final bool isDelivery;
  final VoidCallback onTap;
  const _StripBar({
    required this.topPad,
    required this.height,
    required this.isDelivery,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final label = isDelivery ? 'Envío en curso' : 'Viaje en curso';
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Material(
        color: Colors.transparent,
        child: Ink(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              colors: [BugieColors.primary, BugieColors.accent2],
            ),
          ),
          child: InkWell(
            onTap: onTap,
            child: Semantics(
              button: true,
              label:
                  '$label. Volver a la pantalla del ${isDelivery ? 'envío' : 'viaje'}',
              excludeSemantics: true,
              child: Padding(
                padding: EdgeInsets.only(top: topPad),
                child: SizedBox(
                  height: height,
                  child: MediaQuery.withClampedTextScaling(
                    maxScaleFactor: 1.25,
                    child: Padding(
                      // Respeta el notch / barra lateral en horizontal.
                      padding: EdgeInsets.only(
                        left: 16 + MediaQuery.paddingOf(context).left,
                        right: 16 + MediaQuery.paddingOf(context).right,
                      ),
                      child: Row(
                        children: [
                          Icon(
                            isDelivery
                                ? Icons.local_shipping_rounded
                                : Icons.directions_car_rounded,
                            color: Colors.white,
                            size: 20,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              label,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.22),
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: const Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  'Volver',
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontSize: 13,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                SizedBox(width: 4),
                                Icon(Icons.arrow_forward_rounded,
                                    color: Colors.white, size: 16),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
