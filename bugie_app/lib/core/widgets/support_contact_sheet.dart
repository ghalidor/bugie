import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../services/admin_settings_service.dart';
import '../theme/bugie_theme.dart';

/// Hoja inferior "Ayuda" con el teléfono y el correo de soporte que el admin
/// configura en Configuración (support_phone / support_email).
///
/// La app no tiene url_launcher, así que cada dato se puede copiar con un toque.
Future<void> showSupportContactSheet(BuildContext context) async {
  final contact =
      await context.read<AdminSettingsService>().getSupportContact();
  if (!context.mounted) return;

  final c = context.bugie;
  await showModalBottomSheet<void>(
    context: context,
    backgroundColor: c.surface,
    showDragHandle: true,
    builder: (ctx) {
      void copy(String value) {
        Clipboard.setData(ClipboardData(text: value));
        Navigator.of(ctx).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Copiado: $value')),
        );
      }

      final empty = contact.phone.isEmpty && contact.email.isEmpty;
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('¿Necesitas ayuda?',
                  style: TextStyle(
                      color: c.text,
                      fontSize: 18,
                      fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              Text(
                empty
                    ? 'Por ahora no hay datos de contacto. Inténtalo más tarde.'
                    : 'Toca un dato para copiarlo.',
                style: TextStyle(color: c.textMuted, fontSize: 13),
              ),
              const SizedBox(height: 8),
              if (contact.phone.isNotEmpty)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(Icons.phone_outlined, color: c.text),
                  title: Text(contact.phone, style: TextStyle(color: c.text)),
                  subtitle: Text('Teléfono de soporte',
                      style: TextStyle(color: c.textMuted)),
                  trailing: Icon(Icons.copy, size: 18, color: c.textMuted),
                  onTap: () => copy(contact.phone),
                ),
              if (contact.email.isNotEmpty)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(Icons.email_outlined, color: c.text),
                  title: Text(contact.email, style: TextStyle(color: c.text)),
                  subtitle: Text('Correo de soporte',
                      style: TextStyle(color: c.textMuted)),
                  trailing: Icon(Icons.copy, size: 18, color: c.textMuted),
                  onTap: () => copy(contact.email),
                ),
            ],
          ),
        ),
      );
    },
  );
}
