import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/bugie_theme.dart';

/// Pantalla de splash personalizada (después del splash nativo de
/// flutter_native_splash). Muestra el logo wordmark con animación
/// fade + scale sobre un fondo de gradiente violeta-magenta (los
/// colores del logo Bugie), y después de ~1.8s navega a `/`, que
/// el router redirige al destino correcto según sesión.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with TickerProviderStateMixin {

  // Controlador para el logo (fade + scale).
  late final AnimationController _logoCtrl;
  late final Animation<double> _logoFade;
  late final Animation<double> _logoScale;

  // Controlador para el gradiente de fondo (loop infinito mientras
  // se ve el splash, para que tenga vida).
  late final AnimationController _bgCtrl;

  @override
  void initState() {
    super.initState();

    // Logo: 900ms — fade de 0→1 y scale de 0.7→1.0 con elastic out
    // para que tenga ese "rebote" sutil al entrar.
    _logoCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    );
    _logoFade = CurvedAnimation(
      parent: _logoCtrl,
      curve: const Interval(0.0, 0.6, curve: Curves.easeOut),
    );
    _logoScale = Tween<double>(begin: 0.7, end: 1.0).animate(
      CurvedAnimation(
        parent: _logoCtrl,
        curve: Curves.elasticOut,
      ),
    );

    // Fondo: loop 3s para mover el gradiente sutilmente.
    _bgCtrl = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 3),
    )..repeat(reverse: true);

    // Arranca animaciones
    _logoCtrl.forward();

    // A los 1800ms navegar a /. El router redirect manda al destino
    // correcto (welcome si no logueado, dashboard si logueado).
    Future.delayed(const Duration(milliseconds: 1800), () {
      if (mounted) context.go('/');
    });
  }

  @override
  void dispose() {
    _logoCtrl.dispose();
    _bgCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Detecta el modo activo para elegir el gradiente del splash.
    // (El modo lo controla el ThemeController vía MaterialApp.themeMode).
    final bool isDark = Theme.of(context).brightness == Brightness.dark;

    // Gradiente CLARO: brillante azul → rosa (como el mockup claro).
    const lightColors = [
      BugieColors.primary,   // azul
      BugieColors.primary2,  // azul-violeta
      BugieColors.accent2,   // púrpura
      BugieColors.accent,    // rosa-magenta
    ];
    // Gradiente OSCURO: profundo navy → púrpura → magenta (mockup oscuro).
    const darkColors = [
      Color(0xFF0B0F16), // casi negro (Fondo oscuro)
      Color(0xFF16224A), // navy profundo
      Color(0xFF4A1E63), // púrpura
      Color(0xFF8E2E7E), // magenta apagado
    ];
    final colors = isDark ? darkColors : lightColors;

    return Scaffold(
      body: AnimatedBuilder(
        animation: _bgCtrl,
        builder: (context, _) {
          // El gradiente se mueve sutilmente entre dos posiciones
          // para que el fondo no se vea estático.
          final t = _bgCtrl.value;
          return Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment(-1 + t * 0.3, -1),
                end:   Alignment(1, 1 - t * 0.3),
                colors: colors,
                stops: const [0.0, 0.35, 0.7, 1.0],
              ),
            ),
            child: SafeArea(
              child: Center(
                child: AnimatedBuilder(
                  animation: _logoCtrl,
                  builder: (context, child) {
                    return Opacity(
                      opacity: _logoFade.value,
                      child: Transform.scale(
                        scale: _logoScale.value,
                        child: child,
                      ),
                    );
                  },
                  // Composición según la plantilla del PDF:
                  //   1) Wordmark "bugie" (logo.png, blanco) — SIN círculo.
                  //   2) Tagline.
                  //   3) Barra de progreso (rectángulo redondeado).
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Wordmark "bugie". Si falla el asset, texto "bugie".
                      Image.asset(
                        'assets/logo.png',
                        height: 64,
                        fit: BoxFit.contain,
                        errorBuilder: (_, __, ___) => const Text(
                          'bugie',
                          style: TextStyle(
                            fontFamily: kFontHeading,
                            fontSize: 52,
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                          ),
                        ),
                      ),
                      const SizedBox(height: 18),

                      // Tagline (igual al mockup)
                      const Text(
                        'Tu viaje. Tu envío.\nSiempre contigo.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontFamily: kFontBody,
                          color: Colors.white,
                          fontSize: 15,
                          fontWeight: FontWeight.w500,
                          height: 1.4,
                          letterSpacing: 0.3,
                        ),
                      ),
                      const SizedBox(height: 44),

                      // Barra de progreso (rectángulo redondeado), no spinner.
                      SizedBox(
                        width: 190,
                        height: 6,
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(999),
                          child: LinearProgressIndicator(
                            backgroundColor: Colors.white.withOpacity(0.25),
                            valueColor:
                                const AlwaysStoppedAnimation<Color>(Colors.white),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}