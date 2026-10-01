using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Bugie.Drivers.Infrastructure.BackgroundServices;

/// <summary>
/// Opciones del heartbeat-timeout. Se mantienen para no romper el registro
/// en Program.cs si alguien lo descomenta, pero el servicio está DESACTIVADO.
/// </summary>
public class DriverHeartbeatTimeoutOptions
{
    public int CheckIntervalSeconds { get; set; } = 60;
    public int StaleAfterMinutes { get; set; } = 3;
}

/// <summary>
/// [DESACTIVADO POR DECISIÓN DE PRODUCTO]
///
/// Este servicio marcaba offline a los conductores que dejaban de reportar
/// GPS. Causaba que el conductor se desconectara solo durante pruebas y,
/// peor aún, ahora que el conductor NO manda GPS mientras espera viajes
/// (solo durante un viaje activo), el timeout lo mataba SIEMPRE a los 3 min.
///
/// Política actual: el conductor se desconecta SOLO cuando presiona
/// "Desconectarme". Nada lo desconecta automáticamente.
///
/// El servicio queda como clase vacía (no-op): aunque alguien lo registre
/// por error en Program.cs, NO hace absolutamente nada. Para reactivar la
/// lógica real, recuperar la versión del control de versiones.
/// </summary>
public class DriverHeartbeatTimeoutService : BackgroundService
{
    private readonly ILogger<DriverHeartbeatTimeoutService> _log;

    public DriverHeartbeatTimeoutService(
        IServiceScopeFactory scopeFactory,
        ILogger<DriverHeartbeatTimeoutService> log,
        IOptions<DriverHeartbeatTimeoutOptions> opts)
    {
        _log = log;
    }

    protected override Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // NO-OP: no hace nada. Nunca marca conductores offline.
        _log.LogInformation(
            "DriverHeartbeatTimeoutService: DESACTIVADO (no-op). " +
            "Los conductores solo se desconectan manualmente.");
        return Task.CompletedTask;
    }
}
