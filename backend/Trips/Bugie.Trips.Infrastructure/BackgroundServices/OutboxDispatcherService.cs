using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Bugie.Trips.Domain.External;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Infrastructure.BackgroundServices;

public class OutboxDispatcherOptions
{
    /// <summary>Cada cuantos segundos revisar la bandeja. Default 5s.</summary>
    public int CheckIntervalSeconds { get; set; } = 5;

    /// <summary>Cuantos eventos procesar por pasada. Default 50.</summary>
    public int BatchSize { get; set; } = 50;

    /// <summary>Intentos antes de marcar el evento como 'failed'. Default 10.</summary>
    public int MaxAttempts { get; set; } = 10;
}

/// <summary>
/// Vacia trips.OutboxEvents hacia los modulos destino.
///
/// Por que existe: cuando un viaje se completa, Rewards tiene que acreditar
/// puntos. Si Trips llamara a Rewards directo y Rewards estuviera caido, los
/// puntos se perderian en silencio. Con el outbox el evento queda guardado en
/// la misma base y se reintenta hasta que entra.
///
/// Rewards es idempotente por TripId, asi que reintentar no duplica puntos.
/// </summary>
public class OutboxDispatcherService : BackgroundService
{
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<OutboxDispatcherService> _log;
    private readonly OutboxDispatcherOptions _opt;

    public OutboxDispatcherService(
        IServiceScopeFactory scopes,
        ILogger<OutboxDispatcherService> log,
        IOptions<OutboxDispatcherOptions> opt)
    {
        _scopes = scopes;
        _log    = log;
        _opt    = opt.Value;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        var delay = TimeSpan.FromSeconds(Math.Max(1, _opt.CheckIntervalSeconds));
        _log.LogInformation(
            "OutboxDispatcher iniciado. Intervalo {Seconds}s, lote {Batch}.",
            delay.TotalSeconds, _opt.BatchSize);

        while (!ct.IsCancellationRequested)
        {
            try
            {
                await DispatchBatchAsync(ct);
            }
            catch (Exception ex)
            {
                // Nunca dejamos morir el servicio por un error de una pasada.
                _log.LogError(ex, "Error en la pasada del OutboxDispatcher.");
            }

            try { await Task.Delay(delay, ct); }
            catch (TaskCanceledException) { break; }
        }
    }

    private async Task DispatchBatchAsync(CancellationToken ct)
    {
        using var scope = _scopes.CreateScope();
        var outbox  = scope.ServiceProvider.GetRequiredService<IOutboxRepository>();
        var rewards = scope.ServiceProvider.GetRequiredService<IRewardsClient>();

        var pending = await outbox.GetPendingAsync(_opt.BatchSize, ct);
        if (pending.Count == 0) return;

        foreach (var evt in pending)
        {
            if (ct.IsCancellationRequested) break;

            var ok = await rewards.SendAsync(evt.EventType, evt.PayloadJson, ct);

            if (ok)
            {
                await outbox.MarkSentAsync(evt.Id, ct);
            }
            else
            {
                await outbox.MarkAttemptAsync(
                    evt.Id, "El destino no acepto el evento.", _opt.MaxAttempts, ct);
                _log.LogWarning(
                    "Evento {Id} ({Type}) no entregado. Intento {Attempt}.",
                    evt.Id, evt.EventType, evt.Attempts + 1);
            }
        }
    }
}
