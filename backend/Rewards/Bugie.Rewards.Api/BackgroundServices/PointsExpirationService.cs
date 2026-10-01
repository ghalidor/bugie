using Microsoft.Extensions.Options;
using MediatR;
using Bugie.Rewards.Application.Commands;

namespace Bugie.Rewards.Api.BackgroundServices;

public class PointsExpirationOptions
{
    /// <summary>
    /// Hora UTC a la que corre el proceso nocturno.
    /// Default 7 UTC = 02:00 en Peru, que es lo que pide el PDF (pag. 25).
    /// </summary>
    public int RunAtHourUtc { get; set; } = 7;

    /// <summary>Cuantos perfiles procesar por pasada. Default 500.</summary>
    public int BatchSize { get; set; } = 500;

    /// <summary>
    /// Si es true, corre una vez al arrancar ademas del horario.
    /// Util en desarrollo para no esperar hasta la madrugada.
    /// </summary>
    public bool RunOnStartup { get; set; }
}

/// <summary>
/// Proceso nocturno de vencimiento de puntos.
///
/// Corre una vez al dia a la hora configurada. Avisa a quien esta por perder
/// puntos segun los hitos configurados (30, 7, 1 dias) y vence a quien ya se le
/// paso la fecha.
///
/// Por que despierta cada 15 minutos en vez de dormir hasta la hora exacta:
/// si el servidor se reinicia despues de la hora programada, dormir hasta el
/// dia siguiente saltearia un dia entero de avisos. Asi, al arrancar revisa si
/// ya corrio hoy y se pone al dia.
/// </summary>
public class PointsExpirationService : BackgroundService
{
    private static readonly TimeSpan Tick = TimeSpan.FromMinutes(15);

    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<PointsExpirationService> _log;
    private readonly PointsExpirationOptions _opt;

    private DateOnly? _lastRunDate;

    public PointsExpirationService(
        IServiceScopeFactory scopes,
        ILogger<PointsExpirationService> log,
        IOptions<PointsExpirationOptions> opt)
    {
        _scopes = scopes;
        _log    = log;
        _opt    = opt.Value;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        var hour = Math.Clamp(_opt.RunAtHourUtc, 0, 23);
        _log.LogInformation(
            "PointsExpiration iniciado. Corre a diario a las {Hour}:00 UTC, lote {Batch}.",
            hour, _opt.BatchSize);

        if (_opt.RunOnStartup)
        {
            try { await Task.Delay(TimeSpan.FromSeconds(30), ct); }
            catch (TaskCanceledException) { return; }
            await RunOnceAsync(ct);
            _lastRunDate = DateOnly.FromDateTime(DateTime.UtcNow);
        }

        while (!ct.IsCancellationRequested)
        {
            var now   = DateTime.UtcNow;
            var today = DateOnly.FromDateTime(now);

            // Corre si ya paso la hora de hoy y todavia no corrio hoy.
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

            var result = await mediator.Send(
                new RunPointsExpirationCommand(_opt.BatchSize), ct);

            _log.LogInformation(
                "Vencimiento: {Warned} avisados, {Expired} perfiles vencidos, {Lost} puntos perdidos.",
                result.Warned, result.Expired, result.PointsLost);
        }
        catch (Exception ex)
        {
            // Un error de una noche no puede matar el servicio.
            _log.LogError(ex, "Error en la pasada de vencimiento de puntos.");
        }
    }
}
