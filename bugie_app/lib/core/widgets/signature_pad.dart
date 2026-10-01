import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';

/// Controlador de la firma: guarda los trazos y puede exportarlos a PNG base64.
class SignatureController extends ChangeNotifier {
  final List<List<Offset>> _strokes = [];
  List<List<Offset>> get strokes => _strokes;
  bool get isEmpty => _strokes.every((s) => s.isEmpty);

  void startStroke(Offset p) {
    _strokes.add([p]);
    notifyListeners();
  }

  void appendPoint(Offset p) {
    if (_strokes.isEmpty) _strokes.add([]);
    _strokes.last.add(p);
    notifyListeners();
  }

  void clear() {
    _strokes.clear();
    notifyListeners();
  }

  /// Renderiza la firma a PNG (fondo blanco) y la devuelve como data URL base64.
  /// Devuelve null si no hay firma.
  Future<String?> toBase64DataUrl(Size size) async {
    if (isEmpty) return null;
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);
    canvas.drawRect(
        Offset.zero & size, Paint()..color = const Color(0xFFFFFFFF));
    final paint = Paint()
      ..color = const Color(0xFF111111)
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;
    for (final stroke in _strokes) {
      for (int i = 0; i < stroke.length - 1; i++) {
        canvas.drawLine(stroke[i], stroke[i + 1], paint);
      }
    }
    final picture = recorder.endRecording();
    final img = await picture.toImage(
        size.width.toInt().clamp(1, 4096), size.height.toInt().clamp(1, 4096));
    final data = await img.toByteData(format: ui.ImageByteFormat.png);
    if (data == null) return null;
    final b64 = base64Encode(data.buffer.asUint8List());
    return 'data:image/png;base64,$b64';
  }
}

/// Panel donde el usuario dibuja su firma con el dedo.
class SignaturePad extends StatelessWidget {
  final SignatureController controller;
  final double height;
  const SignaturePad({super.key, required this.controller, this.height = 160});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: height,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: const Color(0xFFCBD5E1)),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(10),
          // Listener captura el trazo con eventos de puntero crudos (siempre
          // llegan, aunque estemos dentro de un scroll).
          child: Listener(
            onPointerDown: (e) => controller.startStroke(e.localPosition),
            onPointerMove: (e) => controller.appendPoint(e.localPosition),
            // GestureDetector absorbe el arrastre VERTICAL para que la pantalla
            // NO haga scroll mientras el usuario firma dentro del cuadro.
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onVerticalDragStart: (_) {},
              onVerticalDragUpdate: (_) {},
              onVerticalDragEnd: (_) {},
              child: AnimatedBuilder(
                animation: controller,
                builder: (_, __) => CustomPaint(
                  painter: _SignaturePainter(controller.strokes),
                  size: Size.infinite,
                  child: controller.isEmpty
                      ? const Center(
                          child: Text('Firma aquí',
                              style: TextStyle(color: Color(0xFF94A3B8))),
                        )
                      : null,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _SignaturePainter extends CustomPainter {
  final List<List<Offset>> strokes;
  _SignaturePainter(this.strokes);

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = const Color(0xFF111111)
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;
    for (final stroke in strokes) {
      for (int i = 0; i < stroke.length - 1; i++) {
        canvas.drawLine(stroke[i], stroke[i + 1], paint);
      }
    }
  }

  @override
  bool shouldRepaint(covariant _SignaturePainter old) => true;
}
