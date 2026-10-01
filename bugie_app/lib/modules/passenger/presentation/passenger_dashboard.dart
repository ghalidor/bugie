import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../../core/session/session.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/widgets/bugie_card.dart';
import '../../../core/widgets/bugie_theme_toggle.dart';
import '../../auth/data/auth_repository.dart';
import '../../auth/domain/passenger_document_model.dart';
import '../../trips/data/trips_repository.dart';
import '../../trips/domain/trip_model.dart';
import '../data/passenger_repository.dart';

class PassengerDashboard extends StatefulWidget {
  const PassengerDashboard({super.key});

  @override
  State<PassengerDashboard> createState() => _PassengerDashboardState();
}

class _PassengerDashboardState extends State<PassengerDashboard> {
  Trip? _active;
  List<Trip> _history = [];
  /// Estado de verificación del pasajero (vía /auth/users/me/status).
  /// isVerified=true cuando admin aprobó DNI frontal y reverso.
  /// Mientras esté false, NO puede solicitar viajes.
  UserVerificationStatus? _verification;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final passengerRepo = context.read<PassengerRepository>();
    final authRepo = context.read<AuthRepository>();
    try {
      final results = await Future.wait([
        passengerRepo.getActiveTrip(),
        passengerRepo.getHistory(),
        // Si falla la consulta de verificación, asumimos NO verificado
        // (más seguro: el backend lo rechazará igualmente).
        authRepo.getMyStatus().catchError((_) =>
            UserVerificationStatus(isActive: true, isVerified: false,
                fullName: '', email: '')),
      ]);
      if (!mounted) return;
      setState(() {
        _active = results[0] as Trip?;
        _history = results[1] as List<Trip>;
        _verification = results[2] as UserVerificationStatus;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<Session>().user;
    final completed = _history.where((t) => t.status == TripStatus.completed).toList();
    final totalSpent = completed.fold<double>(
        0, (s, t) => s + (t.finalFare ?? t.estimatedFare));
    final firstName = user?.fullName.split(' ').first ?? 'pasajero';

    return Scaffold(
      body: Column(
        children: [
          // Header oscuro estilo bugie-shell-hero
          BugiePageHeader(
            title: 'Hola, $firstName',
            subtitle: 'Tu próximo viaje seguro está a un toque.',
            logoAsset: 'assets/logo.png',
            showBack: false,
            actions: [
              const BugieThemeToggle(color: Colors.white),
              IconButton(
                icon: const Icon(Icons.person_outline, color: Colors.white),
                onPressed: () => context.push('/passenger/profile'),
              ),
              IconButton(
                icon: const Icon(Icons.logout, color: Colors.white),
                onPressed: () async {
                  await context.read<Session>().clear();
                  if (mounted) context.go('/');
                },
              ),
            ],
          ),
          // Contenido (con SafeArea solo en el bottom para que no tape gestos del celular)
          Expanded(
            child: SafeArea(
              top: false,
              child: RefreshIndicator(
                onRefresh: _load,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(
                      BugieSpacing.md, BugieSpacing.md, BugieSpacing.md, BugieSpacing.xxl),
                children: [
                  if (_active != null) ...[
                    Card(
                      color: BugieColors.primary.withOpacity(0.06),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(BugieRadius.md),
                        side: BorderSide(
                            color: BugieColors.primary.withOpacity(0.25)),
                      ),
                      child: ListTile(
                        leading: const Icon(Icons.directions_car,
                            color: BugieColors.primary, size: 32),
                        title: Text(TripStatus.labelForPassenger(_active!.status),
                            style: BugieText.h3),
                        subtitle: Text(
                            '${_active!.originAddress} → ${_active!.destAddress}',
                            maxLines: 2, overflow: TextOverflow.ellipsis),
                        trailing: ElevatedButton(
                          onPressed: () => context.push('/passenger/tracking'),
                          child: const Text('Ver'),
                        ),
                      ),
                    ),
                    const SizedBox(height: BugieSpacing.md),
                  ],

                  // Warning si el pasajero NO está verificado (DNI no aprobado por admin).
                  // Mientras esté así, NO se le permite solicitar viajes (el backend también
                  // lo rechaza, pero acá lo prevenimos antes para mejor UX).
                  if (!_loading && _verification != null && !_verification!.isVerified) ...[
                    Card(
                      color: BugieColors.warning.withOpacity(0.1),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(BugieRadius.md),
                        side: const BorderSide(color: BugieColors.warning),
                      ),
                      child: ListTile(
                        leading: const Icon(Icons.warning_amber,
                            color: BugieColors.warning, size: 28),
                        title: const Text('Cuenta sin verificar',
                            style: TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: const Text(
                          'Sube tu DNI (frontal y reverso) desde tu perfil y espera la '
                          'aprobación del administrador para poder solicitar viajes.',
                          style: TextStyle(fontSize: 12.5),
                        ),
                        trailing: TextButton(
                          onPressed: () => context.push('/passenger/verification'),
                          child: const Text('Verificar'),
                        ),
                      ),
                    ),
                    const SizedBox(height: BugieSpacing.md),
                  ],

                  // Botón Solicitar viaje: solo activo si ya está verificado.
                  // Si no, queda gris/deshabilitado.
                  BugieButtons.primary(
                    text: 'Solicitar viaje',
                    icon: Icons.add_location_alt,
                    onPressed: (_verification?.isVerified ?? false)
                        ? () => context.push('/passenger/request')
                        : null,
                  ),
                  const SizedBox(height: BugieSpacing.md),

                  // KPIs
                  Row(
                    children: [
                      _Kpi(label: 'Viajes',  value: _loading ? '…' : '${completed.length}'),
                      const SizedBox(width: BugieSpacing.sm),
                      _Kpi(label: 'Gastado', value: _loading ? '…' : 'S/ ${totalSpent.toStringAsFixed(2)}'),
                      const SizedBox(width: BugieSpacing.sm),
                      _Kpi(label: 'Activo',  value: _loading ? '…' : (_active != null ? 'Sí' : 'No')),
                    ],
                  ),
                  const SizedBox(height: BugieSpacing.md),

                  // Acciones rápidas
                  BugieCard(
                    title: 'Acciones rápidas',
                    padding: EdgeInsets.zero,
                    child: Column(
                      children: [
                        _ActionTile(icon: Icons.add_location_alt, title: 'Solicitar viaje',
                            subtitle: 'Pide un conductor verificado',
                            onTap: () => context.push('/passenger/request')),
                        _ActionTile(icon: Icons.location_on, title: 'Ver seguimiento',
                            subtitle: 'Tracking de tu viaje activo',
                            onTap: () => context.push('/passenger/tracking')),
                        _ActionTile(icon: Icons.history, title: 'Historial',
                            subtitle: 'Tus viajes anteriores',
                            onTap: () => context.push('/passenger/trips')),
                        _ActionTile(icon: Icons.credit_card, title: 'Mis pagos',
                            subtitle: 'Historial de transacciones',
                            onTap: () => context.push('/passenger/payments')),
                        _ActionTile(icon: Icons.stars_rounded, title: 'Mis puntos',
                            subtitle: 'Gana y canjea recompensas',
                            iconColor: Colors.amber.shade600,
                            onTap: () => context.push('/passenger/rewards')),
                        _ActionTile(icon: Icons.favorite, title: 'Mis favoritos',
                            subtitle: 'Direcciones y conductores guardados',
                            iconColor: Colors.red.shade400,
                            onTap: () => context.push('/passenger/favorites')),
                        _ActionTile(icon: Icons.shield, title: 'SOS / Emergencia',
                            subtitle: 'Activar alerta de seguridad',
                            iconColor: BugieColors.danger,
                            onTap: () => context.push('/passenger/sos'),
                            showDivider: false),
                      ],
                    ),
                  ),
                  const SizedBox(height: BugieSpacing.md),

                  if (_history.isNotEmpty)
                    BugieCard(
                      title: 'Últimos viajes',
                      padding: EdgeInsets.zero,
                      child: Column(
                        children: _history.take(5).map((t) {
                          final isComp = t.status == TripStatus.completed;
                          final date = DateFormat('dd MMM, HH:mm', 'es_PE').format(t.createdAt);
                          return ListTile(
                            leading: CircleAvatar(
                              backgroundColor: isComp
                                  ? BugieColors.success.withOpacity(0.15)
                                  : BugieColors.bg2,
                              child: Icon(
                                isComp ? Icons.check : Icons.close,
                                color: isComp ? BugieColors.success : BugieColors.textMuted,
                                size: 18,
                              ),
                            ),
                            title: Text(TripStatus.labelForPassenger(t.status),
                                style: const TextStyle(fontSize: 14)),
                            subtitle: Text(date, style: BugieText.small),
                            trailing: Text(
                              'S/ ${(t.finalFare ?? t.estimatedFare).toStringAsFixed(2)}',
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                color: isComp ? BugieColors.success : BugieColors.textMuted,
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                    ),
                ],
              ),
            ),
          ),
          ),
        ],
      ),
    );
  }
}

class _Kpi extends StatelessWidget {
  final String label;
  final String value;
  const _Kpi({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(BugieSpacing.sm + 4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: BugieText.small),
              const SizedBox(height: 4),
              Text(value, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            ],
          ),
        ),
      ),
    );
  }
}

class _ActionTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final Color? iconColor;
  final bool showDivider;
  const _ActionTile({
    required this.icon, required this.title, required this.subtitle,
    required this.onTap, this.iconColor, this.showDivider = true,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        ListTile(
          leading: CircleAvatar(
            backgroundColor: (iconColor ?? BugieColors.primary).withOpacity(0.1),
            child: Icon(icon, color: iconColor ?? BugieColors.primary),
          ),
          title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
          subtitle: Text(subtitle, style: BugieText.muted),
          trailing: const Icon(Icons.chevron_right, color: BugieColors.textMuted),
          onTap: onTap,
        ),
        if (showDivider) const Divider(height: 1, indent: 72),
      ],
    );
  }
}