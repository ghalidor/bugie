import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../core/api/api_exception.dart';

import '../../../core/theme/bugie_theme.dart';
import '../../../core/widgets/bugie_card.dart';
import '../../../core/widgets/bugie_internal_header.dart';
import 'address_editor_screen.dart';
import '../data/favorites_repository.dart';
import '../domain/favorite_address_model.dart';

/// Pantalla "Mis favoritos" para el pasajero.
/// Tabs:
///   1. Direcciones — CRUD de direcciones guardadas
///   2. Conductores — lista de conductores marcados (solo ver/desmarcar acá)
class FavoritesScreen extends StatefulWidget {
  const FavoritesScreen({super.key});

  @override
  State<FavoritesScreen> createState() => _FavoritesScreenState();
}

class _FavoritesScreenState extends State<FavoritesScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tab;

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tab.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Scaffold(
      backgroundColor: c.bg,
      appBar: const BugieInternalHeader(title: 'Mis favoritos'),
      body: Column(
        children: [
          Container(
            color: c.surface,
            child: TabBar(
              controller: _tab,
              labelColor: BugieColors.primary,
              unselectedLabelColor: c.textMuted,
              indicatorColor: BugieColors.primary,
              tabs: const [
                Tab(icon: Icon(Icons.location_on), text: 'Direcciones'),
                Tab(icon: Icon(Icons.favorite),    text: 'Conductores'),
              ],
            ),
          ),
          Expanded(
            child: TabBarView(
              controller: _tab,
              children: const [
                _AddressesTab(),
                _DriversTab(),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 1: Direcciones favoritas
// ═══════════════════════════════════════════════════════════════════════════
class _AddressesTab extends StatefulWidget {
  const _AddressesTab();
  @override
  State<_AddressesTab> createState() => _AddressesTabState();
}

class _AddressesTabState extends State<_AddressesTab> {
  List<FavoriteAddress> _items = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final repo = context.read<FavoritesRepository>();
      _items = await repo.getAddresses();
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'No se pudo cargar tus direcciones.';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _delete(FavoriteAddress fav) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Borrar dirección'),
        content: Text('¿Quitar "${fav.label}" de tus favoritos?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancelar')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: BugieColors.danger),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Borrar'),
          ),
        ],
      ),
    );
    if (confirm != true) return;

    try {
      await context.read<FavoritesRepository>().deleteAddress(fav.id);
      setState(() => _items.removeWhere((i) => i.id == fav.id));
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No se pudo borrar.')),
        );
      }
    }
  }

  Future<void> _openEditor({FavoriteAddress? edit}) async {
    final saved = await Navigator.push<bool>(
      context,
      MaterialPageRoute(builder: (_) => AddressEditorScreen(edit: edit)),
    );
    if (saved == true) _load();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
        children: [
          if (_error != null) ...[
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.red.withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(_error!, style: const TextStyle(color: Colors.red)),
            ),
            const SizedBox(height: 12),
          ],
          // Aviso inicial si está vacío
          if (_items.isEmpty)
            BugieCard(
              padding: const EdgeInsets.all(24),
              child: Column(
                children: [
                  Icon(Icons.location_off, size: 56, color: c.textMuted),
                  const SizedBox(height: 12),
                  const Text(
                    'Sin direcciones guardadas',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Guarda tus lugares frecuentes (Casa, Trabajo...) para solicitar viajes más rápido.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: c.textMuted, fontSize: 13),
                  ),
                ],
              ),
            )
          else
            ..._items.map((fav) => _AddressTile(
                  fav: fav,
                  onEdit: () => _openEditor(edit: fav),
                  onDelete: () => _delete(fav),
                )),
          const SizedBox(height: 12),
          // Botón agregar al final, para que siempre esté accesible
          ElevatedButton.icon(
            onPressed: () => _openEditor(),
            icon: const Icon(Icons.add),
            label: const Text('Agregar dirección'),
            style: ElevatedButton.styleFrom(
              backgroundColor: BugieColors.primary,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
        ],
      ),
    );
  }
}

/// Cada fila de dirección. Card con icono, etiqueta, dirección, y acciones.
class _AddressTile extends StatelessWidget {
  final FavoriteAddress fav;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  const _AddressTile({required this.fav, required this.onEdit, required this.onDelete});

  /// Mapeo de icon (string) a IconData. Si no se encuentra, usa el genérico.
  static const _icons = {
    'home':              Icons.home,
    'briefcase':         Icons.work,
    'work':              Icons.work,
    'graduation-cap':    Icons.school,
    'school':            Icons.school,
    'shopping-cart':     Icons.shopping_cart,
    'heart':             Icons.favorite,
    'star':              Icons.star,
    'fitness':           Icons.fitness_center,
    'restaurant':        Icons.restaurant,
    'local_hospital':    Icons.local_hospital,
    'location_on':       Icons.location_on,
  };

  IconData get _iconData => _icons[fav.icon] ?? Icons.location_on;

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    // Envolvemos en Padding para tener el "margin" inferior — BugieCard
    // no acepta margin/padding=zero, así que controlamos espacios desde afuera.
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: BugieCard(
        child: Row(
          children: [
            CircleAvatar(
              backgroundColor: BugieColors.primary.withOpacity(0.12),
              child: Icon(_iconData, color: BugieColors.primary),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(fav.label,
                      style: const TextStyle(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 2),
                  Text(
                    fav.address,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: c.textMuted, fontSize: 12),
                  ),
                ],
              ),
            ),
            IconButton(
              icon: const Icon(Icons.edit, size: 20),
              tooltip: 'Editar',
              onPressed: onEdit,
            ),
            IconButton(
              icon: Icon(Icons.delete, size: 20, color: Colors.red.shade400),
              tooltip: 'Borrar',
              onPressed: onDelete,
            ),
          ],
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 2: Conductores favoritos
// ═══════════════════════════════════════════════════════════════════════════
class _DriversTab extends StatefulWidget {
  const _DriversTab();
  @override
  State<_DriversTab> createState() => _DriversTabState();
}

class _DriversTabState extends State<_DriversTab> {
  // Lista de IDs de conductores favoritos (lo único que devuelve el backend).
  // Decisión simple: no traemos info extra (nombre, foto, rating) porque
  // requeriría llamar a otro endpoint por cada uno y NO existe un endpoint
  // que devuelva esa info batch. Mostramos el ID corto y un botón "Ver detalle"
  // que lleva a la pantalla del conductor donde sí están todos sus datos.
  List<String> _ids = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final ids = await context.read<FavoritesRepository>().getFavoriteDriverIds();
      _ids = ids.toList();
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'No se pudo cargar tus conductores favoritos.';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _remove(String driverUserId) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Quitar favorito'),
        content: const Text('¿Quitar este conductor de tus favoritos?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancelar')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: BugieColors.danger),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Quitar'),
          ),
        ],
      ),
    );
    if (confirm != true) return;

    try {
      await context.read<FavoritesRepository>().removeDriver(driverUserId);
      setState(() => _ids.remove(driverUserId));
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No se pudo quitar.')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    if (_loading) return const Center(child: CircularProgressIndicator());

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
        children: [
          if (_error != null) ...[
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.red.withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(_error!, style: const TextStyle(color: Colors.red)),
            ),
            const SizedBox(height: 12),
          ],

          if (_ids.isEmpty)
            BugieCard(
              padding: const EdgeInsets.all(24),
              child: Column(
                children: [
                  Icon(Icons.favorite_border, size: 56, color: c.textMuted),
                  const SizedBox(height: 12),
                  const Text(
                    'Sin conductores favoritos',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Después de un viaje, presiona ❤️ para guardar conductores que te dieron buena experiencia.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: c.textMuted, fontSize: 13),
                  ),
                ],
              ),
            )
          else ...[
            Container(
              padding: const EdgeInsets.all(12),
              margin: const EdgeInsets.only(bottom: 12),
              decoration: BoxDecoration(
                color: BugieColors.primary.withOpacity(0.08),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  Icon(Icons.info_outline, size: 16, color: BugieColors.primary),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Tienes ${_ids.length} conductor(es) favorito(s). Verás ⭐ junto a ellos al solicitar viaje.',
                      style: TextStyle(fontSize: 12, color: BugieColors.primary),
                    ),
                  ),
                ],
              ),
            ),
            ..._ids.map((id) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: BugieCard(
                    child: Row(
                      children: [
                        CircleAvatar(
                          backgroundColor: BugieColors.primary.withOpacity(0.12),
                          child: Icon(Icons.directions_car,
                              color: BugieColors.primary),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Conductor #${id.substring(0, 8)}',
                                  style: const TextStyle(
                                      fontWeight: FontWeight.bold)),
                              const SizedBox(height: 2),
                              const Text(
                                'En tu lista de favoritos',
                                style: TextStyle(fontSize: 12),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.favorite, color: Colors.red),
                          tooltip: 'Quitar favorito',
                          onPressed: () => _remove(id),
                        ),
                      ],
                    ),
                  ),
                )),
          ],
        ],
      ),
    );
  }
}
