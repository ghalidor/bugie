import 'package:flutter/material.dart';
import '../../../../core/theme/bugie_theme.dart';
import '../../../../core/widgets/bugie_card.dart';
import '../../domain/identity_validators.dart';
import '../../domain/user_model.dart';

/// Datos de identidad en SOLO LECTURA (nombres, apellidos y documento).
/// El usuario no puede editarlos: para corregirlos debe contactar a soporte.
/// La usan el perfil del pasajero y el del conductor.
class IdentityInfoCard extends StatelessWidget {
  final UserProfile? profile;
  const IdentityInfoCard({super.key, required this.profile});

  String _orDash(String? v) => (v == null || v.trim().isEmpty) ? '—' : v;

  @override
  Widget build(BuildContext context) {
    final p = profile;
    final doc = p?.hasDocument == true
        ? '${docTypeLabel(p!.docType)} ${p.docNumber}'
        : 'No registrado';
    return BugieCard(
      title: 'Datos personales',
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          ListTile(
            leading: const Icon(Icons.person_outline),
            title: const Text('Nombres'),
            subtitle: Text(_orDash(p?.firstNames)),
          ),
          const Divider(height: 1, indent: 70),
          ListTile(
            leading: const Icon(Icons.people_outline),
            title: const Text('Apellidos'),
            subtitle: Text(_orDash(p?.lastNames)),
          ),
          const Divider(height: 1, indent: 70),
          ListTile(
            leading: const Icon(Icons.badge_outlined),
            title: const Text('Documento'),
            subtitle: Text(doc),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: Row(
              children: [
                Icon(Icons.lock_outline, size: 14, color: context.bugie.textMuted),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    'Para corregirlos contacta a soporte.',
                    style: TextStyle(fontSize: 12, color: context.bugie.textMuted),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
