import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../services/network_status_service.dart';
import '../theme/bugie_theme.dart';

/// Envuelve la app (MaterialApp.builder) y, mientras no haya red o el
/// servidor no responda (NetworkStatusService.offline), muestra arriba una
/// franja discreta "Sin conexión. Reintentando…". Se quita sola al volver la
/// conexión.
///
/// Igual que la franja "Viaje en curso", ocupa el lugar de la barra de
/// estado y el contenido de abajo cede ese margen: nada queda tapado.
class OfflineFrame extends StatefulWidget {
  final Widget child;
  const OfflineFrame({super.key, required this.child});

  @override
  State<OfflineFrame> createState() => _OfflineFrameState();
}

class _OfflineFrameState extends State<OfflineFrame>
    with SingleTickerProviderStateMixin {
  final _net = NetworkStatusService();

  late final AnimationController _show = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 280),
    reverseDuration: const Duration(milliseconds: 200),
  );

  @override
  void initState() {
    super.initState();
    _show.value = _net.offline.value ? 1 : 0;
    _net.offline.addListener(_onChange);
  }

  @override
  void dispose() {
    _net.offline.removeListener(_onChange);
    _show.dispose();
    super.dispose();
  }

  void _onChange() {
    if (!mounted) return;
    final noAnim = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    final target = _net.offline.value ? 1.0 : 0.0;
    if (noAnim) {
      _show.value = target;
    } else if (target == 1) {
      _show.forward();
    } else {
      _show.reverse();
    }
  }

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final topPad = mq.padding.top;
    const barH = 30.0;
    final full = topPad + barH;

    return AnimatedBuilder(
      animation: _show,
      child: widget.child,
      builder: (context, child) {
        final t = Curves.easeOutCubic.transform(_show.value);
        final h = full * t;
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
                        child: _OfflineBar(topPad: topPad, height: barH),
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

class _OfflineBar extends StatelessWidget {
  final double topPad;
  final double height;
  const _OfflineBar({required this.topPad, required this.height});

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Material(
        color: BugieColors.heroNavy,
        child: Semantics(
          liveRegion: true,
          label: 'Sin conexión. Reintentando',
          excludeSemantics: true,
          child: Padding(
            padding: EdgeInsets.only(top: topPad),
            child: SizedBox(
              height: height,
              child: MediaQuery.withClampedTextScaling(
                maxScaleFactor: 1.2,
                child: const Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.wifi_off_rounded,
                        size: 15, color: BugieColors.warning),
                    SizedBox(width: 8),
                    Flexible(
                      child: Text(
                        'Sin conexión. Reintentando…',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: BugieColors.onDark,
                          fontSize: 12.5,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    SizedBox(width: 8),
                    SizedBox(
                      width: 12,
                      height: 12,
                      child: CircularProgressIndicator(
                        strokeWidth: 1.8,
                        color: BugieColors.onDarkMuted,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
