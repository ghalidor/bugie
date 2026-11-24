using MediatR;
using Microsoft.Extensions.Options;
using Bugie.Rewards.Application.Commands;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Api.BackgroundServices;

public class RedemptionExpirationOptions
{
    /// <summary>Cada cuantos minutos revisar. Default 60.</summary>
    public int CheckIntervalMinutes { get; set; } = 60;

    /// <summary>
    /// Minutos de espera antes de que la red de seguridad toque una reserva
    /// (da tiempo a que llegue el aviso normal de Trips). Default 10.
    /// </summary>
    public int ReservationGraceMinutes { get; set; } = 10;
}

/// <summary>
/// Marca como 'expired' los cupones que pasaron su fecha sin usarse.
///
/// No devuelve puntos: el usuario ya los gasto al canjear, igual que un cupon
/// de papel que se vence. Si quieres devolverlos, se hace desde el admin con
/// PUT /api/rewards/admin/redemptions/{code}/cancel.
///
/// OJO: esto vence CUPONES, no puntos. La caducidad de los puntos en si es un
/// paso aparte que todavia no esta implementado.
///
/// Los cupones 'reserved' (aplicados a un viaje activo) no vencen. Ademas hace
/// de red de seguridad de las reservas, por si un aviso de Trips se perdio:
///   - viaje cancelado, sin el cupon o inexistente: libera la reserva;
///   - viaje completado y cupon sin consumir: lo consume (idempotente).
/// </summary>
public class RedemptionExpirationService : BackgroundService
{
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<RedemptionExpirationService> _log;
    private readonly RedemptionExpirationOptions _opt;

    public RedemptionExpirationService(
        IServiceScopeFactory scopes,
        ILogger<RedemptionExpirationService> log,
        IOptions<RedemptionExpirationOptions> opt)
    {
        _scopes = scopes;
        _log    = log;
        _opt    = opt.Value;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        var delay = TimeSpan.FromMinutes(Math.Max(1, _opt.CheckIntervalMinutes));
        _log.LogInformation(
            "RedemptionExpiration iniciado. Revisa cada {Minutes} minutos.", delay.TotalMinutes);

        while (!ct.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopes.CreateScope();
                var repo = scope.ServiceProvider.GetRequiredService<IRedemptionRepository>();
                var count = await repo.ExpireOverdueAsync(ct);
                if (count > 0)
                    _log.LogInformation("{Count} cupones marcados como vencidos.", count);

                await ReconcileReservationsAsync(scope.ServiceProvider, repo, ct);
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "Error venciendo cupones.");
            }

            try { await Task.Delay(delay, ct); }
            catch (TaskCanceledException) { break; }
        }
    }

    private async Task ReconcileReservationsAsync(
        IServiceProvider sp, IRedemptionRepository repo, CancellationToken ct)
    {
        var grace = Math.Max(1, _opt.ReservationGraceMinutes);

        var released = await repo.ReleaseOrphanReservationsAsync(grace, ct);
        if (released > 0)
            _log.LogWarning("{Count} reservas de cupon liberadas: su viaje ya no estaba activo.", released);

        var mediator = sp.GetRequiredService<IMediator>();
        foreach (var p in await repo.GetUnconsumedCompletedAsync(grace, ct))
        {
            try
            {
                await mediator.Send(new UseTripCouponCommand(p.Code, p.TripId, p.AppliedDiscount), ct);
                _log.LogWarning("Cupon {Code} del viaje completado {TripId} consumido por la red de seguridad.",
                    p.Code, p.TripId);
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "No se pudo consumir el cupon {Code} del viaje {TripId}.", p.Code, p.TripId);
            }
        }
    }
}
