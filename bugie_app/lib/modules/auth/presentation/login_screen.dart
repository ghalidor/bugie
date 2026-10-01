import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/session/session.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/widgets/bugie_theme_toggle.dart';
import '../../../core/widgets/bugie_value_chips.dart';
import '../data/auth_repository.dart';

/// Pantalla de Login.
/// Estilo idéntico al web (Login.tsx): título grande + inputs + botón cápsula.
/// Todo el estilo viene de bugie_theme.dart.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  // Clave del Form para poder llamar validate() antes de enviar.
  final _formKey = GlobalKey<FormState>();

  final _emailCtrl    = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool _loading = false;
  bool _obscure = true;
  String? _error;

  // ─────────────────────────────────────────────────────────────────
  // Validadores. Cada uno devuelve null si está OK, o un mensaje si
  // está mal. El Form pinta el mensaje debajo del campo.
  // ─────────────────────────────────────────────────────────────────

  String? _validateEmail(String? value) {
    final v = value?.trim() ?? '';
    if (v.isEmpty) return 'Ingresa tu correo';
    // Regex simple — el server vuelve a validar.
    final emailRegex = RegExp(r'^[\w\.\-]+@[\w\-]+\.[a-zA-Z]{2,}$');
    if (!emailRegex.hasMatch(v)) return 'Correo no válido';
    return null;
  }

  String? _validatePassword(String? value) {
    final v = value ?? '';
    if (v.isEmpty) return 'Ingresa tu contraseña';
    return null;
  }

  Future<void> _submit() async {
    // Disparamos validate() antes de tocar el server. Si algún campo
    // tiene error, validate() devuelve false y muestra los mensajes
    // debajo de cada TextFormField.
    final form = _formKey.currentState;
    if (form == null || !form.validate()) return;

    setState(() { _loading = true; _error = null; });
    try {
      final repo = context.read<AuthRepository>();
      final auth = await repo.login(_emailCtrl.text.trim(), _passwordCtrl.text);

      if (!mounted) return;
      switch (auth.role) {
        case UserRole.passenger:
          context.go('/passenger');
          break;
        case UserRole.driver:
          context.go('/driver');
          break;
        case UserRole.admin:
          setState(() => _error = 'El admin debe usar la web (back office).');
          await context.read<Session>().clear();
          break;
      }
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'No se pudo conectar con el servidor.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie; // tokens adaptativos (claro/oscuro)
    return Scaffold(
      backgroundColor: c.bg,
      appBar: AppBar(
        backgroundColor: c.bg,
        foregroundColor: c.text,
        elevation: 0,
        iconTheme: IconThemeData(color: c.text),
        actions: [BugieThemeToggle(color: c.text)],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(
            BugieSpacing.lg, BugieSpacing.md, BugieSpacing.lg, BugieSpacing.xl,
          ),
          child: Form(
            key: _formKey,
            // Errores aparecen al perder foco/al primer submit, no al
            // tipear cada letra. Más amigable.
            autovalidateMode: AutovalidateMode.onUserInteraction,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Eyebrow rosa-magenta
                const Text('BIENVENIDO', style: BugieText.eyebrow),
                const SizedBox(height: BugieSpacing.sm + 2),

                // Título grande
                Text('Inicia sesión para continuar.',
                    style: BugieText.h1.copyWith(color: c.text)),
                const SizedBox(height: BugieSpacing.sm),

                // Subtítulo
                Text(
                  'Accede con tu cuenta de pasajero o conductor.',
                  style: BugieText.muted.copyWith(color: c.textMuted),
                ),
                const SizedBox(height: BugieSpacing.md),

                // Chips de marca (Moderno, Seguro, Cercano, Claro, Ágil)
                const BugieValueChips(),
                const SizedBox(height: BugieSpacing.lg + 4),

                // Error (si existe)
                if (_error != null) ...[
                  _ErrorBanner(message: _error!),
                  const SizedBox(height: BugieSpacing.md),
                ],

                // Email
                Text('Correo', style: BugieText.label.copyWith(color: c.text)),
                const SizedBox(height: BugieSpacing.xs + 2),
                TextFormField(
                  controller: _emailCtrl,
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const [AutofillHints.email],
                  decoration: const InputDecoration(hintText: 'correo@ejemplo.com'),
                  validator: _validateEmail,
                ),
                const SizedBox(height: BugieSpacing.md),

                // Contraseña
                Text('Contraseña', style: BugieText.label.copyWith(color: c.text)),
                const SizedBox(height: BugieSpacing.xs + 2),
                TextFormField(
                  controller: _passwordCtrl,
                  obscureText: _obscure,
                  autofillHints: const [AutofillHints.password],
                  decoration: InputDecoration(
                    hintText: '••••••••',
                    suffixIcon: IconButton(
                      icon: Icon(
                        _obscure ? Icons.visibility : Icons.visibility_off,
                        color: c.textMuted,
                      ),
                      onPressed: () => setState(() => _obscure = !_obscure),
                    ),
                  ),
                  validator: _validatePassword,
                ),

                // Olvidé contraseña
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: () => context.push('/forgot-password'),
                    child: const Text('¿Olvidaste tu contraseña?'),
                  ),
                ),
                const SizedBox(height: BugieSpacing.sm + 4),

                // Botón principal (gradiente)
                BugieButtons.primary(
                  text: _loading ? 'Ingresando…' : 'Iniciar sesión',
                  loading: _loading,
                  onPressed: _submit,
                ),

                const SizedBox(height: BugieSpacing.sm + 4),

                // Botón secundario (outline) → ir a registro
                BugieButtons.secondary(
                  text: 'Crear cuenta',
                  onPressed: _loading ? null : () => context.push('/register'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Banner de error rojo. Componente local que podría moverse al theme
/// si se reutiliza en más pantallas.
class _ErrorBanner extends StatelessWidget {
  final String message;
  const _ErrorBanner({required this.message});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(BugieSpacing.sm + 4),
      decoration: BoxDecoration(
        color: Colors.red.shade50,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.red.shade200),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline,
              color: BugieColors.danger, size: 20),
          const SizedBox(width: BugieSpacing.sm),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(
                color: BugieColors.danger,
                fontSize: 13,
              ),
            ),
          ),
        ],
      ),
    );
  }
}