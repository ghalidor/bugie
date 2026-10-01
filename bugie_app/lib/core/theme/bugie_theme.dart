import 'package:flutter/material.dart';

// ═════════════════════════════════════════════════════════════════════════
//  COLORES DE MARCA — Fuente única de verdad
//  Tomados de la guía visual del PDF (UI GUIDE / SISTEMA VISUAL).
//
//  NOTA SOBRE MODO CLARO/OSCURO
//  ─────────────────────────────
//  Los valores de ABAJO son los del MODO CLARO (compatibilidad con todo el
//  código existente que usa BugieColors.text, .surface, etc. como constantes).
//
//  Para colores que cambian entre claro y oscuro usa la extensión de tema:
//      context.bugie.text      context.bugie.surface     context.bugie.border ...
//  Eso sí resuelve el color correcto según el modo activo.
//  La migración de pantallas a context.bugie.* se hace módulo por módulo.
// ═════════════════════════════════════════════════════════════════════════

class BugieColors {
  // ── Marca (iguales en claro y oscuro) ──────────────────────────────────
  static const primary  = Color(0xFF2563EB); // Azul Bugie
  static const primary2 = Color(0xFF5B7CEC); // Azul intermedio (para gradientes suaves)
  static const accent   = Color(0xFFFF5BD6); // Rosa Bugie
  static const accent2  = Color(0xFFB85BE0); // Violeta intermedio del gradiente

  // ── Oscuros para HEROES / headers de página ────────────────────────────
  // El header oscuro (BugiePageHeader) usa este gradiente en ambos modos.
  static const heroDark = Color(0xFF0F172A); // Azul Profundo
  static const heroNavy = Color(0xFF1E293B); // Slate profundo

  // ── Estados (iguales en ambos modos) ────────────────────────────────────
  static const danger  = Color(0xFFDC3545);
  static const success = Color(0xFF198754);
  static const info    = Color(0xFF0DCAF0);
  static const warning = Color(0xFFF59E0B);

  // ── Superficies — VALORES DE MODO CLARO ─────────────────────────────────
  static const bg        = Color(0xFFF8FAFC); // Fondo
  static const bg2       = Color(0xFFEEF2F7);
  static const surface   = Color(0xFFFFFFFF); // Superficie / Card
  static const surface2  = Color(0xFFF8FAFC);
  static const text      = Color(0xFF0F172A); // Texto primario (Azul Profundo)
  static const textMuted = Color(0xFF64748B); // Texto secundario (Gris Medio)
  static const border    = Color(0xFFE2E8F0); // Borde (Gris Claro)

  // ── Sobre fondos oscuros (heroes) ───────────────────────────────────────
  static const onDark       = Color(0xFFFFFFFF);
  static const onDarkMuted  = Color(0xBDFFFFFF); // 74%
  static const onDarkBorder = Color(0x33FFFFFF);

  // ── Tokens de DOMINIO DE NEGOCIO ────────────────────────────────────────
  static const mapOrigin        = Color(0xFF2563EB); // Origen del viaje (= azul)
  static const mapDestination   = Color(0xFFFF5BD6); // Destino del viaje (= rosa)
  static const mapWaypoint      = Color(0xFFF59E0B); // Parada intermedia
  static const proposal         = Color(0xFF5B7CEC); // Tarjeta de propuesta
  static const trendDown        = Color(0xFF16A34A); // Bajó precio
  static const trendUp          = Color(0xFFDC2626); // Subió precio
  static const statusSuperseded = Color(0xFF94A3B8); // Histórico modificado
}

// ═════════════════════════════════════════════════════════════════════════
//  EXTENSIÓN DE TEMA — colores que cambian entre CLARO y OSCURO
//  Acceso: context.bugie.text / .surface / .border / ...
//  Registrada dentro de BugieTheme.light() y BugieTheme.dark().
// ═════════════════════════════════════════════════════════════════════════

@immutable
class BugieColorsExt extends ThemeExtension<BugieColorsExt> {
  final Color bg;
  final Color bg2;
  final Color surface;
  final Color surface2;
  final Color text;
  final Color textMuted;
  final Color border;
  // Relleno y borde específicos de los CAMPOS DE TEXTO (inputs).
  // Se separan de `surface`/`border` para garantizar contraste del input
  // tanto sobre el fondo de pantalla como sobre las tarjetas (cards).
  final Color inputFill;
  final Color inputBorder;

  const BugieColorsExt({
    required this.bg,
    required this.bg2,
    required this.surface,
    required this.surface2,
    required this.text,
    required this.textMuted,
    required this.border,
    required this.inputFill,
    required this.inputBorder,
  });

  // Paleta MODO CLARO (PDF)
  static const light = BugieColorsExt(
    bg:        Color(0xFFF8FAFC),
    bg2:       Color(0xFFEEF2F7),
    surface:   Color(0xFFFFFFFF),
    surface2:  Color(0xFFF8FAFC),
    text:      Color(0xFF0F172A),
    textMuted: Color(0xFF64748B),
    border:    Color(0xFFE2E8F0),
    // Input gris claro (más oscuro que el fondo #F8FAFC y que la card blanca)
    inputFill:   Color(0xFFEEF2F7),
    inputBorder: Color(0xFFCBD5E1), // slate-300: se ve claro sobre el relleno
  );

  // Paleta MODO OSCURO (PDF)
  static const dark = BugieColorsExt(
    bg:        Color(0xFF0B0F16), // Fondo Principal
    bg2:       Color(0xFF0F141C),
    surface:   Color(0xFF141A24), // Superficie / Card
    surface2:  Color(0xFF1B2230),
    text:      Color(0xFFF5F6FA), // Texto Primario
    textMuted: Color(0xFFA7B0C0), // Texto Secundario
    border:    Color(0xFF232B38), // Borde Sutil
    // Input más claro que el fondo y que la card, para que resalte
    inputFill:   Color(0xFF1B2230),
    inputBorder: Color(0xFF33405A),
  );

  @override
  BugieColorsExt copyWith({
    Color? bg, Color? bg2, Color? surface, Color? surface2,
    Color? text, Color? textMuted, Color? border,
    Color? inputFill, Color? inputBorder,
  }) {
    return BugieColorsExt(
      bg: bg ?? this.bg,
      bg2: bg2 ?? this.bg2,
      surface: surface ?? this.surface,
      surface2: surface2 ?? this.surface2,
      text: text ?? this.text,
      textMuted: textMuted ?? this.textMuted,
      border: border ?? this.border,
      inputFill: inputFill ?? this.inputFill,
      inputBorder: inputBorder ?? this.inputBorder,
    );
  }

  @override
  BugieColorsExt lerp(ThemeExtension<BugieColorsExt>? other, double t) {
    if (other is! BugieColorsExt) return this;
    return BugieColorsExt(
      bg: Color.lerp(bg, other.bg, t)!,
      bg2: Color.lerp(bg2, other.bg2, t)!,
      surface: Color.lerp(surface, other.surface, t)!,
      surface2: Color.lerp(surface2, other.surface2, t)!,
      text: Color.lerp(text, other.text, t)!,
      textMuted: Color.lerp(textMuted, other.textMuted, t)!,
      border: Color.lerp(border, other.border, t)!,
      inputFill: Color.lerp(inputFill, other.inputFill, t)!,
      inputBorder: Color.lerp(inputBorder, other.inputBorder, t)!,
    );
  }
}

/// Atajo: `context.bugie.text`, `context.bugie.surface`, etc.
extension BugieThemeContext on BuildContext {
  BugieColorsExt get bugie =>
      Theme.of(this).extension<BugieColorsExt>() ?? BugieColorsExt.light;
}

// ═════════════════════════════════════════════════════════════════════════
//  GRADIENTES
// ═════════════════════════════════════════════════════════════════════════

/// Gradiente principal del PDF: Azul Bugie → Rosa Bugie.
/// Para botones primarios destacados, welcome/login, splash.
const bugieGradient = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [
    BugieColors.primary, // #2563EB
    BugieColors.accent,  // #FF5BD6
  ],
);

/// Gradiente HERO oscuro — usado por los headers de página internos.
const bugieHeroGradient = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [
    BugieColors.heroDark, // #0F172A
    BugieColors.heroNavy, // #1E293B
  ],
);

// ═════════════════════════════════════════════════════════════════════════
//  TIPOGRAFÍA (familias de la guía: Poppins para títulos, Inter para texto)
//  Para que se carguen realmente hay que añadir las fuentes (ver instrucciones).
//  Si no están instaladas, Flutter usa la fuente del sistema sin romper nada.
// ═════════════════════════════════════════════════════════════════════════

const String kFontHeading = 'Poppins';
const String kFontBody    = 'Inter';

// ═════════════════════════════════════════════════════════════════════════
//  ESPACIADOS / RADIOS
// ═════════════════════════════════════════════════════════════════════════

class BugieSpacing {
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 16.0;
  static const lg = 24.0;
  static const xl = 32.0;
  static const xxl = 48.0;
}

class BugieRadius {
  static const sm = 12.0;
  static const md = 14.0;
  static const lg = 18.0;
  static const xl = 22.0;
  static const xxl = 28.0;
  static const pill = 999.0;
}

// ═════════════════════════════════════════════════════════════════════════
//  TIPOGRAFÍA — estilos reutilizables (valores de MODO CLARO)
// ═════════════════════════════════════════════════════════════════════════

class BugieText {
  static const eyebrow = TextStyle(
    fontFamily: kFontBody,
    fontSize: 12, fontWeight: FontWeight.bold,
    color: BugieColors.accent, letterSpacing: 1.2,
  );

  static const h1 = TextStyle(
    fontFamily: kFontHeading,
    fontSize: 26, fontWeight: FontWeight.bold,
    color: BugieColors.text, height: 1.2, letterSpacing: -0.5,
  );

  static const h2 = TextStyle(
    fontFamily: kFontHeading,
    fontSize: 18, fontWeight: FontWeight.bold, color: BugieColors.text,
  );

  static const h3 = TextStyle(
    fontFamily: kFontHeading,
    fontSize: 15, fontWeight: FontWeight.bold, color: BugieColors.text,
  );

  static const body  = TextStyle(fontFamily: kFontBody, fontSize: 14, color: BugieColors.text);
  static const muted = TextStyle(fontFamily: kFontBody, fontSize: 14, color: BugieColors.textMuted);
  static const small = TextStyle(fontFamily: kFontBody, fontSize: 12, color: BugieColors.textMuted);

  static const label = TextStyle(
    fontFamily: kFontBody,
    fontSize: 13, fontWeight: FontWeight.w600, color: BugieColors.text,
  );

  // ── Sobre fondo oscuro (heroes) ─────────────────────────────────────────
  static const onDarkH1 = TextStyle(
    fontFamily: kFontHeading,
    fontSize: 24, fontWeight: FontWeight.bold,
    color: Colors.white, height: 1.2, letterSpacing: -0.5,
  );

  static const onDarkH2 = TextStyle(
    fontFamily: kFontHeading,
    fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white,
  );

  static const onDarkBody = TextStyle(
    fontFamily: kFontBody, fontSize: 14, color: BugieColors.onDarkMuted,
  );

  static const onDarkEyebrow = TextStyle(
    fontFamily: kFontBody,
    fontSize: 11, fontWeight: FontWeight.bold,
    color: Colors.white, letterSpacing: 1.2,
  );
}

// ═════════════════════════════════════════════════════════════════════════
//  BOTONES (sin cambios de API — solo heredan los colores de marca nuevos)
// ═════════════════════════════════════════════════════════════════════════

class BugieButtons {
  static Widget primary({
    required String text, required VoidCallback? onPressed,
    bool loading = false, IconData? icon, double height = 52,
  }) => _BugieButton(
    text: text, onPressed: loading ? null : onPressed, loading: loading, icon: icon,
    backgroundColor: BugieColors.primary, foregroundColor: Colors.white,
    gradient: bugieGradient, // Azul → Rosa (look de la plantilla)
    elevation: 2, shadowColor: BugieColors.primary.withOpacity(0.35), height: height,
  );

  static Widget secondary({
    required String text, required VoidCallback? onPressed,
    bool loading = false, IconData? icon, double height = 52,
  }) => _BugieButton(
    text: text, onPressed: loading ? null : onPressed, loading: loading, icon: icon,
    // Colores reales salen del tema (claro/oscuro) por adaptiveOutline.
    backgroundColor: BugieColors.surface, foregroundColor: BugieColors.text,
    borderColor: BugieColors.border, elevation: 0, height: height,
    adaptiveOutline: true,
  );

  static Widget onDarkPrimary({
    required String text, required VoidCallback? onPressed,
    bool loading = false, IconData? icon, double height = 54,
  }) => _BugieButton(
    text: text, onPressed: loading ? null : onPressed, loading: loading, icon: icon,
    backgroundColor: Colors.white, foregroundColor: BugieColors.heroDark,
    elevation: 4, shadowColor: Colors.black38, height: height,
  );

  static Widget onDarkSecondary({
    required String text, required VoidCallback? onPressed,
    bool loading = false, IconData? icon, double height = 54,
  }) => _BugieButton(
    text: text, onPressed: loading ? null : onPressed, loading: loading, icon: icon,
    backgroundColor: Colors.white.withOpacity(0.12), foregroundColor: Colors.white,
    borderColor: Colors.white, borderWidth: 2, elevation: 0, height: height,
  );

  static Widget danger({
    required String text, required VoidCallback? onPressed,
    bool loading = false, IconData? icon, double height = 52,
  }) => _BugieButton(
    text: text, onPressed: loading ? null : onPressed, loading: loading, icon: icon,
    backgroundColor: BugieColors.danger, foregroundColor: Colors.white,
    elevation: 2, shadowColor: BugieColors.danger.withOpacity(0.35), height: height,
  );

  static Widget success({
    required String text, required VoidCallback? onPressed,
    bool loading = false, IconData? icon, double height = 52,
  }) => _BugieButton(
    text: text, onPressed: loading ? null : onPressed, loading: loading, icon: icon,
    backgroundColor: BugieColors.success, foregroundColor: Colors.white,
    elevation: 2, shadowColor: BugieColors.success.withOpacity(0.35), height: height,
  );
}

class _BugieButton extends StatelessWidget {
  final String text;
  final VoidCallback? onPressed;
  final bool loading;
  final IconData? icon;
  final Color backgroundColor;
  final Color foregroundColor;
  final Gradient? gradient; // si viene, pinta el fondo con gradiente
  final Color? borderColor;
  final double borderWidth;
  final double elevation;
  final Color? shadowColor;
  final double height;
  // Si es true, el botón resuelve bg/texto/borde desde el tema (claro/oscuro)
  // en vez de usar colores fijos. Se usa para el botón secundario (outline).
  final bool adaptiveOutline;

  const _BugieButton({
    required this.text, required this.onPressed, required this.loading,
    required this.icon, required this.backgroundColor,
    required this.foregroundColor, this.gradient, this.borderColor,
    this.borderWidth = 1.5,
    required this.elevation, this.shadowColor, required this.height,
    this.adaptiveOutline = false,
  });

  @override
  Widget build(BuildContext context) {
    // Colores efectivos: si es outline adaptativo, salen del tema.
    final ext = context.bugie;
    final Color bg = adaptiveOutline ? ext.surface : backgroundColor;
    final Color fg = adaptiveOutline ? ext.text : foregroundColor;
    final Color? bd = adaptiveOutline ? ext.border : borderColor;

    // Cuando hay gradiente y el botón está activo, lo pintamos con un
    // DecoratedBox detrás y el ElevatedButton en transparente encima
    // (mantiene ripple, estados y loading sin cambiar su comportamiento).
    final bool paintGradient = gradient != null && onPressed != null;

    final button = ElevatedButton(
      style: ElevatedButton.styleFrom(
        backgroundColor: paintGradient ? Colors.transparent : bg,
        foregroundColor: fg,
        surfaceTintColor: Colors.transparent,
        disabledBackgroundColor: gradient != null
            ? Colors.transparent
            : bg.withOpacity(0.5),
        disabledForegroundColor: fg.withOpacity(0.7),
        elevation: paintGradient ? 0 : elevation,
        shadowColor: paintGradient ? Colors.transparent : shadowColor,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(BugieRadius.pill),
          side: bd != null
              ? BorderSide(color: bd, width: borderWidth)
              : BorderSide.none,
        ),
        textStyle: const TextStyle(
            fontFamily: kFontBody, fontSize: 16, fontWeight: FontWeight.bold),
      ),
      onPressed: onPressed,
      child: loading
          ? Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                SizedBox(
                  width: 18, height: 18,
                  child: CircularProgressIndicator(color: fg, strokeWidth: 2.5),
                ),
                const SizedBox(width: 10),
                Text(text),
              ],
            )
          : Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (icon != null) ...[Icon(icon, size: 18), const SizedBox(width: 8)],
                Text(text),
              ],
            ),
    );

    Widget content = button;
    if (gradient != null) {
      content = DecoratedBox(
        decoration: BoxDecoration(
          gradient: onPressed != null ? gradient : null,
          color: onPressed != null ? null : backgroundColor.withOpacity(0.5),
          borderRadius: BorderRadius.circular(BugieRadius.pill),
          boxShadow: (onPressed != null && shadowColor != null)
              ? [BoxShadow(color: shadowColor!, blurRadius: 14, offset: const Offset(0, 5))]
              : null,
        ),
        child: button,
      );
    }

    return SizedBox(width: double.infinity, height: height, child: content);
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  HEADER DE PÁGINA (sin cambios de API)
// ═════════════════════════════════════════════════════════════════════════

class BugiePageHeader extends StatelessWidget implements PreferredSizeWidget {
  final String title;
  final String? subtitle;
  final IconData? icon;
  final String? logoAsset;
  final List<Widget> actions;
  final bool showBack;
  final VoidCallback? onBack;

  const BugiePageHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.icon,
    this.logoAsset,
    this.actions = const [],
    this.showBack = true,
    this.onBack,
  });

  @override
  Size get preferredSize => Size.fromHeight(subtitle != null ? 130 : 100);

  @override
  Widget build(BuildContext context) {
    final hasGraphic = logoAsset != null || icon != null;

    return Container(
      padding: EdgeInsets.only(
        top: MediaQuery.of(context).padding.top + BugieSpacing.sm,
        left: BugieSpacing.md,
        right: BugieSpacing.md,
        bottom: BugieSpacing.md,
      ),
      decoration: const BoxDecoration(gradient: bugieHeroGradient),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (showBack)
            IconButton(
              icon: const Icon(Icons.arrow_back, color: Colors.white),
              onPressed: onBack ?? () => Navigator.of(context).maybePop(),
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(),
            ),
          if (showBack) const SizedBox(width: 8),
          if (hasGraphic) ...[
            Container(
              width: 44, height: 44,
              decoration: BoxDecoration(
                color: logoAsset != null
                    ? Colors.white
                    : Colors.white.withOpacity(0.12),
                borderRadius: BorderRadius.circular(BugieRadius.md),
                border: Border.all(color: Colors.white.withOpacity(0.15)),
              ),
              padding: logoAsset != null ? const EdgeInsets.all(4) : null,
              child: logoAsset != null
                  ? Image.asset(logoAsset!, fit: BoxFit.contain)
                  : Icon(icon, color: Colors.white, size: 22),
            ),
            const SizedBox(width: BugieSpacing.sm + 4),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: BugieText.onDarkH1, maxLines: 1, overflow: TextOverflow.ellipsis),
                if (subtitle != null) ...[
                  const SizedBox(height: 4),
                  Text(subtitle!, style: BugieText.onDarkBody,
                      maxLines: 2, overflow: TextOverflow.ellipsis),
                ],
              ],
            ),
          ),
          ...actions.map((a) => Padding(
                padding: const EdgeInsets.only(left: 4),
                child: a,
              )),
        ],
      ),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  TEMA MATERIAL — light() y dark()
// ═════════════════════════════════════════════════════════════════════════

class BugieTheme {
  // ───────────────────────── MODO CLARO ─────────────────────────
  static ThemeData light() {
    const c = BugieColorsExt.light;
    final base = ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      fontFamily: kFontBody,
      colorScheme: ColorScheme.fromSeed(
        seedColor: BugieColors.primary,
        brightness: Brightness.light,
        primary: BugieColors.primary,
        secondary: BugieColors.accent,
        surface: c.surface,
        error: BugieColors.danger,
      ),
      scaffoldBackgroundColor: c.bg,
      extensions: const [c],
    );
    return _applyCommon(base, c);
  }

  // ───────────────────────── MODO OSCURO ─────────────────────────
  static ThemeData dark() {
    const c = BugieColorsExt.dark;
    final base = ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      fontFamily: kFontBody,
      colorScheme: ColorScheme.fromSeed(
        seedColor: BugieColors.primary,
        brightness: Brightness.dark,
        primary: BugieColors.primary,
        secondary: BugieColors.accent,
        surface: c.surface,
        error: BugieColors.danger,
      ).copyWith(
        onSurface: c.text,
        surfaceContainerHighest: c.surface2,
      ),
      scaffoldBackgroundColor: c.bg,
      extensions: const [c],
    );
    return _applyCommon(base, c);
  }

  // ──────── Estilos compartidos por ambos modos (leen los tokens) ────────
  static ThemeData _applyCommon(ThemeData base, BugieColorsExt c) {
    final isDark = base.brightness == Brightness.dark;
    return base.copyWith(
      // El header de página sigue siendo el gradiente HERO oscuro en ambos modos.
      appBarTheme: const AppBarTheme(
        backgroundColor: BugieColors.heroDark,
        foregroundColor: Colors.white,
        centerTitle: false,
        elevation: 0,
        iconTheme: IconThemeData(color: Colors.white),
        titleTextStyle: TextStyle(
          fontFamily: kFontHeading,
          color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold,
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: BugieColors.primary,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 20),
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(BugieRadius.pill)),
          textStyle: const TextStyle(
              fontFamily: kFontBody, fontWeight: FontWeight.bold, fontSize: 16),
          elevation: 2,
          shadowColor: BugieColors.primary.withOpacity(0.3),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: BugieColors.primary,
          side: const BorderSide(color: BugieColors.primary),
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(BugieRadius.pill)),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(foregroundColor: BugieColors.primary),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        // Relleno específico del input: contrasta con fondo y con cards.
        fillColor: c.inputFill,
        hintStyle: TextStyle(color: c.textMuted),
        labelStyle: TextStyle(color: c.textMuted),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(BugieRadius.sm),
          borderSide: BorderSide(color: c.inputBorder),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(BugieRadius.sm),
          borderSide: BorderSide(color: c.inputBorder),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(BugieRadius.sm),
          borderSide: const BorderSide(color: BugieColors.primary, width: 2),
        ),
      ),
      cardTheme: CardThemeData(
        color: c.surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(BugieRadius.md),
          side: BorderSide(color: c.border),
        ),
        margin: EdgeInsets.zero,
      ),
      dialogTheme: DialogThemeData(backgroundColor: c.surface),
      bottomSheetTheme: BottomSheetThemeData(backgroundColor: c.surface),
      chipTheme: ChipThemeData(side: BorderSide(color: c.border)),
      dividerTheme: DividerThemeData(color: c.border),
      progressIndicatorTheme:
          const ProgressIndicatorThemeData(color: BugieColors.primary),
      iconTheme: IconThemeData(color: isDark ? c.text : BugieColors.primary),
    );
  }
}