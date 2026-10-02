import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/widgets/bugie_internal_header.dart';
import '../data/rewards_repository.dart';
import '../domain/rewards_model.dart';

/// Pantalla de puntos.
///
/// La usan pasajero y conductor: el backend decide por el token qué saldo,
/// qué niveles y qué catálogo devolver, así que la pantalla es la misma.
///
/// Tres pestañas:
///   · Mis puntos → saldo, nivel, progreso, vencimiento e historial.
///   · Canjear    → catálogo con el costo y si alcanza.
///   · Cupones    → lo canjeado, con su código.
class RewardsScreen extends StatefulWidget {
  const RewardsScreen({super.key});

  @override
  State<RewardsScreen> createState() => _RewardsScreenState();
}

class _RewardsScreenState extends State<RewardsScreen> {
  int _tab = 0;

  /// Se sube cada vez que algo cambia el saldo, para que las tres pestañas
  /// vuelvan a pedir datos frescos.
  int _reload = 0;

  /// Código del último cupón canjeado, para resaltarlo.
  String? _lastCode;

  void _onRedeemed(RedeemResult result) {
    setState(() {
      _lastCode = result.redemption.code;
      _reload++;
      _tab = 2;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const BugieInternalHeader(title: 'Mis puntos'),
      body: SafeArea(
        child: Column(
          children: [
            _Tabs(
              current: _tab,
              onChanged: (i) => setState(() => _tab = i),
            ),
            Expanded(
              // Solo se construye la pestaña visible. Con IndexedStack las tres
              // pedían datos al abrir la pantalla: tres llamadas de golpe.
              child: switch (_tab) {
                0 => _SummaryTab(key: ValueKey('s$_reload'),
                                 onGoToCatalog: () => setState(() => _tab = 1)),
                1 => _CatalogTab(key: ValueKey('c$_reload'), onRedeemed: _onRedeemed),
                2 => _CouponsTab(key: ValueKey('u$_reload'), highlight: _lastCode),
                3 => _ExtrasTab(key: ValueKey('x$_reload')),
                _ => _ReferralTab(key: ValueKey('r$_reload')),
              },
            ),
          ],
        ),
      ),
    );
  }
}

/* ── Pestañas ───────────────────────────────────────────────────────────── */

class _Tabs extends StatelessWidget {
  final int current;
  final ValueChanged<int> onChanged;
  const _Tabs({required this.current, required this.onChanged});

  static const _items = [
    _TabItem(Icons.stars_rounded, 'Mis puntos'),
    _TabItem(Icons.card_giftcard, 'Canjear'),
    _TabItem(Icons.confirmation_number_outlined, 'Cupones'),
    _TabItem(Icons.bolt, 'Promos'),
    _TabItem(Icons.person_add_alt, 'Invita'),
  ];

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: Row(
        children: List.generate(_items.length, (i) {
          final active = i == current;
          final icon  = _items[i].icon;
          final label = _items[i].label;
          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: ChoiceChip(
              selected: active,
              onSelected: (_) => onChanged(i),
              avatar: Icon(icon, size: 16,
                  color: active ? Colors.white : c.textMuted),
              label: Text(label),
              labelStyle: TextStyle(
                fontWeight: FontWeight.w600,
                color: active ? Colors.white : c.textMuted,
              ),
              selectedColor: BugieColors.primary,
              backgroundColor: Colors.transparent,
              shape: StadiumBorder(
                side: BorderSide(
                  color: active ? BugieColors.primary : c.border,
                ),
              ),
            ),
          );
        }),
      ),
    );
  }
}

class _TabItem {
  final IconData icon;
  final String label;
  const _TabItem(this.icon, this.label);
}

/* ── Pestaña 1: resumen ─────────────────────────────────────────────────── */

class _SummaryTab extends StatefulWidget {
  final VoidCallback onGoToCatalog;
  const _SummaryTab({super.key, required this.onGoToCatalog});

  @override
  State<_SummaryTab> createState() => _SummaryTabState();
}

class _SummaryTabState extends State<_SummaryTab> {
  RewardsPointsProfile? _profile;
  Progress?             _progress;
  List<RewardLevel>     _levels = [];
  List<RewardsTransaction> _history = [];
  int  _historyTotal = 0;
  int  _historyPage  = 1;
  bool _loadingMore  = false;
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
      final repo = context.read<RewardsRepository>();
      final results = await Future.wait([
        repo.getProfile(),
        repo.getLevels(),
        repo.getHistory(page: 1, pageSize: 15),
        // El progreso es complementario: si falla, la pantalla igual sirve.
        repo.getProgress().then<Progress?>((p) => p).catchError((_) => null),
      ]);
      if (!mounted) return;
      final page = results[2] as RewardsPage<RewardsTransaction>;
      setState(() {
        _profile      = results[0] as RewardsPointsProfile;
        _levels       = results[1] as List<RewardLevel>;
        _progress     = results[3] as Progress?;
        _history      = page.items;
        _historyTotal = page.total;
        _historyPage  = 1;
        _loading      = false;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() { _error = e.message; _loading = false; });
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'No se pudieron cargar tus puntos.';
          _loading = false;
        });
      }
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore) return;
    setState(() => _loadingMore = true);
    try {
      final page = await context
          .read<RewardsRepository>()
          .getHistory(page: _historyPage + 1, pageSize: 15);
      if (!mounted) return;
      setState(() {
        _history.addAll(page.items);
        _historyTotal = page.total;
        _historyPage++;
      });
    } catch (_) {
      // Si falla cargar más, se deja lo que ya hay. No vale romper la pantalla.
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return _ErrorView(message: _error!, onRetry: _load);

    final p = _profile!;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
        children: [
          // La racha va primero: es lo que falta, y motiva más que lo ya ganado.
          if (_progress != null && !_progress!.isEmpty)
            _ProgressSection(progress: _progress!),
          _LevelCard(profile: p),
          const SizedBox(height: 12),
          if (p.availablePoints > 0 && p.pointsExpiryDate != null)
            _ExpiryNotice(profile: p),
          _TotalsRow(profile: p),
          const SizedBox(height: 18),
          if (p.availablePoints > 0)
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: widget.onGoToCatalog,
                icon: const Icon(Icons.card_giftcard, size: 18),
                label: const Text('Ver recompensas'),
              ),
            ),
          const SizedBox(height: 22),
          _SectionTitle('Niveles'),
          const SizedBox(height: 8),
          ..._levels.map((l) => _LevelRow(level: l, current: p.currentLevel)),
          const SizedBox(height: 22),
          _SectionTitle('Movimientos'),
          const SizedBox(height: 8),
          if (_history.isEmpty)
            Padding(
              padding: EdgeInsets.symmetric(vertical: 18),
              child: Text(
                'Todavía no tienes movimientos. Completa un viaje para empezar a acumular.',
                textAlign: TextAlign.center,
                style: TextStyle(color: c.textMuted, fontSize: 13),
              ),
            ),
          ..._history.map((t) => _TransactionRow(tx: t)),
          if (_history.length < _historyTotal)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: OutlinedButton(
                onPressed: _loadingMore ? null : _loadMore,
                child: Text(_loadingMore
                    ? 'Cargando…'
                    : 'Cargar más (${_history.length} de $_historyTotal)'),
              ),
            ),
        ],
      ),
    );
  }
}

class _LevelCard extends StatelessWidget {
  final RewardsPointsProfile profile;
  const _LevelCard({required this.profile});

  @override
  Widget build(BuildContext context) {
    final color = levelColor(profile.currentLevel);
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [BugieColors.heroDark, BugieColors.heroNavy],
          begin: Alignment.topLeft, end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(18),
        border: Border(left: BorderSide(color: color, width: 4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Tu nivel',
                        style: TextStyle(color: BugieColors.onDarkMuted, fontSize: 12)),
                    const SizedBox(height: 4),
                    Row(children: [
                      Icon(Icons.workspace_premium, color: color, size: 26),
                      const SizedBox(width: 8),
                      Text(profile.currentLevelName,
                          style: const TextStyle(
                              color: Colors.white, fontSize: 24,
                              fontWeight: FontWeight.w800, letterSpacing: -.5)),
                    ]),
                    if (profile.discountPercentage > 0) ...[
                      const SizedBox(height: 4),
                      Text('${_num(profile.discountPercentage)}% de descuento',
                          style: const TextStyle(
                              color: BugieColors.onDarkMuted, fontSize: 12)),
                    ],
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  const Text('Disponibles',
                      style: TextStyle(color: BugieColors.onDarkMuted, fontSize: 12)),
                  const SizedBox(height: 2),
                  Text(formatPoints(profile.availablePoints),
                      style: const TextStyle(
                          color: Colors.white, fontSize: 30,
                          fontWeight: FontWeight.w800, height: 1)),
                ],
              ),
            ],
          ),
          const SizedBox(height: 16),
          if (profile.nextLevelName != null) ...[
            ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(
                value: profile.progressPercentage / 100,
                minHeight: 8,
                backgroundColor: BugieColors.onDarkBorder,
                valueColor: AlwaysStoppedAnimation(color),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Te faltan ${formatPoints(profile.pointsToNextLevel)} puntos '
              'para ${profile.nextLevelName}.',
              style: const TextStyle(color: BugieColors.onDarkMuted, fontSize: 12),
            ),
          ] else
            const Text('Estás en el nivel más alto.',
                style: TextStyle(color: BugieColors.onDarkMuted, fontSize: 12)),
        ],
      ),
    );
  }
}

class _ExpiryNotice extends StatelessWidget {
  final RewardsPointsProfile profile;
  const _ExpiryNotice({required this.profile});

  @override
  Widget build(BuildContext context) {
    final days = profile.daysUntilExpiry ?? 0;
    // Ámbar a partir de 30 días, que es cuando el sistema manda el aviso push.
    final soon  = days <= 30;
    final color = soon ? BugieColors.warning : BugieColors.info;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withOpacity(.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(.35)),
      ),
      child: Row(children: [
        Icon(soon ? Icons.hourglass_bottom : Icons.info_outline, color: color, size: 18),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            'Tus ${formatPoints(profile.availablePoints)} puntos vencen el '
            '${formatDate(profile.pointsExpiryDate)}'
            '${days > 0 ? ' (en $days ${days == 1 ? 'día' : 'días'})' : ''}. '
            'Cada viaje renueva la vigencia de todo tu saldo.',
            style: const TextStyle(fontSize: 12.5, height: 1.35),
          ),
        ),
      ]),
    );
  }
}

class _TotalsRow extends StatelessWidget {
  final RewardsPointsProfile profile;
  const _TotalsRow({required this.profile});

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final items = <MapEntry<String, int>>[
      MapEntry('Disponibles', profile.availablePoints),
      MapEntry('Ganados',     profile.totalPoints),
      MapEntry('Canjeados',   profile.redeemedPoints),
    ];
    return Row(
      children: items.map((e) {
        return Expanded(
          child: Container(
            margin: const EdgeInsets.symmetric(horizontal: 3),
            padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
            decoration: BoxDecoration(
              color: c.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: c.border),
            ),
            child: Column(children: [
              Text(e.key, style: TextStyle(
                  fontSize: 11, color: c.textMuted)),
              const SizedBox(height: 3),
              Text(formatPoints(e.value), style: const TextStyle(
                  fontSize: 17, fontWeight: FontWeight.w800)),
            ]),
          ),
        );
      }).toList(),
    );
  }
}

class _LevelRow extends StatelessWidget {
  final RewardLevel level;
  final String current;
  const _LevelRow({required this.level, required this.current});

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final isCurrent = level.name == current;
    final color = levelColor(level.name);

    final perks = <String>[
      if (level.discountPercentage > 0) '${_num(level.discountPercentage)}% de descuento',
      if (level.monthlyFreeTrips > 0)
        '${level.monthlyFreeTrips} ${level.monthlyFreeTrips == 1 ? 'viaje gratis' : 'viajes gratis'} al mes',
      if (level.monthlyRaffleTickets > 0)
        '${level.monthlyRaffleTickets} ${level.monthlyRaffleTickets == 1 ? 'ticket' : 'tickets'} de sorteo',
    ];

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isCurrent ? color.withOpacity(.10) : c.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: isCurrent ? color : c.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Icon(Icons.workspace_premium, color: color, size: 18),
            const SizedBox(width: 8),
            Text(level.displayName,
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
            if (isCurrent) ...[
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: color.withOpacity(.18),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text('Tu nivel',
                    style: TextStyle(fontSize: 10.5, color: color,
                        fontWeight: FontWeight.w700)),
              ),
            ],
            const Spacer(),
            Text('desde ${formatPoints(level.minPoints)}',
                style: TextStyle(fontSize: 11, color: c.textMuted)),
          ]),
          if (perks.isNotEmpty) ...[
            const SizedBox(height: 5),
            Text(perks.join(' · '),
                style: TextStyle(fontSize: 12, color: c.textMuted)),
          ],
        ],
      ),
    );
  }
}

class _TransactionRow extends StatelessWidget {
  final RewardsTransaction tx;
  const _TransactionRow({required this.tx});

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final color = tx.isPositive ? BugieColors.success : BugieColors.danger;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: c.border)),
      ),
      child: Row(children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${txLabel(tx.type)} · ${sourceLabel(tx.sourceEvent)}',
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
              const SizedBox(height: 2),
              Text(
                formatDateTime(tx.createdAt) +
                    (tx.notes != null && tx.notes!.isNotEmpty ? ' — ${tx.notes}' : ''),
                style: TextStyle(fontSize: 11.5, color: c.textMuted),
              ),
            ],
          ),
        ),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text('${tx.isPositive ? '+' : '−'}${formatPoints(tx.points)}',
                style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 14)),
            Text('saldo ${formatPoints(tx.balanceAfter)}',
                style: TextStyle(fontSize: 11, color: c.textMuted)),
          ],
        ),
      ]),
    );
  }
}

/* ── Pestaña 2: catálogo ────────────────────────────────────────────────── */

class _CatalogTab extends StatefulWidget {
  final ValueChanged<RedeemResult> onRedeemed;
  const _CatalogTab({super.key, required this.onRedeemed});

  @override
  State<_CatalogTab> createState() => _CatalogTabState();
}

class _CatalogTabState extends State<_CatalogTab> {
  List<RewardCatalogItem> _items = [];
  int  _available = 0;
  bool _loading = true;
  String? _error;
  String? _redeeming;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final repo = context.read<RewardsRepository>();
      final results = await Future.wait([repo.getCatalog(), repo.getProfile()]);
      if (!mounted) return;
      setState(() {
        _items     = results[0] as List<RewardCatalogItem>;
        _available = (results[1] as RewardsPointsProfile).availablePoints;
        _loading   = false;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() { _error = e.message; _loading = false; });
    } catch (_) {
      if (mounted) {
        setState(() { _error = 'No se pudo cargar el catálogo.'; _loading = false; });
      }
    }
  }

  Future<void> _confirmAndRedeem(RewardCatalogItem item) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(item.name),
        content: Text(
          'Se descontarán ${formatPoints(item.pointsCost)} puntos de tu saldo.\n\n'
          'El cupón vence a los ${item.validityDays} días.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Canjear')),
        ],
      ),
    );
    if (ok != true || !mounted) return;

    setState(() => _redeeming = item.id);
    try {
      final result = await context.read<RewardsRepository>().redeem(item.id);
      if (!mounted) return;
      widget.onRedeemed(result);
    } on ApiException catch (e) {
      // El backend explica el motivo: saldo, nivel, agotado o canje apagado.
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message), backgroundColor: BugieColors.danger),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No se pudo completar el canje.')),
        );
      }
    } finally {
      if (mounted) setState(() => _redeeming = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return _ErrorView(message: _error!, onRetry: _load);

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: c.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: c.border),
            ),
            child: Row(children: [
              Text('Tienes para canjear',
                  style: TextStyle(color: c.textMuted, fontSize: 13)),
              const Spacer(),
              Text('${formatPoints(_available)} pts',
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            ]),
          ),
          const SizedBox(height: 14),
          if (_items.isEmpty)
            Padding(
              padding: EdgeInsets.symmetric(vertical: 28),
              child: Text('No hay recompensas disponibles por ahora.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: c.textMuted)),
            ),
          ..._items.map((i) => _CatalogCard(
                item: i,
                busy: _redeeming == i.id,
                disabled: _redeeming != null,
                onRedeem: () => _confirmAndRedeem(i),
              )),
        ],
      ),
    );
  }
}

class _CatalogCard extends StatelessWidget {
  final RewardCatalogItem item;
  final bool busy;
  final bool disabled;
  final VoidCallback onRedeem;

  const _CatalogCard({
    required this.item,
    required this.busy,
    required this.disabled,
    required this.onRedeem,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final locked = !item.canAfford;
    return Opacity(
      opacity: locked ? .6 : 1,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: c.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: c.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(
                width: 38, height: 38,
                decoration: BoxDecoration(
                  color: BugieColors.primary.withOpacity(.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(rewardIcon(item.rewardType),
                    size: 19, color: BugieColors.primary),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(item.name,
                        style: const TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 14.5)),
                    const SizedBox(height: 2),
                    Text(describeReward(item.rewardType, item.amountSoles,
                            item.quantity, item.percentage),
                        style: TextStyle(
                            fontSize: 12.5, color: c.textMuted)),
                  ],
                ),
              ),
              Text('${formatPoints(item.pointsCost)} pts',
                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
            ]),
            if (item.description != null && item.description!.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(item.description!, style: const TextStyle(fontSize: 12.5)),
            ],
            const SizedBox(height: 6),
            Text(
              'Válido ${item.validityDays} días después de canjear'
              '${item.stock != null ? ' · quedan ${item.stock}' : ''}',
              style: TextStyle(fontSize: 11.5, color: c.textMuted),
            ),
            const SizedBox(height: 10),
            if (locked)
              Row(children: [
                Icon(Icons.lock_outline, size: 14, color: c.textMuted),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(item.blockedReason ?? 'No disponible',
                      style: TextStyle(
                          fontSize: 12, color: c.textMuted)),
                ),
              ])
            else
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: disabled ? null : onRedeem,
                  child: busy
                      ? const SizedBox(width: 18, height: 18,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white))
                      : const Text('Canjear'),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/* ── Pestaña 3: cupones ─────────────────────────────────────────────────── */

class _CouponsTab extends StatefulWidget {
  final String? highlight;
  const _CouponsTab({super.key, this.highlight});

  @override
  State<_CouponsTab> createState() => _CouponsTabState();
}

class _CouponsTabState extends State<_CouponsTab> {
  static const _filters = <_Filter>[
    _Filter(null, 'Todos'),
    _Filter('active', 'Vigentes'),
    _Filter('used', 'Usados'),
    _Filter('expired', 'Vencidos'),
    _Filter('cancelled', 'Anulados'),
  ];

  String? _status = 'active';
  List<RewardRedemption> _items = [];
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
      final page = await context
          .read<RewardsRepository>()
          .getMyRedemptions(status: _status);
      if (!mounted) return;
      setState(() { _items = page.items; _loading = false; });
    } on ApiException catch (e) {
      if (mounted) setState(() { _error = e.message; _loading = false; });
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'No se pudieron cargar tus cupones.';
          _loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Column(
      children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
          child: Row(
            children: _filters.map((f) {
              final active = _status == f.status;
              return Padding(
                padding: const EdgeInsets.only(right: 7),
                child: ChoiceChip(
                  selected: active,
                  onSelected: (_) { setState(() => _status = f.status); _load(); },
                  label: Text(f.label, style: const TextStyle(fontSize: 12.5)),
                  labelStyle: TextStyle(
                    color: active ? Colors.white : c.textMuted,
                    fontWeight: FontWeight.w600,
                  ),
                  selectedColor: BugieColors.primary,
                  backgroundColor: Colors.transparent,
                  shape: StadiumBorder(
                    side: BorderSide(
                        color: active ? BugieColors.primary : c.border),
                  ),
                ),
              );
            }).toList(),
          ),
        ),
        Expanded(child: _buildList()),
      ],
    );
  }

  Widget _buildList() {
    final c = context.bugie;
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return _ErrorView(message: _error!, onRetry: _load);

    if (_items.isEmpty) {
      return RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          children: [
            SizedBox(height: 60),
            Icon(Icons.confirmation_number_outlined,
                size: 40, color: c.textMuted),
            SizedBox(height: 12),
            Text('Aún no tienes cupones aquí.',
                textAlign: TextAlign.center,
                style: TextStyle(color: c.textMuted)),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 28),
        itemCount: _items.length,
        itemBuilder: (_, i) => _CouponCard(
          coupon: _items[i],
          highlighted: _items[i].code == widget.highlight,
        ),
      ),
    );
  }
}

class _Filter {
  final String? status;
  final String label;
  const _Filter(this.status, this.label);
}

class _CouponCard extends StatelessWidget {
  final RewardRedemption coupon;
  final bool highlighted;
  const _CouponCard({required this.coupon, required this.highlighted});

  /// Tipos que entrega el equipo de Bugie fuera de la app.
  static const _manual = {'wallet_bonus', 'physical', 'partner_benefit'};

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final color = statusColor(coupon.status);

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
            color: highlighted ? color : c.border,
            width: highlighted ? 2 : 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(rewardIcon(coupon.rewardType), size: 20, color: BugieColors.primary),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(coupon.itemName,
                      style: const TextStyle(
                          fontWeight: FontWeight.w700, fontSize: 14)),
                  Text(describeReward(coupon.rewardType, coupon.amountSoles,
                          coupon.quantity, coupon.percentage),
                      style: TextStyle(
                          fontSize: 12.5, color: c.textMuted)),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
              decoration: BoxDecoration(
                color: color.withOpacity(.15),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(statusLabel(coupon.status),
                  style: TextStyle(
                      fontSize: 11, color: color, fontWeight: FontWeight.w700)),
            ),
          ]),
          const SizedBox(height: 12),
          Divider(height: 1, color: c.border),
          const SizedBox(height: 10),
          Row(children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Código',
                    style: TextStyle(fontSize: 11, color: c.textMuted)),
                Text(coupon.code,
                    style: const TextStyle(
                        fontFamily: 'monospace', fontSize: 17,
                        fontWeight: FontWeight.w800, letterSpacing: 1.2)),
              ],
            ),
            if (coupon.status == 'active') ...[
              const SizedBox(width: 10),
              IconButton(
                tooltip: 'Copiar código',
                icon: const Icon(Icons.copy, size: 17),
                onPressed: () {
                  Clipboard.setData(ClipboardData(text: coupon.code));
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Código copiado'),
                      duration: Duration(seconds: 2),
                    ),
                  );
                },
              ),
            ],
            const Spacer(),
            Text(
              coupon.status == 'active'
                  ? 'Vence el ${formatDate(coupon.expiresAt)}'
                  : coupon.status == 'used' && coupon.usedAt != null
                      ? 'Usado el ${formatDate(coupon.usedAt)}'
                      : 'Venció el ${formatDate(coupon.expiresAt)}',
              style: TextStyle(fontSize: 11.5, color: c.textMuted),
            ),
          ]),
          if (coupon.status == 'active' && _manual.contains(coupon.rewardType)) ...[
            const SizedBox(height: 8),
            Row(children: [
              Icon(Icons.info_outline, size: 14, color: c.textMuted),
              SizedBox(width: 6),
              Expanded(
                child: Text('La entrega la coordina el equipo de Bugie.',
                    style: TextStyle(fontSize: 11.5, color: c.textMuted)),
              ),
            ]),
          ],
        ],
      ),
    );
  }
}

/* ── Pestaña 4: promociones y sorteos ──────────────────────────────────── */

class _ExtrasTab extends StatefulWidget {
  const _ExtrasTab({super.key});

  @override
  State<_ExtrasTab> createState() => _ExtrasTabState();
}

class _ExtrasTabState extends State<_ExtrasTab> {
  List<ActivePromotion> _promos  = [];
  List<UserRaffle>      _raffles = [];
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
      final repo = context.read<RewardsRepository>();
      final results = await Future.wait([repo.getPromotions(), repo.getRaffles()]);
      if (!mounted) return;
      setState(() {
        _promos  = results[0] as List<ActivePromotion>;
        _raffles = results[1] as List<UserRaffle>;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() { _error = e.message; _loading = false; });
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'No se pudieron cargar las promociones.';
          _loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;

    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return _ErrorView(message: _error!, onRetry: _load);

    final activas = _promos.where((p) => p.activeNow).toList();

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
        children: [
          if (activas.isNotEmpty) _ActiveBanner(promos: activas),

          _SectionTitle('Promociones'),
          const SizedBox(height: 8),
          if (_promos.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Text('No hay promociones activas por ahora.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: c.textMuted, fontSize: 13)),
            ),
          ..._promos.map((p) => _PromoCard(promo: p)),

          const SizedBox(height: 22),
          _SectionTitle('Sorteos'),
          const SizedBox(height: 8),
          if (_raffles.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Text('No hay sorteos abiertos por ahora.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: c.textMuted, fontSize: 13)),
            ),
          ..._raffles.map((r) => _RaffleCard(raffle: r)),
        ],
      ),
    );
  }
}

class _ActiveBanner extends StatelessWidget {
  final List<ActivePromotion> promos;
  const _ActiveBanner({required this.promos});

  @override
  Widget build(BuildContext context) {
    final titulo = promos.length == 1
        ? '${promos.first.name} está activa ahora'
        : '${promos.length} promociones activas ahora';

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: BugieColors.success.withOpacity(.12),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: BugieColors.success.withOpacity(.4)),
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Icon(Icons.bolt, color: BugieColors.success, size: 20),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(titulo, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
              const SizedBox(height: 2),
              Text('${promos.map((p) => p.reward).join(' · ')} en tu próximo viaje.',
                  style: const TextStyle(fontSize: 12.5)),
            ],
          ),
        ),
      ]),
    );
  }
}

class _PromoCard extends StatelessWidget {
  final ActivePromotion promo;
  const _PromoCard({required this.promo});

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: promo.activeNow ? BugieColors.success.withOpacity(.07) : c.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
            color: promo.activeNow ? BugieColors.success.withOpacity(.5) : c.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Expanded(
              child: Text(promo.name,
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5)),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
              decoration: BoxDecoration(
                color: BugieColors.primary.withOpacity(.14),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(promo.reward,
                  style: const TextStyle(
                      color: BugieColors.primary, fontWeight: FontWeight.w700, fontSize: 12)),
            ),
          ]),
          if (promo.description != null && promo.description!.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(promo.description!, style: const TextStyle(fontSize: 12.5)),
          ],
          const SizedBox(height: 6),
          Row(children: [
            Icon(Icons.schedule, size: 13, color: c.textMuted),
            const SizedBox(width: 5),
            Expanded(
              child: Text(
                promo.endDate != null
                    ? '${promo.when} · hasta el ${formatDate(promo.endDate)}'
                    : promo.when,
                style: TextStyle(fontSize: 11.5, color: c.textMuted),
              ),
            ),
            if (promo.activeNow)
              const Text('Activa ahora',
                  style: TextStyle(
                      fontSize: 11.5, color: BugieColors.success, fontWeight: FontWeight.w700)),
          ]),
        ],
      ),
    );
  }
}

class _RaffleCard extends StatelessWidget {
  final UserRaffle raffle;
  const _RaffleCard({required this.raffle});

  static const _tipo = {
    'weekly': 'Semanal', 'monthly': 'Mensual', 'special': 'Especial',
  };

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    const dorado = Color(0xFFF5B400);

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: raffle.iWon ? dorado.withOpacity(.1) : c.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: raffle.iWon ? dorado : c.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Expanded(
              child: Text(raffle.name,
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5)),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
              decoration: BoxDecoration(
                color: c.border,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(_tipo[raffle.raffleType] ?? raffle.raffleType,
                  style: TextStyle(fontSize: 11, color: c.textMuted, fontWeight: FontWeight.w600)),
            ),
          ]),
          const SizedBox(height: 4),
          Text(raffle.prizeDescription, style: const TextStyle(fontSize: 12.5)),
          const SizedBox(height: 8),

          if (raffle.iWon)
            Row(children: [
              const Icon(Icons.emoji_events, size: 16, color: dorado),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  '¡Ganaste! '
                  '${raffle.myPrizeRank == 1 ? 'Premio principal' : 'Puesto ${raffle.myPrizeRank}'}'
                  '${raffle.myTicketNumber != null ? ' con el ticket ${raffle.myTicketNumber}' : ''}',
                  style: const TextStyle(
                      fontSize: 12.5, color: dorado, fontWeight: FontWeight.w700),
                ),
              ),
            ])
          else if (raffle.isDrawn)
            Text(
              'Ya se sorteó. Participaste con ${raffle.myTickets} '
              '${raffle.myTickets == 1 ? 'ticket' : 'tickets'}.',
              style: TextStyle(fontSize: 12, color: c.textMuted),
            )
          else ...[
            if (raffle.myTickets > 0)
              Row(children: [
                const Icon(Icons.confirmation_number_outlined,
                    size: 15, color: BugieColors.success),
                const SizedBox(width: 6),
                Text(
                  'Tienes ${raffle.myTickets} '
                  '${raffle.myTickets == 1 ? 'ticket' : 'tickets'}',
                  style: const TextStyle(
                      fontSize: 12.5, color: BugieColors.success, fontWeight: FontWeight.w700),
                ),
              ])
            else if (raffle.eligible)
              Row(children: [
                Icon(Icons.confirmation_number_outlined, size: 15, color: c.textMuted),
                const SizedBox(width: 6),
                Expanded(
                  child: Text('Todavía sin tickets. Se reparten cada madrugada según tu nivel.',
                      style: TextStyle(fontSize: 12, color: c.textMuted)),
                ),
              ])
            else
              Row(children: [
                const Icon(Icons.lock_outline, size: 15, color: BugieColors.warning),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(raffle.notEligibleReason ?? 'No puedes participar.',
                      style: const TextStyle(fontSize: 12, color: BugieColors.warning)),
                ),
              ]),
            const SizedBox(height: 6),
            Text('${raffle.countdown} · ${formatDate(raffle.drawDate)}',
                style: TextStyle(fontSize: 11.5, color: c.textMuted)),
          ],
        ],
      ),
    );
  }
}

/* ── Racha, meta semanal y aniversario ─────────────────────────────────── */

class _ProgressSection extends StatelessWidget {
  final Progress progress;
  const _ProgressSection({required this.progress});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        if (progress.streakTarget > 0) _StreakCard(progress: progress),
        if (progress.weeklyGoal > 0) ...[
          const SizedBox(height: 10),
          _WeeklyGoalCard(progress: progress),
        ],
        if (progress.isAnniversaryMonth) ...[
          const SizedBox(height: 10),
          _AnniversaryBanner(multiplier: progress.anniversaryMultiplier),
        ],
        const SizedBox(height: 12),
      ],
    );
  }
}

class _StreakCard extends StatelessWidget {
  final Progress progress;
  const _StreakCard({required this.progress});

  static const _fuego = Color(0xFFF97316);
  /// Dos letras y no una: con una sola, martes y miércoles son ambos «M» y
  /// nadie los distingue en una fila.
  static const _diaCorto = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final p = progress;

    // El mensaje es lo que convierte el dato en una invitación a viajar.
    final mensaje = !p.traveledToday && p.streakDays == 0
        ? 'Viaja hoy para empezar una racha.'
        : p.streakDaysToGo == 0
            ? '¡Completaste ${p.streakDays} días! Ganaste ${formatPoints(p.streakPoints)} puntos.'
            : 'Viaja ${p.streakDaysToGo} ${p.streakDaysToGo == 1 ? "día" : "días"} más '
              'y ganas ${formatPoints(p.streakPoints)} puntos.';

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: c.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Icon(Icons.local_fire_department,
                color: p.traveledToday ? _fuego : c.textMuted, size: 19),
            const SizedBox(width: 8),
            const Text('Tu racha',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5)),
            const Spacer(),
            Text('${p.streakDays}',
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 19)),
            Text(' / ${p.streakTarget} días',
                style: TextStyle(fontSize: 12, color: c.textMuted)),
          ]),
          const SizedBox(height: 12),

          // La tira de días.
          //
          // Antes eran cajas anchas con un punto dentro: parecían campos vacíos
          // de un formulario y no se entendía qué representaban. Ahora son
          // círculos unidos por una línea, que es como se lee una secuencia.
          //
          // El día cumplido se llena y lleva un check; el que falta muestra su
          // número. El de hoy dice «Hoy» en vez de depender de un borde que
          // casi no se nota.
          SizedBox(
            height: 58,
            child: Stack(
              alignment: Alignment.topCenter,
              children: [
                // La línea, detrás de los círculos.
                Positioned(
                  top: 16, left: 18, right: 18,
                  child: Container(height: 2, color: c.border),
                ),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: p.days.map((d) {
                    final hoy = d.isToday;
                    return Column(children: [
                      Container(
                        width: 34, height: 34,
                        decoration: BoxDecoration(
                          color: d.hasTrip ? _fuego : c.surface,
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: d.hasTrip
                                ? _fuego
                                : (hoy ? BugieColors.primary : c.border),
                            width: 2,
                          ),
                        ),
                        alignment: Alignment.center,
                        child: d.hasTrip
                            ? const Icon(Icons.check, size: 15, color: Colors.white)
                            : Text('${d.date.day}',
                                style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w700,
                                    color: c.textMuted)),
                      ),
                      const SizedBox(height: 5),
                      Text(hoy ? 'Hoy' : _diaCorto[d.date.weekday % 7],
                          style: TextStyle(
                              fontSize: 10.5,
                              fontWeight: hoy ? FontWeight.w700 : FontWeight.w400,
                              color: hoy ? BugieColors.primary : c.textMuted)),
                    ]);
                  }).toList(),
                ),
              ],
            ),
          ),

          const SizedBox(height: 10),
          Text(mensaje, style: const TextStyle(fontSize: 12.5)),

          if (!p.traveledToday && p.streakDays == 0) ...[
            const SizedBox(height: 3),
            Text('La racha se corta si pasas un día sin viajar.',
                style: TextStyle(fontSize: 11.5, color: c.textMuted)),
          ],
        ],
      ),
    );
  }
}

class _WeeklyGoalCard extends StatelessWidget {
  final Progress progress;
  const _WeeklyGoalCard({required this.progress});

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final p = progress;
    final faltan  = (p.weeklyGoal - p.weeklyTrips).clamp(0, p.weeklyGoal);
    final lograda = faltan == 0;
    final pct     = (p.weeklyTrips / p.weeklyGoal).clamp(0.0, 1.0);

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: c.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Icon(Icons.adjust,
                color: lograda ? BugieColors.success : BugieColors.primary, size: 19),
            const SizedBox(width: 8),
            const Text('Meta de la semana',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5)),
            const Spacer(),
            Text('${p.weeklyTrips}',
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 19)),
            Text(' / ${p.weeklyGoal}',
                style: TextStyle(fontSize: 12, color: c.textMuted)),
          ]),
          const SizedBox(height: 10),

          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: pct,
              minHeight: 8,
              backgroundColor: c.border,
              valueColor: AlwaysStoppedAnimation(
                  lograda ? BugieColors.success : BugieColors.primary),
            ),
          ),
          const SizedBox(height: 8),

          Text(
            lograda
                ? 'Meta cumplida. Ganaste ${formatPoints(p.weeklyPoints)} puntos.'
                : 'Te faltan $faltan ${faltan == 1 ? "viaje" : "viajes"} '
                  'para ganar ${formatPoints(p.weeklyPoints)} puntos.',
            style: const TextStyle(fontSize: 12.5),
          ),
          const SizedBox(height: 3),
          Text('La semana se reinicia el lunes.',
              style: TextStyle(fontSize: 11.5, color: c.textMuted)),
        ],
      ),
    );
  }
}

class _AnniversaryBanner extends StatelessWidget {
  final double multiplier;
  const _AnniversaryBanner({required this.multiplier});

  @override
  Widget build(BuildContext context) {
    final texto = multiplier % 1 == 0 ? multiplier.toInt().toString() : multiplier.toString();
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: BugieColors.warning.withOpacity(.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: BugieColors.warning.withOpacity(.35)),
      ),
      child: Row(children: [
        const Icon(Icons.cake_outlined, color: BugieColors.warning, size: 18),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            'Es tu mes de aniversario en Bugie. Ganas ${texto}x puntos en todos '
            'tus viajes hasta fin de mes.',
            style: const TextStyle(fontSize: 12.5, height: 1.35),
          ),
        ),
      ]),
    );
  }
}

/* ── Pestaña 5: invita y gana ──────────────────────────────────────────── */

class _ReferralTab extends StatefulWidget {
  const _ReferralTab({super.key});

  @override
  State<_ReferralTab> createState() => _ReferralTabState();
}

class _ReferralTabState extends State<_ReferralTab> {
  final _emailCtrl = TextEditingController();

  MyReferral?     _data;
  FriendsRanking? _ranking;
  bool _loading = true;
  bool _sending = false;
  String? _error;
  String? _sentTo;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _emailCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final repo = context.read<RewardsRepository>();
      final data = await repo.getMyReferral();
      // El ranking es complementario: si falla, la pantalla igual sirve.
      final ranking = await repo.getRanking().then<FriendsRanking?>((r) => r)
          .catchError((_) => null);
      if (!mounted) return;
      setState(() { _data = data; _ranking = ranking; _loading = false; });
    } on ApiException catch (e) {
      if (mounted) setState(() { _error = e.message; _loading = false; });
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'No se pudo cargar tu código de invitación.';
          _loading = false;
        });
      }
    }
  }

  Future<void> _invite() async {
    final email = _emailCtrl.text.trim();
    setState(() { _sending = true; _sentTo = null; });
    try {
      await context.read<RewardsRepository>().invite(email);
      if (!mounted) return;
      _emailCtrl.clear();
      setState(() => _sentTo = email);
      await _load();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message), backgroundColor: BugieColors.danger));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No se pudo enviar la invitación.')));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;

    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_data == null) return _ErrorView(message: _error ?? 'No se pudo cargar.', onRetry: _load);

    final d = _data!;

    if (!d.enabled) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Text('El programa de invitaciones no está activo por ahora.',
              textAlign: TextAlign.center, style: TextStyle(color: c.textMuted)),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
        children: [
          // ── El código ──
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: c.surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: c.border, style: BorderStyle.solid),
            ),
            child: Column(children: [
              Text('Tu código', style: TextStyle(fontSize: 12, color: c.textMuted)),
              const SizedBox(height: 8),
              Text(
                d.code,
                style: const TextStyle(
                  fontSize: 30, fontWeight: FontWeight.w800,
                  letterSpacing: 5, color: BugieColors.primary,
                  fontFamily: 'monospace',
                ),
              ),
              const SizedBox(height: 12),
              Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                OutlinedButton.icon(
                  onPressed: () {
                    Clipboard.setData(ClipboardData(text: d.code));
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Código copiado'),
                        duration: Duration(seconds: 2),
                      ));
                  },
                  icon: const Icon(Icons.copy, size: 16),
                  label: const Text('Copiar'),
                ),
              ]),
            ]),
          ),

          const SizedBox(height: 14),
          Text(
            'Compártelo por donde quieras. Quien lo use al crear su cuenta te hace ganar puntos.',
            style: TextStyle(fontSize: 12.5, color: c.textMuted),
          ),

          const SizedBox(height: 14),
          _Bullet('Te damos ${formatPoints(d.pointsPerPassenger)} puntos cuando un pasajero '
                  'se registra con tu código.'),
          _Bullet('${formatPoints(d.pointsPerDriver)} puntos si quien se registra es conductor.'),
          if (d.qualifyTrips > 0 && d.qualifyPoints > 0)
            _Bullet('${formatPoints(d.qualifyPoints)} puntos extra cuando esa persona '
                    'completa ${d.qualifyTrips} viajes.'),

          const SizedBox(height: 22),

          // ── Totales ──
          Row(children: [
            _MiniStat(label: 'Invitados', value: d.totalInvited),
            _MiniStat(label: 'Activos',   value: d.qualified),
            _MiniStat(label: 'Puntos',    value: d.pointsEarned),
          ]),

          const SizedBox(height: 22),

          // ── Invitar por correo ──
          _SectionTitle('Invitar por correo'),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(
              child: TextField(
                controller: _emailCtrl,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(
                  hintText: 'correo@ejemplo.com',
                  prefixIcon: Icon(Icons.mail_outline),
                ),
              ),
            ),
            const SizedBox(width: 10),
            FilledButton(
              onPressed: _sending ? null : _invite,
              child: _sending
                  ? const SizedBox(width: 18, height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Enviar'),
            ),
          ]),

          if (_sentTo != null) ...[
            const SizedBox(height: 10),
            Row(children: [
              const Icon(Icons.check_circle, size: 16, color: BugieColors.success),
              const SizedBox(width: 6),
              Expanded(
                child: Text('Invitación enviada a $_sentTo',
                    style: const TextStyle(fontSize: 12.5, color: BugieColors.success)),
              ),
            ]),
          ],

          // ── Ranking entre amigos ──
          if (_ranking != null && _ranking!.entries.length > 1) ...[
            const SizedBox(height: 24),
            _SectionTitle('Ranking entre amigos'),
            const SizedBox(height: 4),
            Text('Puntos de ${_ranking!.monthLabel}',
                style: TextStyle(fontSize: 11.5, color: c.textMuted)),
            const SizedBox(height: 8),
            ..._ranking!.entries.map((e) => _RankingRow(entry: e)),
          ],

          // ── A quiénes invité ──
          if (d.people.isNotEmpty) ...[
            const SizedBox(height: 24),
            _SectionTitle('A quiénes invitaste'),
            const SizedBox(height: 8),
            ...d.people.map((p) => _ReferredRow(person: p, qualifyTrips: d.qualifyTrips)),
          ],
        ],
      ),
    );
  }
}

class _RankingRow extends StatelessWidget {
  final RankingEntry entry;
  const _RankingRow({required this.entry});

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final color = levelColor(entry.level);
    const dorado = Color(0xFFF5B400);

    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
      decoration: BoxDecoration(
        color: entry.isMe ? BugieColors.primary.withOpacity(.08) : Colors.transparent,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
            color: entry.isMe ? BugieColors.primary : Colors.transparent),
      ),
      child: Row(children: [
        SizedBox(
          width: 24,
          child: entry.position == 1
              ? const Icon(Icons.emoji_events, size: 16, color: dorado)
              : Text('${entry.position}',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      fontWeight: FontWeight.w800,
                      color: entry.position <= 3 ? dorado : c.textMuted)),
        ),
        const SizedBox(width: 8),
        Icon(Icons.workspace_premium, size: 16, color: color),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(entry.fullName,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
              Text(entry.relation,
                  style: TextStyle(fontSize: 11, color: c.textMuted)),
            ],
          ),
        ),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(formatPoints(entry.pointsThisMonth),
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5)),
            Text('${entry.trips} ${entry.trips == 1 ? "viaje" : "viajes"}',
                style: TextStyle(fontSize: 11, color: c.textMuted)),
          ],
        ),
      ]),
    );
  }
}

class _Bullet extends StatelessWidget {
  final String text;
  const _Bullet(this.text);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('·  ', style: TextStyle(fontWeight: FontWeight.w800)),
        Expanded(child: Text(text, style: const TextStyle(fontSize: 12.5))),
      ]),
    );
  }
}

class _MiniStat extends StatelessWidget {
  final String label;
  final int value;
  const _MiniStat({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Expanded(
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 3),
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: c.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: c.border),
        ),
        child: Column(children: [
          Text(label, style: TextStyle(fontSize: 11, color: c.textMuted)),
          const SizedBox(height: 3),
          Text(formatPoints(value),
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
        ]),
      ),
    );
  }
}

class _ReferredRow extends StatelessWidget {
  final ReferredPerson person;
  final int qualifyTrips;
  const _ReferredRow({required this.person, required this.qualifyTrips});

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final esConductor = person.userType == 'driver';

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: c.border)),
      ),
      child: Row(children: [
        Icon(esConductor ? Icons.directions_car_filled_outlined : Icons.person_outline,
            size: 18, color: c.textMuted),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(esConductor ? 'Conductor' : 'Pasajero',
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
              Text(
                person.isQualified
                    ? 'Ya completó sus viajes'
                    : qualifyTrips > 0
                        ? '${person.tripsCompleted} de $qualifyTrips viajes para el bono extra'
                        : '${person.tripsCompleted} viajes',
                style: TextStyle(fontSize: 11.5, color: c.textMuted),
              ),
            ],
          ),
        ),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text('+${formatPoints(person.pointsEarned)}',
                style: const TextStyle(
                    color: BugieColors.success, fontWeight: FontWeight.w800, fontSize: 14)),
            if (!person.isQualified && qualifyTrips > 0)
              Text('pendiente el extra',
                  style: TextStyle(fontSize: 10.5, color: c.textMuted)),
          ],
        ),
      ]),
    );
  }
}

/* ── Piezas compartidas ─────────────────────────────────────────────────── */

class _SectionTitle extends StatelessWidget {
  final String text;
  const _SectionTitle(this.text);

  @override
  Widget build(BuildContext context) => Text(text,
      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800));
}

class _ErrorView extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorView({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.wifi_off, size: 38, color: c.textMuted),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center,
                style: TextStyle(color: c.textMuted)),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh, size: 17),
              label: const Text('Reintentar'),
            ),
          ],
        ),
      ),
    );
  }
}

/* ── Textos y formatos ──────────────────────────────────────────────────── */

final _pointsFormat = NumberFormat.decimalPattern('es_PE');

String formatPoints(int n) => _pointsFormat.format(n);

String formatDate(DateTime? d) =>
    d == null ? '—' : DateFormat('dd MMM yyyy', 'es_PE').format(d);

String formatDateTime(DateTime? d) =>
    d == null ? '—' : DateFormat('dd MMM, HH:mm', 'es_PE').format(d);

String _num(double v) => v % 1 == 0 ? v.toInt().toString() : v.toString();

Color levelColor(String level) {
  switch (level) {
    case 'bronze':   return const Color(0xFFCD7F32);
    case 'silver':   return const Color(0xFFA8B3C1);
    case 'gold':     return const Color(0xFFF5B400);
    case 'platinum': return const Color(0xFF7DD3FC);
    default:         return BugieColors.textMuted;
  }
}

Color statusColor(String status) {
  switch (status) {
    case 'active':    return BugieColors.success;
    case 'used':      return BugieColors.textMuted;
    case 'expired':   return BugieColors.warning;
    case 'cancelled': return BugieColors.danger;
    default:          return BugieColors.textMuted;
  }
}

String statusLabel(String status) {
  switch (status) {
    case 'active':    return 'Vigente';
    case 'used':      return 'Usado';
    case 'expired':   return 'Vencido';
    case 'cancelled': return 'Anulado';
    default:          return status;
  }
}

String txLabel(String type) {
  switch (type) {
    case 'earn':   return 'Ganaste';
    case 'redeem': return 'Canjeaste';
    case 'expire': return 'Vencieron';
    case 'bonus':  return 'Devolución';
    default:       return type;
  }
}

String sourceLabel(String source) {
  switch (source) {
    case 'trip_completed':     return 'Viaje completado';
    case 'catalog_redemption': return 'Canje de recompensa';
    case 'redemption_refund':  return 'Canje anulado';
    case 'points_expired':     return 'Puntos vencidos';
    default:                   return source;
  }
}

IconData rewardIcon(String type) {
  switch (type) {
    case 'discount_amount': return Icons.local_offer_outlined;
    case 'free_trip':       return Icons.directions_car_filled_outlined;
    case 'discount_period': return Icons.percent;
    case 'raffle_ticket':   return Icons.confirmation_number_outlined;
    case 'wallet_bonus':    return Icons.account_balance_wallet_outlined;
    case 'physical':        return Icons.card_giftcard;
    case 'partner_benefit': return Icons.handshake_outlined;
    default:                return Icons.card_giftcard;
  }
}

/// Descripción corta de lo que entrega una recompensa.
String describeReward(String type, double? amount, int? quantity, double? percentage) {
  switch (type) {
    case 'discount_amount':
      return 'S/ ${(amount ?? 0).toStringAsFixed(2)} de descuento';
    case 'free_trip':
      return 'Viaje gratis hasta S/ ${(amount ?? 0).toStringAsFixed(2)}';
    case 'discount_period':
      return '${_num(percentage ?? 0)}% de descuento por ${quantity ?? 0} días';
    case 'raffle_ticket':
      return '${quantity ?? 0} ${quantity == 1 ? 'ticket' : 'tickets'} de sorteo';
    case 'wallet_bonus':
      return 'S/ ${(amount ?? 0).toStringAsFixed(2)} a tu cuenta';
    case 'physical':
      return 'Producto físico';
    case 'partner_benefit':
      return 'Beneficio de socio';
    default:
      return type;
  }
}
