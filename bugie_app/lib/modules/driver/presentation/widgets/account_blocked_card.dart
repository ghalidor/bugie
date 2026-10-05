import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../../../core/api/api_exception.dart';
import '../../../../core/services/fcm_service.dart';
import '../../../../core/theme/bugie_theme.dart';
import '../../data/driver_repository.dart';
import '../../domain/driver_model.dart';

/// Tarjeta para el conductor con la cuenta SUSPENDIDA (4) o NO ACEPTADA (5).
/// Reemplaza al botón "Conectarme": explica el motivo, la fecha fin de la
/// suspensión y permite pedir una revisión al equipo de Bugie.
///
/// [onChanged] se llama después de enviar la solicitud de revisión para
/// que la pantalla vuelva a pedir el estado del conductor.
class DriverAccountBlockedCard extends StatelessWidget {
  final Driver driver;
  final VoidCallback onChanged;

  const DriverAccountBlockedCard({
    super.key,
    required this.driver,
    required this.onChanged,
  });

  static final _day = DateFormat('dd/MM/yyyy');
  static final _dayTime = DateFormat('dd/MM/yyyy HH:mm');

  Future<void> _requestReview(BuildContext context) async {
    final sent = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: context.bugie.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => const _ReviewRequestSheet(),
    );
    if (sent != true || !context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Row(
          children: [
            Icon(Icons.check_circle, color: Colors.white, size: 20),
            SizedBox(width: 8),
            Expanded(
              child: Text(
                  'Solicitud enviada. El equipo de Bugie revisará tu caso.'),
            ),
          ],
        ),
        backgroundColor: BugieColors.success,
        duration: Duration(seconds: 4),
      ),
    );
    onChanged();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final suspended = driver.isSuspended;
    final color = suspended ? BugieColors.warning : BugieColors.danger;
    final review = driver.openReviewRequest;
    final reason = driver.statusReason?.trim();

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // ── Título ──
          Row(
            children: [
              Icon(suspended ? Icons.block_rounded : Icons.gpp_bad_outlined,
                  color: color, size: 28),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  suspended
                      ? 'Tu cuenta está suspendida'
                      : 'Tu registro como conductor no fue aceptado',
                  style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.bold,
                      color: c.text),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'No puedes conectarte ni recibir viajes.',
            style: TextStyle(fontSize: 13, color: c.textMuted),
          ),

          // ── Hasta cuándo (solo suspensión) ──
          if (suspended) ...[
            const SizedBox(height: 12),
            _InfoRow(
              icon: Icons.event_outlined,
              label: 'Suspensión',
              value: driver.suspendedUntil != null
                  ? 'Hasta el ${_day.format(driver.suspendedUntil!)}'
                  : 'Indefinidamente',
            ),
          ],

          // ── Motivo ──
          if (reason != null && reason.isNotEmpty) ...[
            const SizedBox(height: 10),
            _InfoRow(
              icon: Icons.info_outline,
              label: 'Motivo',
              value: reason,
            ),
          ],

          const SizedBox(height: 14),

          // ── Solicitud de revisión ──
          if (review != null)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: c.surface,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: c.border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.hourglass_top,
                          size: 18, color: BugieColors.primary),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          review.createdAt != null
                              ? 'Solicitud de revisión enviada el '
                                  '${_dayTime.format(review.createdAt!)} — '
                                  'esperando respuesta'
                              : 'Solicitud de revisión enviada — '
                                  'esperando respuesta',
                          style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: c.text),
                        ),
                      ),
                    ],
                  ),
                  if (review.message.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(
                      '"${review.message}"',
                      style: TextStyle(
                          fontSize: 13,
                          fontStyle: FontStyle.italic,
                          color: c.textMuted),
                    ),
                  ],
                ],
              ),
            )
          else
            ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: BugieColors.primary,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
              ),
              icon: const Icon(Icons.rate_review_outlined, color: Colors.white),
              label: const Text(
                'Solicitar revisión',
                style: TextStyle(
                    fontSize: 15,
                    color: Colors.white,
                    fontWeight: FontWeight.bold),
              ),
              onPressed: () => _requestReview(context),
            ),

          const SizedBox(height: 14),

          // ── Documentos ──
          Row(
            children: [
              Icon(Icons.description_outlined, size: 18, color: c.textMuted),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Puedes seguir actualizando tus documentos.',
                  style: TextStyle(fontSize: 12.5, color: c.textMuted),
                ),
              ),
              TextButton(
                onPressed: () => context.push('/driver/documents'),
                child: const Text('Documentos'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _InfoRow({required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: c.textMuted),
        const SizedBox(width: 8),
        Expanded(
          child: Text.rich(
            TextSpan(
              children: [
                TextSpan(
                  text: '$label: ',
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                TextSpan(text: value),
              ],
            ),
            style: TextStyle(fontSize: 13.5, color: c.text),
          ),
        ),
      ],
    );
  }
}

/// Hoja para escribir y enviar la solicitud de revisión.
/// Devuelve true (pop) si se envió correctamente.
class _ReviewRequestSheet extends StatefulWidget {
  const _ReviewRequestSheet();

  @override
  State<_ReviewRequestSheet> createState() => _ReviewRequestSheetState();
}

class _ReviewRequestSheetState extends State<_ReviewRequestSheet> {
  static const _min = 10;
  static const _max = 1000;

  final _ctrl = TextEditingController();
  bool _busy = false;
  String? _fieldError;
  String? _apiError;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  String? _validate(String text) {
    final t = text.trim();
    if (t.length < _min) {
      return 'Escribe al menos $_min caracteres.';
    }
    if (t.length > _max) {
      return 'Máximo $_max caracteres.';
    }
    return null;
  }

  Future<void> _send() async {
    final message = _ctrl.text.trim();
    final err = _validate(message);
    setState(() {
      _fieldError = err;
      _apiError = null;
    });
    if (err != null) return;

    // Regla: todo lo que se envía pasa por una confirmación.
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Enviar solicitud de revisión'),
        content: const Text(
          'El equipo de Bugie revisará tu caso y te responderá. '
          'Solo puedes tener una solicitud abierta a la vez. ¿Deseas enviarla?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancelar'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Enviar'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;

    setState(() => _busy = true);
    try {
      await context.read<DriverRepository>().requestReview(message);
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      // 400/409: mostramos el mensaje del backend tal cual.
      if (mounted) setState(() { _apiError = e.message; _busy = false; });
    } catch (_) {
      if (mounted) {
        setState(() {
          _apiError = 'No se pudo enviar la solicitud. Intenta de nuevo.';
          _busy = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Padding(
      padding: EdgeInsets.fromLTRB(
          20, 16, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: c.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'Solicitar revisión',
              style: TextStyle(
                  fontSize: 18, fontWeight: FontWeight.bold, color: c.text),
            ),
            const SizedBox(height: 6),
            Text(
              'Cuéntanos por qué crees que debemos revisar tu caso. '
              'Si actualizaste algún documento, menciónalo.',
              style: TextStyle(fontSize: 13, color: c.textMuted),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: _ctrl,
              enabled: !_busy,
              minLines: 4,
              maxLines: 8,
              maxLength: _max,
              textCapitalization: TextCapitalization.sentences,
              decoration: InputDecoration(
                hintText: 'Escribe tu mensaje (mínimo $_min caracteres)',
                errorText: _fieldError,
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10)),
              ),
              onChanged: (_) {
                if (_fieldError != null) setState(() => _fieldError = null);
              },
            ),
            if (_apiError != null) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.red.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.red.withValues(alpha: 0.3)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.error_outline,
                        color: Colors.red, size: 20),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(_apiError!,
                          style: const TextStyle(color: BugieColors.danger)),
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 14),
            ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: BugieColors.primary,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
              ),
              icon: _busy
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.send_rounded, color: Colors.white),
              label: Text(
                _busy ? 'Enviando...' : 'Enviar solicitud',
                style: const TextStyle(
                    fontSize: 15,
                    color: Colors.white,
                    fontWeight: FontWeight.bold),
              ),
              onPressed: _busy ? null : _send,
            ),
            const SizedBox(height: 4),
            TextButton(
              onPressed: _busy ? null : () => Navigator.of(context).pop(false),
              child: const Text('Cancelar'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Envoltorio para el inicio del conductor: si la cuenta está suspendida o
/// no aceptada muestra [DriverAccountBlockedCard] en lugar de [child].
/// Se refresca solo con los push de cuenta (FcmService.driverAccount).
class DriverAccountGate extends StatefulWidget {
  final Widget child;
  const DriverAccountGate({super.key, required this.child});

  @override
  State<DriverAccountGate> createState() => _DriverAccountGateState();
}

class _DriverAccountGateState extends State<DriverAccountGate> {
  Driver? _driver;

  @override
  void initState() {
    super.initState();
    _load();
    FcmService.driverAccount.addListener(_load);
  }

  @override
  void dispose() {
    FcmService.driverAccount.removeListener(_load);
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final d = await context.read<DriverRepository>().getMyProfile();
      if (mounted) setState(() => _driver = d);
    } catch (_) {
      // Sin red: se mantiene lo último que teníamos.
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = _driver;
    if (d == null || !d.isBlocked) return widget.child;
    return RefreshIndicator(
      onRefresh: _load,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        child: DriverAccountBlockedCard(driver: d, onChanged: _load),
      ),
    );
  }
}
