using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Api.Controllers;

/// <summary>
/// Endpoints que solo consume otro modulo, no la app.
///
/// No usan JWT de usuario sino un token compartido, igual que los internos de
/// Rewards: no hay un usuario detras de estas llamadas.
/// </summary>
[ApiController]
[Route("api/trips/internal")]
[AllowAnonymous]
public class TripsInternalController : ControllerBase
{
    private readonly IDriverDayStatsRepository _stats;
    private readonly IConfiguration _cfg;
    private readonly ILogger<TripsInternalController> _log;

    public TripsInternalController(
        IDriverDayStatsRepository stats, IConfiguration cfg,
        ILogger<TripsInternalController> log)
    {
        _stats = stats;
        _cfg   = cfg;
        _log   = log;
    }

    private bool TokenValido(string? token, out IActionResult? error)
    {
        var esperado = _cfg["InternalToken"];
        if (string.IsNullOrWhiteSpace(esperado))
        {
            error = StatusCode(500, new { error = "InternalToken no configurado en Trips." });
            return false;
        }
        if (token != esperado)
        {
            error = Unauthorized(new { error = "Token interno invalido." });
            return false;
        }
        error = null;
        return true;
    }

    /// <summary>
    /// GET /api/trips/internal/driver-day?date=2026-10-08
    ///
    /// Por cada conductor que tuvo actividad ese dia: cuantos viajes completo
    /// y cuantos cancelo EL. Las cancelaciones del pasajero no se cuentan: el
    /// conductor no hizo nada mal ahi.
    ///
    /// La fecha se interpreta en hora de Peru, que es como se habla de "el dia".
    /// </summary>
    [HttpGet("driver-day")]
    public async Task<IActionResult> DriverDay(
        [FromQuery] DateTime date,
        [FromHeader(Name = "X-Internal-Token")] string? token,
        CancellationToken ct)
    {
        if (!TokenValido(token, out var error)) return error!;

        var filas = await _stats.GetAsync(date.Date, ct);

        _log.LogInformation(
            "Resumen del {Date:yyyy-MM-dd}: {Count} conductores con actividad",
            date, filas.Count);

        return Ok(filas);
    }
}
