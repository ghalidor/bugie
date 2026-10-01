using Microsoft.Extensions.Options;
using MediatR;
using Bugie.Rewards.Application.Commands;

namespace Bugie.Rewards.Api.BackgroundServices;

public class RaffleMaintenanceOptions
{
    /// <summary>Hora UTC a la que corre. Default 8 UTC = 3am en Perú.</summary>
    public int RunAtHourUtc { get; set; } = 8;

    /// <summary>Si es true, corre una vez al arrancar. Útil en desarrollo.</summary>
    public bool RunOnStartup { get; set; }
}

/// <summary>
/// Mantenimiento diario de sorteos: reparte los tickets que corresponden por
/// nivel y ejecuta los sorteos cuya fecha ya llegó.
///
/// Corre de madrugada, después del vencimiento de puntos, para que los niveles
/// ya estén actualizados cuando se reparten los tickets.
///
/// Despierta cada 15 minutos en vez de dormir hasta la hora exacta: si el
/// servidor se reinicia después de esa hora, no se salta el día.
/// </summary>
public class RaffleMaintenanceService : BackgroundService
{
    private static readonly TimeSpan Tick = TimeSpan.FromMinutes(15);

    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<RaffleMaintenanceService> _log;
    private readonly RaffleMaintenanceOptions _opt;

    private DateOnly? _lastRunDate;

    public RaffleMaintenanceService(
        IServiceScopeFactory scopes,
        ILogger<RaffleMaintenanceService> log,
        IOptions<RaffleMaintenanceOptions> opt)
    {
        _scopes = scopes;
        _log    = log;
        _opt    = opt.Value;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        var hour = Math.Clamp(_opt.RunAtHourUtc, 0, 23);
        _log.LogInformation(
            "RaffleMaintenance iniciado. Corre a diario a las {Hour}:00 UTC.", hour);

        if (_opt.RunOnStartup)
        {
            try { await Task.Delay(TimeSpan.FromSeconds(45), ct); }
            catch (TaskCanceledException) { return; }
            await RunOnceAsync(ct);
            _lastRunDate = DateOnly.FromDateTime(DateTime.UtcNow);
        }

        while (!ct.IsCancellationRequested)
        {
            var now   = DateTime.UtcNow;
            var today = DateOnly.FromDateTime(now);

            if (_lastRunDate != today && now.Hour >= hour)
            {
                await RunOnceAsync(ct);
                _lastRunDate = today;
            }

            try { await Task.Delay(Tick, ct); }
            catch (TaskCanceledException) { break; }
        }
    }

    private async Task RunOnceAsync(CancellationToken ct)
    {
        try
        {
            using var scope = _scopes.CreateScope();
            var mediator = scope.ServiceProvider.GetRequiredService<IMediator>();

            var result = await mediator.Send(new RunRaffleMaintenanceCommand(true), ct);

            _log.LogInformation(
                "Sorteos: {Tickets} tickets entregados, {Drawn} sorteos ejecutados.",
                result.TicketsGranted, result.RafflesDrawn);

            foreach (var m in result.Messages) _log.LogInformation("  {Mensaje}", m);
        }
        catch (Exception ex)
        {
            // Un error de una noche no puede matar el servicio.
            _log.LogError(ex, "Error en el mantenimiento de sorteos.");
        }
    }
}
