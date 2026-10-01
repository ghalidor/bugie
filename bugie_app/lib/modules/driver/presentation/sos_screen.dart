import 'dart:async';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:provider/provider.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../sos/data/sos_repository.dart';
import '../../trips/data/trips_repository.dart';
import '../../trips/domain/trip_model.dart';

/// SOS del conductor — mismo flujo que el del pasajero.
/// Backend: el endpoint /api/sos detecta el rol del JWT automáticamente.
class DriverSosScreen extends StatefulWidget {
  const DriverSosScreen({super.key});

  @override
  State<DriverSosScreen> createState() => _DriverSosScreenState();
}

class _DriverSosScreenState extends State<DriverSosScreen> {
  Trip? _activeTrip;
  bool _loading = true;
  bool _sending = false;
  bool _sent = false;
  String? _error;
  /// Polling para detectar cuando el admin desactiva el SOS.
  /// Sin esto, el conductor quedaba mirando "Alerta enviada" eternamente.
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final t = await context.read<TripsRepository>().getActive();
      if (!mounted) return;

      // Si el admin ya resolvió la alerta, el trip ya NO está en sosActive.
      // Si veníamos mostrando "Alerta enviada", reseteamos UI.
      final isStillSos = t != null && t.status == TripStatus.sosActive;
      if (_sent && !isStillSos) {
        _sent = false;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('El centro de monitoreo desactivó tu alerta SOS.'),
            backgroundColor: BugieColors.success,
            duration: Duration(seconds: 4),
          ),
        );
        _pollTimer?.cancel();
        _pollTimer = null;
      }

      setState(() { _activeTrip = t; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _startPolling() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(
      const Duration(seconds: 5), (_) => _load());
  }

  Future<void> _activate() async {
    if (_activeTrip == null) return;
    setState(() { _sending = true; _error = null; });
    try {
      double lat = -8.109052, lng = -79.021534;
      try {
        final perm = await Geolocator.checkPermission();
        if (perm == LocationPermission.denied) {
          await Geolocator.requestPermission();
        }
        final pos = await Geolocator.getCurrentPosition();
        lat = pos.latitude;
        lng = pos.longitude;
      } catch (_) {}

      await context.read<SosRepository>().activate(
            tripId: _activeTrip!.id,
            lat: lat,
            lng: lng,
          );
      if (mounted) setState(() => _sent = true);
      // Empezar polling para detectar resolución desde admin.
      _startPolling();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Error al enviar la alerta.');
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Scaffold(
      backgroundColor: c.bg,
      appBar: AppBar(
        title: const Text('SOS / Emergencia'),
        backgroundColor: const Color(0xFFDC2626),
        foregroundColor: Colors.white,
      ),
      body: SafeArea(
        child: _loading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
              child: _sent ? const _SosSent() : _buildForm(),
            ),
      ),
    );
  }

  Widget _buildForm() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_activeTrip != null)
          _StatusAlert(
            color: BugieColors.info,
            icon: Icons.info,
            title: 'Viaje activo detectado',
            subtitle:
                '${_activeTrip!.originAddress} → ${_activeTrip!.destAddress}',
          )
        else
          const _StatusAlert(
            color: BugieColors.warning,
            icon: Icons.warning_amber,
            title: 'No tienes un viaje activo',
            subtitle: 'El SOS solo se activa durante un viaje.',
          ),
        const SizedBox(height: 12),

        const _StatusAlert(
          color: BugieColors.danger,
          icon: Icons.warning,
          title: 'Solo para emergencias reales',
          subtitle:
              'Tu ubicación se enviará al centro de monitoreo y a la Policía Nacional.',
        ),
        const SizedBox(height: 16),

        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(_error!, style: const TextStyle(color: BugieColors.danger)),
          ),

        ElevatedButton.icon(
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFFDC2626),
            foregroundColor: Colors.white,
            disabledBackgroundColor: const Color(0xFFDC2626).withOpacity(0.4),
            disabledForegroundColor: Colors.white70,
            surfaceTintColor: Colors.transparent,
            padding: const EdgeInsets.symmetric(vertical: 18),
          ),
          onPressed: (_sending || _activeTrip == null) ? null : _activate,
          icon: _sending
              ? const SizedBox(
                  width: 20, height: 20,
                  child: CircularProgressIndicator(
                      color: Colors.white, strokeWidth: 2))
              : const Icon(Icons.warning, color: Colors.white),
          label: Text(_sending ? 'Enviando…' : 'ACTIVAR SOS',
              style: const TextStyle(fontSize: 18)),
        ),
      ],
    );
  }
}

class _SosSent extends StatelessWidget {
  const _SosSent();

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: BugieColors.success.withOpacity(0.12),
        borderRadius: BorderRadius.circular(BugieRadius.md),
        border: Border.all(color: BugieColors.success.withOpacity(0.4)),
      ),
      child: Column(
        children: [
          const Icon(Icons.check_circle, size: 64, color: BugieColors.success),
          const SizedBox(height: 12),
          Text('Alerta SOS enviada',
              style: TextStyle(
                  fontSize: 20, fontWeight: FontWeight.bold, color: c.text)),
          const SizedBox(height: 8),
          Text(
            'El centro de monitoreo recibió tu ubicación. Mantén la calma — ayuda está en camino.',
            textAlign: TextAlign.center,
            style: TextStyle(color: c.textMuted),
          ),
        ],
      ),
    );
  }
}

/// Alerta de estado ADAPTATIVA (claro/oscuro). Fondo = color de estado con baja
/// opacidad; texto con el color del tema (legible en ambos modos).
class _StatusAlert extends StatelessWidget {
  final Color color;
  final IconData icon;
  final String title;
  final String subtitle;
  const _StatusAlert({
    required this.color,
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(BugieRadius.md),
        border: Border.all(color: color.withOpacity(0.4)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 22),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style:
                        TextStyle(fontWeight: FontWeight.bold, color: c.text)),
                const SizedBox(height: 2),
                Text(subtitle,
                    style: TextStyle(fontSize: 13, color: c.textMuted)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
