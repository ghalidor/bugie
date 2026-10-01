using Microsoft.Extensions.Options;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Api.BackgroundServices;

public class RedemptionExpirationOptions
{
    /// <summary>Cada cuantos minutos revisar. Default 60.</summary>
    public int CheckIntervalMinutes { get; set; } = 60;
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
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "Error venciendo cupones.");
            }

            try { await Task.Delay(delay, ct); }
            catch (TaskCanceledException) { break; }
        }
    }
}
