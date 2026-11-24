using Microsoft.Extensions.Options;
using MediatR;
using Bugie.Rewards.Application.Commands;

namespace Bugie.Rewards.Api.BackgroundServices;

public class NoCancellationsOptions
{
    /// <summary>Hora UTC. Default 9 UTC = 4am en Perú.</summary>
    public int  RunAtHourUtc { get; set; } = 9;
    public bool RunOnStartup { get; set; }
}

/// <summary>
/// Paga el bono de trabajar sin cancelar, una vez al día.
///
/// Corre a las 4 de la mañana, después del vencimiento de puntos y del
/// mantenimiento de sorteos, y evalúa el día ANTERIOR: un día que todavía
/// está corriendo puede sumar una cancelación más tarde.
///
/// Despierta cada 15 minutos en vez de dormir hasta la hora exacta: si el
/// servidor se reinicia pasada esa hora, no se salta el día.
/// </summary>
public class NoCancellationsService : BackgroundService
{
    private static readonly TimeSpan Tick = TimeSpan.FromMinutes(15);

    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<NoCancellationsService> _log;
    private readonly NoCancellationsOptions _opt;

    private DateOnly? _lastRunDate;

    public NoCancellationsService(
        IServiceScopeFactory scopes,
        ILogger<NoCancellationsService> log,
        IOptions<NoCancellationsOptions> opt)
    {
        _scopes = scopes;
        _log    = log;
        _opt    = opt.Value;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        var hour = Math.Clamp(_opt.RunAtHourUtc, 0, 23);
        _log.LogInformation(
            "NoCancellations iniciado. Corre a diario a las {Hour}:00 UTC.", hour);

        if (_opt.RunOnStartup)
        {
            try { await Task.Delay(TimeSpan.FromSeconds(60), ct); }
            catch (TaskCanceledException) { return; }
            if (await RunOnceAsync(ct))
                _lastRunDate = DateOnly.FromDateTime(DateTime.UtcNow);
        }

        while (!ct.IsCancellationRequested)
        {
            var now   = DateTime.UtcNow;
            var today = DateOnly.FromDateTime(now);

            // Solo se da el día por hecho si terminó bien. Si Trips no
            // respondió, se reintenta en el siguiente tick (15 min); los días
            // pendientes quedan en rewards.NoCancellationRuns y el comando se
            // pone al día cuando Trips vuelve.
            if (_lastRunDate != today && now.Hour >= hour)
            {
                if (await RunOnceAsync(ct))
                    _lastRunDate = today;
            }

            try { await Task.Delay(Tick, ct); }
            catch (TaskCanceledException) { break; }
        }
    }

    /// <summary>true si terminó (no hace falta reintentar hoy).</summary>
    private async Task<bool> RunOnceAsync(CancellationToken ct)
    {
        try
        {
            using var scope = _scopes.CreateScope();
            var mediator = scope.ServiceProvider.GetRequiredService<IMediator>();

            var r = await mediator.Send(new AwardNoCancellationsCommand(), ct);

            if (r.Retry)
                _log.LogWarning("Bono sin cancelaciones: {Reason}", r.Reason);
            else if (r.Reason is not null)
                _log.LogInformation("Bono sin cancelaciones: {Reason}", r.Reason);
            else
                _log.LogInformation(
                    "Bono sin cancelaciones: {Days} día(s), {Awarded} conductores premiados " +
                    "({Points} puntos) de {Checked} con actividad.",
                    r.DaysProcessed, r.Awarded, r.Points, r.DriversChecked);

            return !r.Retry;
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Error en el bono de sin cancelaciones.");
            return false;
        }
    }
}
