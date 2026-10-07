import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../core/services/alert_feedback.dart';
import '../../../core/services/notification_prefs.dart';
import '../../../core/session/session.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/theme/theme_controller.dart';
import '../../../core/widgets/bugie_internal_header.dart';

/// Versión que se muestra en "Versión de la app".
/// La app no tiene package_info_plus, así que se copia a mano del pubspec
/// (`version: 1.0.0+1`). Actualízala junto con el pubspec al publicar.
const String kAppVersion = '1.0.0 (1)';

/// "Configuración" — la usan el pasajero (/passenger/settings) y el
/// conductor (/driver/settings): tema, permiso de notificaciones, cuenta
/// (cambiar contraseña / eliminar cuenta) y versión.
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

/// Estado del permiso de notificaciones del celular.
enum _NotifState { loading, allowed, blocked, unknown }

class _SettingsScreenState extends State<SettingsScreen>
    with WidgetsBindingObserver {
  _NotifState _notif = _NotifState.loading;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadNotif();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// Al volver de los ajustes del celular, se revisa otra vez el permiso.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _loadNotif();
  }

  Future<void> _loadNotif() async {
    try {
      final s = await FirebaseMessaging.instance.getNotificationSettings();
      if (!mounted) return;
      setState(() {
        switch (s.authorizationStatus) {
          case AuthorizationStatus.authorized:
          case AuthorizationStatus.provisional:
            _notif = _NotifState.allowed;
            break;
          case AuthorizationStatus.denied:
            _notif = _NotifState.blocked;
            break;
          case AuthorizationStatus.notDetermined:
            _notif = _NotifState.unknown;
            break;
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _notif = _NotifState.unknown);
    }
  }

  /// Abre la pantalla de ajustes de Bugie en el celular (Android e iOS).
  /// Usa geolocator, que ya está en la app y trae ese atajo.
  Future<void> _openAppSettings() async {
    final messenger = ScaffoldMessenger.of(context);
    var opened = false;
    try {
      opened = await Geolocator.openAppSettings();
    } catch (_) {
      opened = false;
    }
    if (!opened) {
      messenger.showSnackBar(
        const SnackBar(
          content: Text('No pudimos abrir los ajustes. Entra a Ajustes del '
              'celular > Aplicaciones > Bugie > Notificaciones.'),
          duration: Duration(seconds: 4),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final theme = context.watch<ThemeController>();
    // Las subpantallas cuelgan de la ruta del rol (/passenger o /driver).
    final isDriver = context.read<Session>().role == UserRole.driver;
    final base = isDriver ? '/driver/settings' : '/passenger/settings';

    return Scaffold(
      backgroundColor: c.bg,
      appBar: const BugieInternalHeader(title: 'Configuración'),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
          children: [
            const _SectionTitle('Tema'),
            _Card(
              child: Column(
                children: [
                  _ThemeOption(
                    icon: Icons.light_mode_outlined,
                    label: 'Claro',
                    selected: theme.mode == ThemeMode.light,
                    onTap: () => theme.setMode(ThemeMode.light),
                  ),
                  Divider(height: 1, color: c.border),
                  _ThemeOption(
                    icon: Icons.dark_mode_outlined,
                    label: 'Oscuro',
                    selected: theme.mode == ThemeMode.dark,
                    onTap: () => theme.setMode(ThemeMode.dark),
                  ),
                  Divider(height: 1, color: c.border),
                  _ThemeOption(
                    icon: Icons.brightness_auto_outlined,
                    label: 'Según el sistema',
                    selected: theme.mode == ThemeMode.system,
                    onTap: () => theme.setMode(ThemeMode.system),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            const _SectionTitle('Notificaciones'),
            _Card(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _notifContent(c),
                  Divider(height: 1, color: c.border),
                  _NotifPrefsSection(
                    isDriver: isDriver,
                    onOpenSettings: _openAppSettings,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            const _SectionTitle('Cuenta'),
            _Card(
              child: Column(
                children: [
                  ListTile(
                    leading: Icon(Icons.lock_outline, color: c.text),
                    title: Text('Cambiar contraseña',
                        style: TextStyle(color: c.text, fontSize: 15)),
                    trailing: Icon(Icons.chevron_right, color: c.textMuted),
                    onTap: () => context.push('$base/password'),
                  ),
                  Divider(height: 1, color: c.border),
                  // Zona roja
                  ListTile(
                    leading: const Icon(Icons.delete_forever_outlined,
                        color: BugieColors.danger),
                    title: const Text('Eliminar mi cuenta',
                        style: TextStyle(
                            color: BugieColors.danger,
                            fontSize: 15,
                            fontWeight: FontWeight.w600)),
                    trailing:
                        const Icon(Icons.chevron_right, color: BugieColors.danger),
                    onTap: () => context.push('$base/delete-account'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            const _SectionTitle('Acerca de'),
            _Card(
              child: ListTile(
                leading: Icon(Icons.info_outline, color: c.text),
                title: Text('Versión de la app',
                    style: TextStyle(color: c.text, fontSize: 15)),
                trailing: Text(kAppVersion,
                    style: TextStyle(
                        color: c.textMuted,
                        fontSize: 14,
                        fontWeight: FontWeight.w600)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _notifContent(BugieColorsExt c) {
    final IconData icon;
    final Color color;
    final String title;
    final String subtitle;
    switch (_notif) {
      case _NotifState.loading:
        return const Padding(
          padding: EdgeInsets.all(18),
          child: Center(
            child: SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          ),
        );
      case _NotifState.allowed:
        icon = Icons.notifications_active_outlined;
        color = BugieColors.success;
        title = 'Permitidas';
        subtitle = 'Te avisaremos de tus viajes, envíos y alertas.';
        break;
      case _NotifState.blocked:
        icon = Icons.notifications_off_outlined;
        color = BugieColors.danger;
        title = 'Bloqueadas';
        subtitle = 'No recibirás avisos de tus viajes ni envíos. '
            'Actívalas desde los ajustes del celular.';
        break;
      case _NotifState.unknown:
        icon = Icons.notifications_none;
        color = BugieColors.warning;
        title = 'Sin configurar';
        subtitle = 'Aún no has dado permiso. Puedes activarlas desde los '
            'ajustes del celular.';
        break;
    }
    return Padding(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, color: color, size: 24),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                        style: TextStyle(
                            color: color,
                            fontSize: 15,
                            fontWeight: FontWeight.w700)),
                    const SizedBox(height: 4),
                    Text(subtitle,
                        style: TextStyle(color: c.textMuted, fontSize: 13)),
                  ],
                ),
              ),
            ],
          ),
          if (_notif != _NotifState.allowed) ...[
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: _openAppSettings,
                icon: const Icon(Icons.settings_outlined, size: 18),
                label: const Text('Abrir ajustes del celular'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: BugieColors.primary,
                  side: const BorderSide(color: BugieColors.primary),
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Switches de sonido / vibración (y los del conductor) + botón "Probar".
class _NotifPrefsSection extends StatelessWidget {
  final bool isDriver;
  final VoidCallback onOpenSettings;
  const _NotifPrefsSection({
    required this.isDriver,
    required this.onOpenSettings,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final prefs = context.watch<NotificationPrefs>();
    final noAnim = MediaQuery.of(context).disableAnimations;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _PrefSwitch(
          icon: Icons.volume_up_outlined,
          title: 'Sonido',
          subtitle: 'Suena cuando llega un aviso con la app abierta.',
          value: prefs.sound,
          onChanged: prefs.setSound,
        ),
        _PrefSwitch(
          icon: Icons.vibration,
          title: 'Vibración',
          subtitle: 'Vibra cuando llega un aviso.',
          value: prefs.vibration,
          onChanged: prefs.setVibration,
        ),
        if (isDriver) ...[
          // Se atenúa si el sonido general está apagado.
          AnimatedOpacity(
            opacity: prefs.sound ? 1 : 0.5,
            duration:
                noAnim ? Duration.zero : const Duration(milliseconds: 200),
            child: _PrefSwitch(
              icon: Icons.notifications_active_outlined,
              title: 'Sonido especial para solicitudes nuevas',
              subtitle: 'Un tono distinto que se repite hasta que respondas.',
              value: prefs.requestSound,
              onChanged: prefs.sound ? prefs.setRequestSound : null,
            ),
          ),
          _PrefSwitch(
            icon: Icons.do_not_disturb_on_outlined,
            title: 'No molestar cuando estoy desconectado',
            subtitle: 'Sin sonido ni vibración por solicitudes si no estás '
                'conectado.',
            value: prefs.quietOffline,
            onChanged: prefs.setQuietOffline,
          ),
        ],
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 4, 14, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              OutlinedButton.icon(
                onPressed: (prefs.sound || prefs.vibration)
                    ? () => AlertFeedback().test(request: isDriver)
                    : null,
                icon: const Icon(Icons.play_arrow_rounded, size: 20),
                label: const Text('Probar'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: BugieColors.primary,
                  side: BorderSide(
                      color: (prefs.sound || prefs.vibration)
                          ? BugieColors.primary
                          : c.border),
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
              ),
              const SizedBox(height: 10),
              Text(
                'Con la app cerrada, el sonido y la vibración los decide el '
                'celular. Puedes cambiarlos en los ajustes de notificaciones '
                'de Bugie.',
                style: TextStyle(color: c.textMuted, fontSize: 12.5),
              ),
              const SizedBox(height: 10),
              // Mismo estilo que "Abrir ajustes del celular".
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: onOpenSettings,
                  icon: const Icon(Icons.settings_outlined, size: 18),
                  label: const Text('Abrir ajustes de notificaciones'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: BugieColors.primary,
                    side: const BorderSide(color: BugieColors.primary),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _PrefSwitch extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final bool value;
  final ValueChanged<bool>? onChanged;
  const _PrefSwitch({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return SwitchListTile(
      value: value,
      onChanged: onChanged,
      secondary: Icon(icon, color: c.text),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14),
      title: Text(title, style: TextStyle(color: c.text, fontSize: 15)),
      subtitle: Text(subtitle,
          style: TextStyle(color: c.textMuted, fontSize: 12.5)),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String text;
  const _SectionTitle(this.text);

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Padding(
      padding: const EdgeInsets.only(left: 4, bottom: 8),
      child: Text(text.toUpperCase(),
          style: TextStyle(
              color: c.textMuted,
              fontSize: 11,
              fontWeight: FontWeight.w800,
              letterSpacing: 1)),
    );
  }
}

class _Card extends StatelessWidget {
  final Widget child;
  const _Card({required this.child});

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Container(
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: c.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: child,
    );
  }
}

class _ThemeOption extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _ThemeOption({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return ListTile(
      leading: Icon(icon, color: selected ? BugieColors.primary : c.text),
      title: Text(label,
          style: TextStyle(
              color: c.text,
              fontSize: 15,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w400)),
      trailing: Icon(
        selected ? Icons.radio_button_checked : Icons.radio_button_off,
        color: selected ? BugieColors.primary : c.textMuted,
      ),
      onTap: onTap,
    );
  }
}
