import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../core/api/api_client.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/widgets/bugie_card.dart';
import '../../../core/widgets/bugie_internal_header.dart';
import '../data/emergency_contact_repository.dart';

/// Pantalla para registrar o editar el contacto de emergencia.
/// La usan el pasajero y el conductor (se abre desde "Mis datos").
/// Devuelve el contacto guardado al hacer pop (o null si no guardó).
class EmergencyContactScreen extends StatefulWidget {
  final EmergencyContact? initial;
  const EmergencyContactScreen({super.key, this.initial});

  @override
  State<EmergencyContactScreen> createState() => _EmergencyContactScreenState();
}

class _EmergencyContactScreenState extends State<EmergencyContactScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _name;
  late final TextEditingController _phone;
  late final TextEditingController _relationship;
  late final TextEditingController _email;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController(text: widget.initial?.fullName ?? '');
    _phone = TextEditingController(text: widget.initial?.phone ?? '');
    _relationship = TextEditingController(text: widget.initial?.relationship ?? '');
    _email = TextEditingController(text: widget.initial?.email ?? '');
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _relationship.dispose();
    _email.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _saving = true);
    try {
      final email = _email.text.trim();
      final saved = await EmergencyContactRepository(context.read<ApiClient>()).save(
        EmergencyContact(
          fullName: _name.text.trim(),
          phone: _phone.text.trim(),
          relationship: _relationship.text.trim(),
          email: email.isEmpty ? null : email,
        ),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Contacto de emergencia guardado')),
      );
      Navigator.of(context).pop(saved);
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  String? _required(String? v, String msg) =>
      (v == null || v.trim().isEmpty) ? msg : null;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const BugieInternalHeader(title: 'Contacto de emergencia'),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
            children: [
              const Text(
                'Si activas el botón SOS, el equipo de Bugie podrá llamar a esta '
                'persona. Si registras su correo, le enviaremos un aviso con tu ubicación.',
                style: TextStyle(color: BugieColors.textMuted),
              ),
              const SizedBox(height: 16),
              BugieCard(
                child: Column(
                  children: [
                    TextFormField(
                      controller: _name,
                      maxLength: 120,
                      textCapitalization: TextCapitalization.words,
                      decoration: const InputDecoration(
                        labelText: 'Nombre completo',
                        prefixIcon: Icon(Icons.person_outline),
                        counterText: '',
                      ),
                      validator: (v) => _required(v, 'Ingresa el nombre del contacto'),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _phone,
                      maxLength: 20,
                      keyboardType: TextInputType.phone,
                      decoration: const InputDecoration(
                        labelText: 'Teléfono',
                        hintText: '+51 999 999 999',
                        prefixIcon: Icon(Icons.phone_outlined),
                        counterText: '',
                      ),
                      validator: (v) {
                        final digits = (v ?? '').replaceAll(RegExp(r'\D'), '');
                        return digits.length < 6 ? 'Ingresa un teléfono válido' : null;
                      },
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _relationship,
                      maxLength: 50,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: const InputDecoration(
                        labelText: 'Parentesco o relación',
                        hintText: 'Ej. Mamá, esposo, amiga',
                        prefixIcon: Icon(Icons.family_restroom_outlined),
                        counterText: '',
                      ),
                      validator: (v) => _required(v, 'Indica el parentesco o relación'),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _email,
                      maxLength: 200,
                      keyboardType: TextInputType.emailAddress,
                      decoration: const InputDecoration(
                        labelText: 'Correo (opcional)',
                        prefixIcon: Icon(Icons.email_outlined),
                        counterText: '',
                      ),
                      validator: (v) {
                        final t = (v ?? '').trim();
                        if (t.isEmpty) return null;
                        return RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(t)
                            ? null
                            : 'El correo no es válido';
                      },
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              FilledButton.icon(
                style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                onPressed: _saving ? null : _save,
                icon: _saving
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.save_outlined),
                label: const Text('Guardar contacto'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
