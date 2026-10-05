using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Security;
using Bugie.Trips.Domain.Common;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Api.Controllers;

/// <summary>
/// Centro SOS del admin: alertas activas con nombre y celular de quien activó y
/// del otro participante, e historial de alertas resueltas (quién resolvió,
/// motivo y duración). Resolver sigue en PUT /api/sos/{alertId}/resolve.
/// </summary>
[ApiController]
[Route("api/sos/admin")]
[Authorize(Roles = "admin")]
[RequirePermission(Perm.ViewSosCenter, Perm.ViewLiveMap)]
public class SosAdminController : ControllerBase
{
    private readonly ISosAdminQueries _queries;
    public SosAdminController(ISosAdminQueries queries) => _queries = queries;

    /// <summary>GET /api/sos/admin/active → alertas activas con los datos de las personas.</summary>
    [HttpGet("active")]
    public async Task<IActionResult> Active(CancellationToken ct) =>
        Ok(await _queries.GetActiveAsync(ct));

    /// <summary>
    /// GET /api/sos/admin/history?page=1&amp;pageSize=20&amp;from=2026-10-01&amp;to=2026-10-31&amp;search=
    /// Alertas resueltas, la más reciente primero. from / to: días de Perú (ambos incluidos).
    /// </summary>
    [HttpGet("history")]
    public async Task<IActionResult> History(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to = null,
        [FromQuery] string? search = null,
        CancellationToken ct = default)
    {
        var (items, total) = await _queries.GetHistoryAsync(page, pageSize,
            from is null ? null : BugieTime.PeruToUtc(from.Value.Date),
            to   is null ? null : BugieTime.PeruToUtc(to.Value.Date.AddDays(1)),
            search, ct);
        return Ok(new { items, page = Math.Max(1, page), pageSize = Math.Clamp(pageSize, 1, 100), total });
    }
}
