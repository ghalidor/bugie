using Bugie.Trips.Application.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Bugie.Trips.Infrastructure.BackgroundServices;

/// <summary>
/// Revisa cada 30 s los viajes activos y abre / resuelve las alertas de
/// monitoreo (sin señal, detenido, viaje demorado). La lógica está en
/// MonitorAlertsService; aquí solo el ciclo, el scope y el log.
/// </summary>
public class MonitorAlertsBackgroundService : BackgroundService
{
    public const int IntervalSeconds = 30;

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<MonitorAlertsBackgroundService> _log;

    public MonitorAlertsBackgroundService(IServiceScopeFactory scopeFactory,
                                          ILogger<MonitorAlertsBackgroundService> log)
    {
        _scopeFactory = scopeFactory;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Desde aquí corre la gracia de "sin señal" (el GPS en memoria arranca vacío).
        var startedAt = DateTime.UtcNow;
        _log.LogInformation("MonitorAlertsBackgroundService iniciado. Intervalo: {Interval}s", IntervalSeconds);

        try { await Task.Delay(TimeSpan.FromSeconds(20), stoppingToken); }
        catch(OperationCanceledException) { return; }

        while(!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var service = scope.ServiceProvider.GetRequiredService<MonitorAlertsService>();
                await service.RunPassAsync(startedAt,
                    (ex, tripId) => _log.LogWarning(ex, "Alertas de monitoreo: error en el viaje {TripId} (ignorado).", tripId),
                    stoppingToken);
            }
            catch(OperationCanceledException) when(stoppingToken.IsCancellationRequested) { return; }
            catch(Exception ex)
            {
                _log.LogError(ex, "MonitorAlertsBackgroundService: error en pasada (ignorado).");
            }

            try { await Task.Delay(TimeSpan.FromSeconds(IntervalSeconds), stoppingToken); }
            catch(OperationCanceledException) { return; }
        }
    }
}
