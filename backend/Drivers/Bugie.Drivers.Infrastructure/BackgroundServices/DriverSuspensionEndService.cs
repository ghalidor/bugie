using Bugie.Drivers.Application.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Bugie.Drivers.Infrastructure.BackgroundServices;

/// <summary>
/// Job que corre cada 30 minutos: reactiva a los conductores suspendidos cuya
/// fecha de fin ya pasó (SuspendedUntil = 23:59:59 hora de Perú del último día).
/// Vuelven a Approved si sus documentos siguen vigentes y aprobados; si no, a
/// ExpiredDocs / UnderReview / PendingDocs. Auditoría "auto_reactivated"
/// (actor Sistema), push "driver_reactivated" y correo.
/// </summary>
public class DriverSuspensionEndService : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromMinutes(30);

    private readonly IServiceProvider _services;
    private readonly ILogger<DriverSuspensionEndService> _log;

    public DriverSuspensionEndService(IServiceProvider services, ILogger<DriverSuspensionEndService> log)
    {
        _services = services;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _log.LogInformation("DriverSuspensionEndService iniciado. Revisa cada {Minutes} minutos.", Interval.TotalMinutes);

        while(!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _services.CreateScope();
                var account = scope.ServiceProvider.GetRequiredService<DriverAccountService>();
                var count = await account.EndSuspensionsAsync(stoppingToken);
                if(count > 0)
                    _log.LogInformation("Suspensiones terminadas automáticamente: {Count}", count);
            }
            catch(Exception ex) when(!stoppingToken.IsCancellationRequested)
            {
                _log.LogError(ex, "Error terminando suspensiones de conductores");
            }

            try { await Task.Delay(Interval, stoppingToken); }
            catch(TaskCanceledException) { break; }
        }
    }
}
