import 'package:flutter/material.dart';

import '../services/request_alert_service.dart';
import '../theme/bugie_theme.dart';
import 'service_badge.dart';

/// Panel destacado de "solicitud nueva" para el conductor. Se monta UNA vez
/// encima de toda la app (main.dart, MaterialApp.builder) y escucha
/// RequestAlertService.state.
///
/// Entra desde abajo con un rebote suave, muestra precio grande, origen →
/// destino (o el texto del push), un contador y los botones "Ver solicitud"
/// y "Ahora no". Se puede cerrar deslizándolo hacia abajo. Con
/// MediaQuery.disableAnimations no hay rebote (aparece directo), pero el
/// contador sigue corriendo porque es información.
class RequestAlertPanel extends StatefulWidget {
  const RequestAlertPanel({super.key});

  @override
  State<RequestAlertPanel> createState() => _RequestAlertPanelState();
}

class _RequestAlertPanelState extends State<RequestAlertPanel>
    with TickerProviderStateMixin {
  final _svc = RequestAlertService();

  late final AnimationController _enter = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 560),
    reverseDuration: const Duration(milliseconds: 220),
  );
  late final AnimationController _countdown =
      AnimationController(vsync: this);

  /// Lo último que se mostró (se sigue pintando durante la salida).
  RequestAlertState? _shown;

  @override
  void initState() {
    super.initState();
    _svc.state.addListener(_onState);
    // Por si ya había una solicitud al montar (MediaQuery aún no se puede
    // leer en initState).
    WidgetsBinding.instance.addPostFrameCallback((_) => _onState());
  }

  @override
  void dispose() {
    _svc.state.removeListener(_onState);
    _enter.dispose();
    _countdown.dispose();
    super.dispose();
  }

  bool get _noAnim => MediaQuery.maybeOf(context)?.disableAnimations ?? false;

  void _onState() {
    final s = _svc.state.value;
    if (!mounted) return;
    if (s == null) {
      if (_shown == null) return;
      if (_noAnim) {
        _enter.value = 0;
        setState(() => _shown = null);
      } else {
        _enter.reverse().whenComplete(() {
          if (mounted && _svc.state.value == null) {
            setState(() => _shown = null);
          }
        });
      }
      return;
    }

    final wasHidden = _shown == null || _enter.status == AnimationStatus.reverse;
    setState(() => _shown = s);

    // Contador: de lleno a vacío en el tiempo que queda.
    final left = s.until.difference(DateTime.now());
    _countdown.duration = s.total;
    _countdown.value = 1 -
        (left.inMilliseconds / s.total.inMilliseconds).clamp(0.0, 1.0);
    _countdown.forward();

    if (wasHidden) {
      if (_noAnim) {
        _enter.value = 1;
      } else {
        _enter.forward(from: _enter.value);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = _shown;
    if (s == null) return const SizedBox.shrink();

    return Positioned(
      left: 0,
      right: 0,
      bottom: 0,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
          child: AnimatedBuilder(
            animation: _enter,
            builder: (context, child) {
              final forward = _enter.status != AnimationStatus.reverse;
              final t = forward
                  ? Curves.easeOutBack.transform(_enter.value)
                  : Curves.easeInCubic.transform(_enter.value);
              return FractionalTranslation(
                translation: Offset(0, 1.15 * (1 - t)),
                child: Opacity(
                  opacity: _enter.value.clamp(0.0, 1.0),
                  child: child,
                ),
              );
            },
            child: GestureDetector(
              onVerticalDragEnd: (d) {
                if ((d.primaryVelocity ?? 0) > 250) _svc.close();
              },
              child: _PanelCard(state: s, countdown: _countdown),
            ),
          ),
        ),
      ),
    );
  }
}

class _PanelCard extends StatelessWidget {
  final RequestAlertState state;
  final Animation<double> countdown;
  const _PanelCard({required this.state, required this.countdown});

  @override
  Widget build(BuildContext context) {
    final req = state.latest;
    final many = state.count > 1;
    final noun = req.isDelivery ? 'envío' : 'viaje';
    final title = many
        ? '${state.count} solicitudes nuevas'
        : (req.isScheduled
            ? 'Nuevo $noun programado'
            : 'Nueva solicitud de $noun');
    final hasRoute = req.origin != null || req.destination != null;
    final noAnim = MediaQuery.maybeOf(context)?.disableAnimations ?? false;

    return Semantics(
      liveRegion: true,
      container: true,
      label: '$title. ${req.price ?? ''}',
      child: Material(
        color: Colors.transparent,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 560),
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [BugieColors.heroDark, BugieColors.primary],
              ),
              borderRadius: BorderRadius.circular(22),
              border: Border.all(color: BugieColors.onDarkBorder),
              boxShadow: [
                BoxShadow(
                  color: BugieColors.primary.withOpacity(0.45),
                  blurRadius: 28,
                  offset: const Offset(0, 10),
                ),
              ],
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Encabezado: ícono + título + contador de solicitudes
                Row(
                  children: [
                    _PulsingIcon(
                      icon: serviceIcon(req.isDelivery),
                      animate: !noAnim,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Cambia con animación cuando llega otra solicitud.
                          AnimatedSwitcher(
                            duration: noAnim
                                ? Duration.zero
                                : const Duration(milliseconds: 250),
                            transitionBuilder: (c, a) => FadeTransition(
                              opacity: a,
                              child: SizeTransition(
                                  sizeFactor: a, axisAlignment: -1, child: c),
                            ),
                            child: Text(
                              title,
                              key: ValueKey(title),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 16,
                                fontWeight: FontWeight.w800,
                                height: 1.2,
                              ),
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            many
                                ? 'La más reciente:'
                                : '${serviceLabel(req.isDelivery)}'
                                    '${req.isScheduled ? ' · Programado' : ''}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: BugieColors.onDarkMuted,
                              fontSize: 12.5,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: RequestAlertService().close,
                      icon: const Icon(Icons.close_rounded,
                          color: Colors.white, size: 22),
                      constraints:
                          const BoxConstraints(minWidth: 40, minHeight: 40),
                      padding: EdgeInsets.zero,
                    ),
                  ],
                ),
                const SizedBox(height: 10),

                // Precio grande
                if (req.price != null)
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerLeft,
                    child: Text(
                      req.price!,
                      key: ValueKey('${req.tripId}_${req.price}'),
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 34,
                        fontWeight: FontWeight.w800,
                        height: 1.1,
                      ),
                    ),
                  ),

                // Origen → destino (o el texto del push)
                const SizedBox(height: 6),
                if (hasRoute) ...[
                  if (req.origin != null)
                    _PlaceLine(
                        icon: Icons.trip_origin_rounded,
                        color: BugieColors.mapOrigin,
                        text: req.origin!),
                  if (req.destination != null) ...[
                    const SizedBox(height: 4),
                    _PlaceLine(
                        icon: Icons.location_on_rounded,
                        color: BugieColors.mapDestination,
                        text: req.destination!),
                  ],
                ] else
                  Text(
                    req.body,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        color: BugieColors.onDarkMuted,
                        fontSize: 13.5,
                        height: 1.3),
                  ),
                if (req.distance != null) ...[
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      const Icon(Icons.straighten_rounded,
                          size: 16, color: BugieColors.onDarkMuted),
                      const SizedBox(width: 6),
                      Flexible(
                        child: Text(
                          req.distance!,
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: 13,
                              fontWeight: FontWeight.w600),
                        ),
                      ),
                    ],
                  ),
                ],

                // Contador
                const SizedBox(height: 12),
                _Countdown(animation: countdown, total: state.total),
                const SizedBox(height: 12),

                // Botones
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: RequestAlertService().close,
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.white,
                          side: const BorderSide(color: BugieColors.onDarkBorder),
                          minimumSize: const Size(0, 48),
                          padding: const EdgeInsets.symmetric(horizontal: 8),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14)),
                        ),
                        child: const FittedBox(
                          fit: BoxFit.scaleDown,
                          child: Text('Ahora no',
                              style: TextStyle(fontWeight: FontWeight.w700)),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      flex: 2,
                      child: ElevatedButton.icon(
                        onPressed: RequestAlertService().open,
                        icon: const Icon(Icons.visibility_rounded, size: 20),
                        label: FittedBox(
                          fit: BoxFit.scaleDown,
                          child: Text(
                            many ? 'Ver solicitudes' : 'Ver solicitud',
                            style: const TextStyle(fontWeight: FontWeight.w800),
                          ),
                        ),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.white,
                          foregroundColor: BugieColors.primary,
                          elevation: 0,
                          minimumSize: const Size(0, 48),
                          padding: const EdgeInsets.symmetric(horizontal: 10),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14)),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _PlaceLine extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String text;
  const _PlaceLine(
      {required this.icon, required this.color, required this.text});

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 1),
          child: Icon(icon, size: 16, color: color),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
                color: Colors.white, fontSize: 14, height: 1.25),
          ),
        ),
      ],
    );
  }
}

/// Barra que se vacía + segundos restantes.
class _Countdown extends StatelessWidget {
  final Animation<double> animation;
  final Duration total;
  const _Countdown({required this.animation, required this.total});

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: animation,
      builder: (context, _) {
        final left = 1 - animation.value;
        final secs = (total.inMilliseconds * left / 1000).ceil();
        final color = left > 0.3 ? Colors.white : BugieColors.warning;
        return Row(
          children: [
            Expanded(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: LinearProgressIndicator(
                  value: left,
                  minHeight: 6,
                  backgroundColor: Colors.white.withOpacity(0.18),
                  valueColor: AlwaysStoppedAnimation(color),
                ),
              ),
            ),
            const SizedBox(width: 10),
            Text(
              '$secs s',
              style: TextStyle(
                color: color,
                fontSize: 13,
                fontWeight: FontWeight.w800,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ],
        );
      },
    );
  }
}

/// Ícono del servicio con un anillo que "late" para llamar la atención.
class _PulsingIcon extends StatefulWidget {
  final IconData icon;
  final bool animate;
  const _PulsingIcon({required this.icon, required this.animate});

  @override
  State<_PulsingIcon> createState() => _PulsingIconState();
}

class _PulsingIconState extends State<_PulsingIcon>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1300),
  );

  @override
  void initState() {
    super.initState();
    if (widget.animate) _c.repeat();
  }

  @override
  void didUpdateWidget(covariant _PulsingIcon old) {
    super.didUpdateWidget(old);
    if (widget.animate && !_c.isAnimating) _c.repeat();
    if (!widget.animate && _c.isAnimating) _c.stop();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 48,
      height: 48,
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, child) {
          final t = widget.animate ? _c.value : 0.0;
          return Stack(
            alignment: Alignment.center,
            children: [
              Container(
                width: 34 + 14 * t,
                height: 34 + 14 * t,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withOpacity(0.28 * (1 - t)),
                ),
              ),
              child!,
            ],
          );
        },
        child: Container(
          width: 40,
          height: 40,
          decoration: const BoxDecoration(
            color: Colors.white,
            shape: BoxShape.circle,
          ),
          child: Icon(widget.icon, color: BugieColors.primary, size: 22),
        ),
      ),
    );
  }
}
