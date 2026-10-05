import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/ui/app_messenger.dart';
import '../../../core/widgets/bugie_internal_header.dart';
import '../../auth/data/auth_repository.dart';

/// Eliminar mi cuenta (Configuración → Cuenta, zona roja).
/// POST /api/auth/me/delete-account { password, reason? }.
/// Si sale bien se cierra la sesión local completa y se vuelve al inicio.
/// Si el backend lo impide (viaje en curso, comisiones, etc.) se muestra su
/// mensaje tal cual.
class DeleteAccountScreen extends StatefulWidget {
  const DeleteAccountScreen({super.key});

  @override
  State<DeleteAccountScreen> createState() => _DeleteAccountScreenState();
}

class _DeleteAccountScreenState extends State<DeleteAccountScreen> {
  final _formKey = GlobalKey<FormState>();
  final _reasonCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool _showPassword = false;
  bool _understood = false;
  bool _deleting = false;
  String? _error;

  @override
  void dispose() {
    _reasonCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final form = _formKey.currentState;
    if (form == null || !form.validate()) return;
    if (!_understood) {
      setState(() => _error =
          'Marca la casilla para confirmar que entiendes lo que pasará.');
      return;
    }

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('¿Eliminar tu cuenta?'),
        content: const Text(
            'Ya no podrás iniciar sesión con esta cuenta. Esta acción no se '
            'puede deshacer desde la app.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: BugieColors.danger),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Sí, eliminar'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;

    setState(() { _deleting = true; _error = null; });
    final router = GoRouter.of(context);
    try {
      // deleteAccount ya hace el logout completo (token FCM, banners, sesión).
      await context.read<AuthRepository>().deleteAccount(
            password: _passwordCtrl.text,
            reason: _reasonCtrl.text,
          );
      showSuccessSnack('Tu cuenta fue eliminada');
      router.go('/');
    } on ApiException catch (e) {
      // 400 (contraseña incorrecta) / 409 (viaje en curso, comisiones…)
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'No se pudo conectar con el servidor.');
    } finally {
      if (mounted) setState(() => _deleting = false);
    }
  }

  Widget _bullet(String text) {
    final c = context.bugie;
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Container(
              width: 5,
              height: 5,
              decoration: const BoxDecoration(
                  color: BugieColors.danger, shape: BoxShape.circle),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text, style: TextStyle(fontSize: 13, color: c.text)),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Scaffold(
      backgroundColor: c.bg,
      appBar: const BugieInternalHeader(title: 'Eliminar mi cuenta'),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Qué pasa al eliminar
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: BugieColors.danger.withOpacity(0.08),
                    borderRadius: BorderRadius.circular(BugieRadius.md),
                    border: Border.all(
                        color: BugieColors.danger.withOpacity(0.4)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Row(
                        children: [
                          Icon(Icons.warning_amber_rounded,
                              color: BugieColors.danger),
                          SizedBox(width: 8),
                          Expanded(
                            child: Text('Antes de continuar, ten en cuenta:',
                                style: TextStyle(
                                    color: BugieColors.danger,
                                    fontWeight: FontWeight.w700)),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      _bullet('Ya no podrás iniciar sesión con esta cuenta.'),
                      _bullet('Tus viajes y pagos se conservan en nuestros '
                          'registros.'),
                      _bullet('Si quieres recuperarla, contacta a soporte.'),
                      _bullet('Si tienes un viaje o envío en curso, programado '
                          'o comisiones pendientes, primero debes resolverlos.'),
                    ],
                  ),
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

                TextFormField(
                  controller: _reasonCtrl,
                  maxLength: 500,
                  minLines: 2,
                  maxLines: 4,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: const InputDecoration(
                    labelText: 'Motivo (opcional)',
                    hintText: 'Cuéntanos por qué te vas',
                    alignLabelWithHint: true,
                  ),
                ),
                const SizedBox(height: 8),

                TextFormField(
                  controller: _passwordCtrl,
                  obscureText: !_showPassword,
                  decoration: InputDecoration(
                    labelText: 'Tu contraseña',
                    prefixIcon: const Icon(Icons.lock_outline),
                    suffixIcon: IconButton(
                      icon: Icon(
                          _showPassword
                              ? Icons.visibility_off
                              : Icons.visibility,
                          color: c.textMuted),
                      onPressed: () =>
                          setState(() => _showPassword = !_showPassword),
                    ),
                  ),
                  validator: (v) => (v ?? '').isEmpty
                      ? 'Ingresa tu contraseña para confirmar'
                      : null,
                ),
                const SizedBox(height: 12),

                InkWell(
                  onTap: () => setState(() => _understood = !_understood),
                  borderRadius: BorderRadius.circular(8),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      children: [
                        SizedBox(
                          width: 24,
                          height: 24,
                          child: Checkbox(
                            value: _understood,
                            activeColor: BugieColors.danger,
                            onChanged: (v) =>
                                setState(() => _understood = v ?? false),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Entiendo que mi cuenta será eliminada',
                            style: TextStyle(fontSize: 13, color: c.text),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 20),

                SizedBox(
                  height: 52,
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: BugieColors.danger,
                      foregroundColor: Colors.white,
                      disabledBackgroundColor:
                          BugieColors.danger.withOpacity(0.4),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(BugieRadius.pill)),
                    ),
                    onPressed: _deleting ? null : _submit,
                    icon: _deleting
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: Colors.white),
                          )
                        : const Icon(Icons.delete_forever_outlined),
                    label: const Text('Eliminar mi cuenta',
                        style: TextStyle(fontWeight: FontWeight.w700)),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
