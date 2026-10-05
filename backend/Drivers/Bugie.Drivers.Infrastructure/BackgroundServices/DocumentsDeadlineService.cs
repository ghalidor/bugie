using Bugie.Drivers.Application.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Bugie.Drivers.Infrastructure.BackgroundServices;

/// <summary>
/// Job que corre cada hora: desactiva a los conductores aprobados por excepción
/// cuyo plazo de 3 días venció sin completar documentos (suspendido, offline,
/// +1 falta, auditoría y correo). Si ya completaron, solo cierra el plazo.
/// </summary>
public class DocumentsDeadlineService : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(1);

    private readonly IServiceProvider _services;
    private readonly ILogger<DocumentsDeadlineService> _log;

    public DocumentsDeadlineService(IServiceProvider services, ILogger<DocumentsDeadlineService> log)
    {
        _services = services;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _log.LogInformation("DocumentsDeadlineService iniciado. Revisa cada {Hours} hora(s).", Interval.TotalHours);

        while(!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _services.CreateScope();
                var deadline = scope.ServiceProvider.GetRequiredService<DriverDocumentsDeadlineService>();
                var count = await deadline.DeactivateExpiredAsync(stoppingToken);
                if(count > 0)
                    _log.LogInformation("Conductores desactivados por no completar documentos: {Count}", count);
            }
            catch(Exception ex) when(!stoppingToken.IsCancellationRequested)
            {
                _log.LogError(ex, "Error revisando plazos de documentos");
            }

            try { await Task.Delay(Interval, stoppingToken); }
            catch(TaskCanceledException) { break; }
        }
    }
}
