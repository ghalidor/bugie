import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/session/session.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/widgets/bugie_theme_toggle.dart';
import '../../../core/widgets/signature_pad.dart';
import '../data/auth_repository.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  // Clave del Form para poder llamar a validate() antes de enviar.
  final _formKey = GlobalKey<FormState>();

  final _firstNameCtrl = TextEditingController();
  final _lastNameCtrl  = TextEditingController();
  final _emailCtrl     = TextEditingController();
  final _phoneCtrl     = TextEditingController();
  final _passwordCtrl  = TextEditingController();
  String _role = 'passenger';
  bool _loading = false;
  bool _accepted = false;
  final _sigController = SignatureController();
  final _sigKey = GlobalKey(); // aceptó términos y condiciones
  String? _error;

  // ─────────────────────────────────────────────────────────────────
  // Validadores. Cada uno devuelve null si está OK, o un mensaje de
  // error si está mal. El Form pinta el mensaje debajo del campo.
  // ─────────────────────────────────────────────────────────────────

  String? _required(String? value, String campo) {
    if (value == null || value.trim().isEmpty) {
      return 'Ingresa tu $campo';
    }
    return null;
  }

  String? _validateEmail(String? value) {
    final v = value?.trim() ?? '';
    if (v.isEmpty) return 'Ingresa tu correo';
    // Regex simple — el server vuelve a validar.
    final emailRegex = RegExp(r'^[\w\.\-]+@[\w\-]+\.[a-zA-Z]{2,}$');
    if (!emailRegex.hasMatch(v)) return 'Correo no válido';
    return null;
  }

  String? _validatePhone(String? value) {
    final v = value?.trim() ?? '';
    if (v.isEmpty) return 'Ingresa tu teléfono';
    // Solo dígitos y espacios; entre 8 y 15 dígitos (Perú son 9).
    final digits = v.replaceAll(RegExp(r'\D'), '');
    if (digits.length < 8) return 'Teléfono muy corto';
    if (digits.length > 15) return 'Teléfono muy largo';
    return null;
  }

  String? _validatePassword(String? value) {
    final v = value ?? '';
    if (v.isEmpty) return 'Ingresa una contraseña';
    if (v.length < 8) return 'Mínimo 8 caracteres';
    return null;
  }

  Future<void> _submit() async {
    // Disparamos validate() antes de tocar el server. Si algún campo
    // tiene error, validate() devuelve false y muestra los mensajes
    // debajo de cada TextFormField.
    final form = _formKey.currentState;
    if (form == null || !form.validate()) return;

    // Debe aceptar términos y condiciones para continuar.
    if (!_accepted) {
      setState(() => _error =
          'Debes aceptar los Términos y Condiciones para crear tu cuenta.');
      return;
    }

    if (_sigController.isEmpty) {
      setState(() => _error = 'Debes firmar para crear tu cuenta.');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      final repo = context.read<AuthRepository>();
      final box = _sigKey.currentContext?.findRenderObject() as RenderBox?;
      final signature = await _sigController
          .toBase64DataUrl(box?.size ?? const Size(600, 160));
      final auth = await repo.register(
        fullName: '${_firstNameCtrl.text} ${_lastNameCtrl.text}'.trim(),
        email: _emailCtrl.text.trim(),
        password: _passwordCtrl.text,
        phone: _phoneCtrl.text.trim(),
        role: _role,
        acceptedTerms: _accepted,
        signatureImage: signature,
      );
      if (!mounted) return;
      if (auth.role == UserRole.driver) {
        context.go('/driver');
      } else {
        context.go('/passenger');
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
    _firstNameCtrl.dispose();
    _lastNameCtrl.dispose();
    _emailCtrl.dispose();
    _phoneCtrl.dispose();
    _passwordCtrl.dispose();
    _sigController.dispose();
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
          padding: const EdgeInsets.all(20),
          child: Form(
            key: _formKey,
            // Muestra errores de validación al perder foco y al primer
            // submit. Más amigable que validar al tipear cada letra.
            autovalidateMode: AutovalidateMode.onUserInteraction,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text('CREAR CUENTA', style: BugieText.eyebrow),
                const SizedBox(height: 8),
                Text('Crea tu cuenta',
                    style: BugieText.h1.copyWith(color: c.text)),
                const SizedBox(height: 8),
                Text('Completa tus datos para comenzar.',
                    style: TextStyle(color: c.textMuted)),
                const SizedBox(height: 24),

                if (_error != null)
                  Container(
                    padding: const EdgeInsets.all(12),
                    margin: const EdgeInsets.only(bottom: 16),
                    decoration: BoxDecoration(
                      color: Colors.red.shade50,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.red.shade200),
                    ),
                    child: Text(_error!,
                        style: const TextStyle(
                            color: BugieColors.danger, fontSize: 13)),
                  ),

                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: TextFormField(
                        controller: _firstNameCtrl,
                        textCapitalization: TextCapitalization.words,
                        decoration:
                            const InputDecoration(labelText: 'Nombre'),
                        validator: (v) => _required(v, 'nombre'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextFormField(
                        controller: _lastNameCtrl,
                        textCapitalization: TextCapitalization.words,
                        decoration:
                            const InputDecoration(labelText: 'Apellido'),
                        validator: (v) => _required(v, 'apellido'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),

                TextFormField(
                  controller: _emailCtrl,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(
                    labelText: 'Correo',
                    hintText: 'correo@ejemplo.com',
                    prefixIcon: Icon(Icons.email_outlined),
                  ),
                  validator: _validateEmail,
                ),
                const SizedBox(height: 14),

                TextFormField(
                  controller: _phoneCtrl,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(
                    labelText: 'Teléfono',
                    hintText: '999 999 999',
                    prefixIcon: Icon(Icons.phone_outlined),
                  ),
                  validator: _validatePhone,
                ),
                const SizedBox(height: 14),

                TextFormField(
                  controller: _passwordCtrl,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'Contraseña',
                    hintText: 'Mínimo 8 caracteres',
                    prefixIcon: Icon(Icons.lock_outline),
                  ),
                  validator: _validatePassword,
                ),
                const SizedBox(height: 14),

                const Text('Voy a usar Bugie como',
                    style: TextStyle(fontSize: 13)),
                const SizedBox(height: 8),
                SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(value: 'passenger', label: Text('Pasajero'),
                        icon: Icon(Icons.person)),
                    ButtonSegment(value: 'driver', label: Text('Conductor'),
                        icon: Icon(Icons.directions_car)),
                  ],
                  selected: {_role},
                  onSelectionChanged: (s) => setState(() => _role = s.first),
                ),
                const SizedBox(height: 16),

                // Acepto Términos y Condiciones (requerido)
                InkWell(
                  onTap: () => setState(() => _accepted = !_accepted),
                  borderRadius: BorderRadius.circular(8),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        SizedBox(
                          width: 24, height: 24,
                          child: Checkbox(
                            value: _accepted,
                            onChanged: (v) =>
                                setState(() => _accepted = v ?? false),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text.rich(
                            TextSpan(
                              style: TextStyle(
                                  fontSize: 13, color: context.bugie.text),
                              children: const [
                                TextSpan(text: 'Acepto los '),
                                TextSpan(
                                  text: 'Términos y Condiciones',
                                  style: TextStyle(
                                      color: BugieColors.primary,
                                      fontWeight: FontWeight.w600),
                                ),
                                TextSpan(text: ' y la '),
                                TextSpan(
                                  text: 'Política de Privacidad',
                                  style: TextStyle(
                                      color: BugieColors.primary,
                                      fontWeight: FontWeight.w600),
                                ),
                                TextSpan(text: '.'),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 20),

                // Botón principal con gradiente (plantilla)
                // Firma (requerida por el registro)
                Row(
                  children: [
                    const Text('Tu firma',
                        style: TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w600)),
                    const Spacer(),
                    TextButton.icon(
                      onPressed: () => _sigController.clear(),
                      icon: const Icon(Icons.refresh, size: 16),
                      label: const Text('Limpiar'),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                SignaturePad(key: _sigKey, controller: _sigController),
                const SizedBox(height: 20),

                BugieButtons.primary(
                  text: 'Crear cuenta',
                  loading: _loading,
                  onPressed: _submit,
                ),

                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text('¿Ya tienes cuenta?',
                        style: TextStyle(color: context.bugie.textMuted)),
                    TextButton(
                      onPressed: () => context.go('/login'),
                      child: const Text('Ingresar'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}