using Bugie.Drivers.Application.Services;
using Bugie.Drivers.Domain.Interfaces;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Bugie.Drivers.Infrastructure.GpsArchive;

/// <summary>
/// Consolida el recorrido de un viaje en segundo plano, GpsArchive:ConsolidateDelaySeconds
/// despues de que Trips avisa que termino (los ultimos puntos GPS pueden estar
/// todavia en la cola de ingesta). Singleton. Si falla, lo recoge el job nocturno.
/// </summary>
public class TripPathConsolidationScheduler : ITripPathConsolidationScheduler
{
    private readonly IServiceScopeFactory _scopes;
    private readonly GpsArchiveOptions _opt;
    private readonly ILogger<TripPathConsolidationScheduler> _log;

    public TripPathConsolidationScheduler(
        IServiceScopeFactory scopes,
        IOptions<GpsArchiveOptions> opt,
        ILogger<TripPathConsolidationScheduler> log)
    {
        _scopes = scopes;
        _opt = opt.Value;
        _log = log;
    }

    public void Schedule(Guid tripId)
    {
        var delay = TimeSpan.FromSeconds(Math.Max(_opt.ConsolidateDelaySeconds, 0));
        _ = Task.Run(async () =>
        {
            try
            {
                if (delay > TimeSpan.Zero) await Task.Delay(delay);
                using var scope = _scopes.CreateScope();
                var paths = scope.ServiceProvider.GetRequiredService<ITripPathRepository>();
                var points = await paths.ConsolidateAsync(tripId);
                _log.LogInformation("Recorrido del viaje {TripId} consolidado: {Points} puntos", tripId, points);
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "No se pudo consolidar el recorrido del viaje {TripId} (lo hara el job nocturno)", tripId);
            }
        });
    }
}
