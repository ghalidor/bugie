import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/session/session.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/ui/app_messenger.dart';
import '../data/auth_repository.dart';
import '../domain/identity_validators.dart';
import '../domain/user_model.dart';
import 'widgets/identity_form_fields.dart';

/// "Completa tus datos": la ven las cuentas a las que les falta el documento
/// o los nombres separados (GET /api/auth/me → needsProfileCompletion).
/// No se puede omitir: el router la impone hasta completarla. La única
/// salida es cerrar sesión.
///
/// PUT /api/auth/me/profile-completion. Si la cuenta ya tenía documento, se
/// muestra bloqueado y no se envía.
class CompleteProfileScreen extends StatefulWidget {
  const CompleteProfileScreen({super.key});

  @override
  State<CompleteProfileScreen> createState() => _CompleteProfileScreenState();
}

class _CompleteProfileScreenState extends State<CompleteProfileScreen> {
  final _formKey = GlobalKey<FormState>();
  final _firstNamesCtrl = TextEditingController();
  final _paternalCtrl = TextEditingController();
  final _maternalCtrl = TextEditingController();
  final _docNumberCtrl = TextEditingController();
  String _docType = 'DNI';

  UserProfile? _profile;
  bool _loading = true;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _firstNamesCtrl.dispose();
    _paternalCtrl.dispose();
    _maternalCtrl.dispose();
    _docNumberCtrl.dispose();
    super.dispose();
  }

  bool get _docLocked => _profile?.hasDocument == true;

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final p = await context.read<AuthRepository>().getMyProfile();
      if (!mounted) return;
      setState(() {
        _profile = p;
        _loading = false;
        if (p != null) {
          _firstNamesCtrl.text = p.firstNames ?? '';
          _paternalCtrl.text = p.lastNamePaternal ?? '';
          _maternalCtrl.text = p.lastNameMaternal ?? '';
          if (p.hasDocument) {
            _docNumberCtrl.text = p.docNumber!;
            if (kDocTypes.containsKey(p.docType)) _docType = p.docType!;
          }
        }
      });
    } on ApiException catch (e) {
      if (mounted) setState(() { _loading = false; _error = e.message; });
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = 'No se pudo cargar tu información.';
        });
      }
    }
  }

  Future<void> _submit() async {
    final form = _formKey.currentState;
    if (form == null || !form.validate()) return;

    final docNumber = normalizeDocNumber(_docNumberCtrl.text);
    final maternal = _maternalCtrl.text.trim();
    final fullName = [
      _firstNamesCtrl.text.trim(),
      _paternalCtrl.text.trim(),
      if (maternal.isNotEmpty) maternal,
    ].join(' ');

    // Confirmación: después ya no se pueden cambiar desde la app.
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('¿Tus datos son correctos?'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Nombre: $fullName'),
            const SizedBox(height: 4),
            Text('Documento: ${docTypeLabel(_docType)} $docNumber'),
            const SizedBox(height: 12),
            const Text(
              'Después no podrás cambiarlos desde la app. Para corregirlos '
              'tendrás que contactar a soporte.',
              style: TextStyle(fontSize: 13),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Revisar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Sí, guardar'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;

    setState(() { _saving = true; _error = null; });
    try {
      await context.read<AuthRepository>().completeProfile(
            docType: _docLocked ? null : _docType,
            docNumber: _docLocked ? null : docNumber,
            firstNames: _firstNamesCtrl.text.trim(),
            lastNamePaternal: _paternalCtrl.text.trim(),
            lastNameMaternal: maternal,
          );
      // Al guardar, la sesión ya no pide completar datos y el router nos
      // saca de aquí solo; el go() es por si acaso.
      showSuccessSnack('¡Listo! Tus datos quedaron guardados.');
      if (!mounted) return;
      final role = context.read<Session>().role;
      context.go(role == UserRole.driver ? '/driver' : '/passenger');
    } on ApiException catch (e) {
      // 400 / 409 del backend tal cual (documento usado, ya completos, etc.)
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'No se pudo conectar con el servidor.');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _logout() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cerrar sesión'),
        content: const Text(
            'Podrás completar tus datos la próxima vez que inicies sesión.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Cerrar sesión'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    await context.read<AuthRepository>().logout();
    if (mounted) context.go('/');
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return PopScope(
      canPop: false, // no se puede omitir
      child: Scaffold(
        backgroundColor: c.bg,
        appBar: AppBar(
          backgroundColor: c.bg,
          foregroundColor: c.text,
          elevation: 0,
          automaticallyImplyLeading: false,
          actions: [
            TextButton.icon(
              onPressed: _saving ? null : _logout,
              icon: const Icon(Icons.logout, size: 18),
              label: const Text('Cerrar sesión'),
            ),
          ],
        ),
        body: SafeArea(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(20),
                  child: Form(
                    key: _formKey,
                    autovalidateMode: AutovalidateMode.onUserInteraction,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Text('UN PASO MÁS', style: BugieText.eyebrow),
                        const SizedBox(height: 8),
                        Text('Completa tus datos',
                            style: BugieText.h1.copyWith(color: c.text)),
                        const SizedBox(height: 8),
                        Text(
                          'Para tu seguridad y la de todos, necesitamos tu '
                          'documento de identidad y tu nombre completo, tal '
                          'como aparecen en tu documento.',
                          style: TextStyle(color: c.textMuted),
                        ),
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
                        if (_profile == null) ...[
                          BugieButtons.secondary(
                            text: 'Reintentar',
                            onPressed: _load,
                          ),
                        ] else ...[
                          DocumentFormFields(
                            docType: _docType,
                            onDocTypeChanged: (v) =>
                                setState(() => _docType = v),
                            docNumber: _docNumberCtrl,
                            enabled: !_docLocked,
                          ),
                          const SizedBox(height: 14),
                          NameFormFields(
                            firstNames: _firstNamesCtrl,
                            lastNamePaternal: _paternalCtrl,
                            lastNameMaternal: _maternalCtrl,
                          ),
                          const SizedBox(height: 24),
                          BugieButtons.primary(
                            text: 'Guardar y continuar',
                            loading: _saving,
                            onPressed: _submit,
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
        ),
      ),
    );
  }
}
