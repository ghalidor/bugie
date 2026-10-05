using MediatR;
using Bugie.Drivers.Domain.Enums;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Application.Commands;

/// <summary>
/// Verifica si el conductor tiene documentos vencidos. Si los hay:
/// - Cambia su status a ExpiredDocs (queda bloqueado).
/// - Lo desconecta si estaba online.
/// Devuelve un resumen para el frontend.
/// </summary>
public record CheckExpiredDocumentsCommand(Guid UserId) : IRequest<CheckExpiredResult>;

public record CheckExpiredResult(
    bool HasExpired,
    int NewStatus,                       // 1..6 según DriverStatus
    List<string> ExpiredDocTypes);

public class CheckExpiredDocumentsHandler : IRequestHandler<CheckExpiredDocumentsCommand, CheckExpiredResult>
{
    private readonly IDriverRepository _drivers;
    private readonly IDocumentRepository _docs;
    private readonly IApprovalAuditRepository _audit;

    public CheckExpiredDocumentsHandler(IDriverRepository drivers, IDocumentRepository docs,
        IApprovalAuditRepository audit)
    {
        _drivers = drivers;
        _docs = docs;
        _audit = audit;
    }

    public async Task<CheckExpiredResult> Handle(CheckExpiredDocumentsCommand cmd, CancellationToken ct)
    {
        var driver = await _drivers.GetByUserIdAsync(cmd.UserId, ct);
        if(driver is null)
            return new CheckExpiredResult(false, 0, new List<string>());

        // Solo conductores aprobados pueden caducar (los demás ya están bloqueados por otra vía)
        if(driver.Status != DriverStatus.Approved)
            return new CheckExpiredResult(false, (int)driver.Status, new List<string>());

        var docs = await _docs.GetActiveByDriverAsync(driver.Id, ct);
        var now = DateTime.UtcNow;

        var expired = docs
            .Where(d => d.Status == "approved"
                    && d.ExpiresAt.HasValue
                    && d.ExpiresAt.Value <= now)
            .Select(d => d.DocType)
            .ToList();

        if(expired.Count == 0)
            return new CheckExpiredResult(false, (int)driver.Status, new List<string>());

        // Hay docs caducados → marcar conductor como ExpiredDocs
        driver.MarkAsExpired();
        await _drivers.UpdateAsync(driver, ct);
        await _audit.AddAsync(Domain.Entities.ApprovalAudit.Create(
            driver.Id, Domain.Entities.ApprovalAudit.ActionExpired, null, null,
            "Documentos vencidos", expired, null,
            (int)DriverStatus.Approved, (int)DriverStatus.ExpiredDocs), ct);

        return new CheckExpiredResult(true, (int)driver.Status, expired);
    }
}