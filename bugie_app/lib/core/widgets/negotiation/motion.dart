import 'package:flutter/widgets.dart';

// Formato de precio único en toda la app ("S/ 12.00"); se re-exporta
// para los widgets de negociación que ya lo usaban desde aquí.
export '../../utils/format.dart' show formatSoles;

/// Utilidades de animación compartidas por los widgets de negociación.
///
/// Todas las animaciones respetan la opción del sistema "Quitar animaciones"
/// (MediaQuery.disableAnimations): si está activa, la duración es cero.
bool reduceMotion(BuildContext context) =>
    MediaQuery.maybeDisableAnimationsOf(context) ?? false;

/// Duración en milisegundos, o cero si el usuario desactivó las animaciones.
Duration motionDuration(BuildContext context, int ms) =>
    reduceMotion(context) ? Duration.zero : Duration(milliseconds: ms);
