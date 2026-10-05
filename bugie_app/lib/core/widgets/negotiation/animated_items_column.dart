import 'package:flutter/material.dart';

import 'motion.dart';

/// Columna de elementos con entrada escalonada y salida animada.
///
/// - Los elementos nuevos aparecen deslizando y con fundido (uno tras otro).
/// - Los que desaparecen de [items] se encogen y se desvanecen antes de
///   quitarse (p. ej. una propuesta rechazada o una solicitud que expiró).
/// - Se identifican por [keyOf]: el mismo id = el mismo elemento aunque el
///   objeto se haya recreado en el polling.
/// - Respeta "Quitar animaciones" del sistema.
class AnimatedItemsColumn<T> extends StatefulWidget {
  final List<T> items;
  final Object Function(T item) keyOf;
  final Widget Function(BuildContext context, T item, int index) itemBuilder;
  final double spacing;

  const AnimatedItemsColumn({
    super.key,
    required this.items,
    required this.keyOf,
    required this.itemBuilder,
    this.spacing = 12,
  });

  @override
  State<AnimatedItemsColumn<T>> createState() => _AnimatedItemsColumnState<T>();
}

class _Entry<T> {
  T item;
  final Object key;
  final AnimationController ctrl;
  bool removing = false;
  _Entry(this.item, this.key, this.ctrl);
}

class _AnimatedItemsColumnState<T> extends State<AnimatedItemsColumn<T>>
    with TickerProviderStateMixin {
  final List<_Entry<T>> _entries = [];
  bool _initialized = false;

  bool get _reduce => reduceMotion(context);

  AnimationController _newCtrl() => AnimationController(
        vsync: this,
        duration: const Duration(milliseconds: 380),
        reverseDuration: const Duration(milliseconds: 260),
      );

  void _show(_Entry<T> e, int order) {
    if (_reduce) {
      e.ctrl.value = 1;
      return;
    }
    Future.delayed(Duration(milliseconds: 70 * order), () {
      if (mounted && !e.removing) e.ctrl.forward();
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialized) return;
    _initialized = true;
    for (var i = 0; i < widget.items.length; i++) {
      final it = widget.items[i];
      final e = _Entry<T>(it, widget.keyOf(it), _newCtrl());
      _entries.add(e);
      _show(e, i);
    }
  }

  @override
  void didUpdateWidget(covariant AnimatedItemsColumn<T> old) {
    super.didUpdateWidget(old);
    final byKey = {for (final e in _entries) e.key: e};
    final newKeys = widget.items.map(widget.keyOf).toSet();

    // Nueva lista en el orden recibido.
    final next = <_Entry<T>>[];
    var newOrder = 0;
    for (final it in widget.items) {
      final k = widget.keyOf(it);
      final existing = byKey[k];
      if (existing != null && !existing.removing) {
        existing.item = it;
        next.add(existing);
      } else {
        if (existing != null) {
          // Volvió mientras salía: lo reaparecemos.
          existing.removing = false;
          existing.item = it;
          next.add(existing);
          if (_reduce) {
            existing.ctrl.value = 1;
          } else {
            existing.ctrl.forward();
          }
          continue;
        }
        final e = _Entry<T>(it, k, _newCtrl());
        next.add(e);
        _show(e, newOrder++);
      }
    }

    // Los que ya no están: se quedan en su posición mientras salen.
    for (var i = 0; i < _entries.length; i++) {
      final e = _entries[i];
      if (newKeys.contains(e.key)) continue;
      if (_reduce) {
        // Sin animaciones: se quita al instante.
        if (!e.removing) {
          e.removing = true;
          WidgetsBinding.instance.addPostFrameCallback((_) => e.ctrl.dispose());
        }
        continue;
      }
      if (!e.removing) {
        e.removing = true;
        e.ctrl.reverse().whenComplete(() => _drop(e));
      }
      next.insert(i < next.length ? i : next.length, e);
    }

    _entries
      ..clear()
      ..addAll(next);
  }

  void _drop(_Entry<T> e) {
    if (!mounted || !e.removing) return;
    setState(() => _entries.remove(e));
    WidgetsBinding.instance.addPostFrameCallback((_) => e.ctrl.dispose());
  }

  @override
  void dispose() {
    for (final e in _entries) {
      e.ctrl.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final visibleIndex = <_Entry<T>, int>{};
    var idx = 0;
    for (final e in _entries) {
      if (!e.removing) visibleIndex[e] = idx++;
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final e in _entries)
          KeyedSubtree(
            key: ValueKey(e.key),
            child: _AnimatedEntry(
              animation: e.ctrl,
              removing: e.removing,
              child: Padding(
                padding: EdgeInsets.only(bottom: widget.spacing),
                child: widget.itemBuilder(
                    context, e.item, visibleIndex[e] ?? 0),
              ),
            ),
          ),
      ],
    );
  }
}

class _AnimatedEntry extends StatefulWidget {
  final Animation<double> animation;
  final bool removing;
  final Widget child;
  const _AnimatedEntry({
    required this.animation,
    required this.removing,
    required this.child,
  });

  @override
  State<_AnimatedEntry> createState() => _AnimatedEntryState();
}

class _AnimatedEntryState extends State<_AnimatedEntry> {
  late CurvedAnimation _curved = _make();

  CurvedAnimation _make() => CurvedAnimation(
        parent: widget.animation,
        curve: Curves.easeOutCubic,
        reverseCurve: Curves.easeInCubic,
      );

  @override
  void didUpdateWidget(covariant _AnimatedEntry old) {
    super.didUpdateWidget(old);
    if (old.animation != widget.animation) {
      _curved.dispose();
      _curved = _make();
    }
  }

  @override
  void dispose() {
    _curved.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final removing = widget.removing;
    return IgnorePointer(
      ignoring: removing,
      child: SizeTransition(
        sizeFactor: _curved,
        axisAlignment: -1,
        child: FadeTransition(
          opacity: _curved,
          child: SlideTransition(
            position: Tween<Offset>(
              begin: Offset(removing ? 0.25 : 0, removing ? 0 : 0.15),
              end: Offset.zero,
            ).animate(_curved),
            child: widget.child,
          ),
        ),
      ),
    );
  }
}
