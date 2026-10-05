import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../domain/identity_validators.dart';

/// Campos de nombres: Nombres, Apellido paterno y Apellido materno (opcional).
/// Se usan en el registro y en "Completa tus datos".
class NameFormFields extends StatelessWidget {
  final TextEditingController firstNames;
  final TextEditingController lastNamePaternal;
  final TextEditingController lastNameMaternal;

  const NameFormFields({
    super.key,
    required this.firstNames,
    required this.lastNamePaternal,
    required this.lastNameMaternal,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextFormField(
          controller: firstNames,
          textCapitalization: TextCapitalization.words,
          maxLength: 60,
          decoration: const InputDecoration(
            labelText: 'Nombres',
            prefixIcon: Icon(Icons.person_outline),
            counterText: '',
          ),
          validator: validateFirstNames,
        ),
        const SizedBox(height: 14),
        TextFormField(
          controller: lastNamePaternal,
          textCapitalization: TextCapitalization.words,
          maxLength: 40,
          decoration: const InputDecoration(
            labelText: 'Apellido paterno',
            counterText: '',
          ),
          validator: validateLastNamePaternal,
        ),
        const SizedBox(height: 14),
        TextFormField(
          controller: lastNameMaternal,
          textCapitalization: TextCapitalization.words,
          maxLength: 40,
          decoration: const InputDecoration(
            labelText: 'Apellido materno (opcional)',
            helperText: 'Si tienes un solo apellido, déjalo vacío.',
            counterText: '',
          ),
          validator: validateLastNameMaternal,
        ),
      ],
    );
  }
}

/// Tipo de documento (DNI / CE / Pasaporte) + número.
/// Con [enabled] = false se muestra bloqueado (ya registrado).
class DocumentFormFields extends StatelessWidget {
  final String docType;
  final ValueChanged<String> onDocTypeChanged;
  final TextEditingController docNumber;
  final bool enabled;

  const DocumentFormFields({
    super.key,
    required this.docType,
    required this.onDocTypeChanged,
    required this.docNumber,
    this.enabled = true,
  });

  @override
  Widget build(BuildContext context) {
    final isDni = docType == 'DNI';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        DropdownButtonFormField<String>(
          initialValue: docType,
          decoration: const InputDecoration(
            labelText: 'Tipo de documento',
            prefixIcon: Icon(Icons.badge_outlined),
          ),
          items: [
            for (final e in kDocTypes.entries)
              DropdownMenuItem(value: e.key, child: Text(e.value)),
          ],
          onChanged: enabled
              ? (v) {
                  if (v != null) onDocTypeChanged(v);
                }
              : null,
        ),
        const SizedBox(height: 14),
        TextFormField(
          // La key cambia con el tipo para que se apliquen el teclado y el
          // límite nuevos al cambiar de DNI a CE/Pasaporte.
          key: ValueKey('docNumber-$docType'),
          controller: docNumber,
          enabled: enabled,
          keyboardType: isDni ? TextInputType.number : TextInputType.text,
          textCapitalization: TextCapitalization.characters,
          maxLength: isDni ? 8 : 12,
          inputFormatters: [
            isDni
                ? FilteringTextInputFormatter.digitsOnly
                : FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9]')),
          ],
          decoration: InputDecoration(
            labelText: 'Número de documento',
            prefixIcon: const Icon(Icons.pin_outlined),
            counterText: '',
            helperText: enabled ? null : 'Ya registrado. Para corregirlo contacta a soporte.',
          ),
          validator: enabled ? (v) => validateDocNumber(docType, v) : null,
        ),
      ],
    );
  }
}
