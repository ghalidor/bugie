import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../session/session.dart';
import '../theme/bugie_theme.dart';
import 'bugie_theme_toggle.dart';

/// Header compacto para pantallas internas (no dashboards).
/// Diseño: misma estética que [BugiePageHeader] del dashboard (gradient oscuro)
/// pero más corto y con elementos diferentes:
///   - Botón volver [←] → vuelve a la pantalla anterior (o al dashboard si no
///     hay pila de navegación, como cuando se entra con context.go).
///   - Hamburguesa [☰] → abre el drawer.
///   - Mini-logo Bugie + título.
///   - Campanita [🔔] → por ahora no tiene lógica (placeholder).
class BugieInternalHeader extends StatelessWidget implements PreferredSizeWidget {
  final String title;

  /// Ruta a la que ir cuando NO hay pila de navegación (entró con context.go).
  /// Si es null, se calcula según el rol del usuario en sesión.
  final String? fallbackRoute;

  /// Si es false, no muestra el boton volver (util en pestanas del bottom
  /// nav, donde "volver" no tiene sentido). Muestra [leadingIcon] en su lugar.
  final bool showBack;
  final IconData? leadingIcon;

  const BugieInternalHeader({
    super.key,
    required this.title,
    this.fallbackRoute,
    this.showBack = true,
    this.leadingIcon,
  });

  @override
  Size get preferredSize => const Size.fromHeight(60);

  /// Calcula a dónde ir si el botón volver no puede hacer pop.
  /// Si el dev pasó [fallbackRoute] explícito, usa ese.
  /// Si no, intenta deducir del rol del usuario actual.
  String _resolveFallback(BuildContext context) {
    if (fallbackRoute != null) return fallbackRoute!;
    final user = context.read<Session>().user;
    if (user == null) return '/';
    switch (user.role) {
      case UserRole.driver:    return '/driver';
      case UserRole.passenger: return '/passenger';
      case UserRole.admin:     return '/';
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Container(
      padding: EdgeInsets.only(
        top: MediaQuery.of(context).padding.top,
        left: 0,
        right: 8,
      ),
      // Se mezcla con el fondo del tema (igual que el dashboard/login),
      // en vez del gradiente. Con una línea inferior sutil para separarlo.
      decoration: BoxDecoration(
        color: c.bg,
        border: Border(bottom: BorderSide(color: c.border)),
      ),
      height: preferredSize.height + MediaQuery.of(context).padding.top,
      child: Row(
        children: [
          // Botón volver: hace pop si hay pila, si no va al dashboard del rol.
          if (showBack)
            IconButton(
              icon: Icon(Icons.arrow_back, color: c.text),
              tooltip: 'Volver',
              onPressed: () {
                if (context.canPop()) {
                  context.pop();
                } else {
                  context.go(_resolveFallback(context));
                }
              },
            )
          else
            Padding(
              padding: const EdgeInsets.only(left: 14, right: 6),
              child: Icon(leadingIcon ?? Icons.list, color: c.text),
            ),

          // Título de la pantalla
          Expanded(
            child: Text(
              title,
              style: TextStyle(
                color: c.text,
                fontSize: 18,
                fontWeight: FontWeight.w600,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),

          // Cambiar tema claro/oscuro (afecta a toda la app).
          BugieThemeToggle(color: c.text),

          // Campanita: sin lógica aún (placeholder).
          IconButton(
            icon: Icon(Icons.notifications_none, color: c.text),
            tooltip: 'Notificaciones',
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Notificaciones — próximamente'),
                  duration: Duration(seconds: 2),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}
