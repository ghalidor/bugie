using Microsoft.Extensions.Options;
using MediatR;
using Bugie.Rewards.Application.Commands;

namespace Bugie.Rewards.Api.BackgroundServices;

public class LevelBenefitsNoticeOptions
{
    /// <summary>Hora UTC a la que corre. Default 14 UTC = 9am en Perú (no de madrugada: es un push).</summary>
    public int RunAtHourUtc { get; set; } = 14;
}

/// <summary>
/// Aviso de inicio de mes de los beneficios de nivel (solo pasajero):
/// "Este mes tienes N cupones de X % y M viajes gratis de tu nivel Plata.
/// Reclámalos en Puntos."
///
/// Corre a diario; cada usuario recibe el aviso una sola vez por mes (lo marca
/// rewards.levelbenefitnotices). El primer día del mes avisa a todos; los días
/// siguientes solo a quienes recién tienen perfil de puntos.
///
/// Despierta cada 15 minutos en vez de dormir hasta la hora exacta: si el
/// servidor se reinicia después de esa hora, no se salta el día.
/// </summary>
public class LevelBenefitsNoticeService : BackgroundService
{
    private static readonly TimeSpan Tick = TimeSpan.FromMinutes(15);

    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<LevelBenefitsNoticeService> _log;
    private readonly LevelBenefitsNoticeOptions _opt;

    private DateOnly? _lastRunDate;

    public LevelBenefitsNoticeService(
        IServiceScopeFactory scopes,
        ILogger<LevelBenefitsNoticeService> log,
        IOptions<LevelBenefitsNoticeOptions> opt)
    {
        _scopes = scopes;
        _log    = log;
        _opt    = opt.Value;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        var hour = Math.Clamp(_opt.RunAtHourUtc, 0, 23);
        _log.LogInformation(
            "LevelBenefitsNotice iniciado. Corre a diario a las {Hour}:00 UTC.", hour);

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

            var enviados = await mediator.Send(new RunLevelBenefitsNoticeCommand(), ct);
            if (enviados > 0)
                _log.LogInformation("Beneficios de nivel: {Count} avisos de inicio de mes enviados.", enviados);
        }
        catch (Exception ex)
        {
            // Un error de un día no puede matar el servicio.
            _log.LogError(ex, "Error en el aviso mensual de beneficios de nivel.");
        }
    }
}
