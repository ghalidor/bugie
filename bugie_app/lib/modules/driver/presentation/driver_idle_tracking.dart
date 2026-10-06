import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';
import '../../../core/services/location_tracking_service.dart';
import '../../../core/session/session.dart';
import '../data/driver_repository.dart';

/// Envía el GPS del conductor mientras está EN LÍNEA sin viaje (cada 30s,
/// o antes si se movió 20m). Así el backend conoce su posición real y le
/// muestra las solicitudes cercanas. Sin esto, el backend se queda con la
/// posición de cuando se conectó (o de su último viaje).
///
/// Va por el endpoint de lote (con 1 punto) para unificar el envío con el
/// del viaje; si no hay red, el punto espera en la cola al siguiente ciclo.
/// Si la sesión se cerró, el propio envío detiene el seguimiento.
void startDriverIdleTracking(BuildContext context) {
  final tracking = context.read<LocationTrackingService>();
  final repo = context.read<DriverRepository>();
  final session = context.read<Session>();

  tracking.start(
    mode: TrackingMode.driverIdle,
    batchSender: (points) async {
      if (!session.isLoggedIn) {
        tracking.stop();
        return;
      }
      await repo.updateLocationBatch(points: points);
    },
  );
}

/// Al entrar al inicio o a solicitudes: si el conductor está en línea y el
/// seguimiento no está corriendo (ej. login, app reabierta), lo enciende.
Future<void> ensureDriverIdleTracking(BuildContext context) async {
  final tracking = context.read<LocationTrackingService>();
  if (tracking.isRunning) return;
  try {
    final d = await context.read<DriverRepository>().getMyProfile();
    if (!context.mounted || d == null || !d.isOnline) return;
    if (!tracking.isRunning) startDriverIdleTracking(context);
  } catch (_) {
    // Sin red: se intentará de nuevo al volver a entrar.
  }
}
