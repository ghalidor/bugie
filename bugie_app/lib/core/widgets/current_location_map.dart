import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import 'bugie_map.dart';

/// Mapa real centrado en la ubicación actual del celular.
/// Si no hay permiso/posición, muestra el centro por defecto del mapa.
class CurrentLocationMap extends StatefulWidget {
  final double height;
  const CurrentLocationMap({super.key, this.height = 220});

  @override
  State<CurrentLocationMap> createState() => _CurrentLocationMapState();
}

class _CurrentLocationMapState extends State<CurrentLocationMap> {
  LatLng? _pos;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.denied ||
          perm == LocationPermission.deniedForever) {
        return;
      }
      final p = await Geolocator.getCurrentPosition();
      if (mounted) setState(() => _pos = LatLng(p.latitude, p.longitude));
    } catch (_) {
      // Sin permiso o error: el mapa muestra su centro por defecto.
    }
  }

  @override
  Widget build(BuildContext context) {
    return BugieMap(
      center: _pos,
      zoom: 15,
      height: widget.height,
      fitBoundsOnMarkers: false,
      markers: _pos == null
          ? const []
          : [
              BugieMarker(
                position: _pos!,
                kind: MarkerKind.driver,
                label: 'Tú',
              ),
            ],
    );
  }
}
