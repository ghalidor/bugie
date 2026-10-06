using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Bugie.Security;
using Bugie.Drivers.Application.Services;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Api.Controllers;

/// <summary>
/// Historial GPS (panel admin > Configuracion): correr a mano el job que
/// particiona, consolida y archiva en Parquet, y ver su estado.
/// </summary>
[ApiController]
[Route("api/drivers/admin/gps-archive")]
[Authorize(Roles = "admin")]
[RequirePermission(Perm.ViewSettings)]
public class GpsArchiveAdminController : ControllerBase
{
    private readonly GpsArchiveService _service;
    private readonly GpsArchiveState   _state;
    private readonly IGpsArchiveStore  _store;
    private readonly GpsArchiveOptions _opt;

    public GpsArchiveAdminController(
        GpsArchiveService service,
        GpsArchiveState state,
        IGpsArchiveStore store,
        IOptions<GpsArchiveOptions> opt)
    {
        _service = service;
        _state   = state;
        _store   = store;
        _opt     = opt.Value;
    }

    /// <summary>
    /// POST /api/drivers/admin/gps-archive/run: corre el job ahora (particiones,
    /// consolidacion, Parquet y borrado verificado). 409 si ya hay una corrida en curso.
    /// </summary>
    [HttpPost("run")]
    public async Task<IActionResult> Run(CancellationToken ct)
    {
        if (!_state.TryBegin())
            return Conflict(new { error = "Ya hay una corrida del historial GPS en curso." });

        GpsArchiveRunResult result;
        try
        {
            result = await _service.RunAsync("admin", ct);
        }
        catch (Exception ex)
        {
            result = new GpsArchiveRunResult { StartedAtUtc = DateTime.UtcNow, FinishedAtUtc = DateTime.UtcNow, TriggeredBy = "admin" };
            result.Errors.Add(ex.Message);
        }
        _state.End(result);
        return Ok(result);
    }

    /// <summary>GET /api/drivers/admin/gps-archive: configuracion, ultima corrida y archivos Parquet.</summary>
    [HttpGet]
    public IActionResult Status() => Ok(new
    {
        settings = new
        {
            folder = _store.FolderPath,
            _opt.KeepDays,
            _opt.RunAtHourUtc,
            _opt.PartitionDaysAhead,
            _opt.ConsolidateAfterHours,
            _opt.ConsolidateDelaySeconds,
        },
        _state.IsRunning,
        _state.NextRunUtc,
        lastRun = _state.LastRun,
        files = _store.ListFiles(),
    });
}
