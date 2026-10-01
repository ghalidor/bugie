import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../../core/session/session.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/widgets/bugie_card.dart';
import '../../../core/widgets/bugie_theme_toggle.dart';
import '../../payments/data/payments_repository.dart';
import '../../payments/domain/payment_model.dart';
import '../../trips/data/trips_repository.dart';
import '../../trips/domain/trip_model.dart';
import '../data/driver_repository.dart';
import '../domain/driver_document_model.dart';
import '../domain/driver_model.dart';

class DriverDashboard extends StatefulWidget {
  const DriverDashboard({super.key});

  @override
  State<DriverDashboard> createState() => _DriverDashboardState();
}

class _DriverDashboardState extends State<DriverDashboard> {
  Driver? _driver;
  Trip? _activeTrip;
  DriverEarnings? _earnings;
  /// Documentos del conductor — para alerta de caducidad.
  List<DriverDocument> _documents = const [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final dRepo = context.read<DriverRepository>();
    final tRepo = context.read<TripsRepository>();
    final pRepo = context.read<PaymentsRepository>();
    try {
      final results = await Future.wait([
        dRepo.getMyProfile(),
        tRepo.getActive(),
        pRepo.getEarnings().catchError((_) =>
            DriverEarnings(totalEarnings: 0, totalTrips: 0, earningsThisMonth: 0)),
        dRepo.getMyDocuments().catchError((_) => <DriverDocument>[]),
      ]);
      if (!mounted) return;
      setState(() {
        _driver = results[0] as Driver?;
        _activeTrip = results[1] as Trip?;
        _earnings = results[2] as DriverEarnings;
        _documents = results[3] as List<DriverDocument>;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// Documentos con caducidad próxima (≤4 días) o ya caducados.
  /// Solo cuenta los documentos aprobados (los pending no preocupan al usuario).
  List<DriverDocument> get _docsNeedingAttention {
    return _documents.where((d) {
      if (d.status != 'approved') return false;
      return d.isExpired || d.isExpiringSoon;
    }).toList();
  }

  /// Documentos que el conductor subió y están esperando aprobación
  /// del admin. Útil para distinguir el estado "ya envié, en revisión"
  /// del estado "tengo docs por caducar".
  List<DriverDocument> get _docsInReview {
    return _documents.where((d) => d.status == 'pending').toList();
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<Session>().user;
    final approved = _driver?.status == DriverStatus.approved;
    final firstName = user?.fullName.split(' ').first ?? 'conductor';

    return Scaffold(
      body: Column(
        children: [
          BugiePageHeader(
            title: 'Hola, $firstName',
            subtitle: 'Gestiona tus viajes y ganancias.',
            logoAsset: 'assets/logo.png',
            showBack: false,
            actions: [
              const BugieThemeToggle(color: Colors.white),
              IconButton(
                icon: const Icon(Icons.person_outline, color: Colors.white),
                onPressed: () => context.push('/driver/profile'),
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
          Expanded(
            child: SafeArea(
              top: false,
              child: RefreshIndicator(
                onRefresh: _load,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(
                      BugieSpacing.md, BugieSpacing.md, BugieSpacing.md, BugieSpacing.xxl),
                  children: [
                  if (_activeTrip != null) ...[
                    Card(
                      color: BugieColors.primary.withOpacity(0.06),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(BugieRadius.md),
                        side: BorderSide(
                            color: BugieColors.primary.withOpacity(0.25)),
                      ),
                      child: ListTile(
                        leading: const Icon(Icons.route,
                            color: BugieColors.primary, size: 32),
                        title: Text(TripStatus.labelForDriver(_activeTrip!.status),
                            style: BugieText.h3),
                        subtitle: Text(
                            '${_activeTrip!.originAddress} → ${_activeTrip!.destAddress}',
                            maxLines: 2, overflow: TextOverflow.ellipsis),
                        trailing: ElevatedButton(
                          onPressed: () async {
                            await context.push('/driver/trip-in-progress');
                            if (mounted) _load();
                          },
                          child: const Text('Ver'),
                        ),
                      ),
                    ),
                    const SizedBox(height: BugieSpacing.sm + 4),
                  ],

                  if (!_loading && _driver != null && !approved) ...[
                    Card(
                      color: BugieColors.warning.withOpacity(0.1),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(BugieRadius.md),
                        side: BorderSide(color: Colors.orange.shade200),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(BugieSpacing.sm + 4),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Row(
                              children: [
                                Icon(Icons.warning_amber, color: Colors.orange),
                                SizedBox(width: BugieSpacing.sm),
                                Expanded(
                                  child: Text('Tu cuenta está pendiente de aprobación.',
                                      style: TextStyle(fontWeight: FontWeight.bold)),
                                ),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Text(
                                'Estado: ${DriverStatus.label(_driver!.status)}. Completa tus documentos para empezar a recibir viajes.',
                                style: const TextStyle(fontSize: 13)),
                            const SizedBox(height: BugieSpacing.sm),
                            ElevatedButton(
                              onPressed: () async {
                                await context.push('/driver/documents');
                                if (mounted) _load();
                              },
                              child: const Text('Ir a documentos'),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: BugieSpacing.sm + 4),
                  ],

                  // ── Alerta de caducidad de documentos ────────────────
                  // Aparece si hay AL MENOS UN documento aprobado caducado
                  // o próximo a caducar. La mostramos para approved Y para
                  // underReview, porque un conductor underReview que subió
                  // doc adelantado todavía puede ver el aviso de otros docs.
                  if (_docsNeedingAttention.isNotEmpty) ...[
                    _ExpirationAlertCard(
                      docs: _docsNeedingAttention,
                      onReturned: () { if (mounted) _load(); },
                    ),
                    const SizedBox(height: BugieSpacing.sm + 4),
                  ],

                  // ── Aviso "documentos en revisión" ───────────────────
                  // Cuando el conductor ya subió un doc y está esperando
                  // que admin lo apruebe, le mostramos un card informativo
                  // (azul, no rojo). Le da contexto de que la acción está
                  // pendiente del lado del admin, no del suyo.
                  if (_docsInReview.isNotEmpty) ...[
                    _DocsInReviewCard(
                      docs: _docsInReview,
                      onReturned: () { if (mounted) _load(); },
                    ),
                    const SizedBox(height: BugieSpacing.sm + 4),
                  ],

                  if (approved)
                    _driver!.isOnline
                        ? BugieButtons.danger(
                            text: 'Desconectarme',
                            icon: Icons.power_off,
                            // push devuelve un Future que se completa al volver.
                            // Recargamos el perfil para reflejar el nuevo estado
                            // (online/offline) sin tener que refrescar a mano.
                            onPressed: () async {
                              await context.push('/driver/go-online');
                              if (mounted) _load();
                            },
                          )
                        : BugieButtons.success(
                            text: 'Conectarme y recibir viajes',
                            icon: Icons.power,
                            onPressed: () async {
                              await context.push('/driver/go-online');
                              if (mounted) _load();
                            },
                          ),

                  const SizedBox(height: BugieSpacing.md),

                  Row(
                    children: [
                      _Kpi(label: 'Estado',
                          value: _loading ? '…' :
                              (_driver?.isOnline == true ? 'En línea' : 'Offline')),
                      const SizedBox(width: BugieSpacing.sm),
                      _Kpi(label: 'Mes',
                          value: _loading ? '…' :
                              'S/ ${_earnings?.earningsThisMonth.toStringAsFixed(2) ?? "0.00"}'),
                      const SizedBox(width: BugieSpacing.sm),
                      _Kpi(label: 'Viajes',
                          value: _loading ? '…' : '${_earnings?.totalTrips ?? 0}'),
                    ],
                  ),
                  const SizedBox(height: BugieSpacing.md),

                  BugieCard(
                    title: 'Acciones rápidas',
                    padding: EdgeInsets.zero,
                    child: Column(
                      children: [
                        _Tile(icon: Icons.notifications_active, title: 'Solicitudes entrantes',
                            subtitle: 'Viajes pendientes de aceptar',
                            onTap: () async {
                              await context.push('/driver/requests');
                              if (mounted) _load();
                            }),
                        _Tile(icon: Icons.directions_car, title: 'Viaje en curso',
                            subtitle: 'Continuar viaje activo',
                            onTap: () async {
                              await context.push('/driver/trip-in-progress');
                              if (mounted) _load();
                            }),
                        _Tile(icon: Icons.stars_rounded, title: 'Mis puntos',
                            subtitle: 'Gana y canjea recompensas',
                            onTap: () => context.push('/driver/rewards')),
                        _Tile(icon: Icons.account_balance_wallet, title: 'Mis ganancias',
                            subtitle: 'Ingresos y resumen',
                            onTap: () => context.push('/driver/earnings')),
                        _Tile(icon: Icons.history, title: 'Historial de viajes',
                            subtitle: 'Tus viajes anteriores',
                            onTap: () => context.push('/driver/trips')),
                        _Tile(icon: Icons.star_outline, title: 'Mis calificaciones',
                            subtitle: 'Lo que dicen tus pasajeros',
                            iconColor: const Color(0xFFFBBF24),
                            onTap: () => context.push('/driver/ratings')),
                        _Tile(icon: Icons.badge, title: 'Documentos',
                            subtitle: 'Estado de verificación',
                            onTap: () async {
                              await context.push('/driver/documents');
                              if (mounted) _load();
                            }),
                        _Tile(icon: Icons.directions_car_filled, title: 'Vehículos',
                            subtitle: 'Gestionar tus vehículos',
                            onTap: () => context.push('/driver/vehicles')),
                        _Tile(icon: Icons.shield, title: 'SOS / Emergencia',
                            subtitle: 'Activar alerta en ruta',
                            iconColor: BugieColors.danger,
                            onTap: () => context.push('/driver/sos'),
                            showDivider: false),
                      ],
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
              Text(value, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            ],
          ),
        ),
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final Color? iconColor;
  final bool showDivider;
  const _Tile({
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
// ─────────────────────────────────────────────────────────────────────────
// Card de alerta de caducidad de documentos.
// Muestra documentos aprobados que caducaron o caducan en ≤4 días.
// El color depende del peor estado:
//   - Rojo si HAY alguno caducado.
//   - Amarillo si solo hay próximos a caducar.
// ─────────────────────────────────────────────────────────────────────────

class _ExpirationAlertCard extends StatelessWidget {
  final List<DriverDocument> docs;
  // Callback que el dashboard pasa para recargar sus datos cuando el
  // conductor vuelva de la pantalla de documentos (puede haber subido
  // un reemplazo y el warning ya no aplica).
  final VoidCallback? onReturned;
  const _ExpirationAlertCard({required this.docs, this.onReturned});

  @override
  Widget build(BuildContext context) {
    final hasExpired = docs.any((d) => d.isExpired);
    final color = hasExpired ? BugieColors.danger : const Color(0xFFB45309);
    final bgColor = color.withOpacity(0.1);
    final borderColor = color.withOpacity(0.4);
    final icon = hasExpired ? Icons.error_outline : Icons.warning_amber;
    final title = hasExpired
        ? 'Tienes documentos caducados'
        : 'Documentos próximos a caducar';
    final subtitle = hasExpired
        ? 'Actualiza los documentos vencidos para seguir recibiendo viajes.'
        : 'Renuévalos antes de que caduquen para no perder tu cuenta activa.';

    return Card(
      color: bgColor,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(BugieRadius.md),
        side: BorderSide(color: borderColor),
      ),
      child: Padding(
        padding: const EdgeInsets.all(BugieSpacing.sm + 4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, color: color),
                const SizedBox(width: BugieSpacing.sm),
                Expanded(
                  child: Text(title,
                      style: TextStyle(
                          fontWeight: FontWeight.bold, color: color)),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(subtitle, style: const TextStyle(fontSize: 13)),
            const SizedBox(height: 8),

            // Listado de documentos con su estado
            ...docs.map((d) {
              final days = d.daysUntilExpiry ?? 0;
              final text = d.isExpired
                  ? '${d.docTypeLabel} · caducado'
                  : '${d.docTypeLabel} · vence en $days ${days == 1 ? 'día' : 'días'}';
              final docColor = d.isExpired
                  ? BugieColors.danger
                  : const Color(0xFFB45309);
              return Padding(
                padding: const EdgeInsets.only(bottom: 3),
                child: Row(
                  children: [
                    Icon(Icons.circle, size: 6, color: docColor),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(text,
                          style: TextStyle(fontSize: 12, color: docColor)),
                    ),
                  ],
                ),
              );
            }),

            const SizedBox(height: BugieSpacing.sm),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: color),
              onPressed: () async {
                await context.push('/driver/documents');
                onReturned?.call();
              },
              child: const Text('Ir a documentos'),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Card informativo: documentos enviados a revisión.
// Se muestra cuando el conductor ya subió uno o más documentos y está
// esperando aprobación del admin. Color AZUL (no rojo/amarillo) porque
// no es un problema — es solo información de estado.
// ─────────────────────────────────────────────────────────────────────────
class _DocsInReviewCard extends StatelessWidget {
  final List<DriverDocument> docs;
  final VoidCallback? onReturned;
  const _DocsInReviewCard({required this.docs, this.onReturned});

  @override
  Widget build(BuildContext context) {
    const color = BugieColors.primary;  // azul-violeta corporativo
    final bgColor = color.withOpacity(0.10);
    final borderColor = color.withOpacity(0.35);

    // Mensajes en plural/singular según cantidad.
    final count = docs.length;
    final title = count == 1
        ? 'Documento enviado a revisión'
        : 'Documentos enviados a revisión ($count)';
    final subtitle = count == 1
        ? 'Estamos revisando tu documento. Te avisaremos cuando lo aprobemos.'
        : 'Estamos revisando tus documentos. Te avisaremos cuando los aprobemos.';

    return Card(
      color: bgColor,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(BugieRadius.md),
        side: BorderSide(color: borderColor),
      ),
      child: Padding(
        padding: const EdgeInsets.all(BugieSpacing.sm + 4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.hourglass_top, color: color),
                const SizedBox(width: BugieSpacing.sm),
                Expanded(
                  child: Text(title,
                      style: const TextStyle(
                          fontWeight: FontWeight.bold, color: color)),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(subtitle, style: const TextStyle(fontSize: 13)),
            const SizedBox(height: 8),

            // Listado de documentos en revisión
            ...docs.map((d) => Padding(
                  padding: const EdgeInsets.only(bottom: 3),
                  child: Row(
                    children: [
                      const Icon(Icons.circle, size: 6, color: color),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          '${d.docTypeLabel} · en revisión',
                          style: const TextStyle(fontSize: 12, color: color),
                        ),
                      ),
                    ],
                  ),
                )),
          ],
        ),
      ),
    );
  }
}
