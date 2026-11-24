import 'dart:async';
import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';
import 'package:path_provider/path_provider.dart';


/// Resultado de la captura facial. Se devuelve cuando la pantalla se cierra
/// con éxito (Navigator.pop con esto).
class FaceCaptureResult {
  final String filePath;
  final double qualityScore;

  /// true si el conductor completó la prueba de vida antes de la foto.
  final bool livenessPassed;

  FaceCaptureResult({
    required this.filePath,
    required this.qualityScore,
    this.livenessPassed = false,
  });
}

/// Pantalla de captura de selfie con detección facial en vivo.
/// Solo cierra con foto válida (POP con FaceCaptureResult) o cancelada (POP con null).
///
/// Si [livenessChallenges] es true (interruptor del admin
/// `face_verification_enabled`), antes de la foto se piden 2 retos en orden
/// aleatorio: parpadear y girar la cabeza hacia un lado. Si es false, la
/// pantalla funciona igual que siempre.
class FaceCaptureScreen extends StatefulWidget {
  final bool livenessChallenges;

  const FaceCaptureScreen({super.key, this.livenessChallenges = false});

  @override
  State<FaceCaptureScreen> createState() => _FaceCaptureScreenState();
}

class _FaceCaptureScreenState extends State<FaceCaptureScreen>
    with WidgetsBindingObserver {
  // ── Cámara ───────────────────────────────────────────────────────────
  CameraController? _camera;
  List<CameraDescription> _availableCameras = const [];
  /// Índice en _availableCameras de la cámara seleccionada actualmente.
  int _selectedCameraIdx = 0;
  bool _initializing = true;
  String? _initError;

  // ── ML Kit ────────────────────────────────────────────────────────────
  late final FaceDetector _faceDetector;
  /// True mientras un frame se está analizando — evita acumular trabajo.
  bool _processingFrame = false;

  // ── Estado de validación facial ──────────────────────────────────────
  /// Lista ordenada de checks que pueden estar OK o NO según el frame actual.
  /// El usuario los ve como una lista de KPIs con tilde verde / círculo rojo.
  _FaceChecks _checks = _FaceChecks.empty();

  /// Timer que cuenta atrás cuando TODAS las condiciones están OK por un rato.
  /// Cuando llega a 0 → disparamos la captura.
  Timer? _captureCountdown;
  int _countdownSecs = 0;

  /// True mientras estamos tomando la foto (entre takePicture y el cierre).
  bool _capturing = false;

  // ── Prueba de vida (solo si widget.livenessChallenges) ───────────────
  /// Retos en el orden en que se piden (se sortea al empezar).
  List<_Challenge> _challenges = const [];
  /// Índice del reto actual. Igual a _challenges.length = todos completados.
  int _challengeIdx = 0;
  /// Primera mitad del reto cumplida (ojos cerrados / cabeza girada);
  /// falta la segunda (ojos abiertos / volver al frente).
  bool _challengeHalfDone = false;
  /// Cuándo empezó el intento actual del reto (para el tiempo límite).
  /// Null = todavía no hay un rostro válido para empezar.
  DateTime? _challengeStartedAt;
  /// trackingId de ML Kit del rostro que está haciendo la prueba.
  int? _livenessFaceId;
  /// Desde cuándo no se ve el rostro (tolerancia a frames sueltos).
  DateTime? _faceLostAt;
  /// Aviso temporal ("No detectamos el movimiento…") y hasta cuándo se ve.
  String? _livenessHint;
  DateTime? _livenessHintUntil;

  static const _challengeTimeout = Duration(seconds: 8);
  static const _faceLostTolerance = Duration(milliseconds: 700);

  bool get _livenessPending =>
      widget.livenessChallenges && _challengeIdx < _challenges.length;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    if (widget.livenessChallenges) _resetLiveness();
    _faceDetector = FaceDetector(
      options: FaceDetectorOptions(
        // Seguimiento del rostro (trackingId) solo para la prueba de vida:
        // así sabemos que es la misma cara durante todo el proceso.
        enableTracking: widget.livenessChallenges,
        // performanceMode.fast: 30 FPS aprox. Suficiente para verificar.
        // performanceMode.accurate sería para análisis post-mortem, gasta más batería.
        performanceMode: FaceDetectorMode.fast,
        // enableContours: false porque solo necesitamos posición + ojos abiertos.
        // Habilitarlo gasta mucho extra y no aporta.
        enableContours: false,
        enableLandmarks: true,        // para ojos, nariz, boca
        enableClassification: true,   // probabilidades de ojos abiertos + sonrisa
        minFaceSize: 0.15,            // 15%: detecta a distancia normal de selfie (0.30 era muy estricto)
      ),
    );
    _initializeCamera();
  }

  /// Inicializa la cámara seleccionada. Se llama al entrar y al cambiar de
  /// cámara (selfie ⇄ trasera).
  Future<void> _initializeCamera() async {
    setState(() {
      _initializing = true;
      _initError    = null;
    });
    try {
      _availableCameras = await availableCameras();
      if (_availableCameras.isEmpty) {
        setState(() {
          _initError    = 'No se detectó ninguna cámara en este dispositivo.';
          _initializing = false;
        });
        return;
      }
      // Preferencia inicial: cámara frontal. Si no hay frontal, la primera.
      if (_camera == null) {
        final frontIdx = _availableCameras.indexWhere(
          (c) => c.lensDirection == CameraLensDirection.front,
        );
        _selectedCameraIdx = frontIdx >= 0 ? frontIdx : 0;
      }

      // Liberamos el anterior antes de crear uno nuevo (cambio de cámara).
      await _camera?.dispose();

      _camera = CameraController(
        _availableCameras[_selectedCameraIdx],
        ResolutionPreset.high,        // suficiente para una selfie
        enableAudio: false,
        imageFormatGroup: Platform.isAndroid
            ? ImageFormatGroup.nv21
            : ImageFormatGroup.bgra8888,
      );
      await _camera!.initialize();
      if (!mounted) return;

      // Arrancamos el stream de frames para que ML Kit los analice.
      await _camera!.startImageStream(_onCameraImage);

      setState(() => _initializing = false);
    } catch (e) {
      setState(() {
        _initError    = 'No se pudo abrir la cámara: $e';
        _initializing = false;
      });
    }
  }

  /// Cambia de cámara frontal ⇄ trasera.
  Future<void> _switchCamera() async {
    if (_availableCameras.length < 2) return;
    setState(() {
      _selectedCameraIdx = (_selectedCameraIdx + 1) % _availableCameras.length;
      _cancelCountdown();   // reset checks al cambiar
      _checks = _FaceChecks.empty();
      if (widget.livenessChallenges) _resetLiveness();
    });
    await _initializeCamera();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Detección facial — se llama por cada frame de la cámara.
  // ═══════════════════════════════════════════════════════════════════════
  Future<void> _onCameraImage(CameraImage image) async {
    if (_processingFrame || _capturing) return;
    _processingFrame = true;

    try {
      final input = _toInputImage(image);
      if (input == null) {
        _processingFrame = false;
        return;
      }
      final faces = await _faceDetector.processImage(input);
      final checks = _evaluateFaces(faces, image.width, image.height);

      if (!mounted) return;
      setState(() {
        _checks = checks;
        if (widget.livenessChallenges) _updateLiveness(faces, checks);
      });

      // Con prueba de vida: la foto se toma recién al completar los retos.
      if (_livenessPending) {
        _cancelCountdown();
      } else if (checks.allOk()) {
        _startCountdownIfIdle();
      } else {
        _cancelCountdown();
      }
    } catch (_) {
      // Si un frame falla lo ignoramos y seguimos con el siguiente.
    } finally {
      _processingFrame = false;
    }
  }

  /// Convierte un CameraImage al formato que entiende ML Kit.
  InputImage? _toInputImage(CameraImage image) {
    final camera = _availableCameras[_selectedCameraIdx];
    final sensorOrientation = camera.sensorOrientation;

    // Calcular rotación según orientación del sensor + dirección de la cámara.
    InputImageRotation? rotation;
    if (Platform.isIOS) {
      rotation = InputImageRotationValue.fromRawValue(sensorOrientation);
    } else if (Platform.isAndroid) {
      // En Android usamos la rotación del sensor directo (la cámara ya nos
      // devuelve frames en orientación correcta para el formato nv21).
      var rotationCompensation = sensorOrientation;
      if (camera.lensDirection == CameraLensDirection.front) {
        rotationCompensation = (sensorOrientation + 360) % 360;
      }
      rotation = InputImageRotationValue.fromRawValue(rotationCompensation);
    }
    if (rotation == null) return null;

    // Forzamos el formato según la plataforma en vez de derivarlo del raw:
    // en varios Android reales image.format.raw no mapea y quedaba null,
    // devolviendo null aquí y ML Kit nunca recibía el frame.
    final format = Platform.isAndroid
        ? InputImageFormat.nv21
        : InputImageFormat.bgra8888;

    // Android puede entregar la imagen en 1 plano (NV21, lo ideal) o en 3
    // (YUV_420_888). ML Kit necesita NV21: si vienen 3 planos, lo construimos.
    final Uint8List bytes;
    final int bytesPerRow;
    if (image.planes.length == 1) {
      bytes = image.planes.first.bytes;
      bytesPerRow = image.planes.first.bytesPerRow;
    } else {
      bytes = _yuv420ToNv21(image);
      bytesPerRow = image.width;
    }
    return InputImage.fromBytes(
      bytes: bytes,
      metadata: InputImageMetadata(
        size: Size(image.width.toDouble(), image.height.toDouble()),
        rotation: rotation,
        format: format,
        bytesPerRow: bytesPerRow,
      ),
    );
  }

  /// Construye bytes NV21 a partir de un CameraImage YUV_420_888 (3 planos).
  /// NV21 = plano Y completo + plano VU intercalado.
  Uint8List _yuv420ToNv21(CameraImage image) {
    final int width = image.width;
    final int height = image.height;
    final yBytes = image.planes[0].bytes;
    final uBytes = image.planes[1].bytes;
    final vBytes = image.planes[2].bytes;

    final int ySize = width * height;
    final out = Uint8List(ySize + width * height ~/ 2);

    // Y (respetando el rowStride del plano)
    final int yRowStride = image.planes[0].bytesPerRow;
    int pos = 0;
    for (int row = 0; row < height; row++) {
      out.setRange(pos, pos + width, yBytes, row * yRowStride);
      pos += width;
    }

    // VU intercalado (NV21)
    final int uvRowStride = image.planes[1].bytesPerRow;
    final int uvPixelStride = image.planes[1].bytesPerPixel ?? 1;
    for (int row = 0; row < height ~/ 2; row++) {
      for (int col = 0; col < width ~/ 2; col++) {
        final int uvIndex = row * uvRowStride + col * uvPixelStride;
        out[pos++] = vBytes[uvIndex];
        out[pos++] = uBytes[uvIndex];
      }
    }
    return out;
  }

  /// Evalúa todos los checks en base a las caras detectadas en este frame.
  _FaceChecks _evaluateFaces(List<Face> faces, int frameW, int frameH) {
    if (faces.isEmpty) {
      return _FaceChecks(
        hasFace:        false,
        oneFaceOnly:    false,
        wellCentered:   false,
        goodSize:       false,
        eyesOpen:       false,
        straightAngle:  false,
      );
    }
    if (faces.length > 1) {
      return _FaceChecks(
        hasFace:        true,
        oneFaceOnly:    false,
        wellCentered:   false,
        goodSize:       false,
        eyesOpen:       false,
        straightAngle:  false,
      );
    }

    final face = faces.first;
    final box  = face.boundingBox;

    // ── Centrado: el óvalo es solo una GUÍA VISUAL para el conductor.
    // No validamos por coordenadas porque las que devuelve ML Kit no
    // corresponden directo con lo que ve el conductor (orientación del
    // sensor, mirror de la cámara frontal, ratio del preview vs frame).
    // Comparar pixel a pixel daría falsos negativos.
    //
    // Razonamiento: si ML Kit detecta UN rostro Y tiene buen tamaño Y
    // está mirando derecho, entonces ESTÁ centrado lo suficiente para
    // capturar. El óvalo en pantalla ayuda al conductor a posicionarse
    // visualmente, pero la decisión es de ML Kit + tamaño.
    final centered = true;

    // ── Tamaño: la cara debe ocupar entre 25% y 70% del lado más corto. ──
    // Muy chica = está lejos. Muy grande = está pegado a la cámara.
    final frameMin = math.min(frameW, frameH).toDouble();
    final faceSize = math.max(box.width, box.height);
    final sizeRatio = faceSize / frameMin;
    final goodSize  = sizeRatio >= 0.25 && sizeRatio <= 0.70;

    // ── Ojos abiertos: si tenemos los datos. ML Kit a veces no los devuelve.
    final leftEyeProb  = face.leftEyeOpenProbability  ?? 1.0;
    final rightEyeProb = face.rightEyeOpenProbability ?? 1.0;
    // Pedimos >60% para cada ojo (umbral cómodo, no muy estricto).
    final eyesOpen = leftEyeProb > 0.6 && rightEyeProb > 0.6;

    // ── Ángulo: la cabeza no debe estar muy inclinada de costado ni mirar
    // demasiado a un lado.
    final yaw   = (face.headEulerAngleY ?? 0.0).abs(); // izq/der
    final roll  = (face.headEulerAngleZ ?? 0.0).abs(); // inclinación lateral
    final straight = yaw < 15.0 && roll < 15.0;

    return _FaceChecks(
      hasFace:       true,
      oneFaceOnly:   true,
      wellCentered:  centered,
      goodSize:      goodSize,
      eyesOpen:      eyesOpen,
      straightAngle: straight,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Prueba de vida: parpadear + girar la cabeza (en orden aleatorio).
  // ═══════════════════════════════════════════════════════════════════════

  /// Empieza la prueba desde cero, con un orden y un lado nuevos.
  void _resetLiveness() {
    final rnd = math.Random();
    final turn = rnd.nextBool() ? _Challenge.turnLeft : _Challenge.turnRight;
    _challenges = rnd.nextBool()
        ? [_Challenge.blink, turn]
        : [turn, _Challenge.blink];
    _challengeIdx = 0;
    _challengeHalfDone = false;
    _challengeStartedAt = null;
    _livenessFaceId = null;
    _faceLostAt = null;
  }

  /// Muestra un aviso temporal sobre la prueba de vida.
  void _showLivenessHint(String text) {
    _livenessHint = text;
    _livenessHintUntil = DateTime.now().add(const Duration(seconds: 3));
  }

  /// Reinicia la prueba porque el rostro cambió o desapareció. Solo avisa
  /// si ya había empezado (para no mostrar el aviso al entrar).
  void _restartLiveness() {
    final started = _livenessFaceId != null || _challengeStartedAt != null;
    _resetLiveness();
    if (started) {
      _showLivenessHint('Mantén tu rostro en el óvalo. Empecemos de nuevo.');
    }
  }

  /// Avanza la prueba de vida con el frame actual. Se llama dentro de
  /// setState. Además de los retos, vigila que sea siempre UNA sola cara y
  /// la misma (trackingId) hasta que se toma la foto.
  void _updateLiveness(List<Face> faces, _FaceChecks checks) {
    final now = DateTime.now();
    final started = _livenessFaceId != null || _challengeStartedAt != null;

    // Dos o más personas: se reinicia.
    if (faces.length > 1) {
      if (started) _restartLiveness();
      return;
    }

    // Sin rostro: se tolera un instante (frames sueltos sin detección).
    if (faces.isEmpty) {
      if (!started) return;
      _faceLostAt ??= now;
      if (now.difference(_faceLostAt!) > _faceLostTolerance) _restartLiveness();
      return;
    }
    _faceLostAt = null;

    final face = faces.first;
    final id = face.trackingId;
    // Otra cara distinta a la que empezó: se reinicia.
    if (_livenessFaceId != null && id != null && id != _livenessFaceId) {
      _restartLiveness();
      return;
    }

    // Retos ya completados: solo se vigila que siga siendo la misma cara.
    if (!_livenessPending) return;

    // Para empezar: un solo rostro a buena distancia.
    if (_challengeStartedAt == null) {
      if (!checks.goodSize) return;
      _livenessFaceId = id;
      _challengeStartedAt = now;
      _challengeHalfDone = false;
    }
    _livenessFaceId ??= id;

    final challenge = _challenges[_challengeIdx];
    final done = challenge == _Challenge.blink
        ? _evalBlink(face)
        : _evalTurn(face, challenge == _Challenge.turnLeft);

    if (done) {
      _challengeIdx++;
      _challengeHalfDone = false;
      _challengeStartedAt = now; // el siguiente reto arranca su tiempo
      return;
    }

    // Tiempo agotado: se repite el mismo reto.
    if (now.difference(_challengeStartedAt!) > _challengeTimeout) {
      _challengeHalfDone = false;
      _challengeStartedAt = now;
      _showLivenessHint('No detectamos el movimiento, inténtalo de nuevo');
    }
  }

  /// Parpadeo: primero ambos ojos cerrados (< 0.2) y luego abiertos (> 0.6).
  bool _evalBlink(Face face) {
    final l = face.leftEyeOpenProbability;
    final r = face.rightEyeOpenProbability;
    if (l == null || r == null) return false;
    if (!_challengeHalfDone) {
      if (l < 0.2 && r < 0.2) _challengeHalfDone = true;
      return false;
    }
    return l > 0.6 && r > 0.6;
  }

  /// Giro: más de 18° hacia el lado pedido y luego volver al frente (< 10°).
  ///
  /// ML Kit: headEulerAngleY positivo = la cara gira hacia la derecha de la
  /// imagen del sensor (sin espejo), que es la IZQUIERDA de la persona.
  bool _evalTurn(Face face, bool toLeft) {
    final yaw = face.headEulerAngleY;
    if (yaw == null) return false;
    if (!_challengeHalfDone) {
      final towardSide = toLeft ? yaw : -yaw;
      if (towardSide > 18) _challengeHalfDone = true;
      return false;
    }
    return yaw.abs() < 10;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Countdown + captura
  // ═══════════════════════════════════════════════════════════════════════
  void _startCountdownIfIdle() {
    if (_captureCountdown != null) return;  // ya hay uno corriendo
    setState(() => _countdownSecs = 2);     // 2 segundos de ventana

    _captureCountdown = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) { t.cancel(); return; }
      setState(() => _countdownSecs--);
      if (_countdownSecs <= 0) {
        t.cancel();
        _captureCountdown = null;
        _capturePhoto();
      }
    });
  }

  void _cancelCountdown() {
    if (_captureCountdown == null) return;
    _captureCountdown?.cancel();
    _captureCountdown = null;
    setState(() => _countdownSecs = 0);
  }

  Future<void> _capturePhoto() async {
    if (_capturing || _camera == null || !_camera!.value.isInitialized) return;
    setState(() => _capturing = true);

    try {
      // Detenemos el stream para que takePicture funcione (no se puede
      // tomar foto con el stream activo en Android).
      await _camera!.stopImageStream();
      final picture = await _camera!.takePicture();

      // Movemos a un path temporal con nombre descriptivo.
      final tempDir = await getTemporaryDirectory();
      final ts = DateTime.now().millisecondsSinceEpoch;
      final finalPath = '${tempDir.path}/face_$ts.jpg';
      await File(picture.path).copy(finalPath);
      // Intentamos borrar el original (si falla, no es crítico).
      try { await File(picture.path).delete(); } catch (_) {}

      // Score: 1.0 si todos los checks pasaron, 0 si no. Por ahora simple.
      // Más adelante podríamos calcular un score más rico (ej. promedio de
      // probabilidades de ojos abiertos, distancia al centro, etc.)
      final score = _checks.scoreNumeric();

      if (!mounted) return;
      Navigator.of(context).pop(
        FaceCaptureResult(
          filePath: finalPath,
          qualityScore: score,
          livenessPassed: widget.livenessChallenges && !_livenessPending,
        ),
      );
    } catch (e) {
      setState(() {
        _capturing = false;
        _initError = 'No se pudo capturar la foto: $e';
      });
      // Reactivar el stream para que el usuario pueda reintentar.
      try { await _camera?.startImageStream(_onCameraImage); } catch (_) {}
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Ciclo de vida
  // ═══════════════════════════════════════════════════════════════════════
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Al ir a background, soltar la cámara. Al volver, reabrirla.
    if (state == AppLifecycleState.inactive) {
      _camera?.dispose();
    } else if (state == AppLifecycleState.resumed) {
      // La prueba de vida vuelve a empezar al regresar a la app.
      if (widget.livenessChallenges) _resetLiveness();
      _initializeCamera();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _captureCountdown?.cancel();
    _camera?.dispose();
    _faceDetector.close();
    super.dispose();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // UI
  // ═══════════════════════════════════════════════════════════════════════
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    if (_initializing) {
      return const Center(child: CircularProgressIndicator(color: Colors.white));
    }
    if (_initError != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, color: Colors.red, size: 64),
              const SizedBox(height: 16),
              Text(
                _initError!,
                style: const TextStyle(color: Colors.white, fontSize: 16),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('Cerrar'),
              ),
            ],
          ),
        ),
      );
    }
    if (_camera == null || !_camera!.value.isInitialized) {
      return const Center(child: CircularProgressIndicator(color: Colors.white));
    }

    return Stack(
      children: [
        // ── Preview de la cámara llenando la pantalla ─────────────────
        Positioned.fill(child: CameraPreview(_camera!)),

        // ── Overlay con óvalo guía ─────────────────────────────────────
        Positioned.fill(
          child: CustomPaint(
            painter: _OvalGuidePainter(
              allOk: _checks.allOk() && !_livenessPending,
              countdown: _countdownSecs,
            ),
          ),
        ),

        // ── Header: cerrar + cambiar cámara ────────────────────────────
        Positioned(
          top: 16, left: 16, right: 16,
          child: Row(
            children: [
              IconButton(
                icon: const Icon(Icons.close, color: Colors.white, size: 28),
                onPressed: () => Navigator.of(context).pop(),
                tooltip: 'Cancelar',
              ),
              const Spacer(),
              if (_availableCameras.length > 1)
                IconButton(
                  icon: const Icon(Icons.cameraswitch, color: Colors.white, size: 28),
                  onPressed: _switchCamera,
                  tooltip: 'Cambiar cámara',
                ),
            ],
          ),
        ),

        // ── Instrucción principal (arriba) ─────────────────────────────
        // Con prueba de vida pendiente se muestra el reto en su lugar.
        Positioned(
          top: 80, left: 16, right: 16,
          child: _livenessPending ? _buildChallengeCard() : Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: Colors.black.withOpacity(0.55),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              _checks.mainInstruction(),
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 15,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ),

        // ── KPIs debajo del óvalo ──────────────────────────────────────
        Positioned(
          left: 16, right: 16, bottom: 32,
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.black.withOpacity(0.65),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (_countdownSecs > 0)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Row(
                      children: [
                        const Icon(Icons.timer, color: Colors.greenAccent),
                        const SizedBox(width: 8),
                        Text(
                          'Capturando en $_countdownSecs…',
                          style: const TextStyle(
                            color: Colors.greenAccent,
                            fontWeight: FontWeight.bold,
                            fontSize: 14,
                          ),
                        ),
                      ],
                    ),
                  ),
                _kpi('Hay un rostro',           _checks.hasFace),
                _kpi('Solo un rostro',          _checks.oneFaceOnly),
                _kpi('Rostro en el óvalo',      _checks.wellCentered),
                _kpi('Distancia correcta',      _checks.goodSize),
                _kpi('Ojos abiertos',           _checks.eyesOpen),
                _kpi('Cabeza derecha',          _checks.straightAngle),
              ],
            ),
          ),
        ),

        // ── Overlay "capturando..." ────────────────────────────────────
        if (_capturing)
          Positioned.fill(
            child: Container(
              color: Colors.black.withOpacity(0.7),
              child: const Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CircularProgressIndicator(color: Colors.white),
                    SizedBox(height: 16),
                    Text('Capturando foto…',
                        style: TextStyle(color: Colors.white, fontSize: 16)),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }

  Widget _kpi(String label, bool ok) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Icon(
            ok ? Icons.check_circle : Icons.radio_button_unchecked,
            color: ok ? Colors.greenAccent : Colors.white60,
            size: 18,
          ),
          const SizedBox(width: 10),
          Text(
            label,
            style: TextStyle(
              color: ok ? Colors.white : Colors.white70,
              fontSize: 13,
              fontWeight: ok ? FontWeight.w600 : FontWeight.normal,
            ),
          ),
        ],
      ),
    );
  }

  /// Tarjeta del reto actual de la prueba de vida: progreso (reto N de 2),
  /// ícono animado, instrucción, tiempo restante y avisos.
  Widget _buildChallengeCard() {
    final challenge = _challenges[_challengeIdx];
    final started = _challengeStartedAt != null;

    // Segunda mitad del reto: qué falta hacer.
    String? detail;
    if (!started) {
      detail = _checks.mainInstruction();
    } else if (_challengeHalfDone) {
      detail = challenge == _Challenge.blink
          ? 'Ahora abre los ojos'
          : 'Ahora vuelve a mirar al frente';
    } else if (challenge == _Challenge.blink) {
      // Un parpadeo muy rápido puede no captarse entre dos frames.
      detail = 'Cierra los ojos un momento y vuelve a abrirlos';
    }

    // Tiempo restante del intento (0..1).
    double remaining = 1;
    if (started) {
      final elapsed = DateTime.now().difference(_challengeStartedAt!);
      remaining = 1 -
          (elapsed.inMilliseconds / _challengeTimeout.inMilliseconds)
              .clamp(0.0, 1.0);
    }

    final hintUntil = _livenessHintUntil;
    final hint = (hintUntil != null && DateTime.now().isBefore(hintUntil))
        ? _livenessHint
        : null;

    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.65),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Progreso de los retos.
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                'Reto ${_challengeIdx + 1} de ${_challenges.length}',
                style: const TextStyle(color: Colors.white70, fontSize: 12),
              ),
              const SizedBox(width: 8),
              for (var i = 0; i < _challenges.length; i++)
                Container(
                  margin: const EdgeInsets.symmetric(horizontal: 3),
                  width: 9,
                  height: 9,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: i < _challengeIdx
                        ? Colors.greenAccent
                        : i == _challengeIdx
                            ? Colors.white
                            : Colors.white24,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              _ChallengeIcon(challenge: challenge),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      challenge.instruction,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (detail != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        detail,
                        style: const TextStyle(
                            color: Colors.white70, fontSize: 13),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
          if (started) ...[
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: remaining,
                minHeight: 4,
                backgroundColor: Colors.white24,
                color: remaining > 0.3 ? Colors.greenAccent : Colors.amber,
              ),
            ),
          ],
          if (hint != null) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(Icons.info_outline, color: Colors.amber, size: 18),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    hint,
                    style: const TextStyle(
                      color: Colors.amber,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Retos de la prueba de vida.
// ═══════════════════════════════════════════════════════════════════════════
enum _Challenge {
  blink,
  turnLeft,
  turnRight;

  String get instruction {
    switch (this) {
      case _Challenge.blink:     return 'Parpadea';
      case _Challenge.turnLeft:  return 'Gira un poco la cabeza hacia la izquierda';
      case _Challenge.turnRight: return 'Gira un poco la cabeza hacia la derecha';
    }
  }
}

/// Ícono animado del reto: un ojo que se abre y cierra (parpadeo) o una
/// flecha que se mueve hacia el lado pedido (giro).
class _ChallengeIcon extends StatefulWidget {
  final _Challenge challenge;
  const _ChallengeIcon({required this.challenge});

  @override
  State<_ChallengeIcon> createState() => _ChallengeIconState();
}

class _ChallengeIconState extends State<_ChallengeIcon>
    with SingleTickerProviderStateMixin {
  late final AnimationController _anim = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 700),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _anim.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 48,
      height: 48,
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.12),
        shape: BoxShape.circle,
      ),
      child: AnimatedBuilder(
        animation: _anim,
        builder: (_, __) {
          if (widget.challenge == _Challenge.blink) {
            return Icon(
              _anim.value < 0.5 ? Icons.visibility : Icons.visibility_off,
              color: Colors.white,
              size: 26,
            );
          }
          // La vista previa es en espejo: la flecha a la izquierda de la
          // pantalla coincide con la izquierda del conductor.
          final toLeft = widget.challenge == _Challenge.turnLeft;
          return Transform.translate(
            offset: Offset((toLeft ? -6 : 6) * _anim.value, 0),
            child: Icon(
              toLeft ? Icons.arrow_back_rounded : Icons.arrow_forward_rounded,
              color: Colors.white,
              size: 26,
            ),
          );
        },
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Estructura interna para tracking de los checks faciales en cada frame.
// ═══════════════════════════════════════════════════════════════════════════
class _FaceChecks {
  final bool hasFace;
  final bool oneFaceOnly;
  final bool wellCentered;
  final bool goodSize;
  final bool eyesOpen;
  final bool straightAngle;

  _FaceChecks({
    required this.hasFace,
    required this.oneFaceOnly,
    required this.wellCentered,
    required this.goodSize,
    required this.eyesOpen,
    required this.straightAngle,
  });

  factory _FaceChecks.empty() => _FaceChecks(
        hasFace: false, oneFaceOnly: false, wellCentered: false,
        goodSize: false, eyesOpen: false, straightAngle: false,
      );

  bool allOk() =>
      hasFace && oneFaceOnly && wellCentered && goodSize && eyesOpen && straightAngle;

  /// Mensaje principal mostrado arriba según el problema más prioritario.
  String mainInstruction() {
    if (!hasFace)       return 'Coloca tu rostro frente a la cámara';
    if (!oneFaceOnly)   return 'Solo debe aparecer una persona';
    if (!goodSize)      return 'Acerca o aleja tu rostro';
    if (!straightAngle) return 'Mira directamente a la cámara';
    if (!eyesOpen)      return 'Mantén los ojos abiertos';
    return '¡Perfecto! Mantén la posición';
  }

  /// Score 0-1 estimando qué tan bien está la captura (informativo).
  double scoreNumeric() {
    final flags = [hasFace, oneFaceOnly, wellCentered, goodSize, eyesOpen, straightAngle];
    final ok = flags.where((f) => f).length;
    return ok / flags.length;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Painter del óvalo guía sobre la cámara.
// El óvalo cambia de color según si todos los checks pasan o no:
//   - Rojo:    falta algo
//   - Verde:   todo OK (esperando el countdown)
//   - Amarillo: en cuenta atrás
// ═══════════════════════════════════════════════════════════════════════════
class _OvalGuidePainter extends CustomPainter {
  final bool allOk;
  final int countdown;

  _OvalGuidePainter({required this.allOk, required this.countdown});

  @override
  void paint(Canvas canvas, Size size) {
    // El óvalo ocupa ~70% del ancho centrado, ratio 4:5 vertical (más alto que ancho).
    final ovalWidth  = size.width * 0.70;
    final ovalHeight = ovalWidth * 1.30;
    final ovalRect = Rect.fromCenter(
      center: Offset(size.width / 2, size.height / 2),
      width: ovalWidth,
      height: ovalHeight,
    );

    // Color según estado
    final Color color = countdown > 0
        ? Colors.amber
        : (allOk ? Colors.greenAccent : Colors.red.shade400);

    // 1) Capa oscura encima de la pantalla, recortando el óvalo.
    final overlay = Paint()..color = Colors.black.withOpacity(0.45);
    final cutout = Path()
      ..fillType = PathFillType.evenOdd
      ..addRect(Rect.fromLTWH(0, 0, size.width, size.height))
      ..addOval(ovalRect);
    canvas.drawPath(cutout, overlay);

    // 2) Borde del óvalo.
    final border = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4;
    canvas.drawOval(ovalRect, border);
  }

  @override
  bool shouldRepaint(covariant _OvalGuidePainter oldDelegate) =>
      oldDelegate.allOk != allOk || oldDelegate.countdown != countdown;
}