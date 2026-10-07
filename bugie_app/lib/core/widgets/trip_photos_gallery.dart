import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../modules/trips/data/trips_repository.dart';
import '../../modules/trips/domain/trip_photo_model.dart';
import '../theme/bugie_theme.dart';

/// Galería de fotos de un envío (paquete, recojo y entrega).
///
/// Pide las fotos a GET /api/trips/{id}/photos vía TripsRepository y las
/// muestra en una grilla de 3 columnas con su etiqueta ("Paquete",
/// "Recojo", "Recojo (adicional)", "Entrega"). Al tocar una foto se abre
/// en grande (con zoom).
///
/// Si no hay fotos muestra un texto corto; si falla, un aviso con reintentar.
/// Cambiar [refreshKey] (ej. el estado del viaje) vuelve a pedir las fotos.
class TripPhotosGallery extends StatefulWidget {
  final String tripId;
  final Object? refreshKey;
  /// Título opcional encima de la grilla. Null = sin título.
  final String? title;
  /// Si se indica, solo muestra las fotos de esos tipos (ver TripPhotoKind).
  /// Ej. {TripPhotoKind.package} = solo las fotos del paquete.
  final Set<int>? kinds;
  /// Texto cuando no hay fotos.
  final String emptyText;

  const TripPhotosGallery({
    super.key,
    required this.tripId,
    this.refreshKey,
    this.title = 'Fotos del envío',
    this.kinds,
    this.emptyText = 'Aún no hay fotos.',
  });

  @override
  State<TripPhotosGallery> createState() => _TripPhotosGalleryState();
}

class _TripPhotosGalleryState extends State<TripPhotosGallery> {
  List<TripPhoto>? _photos;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant TripPhotosGallery old) {
    super.didUpdateWidget(old);
    if (old.tripId != widget.tripId || old.refreshKey != widget.refreshKey) {
      _load();
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      var list = await context.read<TripsRepository>().getPhotos(widget.tripId);
      final kinds = widget.kinds;
      if (kinds != null) {
        list = list.where((p) => kinds.contains(p.kind)).toList();
      }
      // Orden: paquete → recojo → adicionales → entrega.
      list.sort((a, b) => a.kind.compareTo(b.kind));
      if (!mounted) return;
      setState(() {
        _photos = list;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'No se pudieron cargar las fotos.';
        _loading = false;
      });
    }
  }

  void _open(int index) {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => _PhotoViewer(photos: _photos!, initialIndex: index),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    Widget body;

    if (_loading) {
      body = const Padding(
        padding: EdgeInsets.symmetric(vertical: 16),
        child: Center(
          child: SizedBox(
            width: 22, height: 22,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      );
    } else if (_error != null) {
      body = Row(
        children: [
          Expanded(
            child: Text(_error!,
                style: TextStyle(color: c.textMuted, fontSize: 13)),
          ),
          const SizedBox(width: 8),
          OutlinedButton.icon(
            style: BugieButtons.compactOutlinedStyle(context),
            onPressed: _load,
            icon: const Icon(Icons.refresh, size: 16),
            label: const Text('Reintentar'),
          ),
        ],
      );
    } else if (_photos == null || _photos!.isEmpty) {
      body = Text(widget.emptyText,
          style: TextStyle(color: c.textMuted, fontSize: 13));
    } else {
      body = GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        padding: EdgeInsets.zero,
        itemCount: _photos!.length,
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 3,
          mainAxisSpacing: 8,
          crossAxisSpacing: 8,
        ),
        itemBuilder: (_, i) => _Thumb(
          photo: _photos![i],
          onTap: () => _open(i),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (widget.title != null) ...[
          Row(
            children: [
              Icon(Icons.photo_library_outlined, size: 16, color: c.textMuted),
              const SizedBox(width: 6),
              Text(widget.title!,
                  style: TextStyle(
                      color: c.text,
                      fontSize: 13,
                      fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 8),
        ],
        body,
      ],
    );
  }
}

/// Miniatura con la etiqueta del tipo de foto abajo.
class _Thumb extends StatelessWidget {
  final TripPhoto photo;
  final VoidCallback onTap;
  const _Thumb({required this.photo, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return GestureDetector(
      onTap: onTap,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(10),
        child: Stack(
          fit: StackFit.expand,
          children: [
            Image.network(
              photo.fullUrl,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => Container(
                color: c.surface2,
                child: Icon(Icons.broken_image_outlined, color: c.textMuted),
              ),
            ),
            Positioned(
              left: 0, right: 0, bottom: 0,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                color: Colors.black.withValues(alpha: 0.55),
                child: Text(
                  photo.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Fotos a pantalla completa: zoom (pinch) y deslizar entre fotos.
class _PhotoViewer extends StatefulWidget {
  final List<TripPhoto> photos;
  final int initialIndex;
  const _PhotoViewer({required this.photos, required this.initialIndex});

  @override
  State<_PhotoViewer> createState() => _PhotoViewerState();
}

class _PhotoViewerState extends State<_PhotoViewer> {
  late final PageController _ctrl;
  late int _index;

  @override
  void initState() {
    super.initState();
    _index = widget.initialIndex;
    _ctrl = PageController(initialPage: widget.initialIndex);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final photos = widget.photos;
    final title = photos.length > 1
        ? '${photos[_index].label} (${_index + 1}/${photos.length})'
        : photos[_index].label;
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(title),
      ),
      body: PageView.builder(
        controller: _ctrl,
        itemCount: photos.length,
        onPageChanged: (i) => setState(() => _index = i),
        itemBuilder: (_, i) => Center(
          child: InteractiveViewer(
            minScale: 1,
            maxScale: 5,
            child: Image.network(
              photos[i].fullUrl,
              fit: BoxFit.contain,
              loadingBuilder: (_, child, progress) => progress == null
                  ? child
                  : const CircularProgressIndicator(color: Colors.white54),
              errorBuilder: (_, __, ___) => const Icon(
                  Icons.broken_image_outlined,
                  color: Colors.white54,
                  size: 48),
            ),
          ),
        ),
      ),
    );
  }
}
