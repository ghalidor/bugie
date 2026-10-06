using Bugie.Drivers.Application.Services;
using Bugie.Drivers.Domain.Interfaces;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Bugie.Drivers.Infrastructure.BackgroundServices;

/// <summary>
/// Job nocturno del historial GPS. Corre una vez al dia a GpsArchive:RunAtHourUtc
/// (por defecto 08:00 UTC = 3 am en Peru) y hace lo de GpsArchiveService:
/// particiones por adelantado, consolidar viajes y archivar a Parquet las
/// particiones de hace KeepDays dias o mas (borrandolas solo si el archivo
/// quedo verificado).
/// Al arrancar la API solo asegura las particiones (hoy + N dias), para que
/// la ingesta nunca se quede sin particion despues de un despliegue.
/// </summary>
public class GpsArchiveJobService : BackgroundService
{
    private readonly IServiceProvider _services;
    private readonly GpsArchiveOptions _opt;
    private readonly GpsArchiveState _state;
    private readonly ILogger<GpsArchiveJobService> _log;

    public GpsArchiveJobService(
        IServiceProvider services,
        IOptions<GpsArchiveOptions> opt,
        GpsArchiveState state,
        ILogger<GpsArchiveJobService> log)
    {
        _services = services;
        _opt = opt.Value;
        _state = state;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _log.LogInformation("GpsArchiveJobService iniciado. Hora: {Hour}:00 UTC, KeepDays {Keep}, carpeta {Folder}",
                            _opt.RunAtHourUtc, _opt.KeepDays, _opt.Folder);

        await EnsurePartitionsAtStartupAsync(stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            var next = NextRunUtc();
            _state.NextRunUtc = next;
            _log.LogInformation("GpsArchive: proxima corrida {Next:yyyy-MM-dd HH:mm} UTC", next);

            try { await Task.Delay(next - DateTime.UtcNow, stoppingToken); }
            catch (TaskCanceledException) { break; }

            await RunOnceAsync(stoppingToken);
        }
    }

    private DateTime NextRunUtc()
    {
        var now  = DateTime.UtcNow;
        var hour = Math.Clamp(_opt.RunAtHourUtc, 0, 23);
        var next = new DateTime(now.Year, now.Month, now.Day, hour, 0, 0, DateTimeKind.Utc);
        if (next <= now) next = next.AddDays(1);
        return next;
    }

    private async Task EnsurePartitionsAtStartupAsync(CancellationToken ct)
    {
        try
        {
            using var scope = _services.CreateScope();
            var repo = scope.ServiceProvider.GetRequiredService<IGpsArchiveRepository>();
            var created = await repo.EnsurePartitionsAsync(_opt.PartitionDaysAhead, ct);
            _log.LogInformation("GpsArchive: particiones aseguradas al arrancar (creadas: {N})", created);
        }
        catch (Exception ex)
        {
            // Si la base todavia no tiene el script aplicado, la ingesta sigue
            // funcionando (tabla sin particionar o particion DEFAULT).
            _log.LogError(ex, "GpsArchive: no se pudieron asegurar las particiones al arrancar");
        }
    }

    private async Task RunOnceAsync(CancellationToken ct)
    {
        if (!_state.TryBegin())
        {
            _log.LogWarning("GpsArchive: ya hay una corrida en curso (manual), se omite la programada");
            return;
        }

        GpsArchiveRunResult result;
        try
        {
            using var scope = _services.CreateScope();
            var service = scope.ServiceProvider.GetRequiredService<GpsArchiveService>();
            result = await service.RunAsync("job", ct);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "GpsArchive: error en la corrida programada");
            result = new GpsArchiveRunResult { StartedAtUtc = DateTime.UtcNow, FinishedAtUtc = DateTime.UtcNow, TriggeredBy = "job" };
            result.Errors.Add(ex.Message);
        }
        // El resultado siempre se registra para que el GET de estado lo muestre.
        _state.End(result);
    }
}
