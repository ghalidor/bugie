import 'package:flutter/widgets.dart';

/// Utilidades de animación compartidas por los widgets de negociación.
///
/// Todas las animaciones respetan la opción del sistema "Quitar animaciones"
/// (MediaQuery.disableAnimations): si está activa, la duración es cero.
bool reduceMotion(BuildContext context) =>
    MediaQuery.maybeDisableAnimationsOf(context) ?? false;

/// Duración en milisegundos, o cero si el usuario desactivó las animaciones.
Duration motionDuration(BuildContext context, int ms) =>
    reduceMotion(context) ? Duration.zero : Duration(milliseconds: ms);

/// Formato de precio único en toda la app: "S/ 12.00".
String formatSoles(double v) => 'S/ ${v.toStringAsFixed(2)}';
