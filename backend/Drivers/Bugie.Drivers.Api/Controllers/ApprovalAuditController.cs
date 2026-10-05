using Bugie.Drivers.Domain.Common;
using Bugie.Drivers.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Security;

namespace Bugie.Drivers.Api.Controllers;

/// <summary>
/// Auditoría de aprobación de conductores (solo admin):
/// aprobaciones normales, por excepción, documentos completados y
/// desactivaciones automáticas por no completar a tiempo.
/// </summary>
[ApiController]
[Route("api/drivers/approval-audit")]
[Authorize(Roles = "admin")]
[RequirePermission(Perm.ViewDrivers, Perm.ViewVerification)]
public class ApprovalAuditController : ControllerBase
{
    private readonly IApprovalAuditRepository _audit;
    public ApprovalAuditController(IApprovalAuditRepository audit) => _audit = audit;

    // GET /api/drivers/approval-audit/driver/{driverId}
    // Historial de un conductor (más reciente primero)
    [HttpGet("driver/{driverId:guid}")]
    public async Task<IActionResult> ByDriver(Guid driverId, CancellationToken ct)
    {
        var rows = await _audit.GetByDriverAsync(driverId, ct);
        return Ok(rows.Select(ToDto));
    }

    // GET /api/drivers/approval-audit?page=1&pageSize=20&action=approved_exception
    // Lista general paginada
    [HttpGet]
    public async Task<IActionResult> Paged(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? action = null,
        CancellationToken ct = default)
    {
        var (items, total) = await _audit.GetPagedAsync(page, pageSize, action, ct);
        return Ok(new
        {
            items = items.Select(ToDto),
            page = Math.Max(1, page),
            pageSize = Math.Clamp(pageSize, 1, 100),
            total,
        });
    }

    private static object ToDto(ApprovalAuditRow r)
    {
        var missing = string.IsNullOrWhiteSpace(r.MissingDocs)
            ? new List<string>()
            : r.MissingDocs.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList();
        return new
        {
            id = r.Id,
            driverId = r.DriverId,
            driverName = r.DriverName,
            action = r.Action,
            adminUserId = r.AdminUserId,
            adminName = r.AdminName,
            reason = r.Reason,
            missingDocs = missing,
            missingDocLabels = missing.Select(RequiredDocuments.Label).ToList(),
            deadline = r.Deadline,
            createdAt = r.CreatedAt,
        };
    }
}
