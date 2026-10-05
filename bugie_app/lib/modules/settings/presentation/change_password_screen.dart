import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/ui/app_messenger.dart';
import '../../../core/widgets/bugie_internal_header.dart';
import '../../auth/data/auth_repository.dart';

/// Cambiar contraseña (Configuración → Cuenta).
/// POST /api/auth/me/change-password { currentPassword, newPassword }.
class ChangePasswordScreen extends StatefulWidget {
  const ChangePasswordScreen({super.key});

  @override
  State<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends State<ChangePasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _currentCtrl = TextEditingController();
  final _newCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();
  bool _showCurrent = false;
  bool _showNew = false;
  bool _showConfirm = false;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _currentCtrl.dispose();
    _newCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  String? _validateNew(String? v) {
    final s = v ?? '';
    if (s.isEmpty) return 'Ingresa la nueva contraseña';
    if (s.length < 8) return 'Mínimo 8 caracteres';
    if (s.length > 100) return 'Máximo 100 caracteres';
    if (s == _currentCtrl.text) {
      return 'La nueva contraseña debe ser distinta de la actual.';
    }
    return null;
  }

  String? _validateConfirm(String? v) {
    if ((v ?? '').isEmpty) return 'Repite la nueva contraseña';
    if (v != _newCtrl.text) return 'Las contraseñas no coinciden';
    return null;
  }

  Future<void> _submit() async {
    final form = _formKey.currentState;
    if (form == null || !form.validate()) return;

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cambiar contraseña'),
        content: const Text(
            '¿Seguro que quieres cambiar tu contraseña? La próxima vez que '
            'inicies sesión tendrás que usar la nueva.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Sí, cambiar'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;

    setState(() { _saving = true; _error = null; });
    try {
      final msg = await context.read<AuthRepository>().changePassword(
            currentPassword: _currentCtrl.text,
            newPassword: _newCtrl.text,
          );
      if (!mounted) return;
      showSuccessSnack(msg);
      context.pop();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'No se pudo conectar con el servidor.');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Widget _passwordField({
    required TextEditingController controller,
    required String label,
    required bool visible,
    required VoidCallback onToggle,
    required FormFieldValidator<String> validator,
  }) {
    final c = context.bugie;
    return TextFormField(
      controller: controller,
      obscureText: !visible,
      maxLength: 100,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: const Icon(Icons.lock_outline),
        counterText: '',
        suffixIcon: IconButton(
          icon: Icon(visible ? Icons.visibility_off : Icons.visibility,
              color: c.textMuted),
          onPressed: onToggle,
        ),
      ),
      validator: validator,
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Scaffold(
      backgroundColor: c.bg,
      appBar: const BugieInternalHeader(title: 'Cambiar contraseña'),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
          child: Form(
            key: _formKey,
            autovalidateMode: AutovalidateMode.onUserInteraction,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Usa al menos 8 caracteres. Te recomendamos combinar letras '
                  'y números.',
                  style: TextStyle(color: c.textMuted, fontSize: 13),
                ),
                const SizedBox(height: 16),
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
                _passwordField(
                  controller: _currentCtrl,
                  label: 'Contraseña actual',
                  visible: _showCurrent,
                  onToggle: () => setState(() => _showCurrent = !_showCurrent),
                  validator: (v) => (v ?? '').isEmpty
                      ? 'Ingresa tu contraseña actual'
                      : null,
                ),
                const SizedBox(height: 14),
                _passwordField(
                  controller: _newCtrl,
                  label: 'Nueva contraseña',
                  visible: _showNew,
                  onToggle: () => setState(() => _showNew = !_showNew),
                  validator: _validateNew,
                ),
                const SizedBox(height: 14),
                _passwordField(
                  controller: _confirmCtrl,
                  label: 'Confirmar nueva contraseña',
                  visible: _showConfirm,
                  onToggle: () => setState(() => _showConfirm = !_showConfirm),
                  validator: _validateConfirm,
                ),
                const SizedBox(height: 24),
                BugieButtons.primary(
                  text: 'Cambiar contraseña',
                  loading: _saving,
                  onPressed: _submit,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
