using Bugie.Trips.Domain.Interfaces;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Bugie.Trips.Infrastructure.BackgroundServices;

/// <summary>
/// Configuración del expirador de propuestas accepted_by_passenger.
/// </summary>
public class ProposalExpirationOptions
{
    /// <summary>Cada cuántos segundos correr la pasada (default 120s).</summary>
    public int CheckIntervalSeconds { get; set; } = 120;

    /// <summary>
    /// Después de cuántos minutos sin confirmación del conductor, la
    /// propuesta accepted_by_passenger se expira automáticamente.
    /// Default 30 min: tiempo razonable para que un conductor mire su pantalla.
    /// </summary>
    public int ExpireAfterMinutes { get; set; } = 30;
}

/// <summary>
/// Background service que expira propuestas 'accepted_by_passenger' que el
/// conductor nunca confirmó.
///
/// Caso típico: el pasajero acepta la propuesta del conductor, pero el conductor
/// dejó la app abierta en otra pantalla o se fue. La propuesta queda esperando
/// confirmación, y el pasajero queda bloqueado para aceptar otras (la validación
/// del frontend impide aceptar otra mientras hay una en estado intermedio).
///
/// Sin este servicio, el pasajero solo puede cancelar el viaje y empezar de cero.
///
/// Con este servicio:
/// - Cada CheckIntervalSeconds, marca como 'rejected' las propuestas en
///   'accepted_by_passenger' con CreatedAt &lt; (now - ExpireAfterMinutes).
/// - El pasajero (en su próximo poll) ve la propuesta como rechazada y puede
///   aceptar otra propuesta o esperar nuevas.
///
/// Limitación honesta: usamos CreatedAt en lugar de AcceptedByPassengerAt
/// (que no existe). Eso significa que una propuesta CREADA hace 30 min, que
/// fue ACEPTADA por el pasajero hace 2 min, igual será expirada en la próxima
/// pasada. En la práctica es OK porque las negociaciones no duran 30 min.
/// </summary>
public class ProposalExpirationService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<ProposalExpirationService> _log;
    private readonly ProposalExpirationOptions _opts;

    public ProposalExpirationService(
        IServiceScopeFactory scopeFactory,
        ILogger<ProposalExpirationService> log,
        IOptions<ProposalExpirationOptions> opts)
    {
        _scopeFactory = scopeFactory;
        _log = log;
        _opts = opts.Value;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _log.LogInformation(
            "ProposalExpirationService iniciado. Intervalo: {Interval}s, expire: {Expire}m",
            _opts.CheckIntervalSeconds, _opts.ExpireAfterMinutes);

        await Task.Delay(TimeSpan.FromSeconds(20), stoppingToken);

        while(!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunPassAsync(stoppingToken);
            }
            catch(Exception ex)
            {
                _log.LogError(ex, "ProposalExpirationService: error en pasada (ignorado).");
            }

            try
            {
                await Task.Delay(
                    TimeSpan.FromSeconds(_opts.CheckIntervalSeconds), stoppingToken);
            }
            catch(OperationCanceledException) { /* shutdown */ }
        }
    }

    private async Task RunPassAsync(CancellationToken ct)
    {
        var cutoff = DateTime.UtcNow.AddMinutes(-_opts.ExpireAfterMinutes);

        using var scope = _scopeFactory.CreateScope();
        var proposals = scope.ServiceProvider
            .GetRequiredService<ITripProposalRepository>();

        var count = await proposals.ExpireStaleAcceptedByPassengerAsync(cutoff, ct);

        if(count > 0)
        {
            _log.LogInformation(
                "ProposalExpiration: {Count} propuesta(s) expiradas (driver_no_confirm).",
                count);
        }
    }
}
