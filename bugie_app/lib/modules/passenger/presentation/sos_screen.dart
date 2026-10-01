import 'dart:async';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:provider/provider.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/widgets/bugie_card.dart';
import '../../sos/data/sos_repository.dart';
import '../../trips/data/trips_repository.dart';
import '../../trips/domain/trip_model.dart';

class PassengerSosScreen extends StatefulWidget {
  const PassengerSosScreen({super.key});

  @override
  State<PassengerSosScreen> createState() => _PassengerSosScreenState();
}

class _PassengerSosScreenState extends State<PassengerSosScreen> {
  Trip? _activeTrip;
  bool _loading = true;
  bool _sending = false;
  bool _sent = false;
  String? _error;
  /// Timer de polling para detectar cuando el admin desactiva el SOS.
  /// Cuando el viaje ya no está en sosActive, mostramos un mensaje al pasajero
  /// y reseteamos el estado a "no enviado" para que pueda cerrar la pantalla.
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    _loadActive();
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<void> _loadActive() async {
    try {
      final t = await context.read<TripsRepository>().getActive();
      if (!mounted) return;

      // ¿El viaje ya NO está en sosActive? Eso significa que el admin lo
      // resolvió. Si veníamos mostrando "Alerta enviada", reseteamos.
      final isStillSos = t != null && t.status == TripStatus.sosActive;
      if (_sent && !isStillSos) {
        // El admin resolvió la alerta. Mostramos toast y reseteamos UI.
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

  /// Polling cada 5s mientras está en "alerta enviada", para detectar cuando
  /// el admin resuelve. Sin esto, el pasajero quedaba mirando "Alerta enviada"
  /// eternamente aunque ya no había alerta activa en el backend.
  void _startPolling() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(
      const Duration(seconds: 5), (_) => _loadActive());
  }

  Future<void> _activate() async {
    if (_activeTrip == null) return;
    setState(() { _sending = true; _error = null; });
    try {
      // Obtener GPS
      double lat = -8.109052, lng = -79.021534; // Trujillo (fallback)
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
    return Scaffold(
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
              child: _sent ? _Sent() : _buildForm(),
            ),
      ),
    );
  }

  Widget _buildForm() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Estado del viaje (alerta adaptativa)
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
            subtitle: 'El SOS solo se activa durante un viaje en curso.',
          ),
        const SizedBox(height: 12),

        // Aviso (alerta adaptativa, roja)
        const _StatusAlert(
          color: BugieColors.danger,
          icon: Icons.warning,
          title: 'Solo para emergencias reales',
          subtitle:
              'Al activar, el centro de monitoreo y la Policía Nacional son notificados con tu ubicación GPS.',
        ),
        const SizedBox(height: 16),

        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(_error!, style: const TextStyle(color: BugieColors.danger)),
          ),

        // Botón activar (rojo emergencia)
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
          label: Text(_sending ? 'Enviando alerta…' : 'ACTIVAR SOS',
              style: const TextStyle(fontSize: 18)),
        ),
        const SizedBox(height: 16),

        // ¿A dónde llega tu alerta?
        BugieCard(
          title: '¿A dónde llega tu alerta?',
          padding: EdgeInsets.zero,
          child: Column(
            children: const [
              ListTile(
                leading: Icon(Icons.headset_mic, color: BugieColors.primary),
                title: Text('Centro de monitoreo Bugie',
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                subtitle: Text('Supervisión 24/7 — recibe tu ubicación en segundos',
                    style: TextStyle(fontSize: 12)),
              ),
              Divider(height: 1, indent: 70),
              ListTile(
                leading: Icon(Icons.shield, color: BugieColors.primary),
                title: Text('Policía Nacional',
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                subtitle: Text('Coordinación directa para respuesta inmediata',
                    style: TextStyle(fontSize: 12)),
              ),
              Divider(height: 1, indent: 70),
              ListTile(
                leading: Icon(Icons.location_on, color: BugieColors.primary),
                title: Text('Tu posición GPS',
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                subtitle: Text('Se comparte automáticamente con los servicios',
                    style: TextStyle(fontSize: 12)),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _Sent extends StatelessWidget {
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
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                  color: c.text)),
          const SizedBox(height: 8),
          Text(
            'El centro de monitoreo de Bugie recibió tu ubicación y está coordinando respuesta. Mantén la calma — ayuda está en camino.',
            textAlign: TextAlign.center,
            style: TextStyle(color: c.textMuted),
          ),
        ],
      ),
    );
  }
}

/// Alerta de estado ADAPTATIVA (claro/oscuro).
/// Fondo = color de estado con baja opacidad (se ve bien sobre fondo claro y
/// oscuro); borde del mismo color; título/subtítulo legibles en ambos modos.
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
                    style: TextStyle(
                        fontWeight: FontWeight.bold, color: c.text)),
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
