import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../core/api/api_client.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/widgets/bugie_card.dart';
import '../data/emergency_contact_repository.dart';
import 'emergency_contact_screen.dart';

/// Tarjeta "Contacto de emergencia" para la pantalla "Mis datos" del pasajero
/// y del conductor. Carga el contacto por su cuenta, lo muestra y abre
/// [EmergencyContactScreen] para agregar o editar.
/// Si no hay contacto, lo recomienda (no bloquea nada).
class EmergencyContactCard extends StatefulWidget {
  const EmergencyContactCard({super.key});

  @override
  State<EmergencyContactCard> createState() => _EmergencyContactCardState();
}

class _EmergencyContactCardState extends State<EmergencyContactCard> {
  EmergencyContact? _contact;
  bool _loading = true;
  bool _error = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = false;
    });
    try {
      final c = await EmergencyContactRepository(context.read<ApiClient>()).getMine();
      if (mounted) setState(() => _contact = c);
    } catch (_) {
      if (mounted) setState(() => _error = true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _edit() async {
    final saved = await Navigator.of(context).push<EmergencyContact>(
      MaterialPageRoute(builder: (_) => EmergencyContactScreen(initial: _contact)),
    );
    if (saved != null && mounted) setState(() => _contact = saved);
  }

  @override
  Widget build(BuildContext context) {
    final c = _contact;
    final String subtitle;
    if (_loading) {
      subtitle = 'Cargando…';
    } else if (_error) {
      subtitle = 'No se pudo cargar. Toca para reintentar.';
    } else if (c == null) {
      subtitle = 'Te recomendamos registrarlo. Si activas un SOS, '
          'el equipo de Bugie podrá contactarlo.';
    } else {
      subtitle = '${c.fullName} (${c.relationship})\n${c.phone}'
          '${c.email != null ? '\n${c.email}' : ''}';
    }

    return BugieCard(
      title: 'Contacto de emergencia',
      padding: EdgeInsets.zero,
      child: ListTile(
        leading: Icon(
          c == null ? Icons.warning_amber_rounded : Icons.health_and_safety_outlined,
          color: c == null && !_loading ? BugieColors.warning : BugieColors.danger,
        ),
        title: Text(c == null ? 'Agregar contacto' : 'Editar contacto'),
        subtitle: Text(subtitle),
        isThreeLine: c != null || (!_loading && !_error),
        trailing: const Icon(Icons.chevron_right),
        onTap: _loading ? null : (_error ? _load : _edit),
      ),
    );
  }
}
