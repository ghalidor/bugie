using System.Globalization;
using MediatR;
using Bugie.Drivers.Application.Services;
using Bugie.Drivers.Domain.Common;
using Bugie.Drivers.Domain.Entities;
using Bugie.Drivers.Domain.Enums;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Application.Queries;

/// <summary>
/// Línea de tiempo de la cuenta del conductor (admin), más reciente primero.
/// Sale de drivers.ApprovalAudit (incluye las aprobaciones antiguas).
/// NULL si el conductor no existe.
/// </summary>
public record GetDriverTimelineQuery(Guid DriverId) : IRequest<List<DriverTimelineItemDto>?>;

/// <param name="Action">
/// approved, approved_with_pending, documents_completed, auto_deactivated, rejected,
/// suspended, reactivated, auto_reactivated, review_requested, review_kept, expired.
/// </param>
/// <param name="ActorRole">admin | system | driver.</param>
public record DriverTimelineItemDto(
    Guid Id,
    DateTime At,
    string Action,
    string ActorName,
    string ActorRole,
    string? Reason,
    string? Details,
    int? FromStatus,
    int? ToStatus);

public class GetDriverTimelineHandler : IRequestHandler<GetDriverTimelineQuery, List<DriverTimelineItemDto>?>
{
    private readonly IDriverRepository _drivers;
    private readonly IApprovalAuditRepository _audit;

    public GetDriverTimelineHandler(IDriverRepository drivers, IApprovalAuditRepository audit)
        => (_drivers, _audit) = (drivers, audit);

    public async Task<List<DriverTimelineItemDto>?> Handle(GetDriverTimelineQuery q, CancellationToken ct)
    {
        if(await _drivers.GetByIdAsync(q.DriverId, ct) is null) return null;

        var rows = await _audit.GetByDriverAsync(q.DriverId, ct);   // ya viene más reciente primero
        return rows.Select(ToItem).ToList();
    }

    public static DriverTimelineItemDto ToItem(ApprovalAuditRow r)
    {
        var role = r.ActorRole ?? (r.AdminUserId is null ? ApprovalAudit.RoleSystem : ApprovalAudit.RoleAdmin);
        var actor = role == ApprovalAudit.RoleSystem
            ? DriverAccountService.SystemName
            : r.AdminName ?? (role == ApprovalAudit.RoleDriver ? "Conductor" : "Administrador");

        return new DriverTimelineItemDto(
            r.Id,
            r.CreatedAt,
            r.Action == ApprovalAudit.ActionApprovedException ? "approved_with_pending" : r.Action,
            actor,
            role,
            r.Reason,
            Details(r),
            r.FromStatus,
            r.ToStatus);
    }

    private static string? Details(ApprovalAuditRow r)
    {
        var docs = string.IsNullOrWhiteSpace(r.MissingDocs)
            ? ""
            : string.Join(", ", r.MissingDocs.Split(',', StringSplitOptions.RemoveEmptyEntries)
                                              .Select(RequiredDocuments.Label));
        string? Date(string format) => r.Deadline is null ? null : BugieTime.ToPeru(r.Deadline.Value).ToString(format, CultureInfo.InvariantCulture);

        return r.Action switch
        {
            ApprovalAudit.ActionApprovedException =>
                $"Documentos pendientes: {docs}. Plazo hasta el {Date("dd/MM/yyyy HH:mm")}.",
            ApprovalAudit.ActionAutoDeactivated when docs.Length > 0 => $"Documentos que faltaban: {docs}.",
            ApprovalAudit.ActionExpired when docs.Length > 0 => $"Documentos vencidos: {docs}.",
            ApprovalAudit.ActionSuspended => r.Deadline is null
                ? "Suspensión indefinida."
                : $"Suspendido hasta el {Date("dd/MM/yyyy")}.",
            ApprovalAudit.ActionReactivated or ApprovalAudit.ActionAutoReactivated when r.ToStatus is not null =>
                $"Nuevo estado: {DriverAccountService.StatusLabel((DriverStatus)r.ToStatus.Value)}.",
            _ => null,
        };
    }
}
