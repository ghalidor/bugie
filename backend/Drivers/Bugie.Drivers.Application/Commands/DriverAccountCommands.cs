using System.Globalization;
using MediatR;
using Bugie.Drivers.Application.DTOs;
using Bugie.Drivers.Application.Email;
using Bugie.Drivers.Application.Services;
using Bugie.Drivers.Domain.Common;
using Bugie.Drivers.Domain.Entities;
using Bugie.Drivers.Domain.Enums;
using Bugie.Drivers.Domain.External;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Application.Commands;

// ─────────────────────────────────────────────────────────────────────────
// Rechazo, suspensión, reactivación y solicitudes de revisión del conductor.
// Errores: KeyNotFoundException = 404, ArgumentException = 400 (motivo/fecha),
//          InvalidOperationException = 409 (estado no permite la acción).
// AdminUserId/AdminName salen del token (quedan en la auditoría).
// ─────────────────────────────────────────────────────────────────────────

public record RejectDriverCommand(Guid DriverId, string? Reason, Guid AdminUserId, string? AdminName)
    : IRequest<DriverDto>;

/// <param name="Until">Fecha de fin yyyy-MM-dd (hora de Perú). NULL/vacío = indefinida.</param>
public record SuspendDriverCommand(Guid DriverId, string? Reason, string? Until, Guid AdminUserId, string? AdminName)
    : IRequest<DriverDto>;

public record ReactivateDriverCommand(Guid DriverId, string? Reason, Guid AdminUserId, string? AdminName)
    : IRequest<DriverDto>;

/// <summary>Mantener el rechazo/suspensión: cierra la solicitud abierta como "rejected".</summary>
public record KeepDriverStatusCommand(Guid DriverId, string? Reason, Guid AdminUserId, string? AdminName)
    : IRequest<DriverDto>;

/// <summary>El conductor (rechazado o suspendido) pide que revisen su caso.</summary>
public record RequestDriverReviewCommand(Guid UserId, string? Message) : IRequest<ReviewRequestDto>;

/// <summary>
/// Rechazar registro: desde PendingDocs, UnderReview o ExpiredDocs.
/// Un aprobado se suspende (409).
/// </summary>
public class RejectDriverHandler : IRequestHandler<RejectDriverCommand, DriverDto>
{
    private readonly IDriverRepository _drivers;
    private readonly IApprovalAuditRepository _audit;
    private readonly DriverAccountService _account;
    private readonly DriverDocumentsDeadlineService _mail;
    private readonly ITripsNotifyClient _push;

    public RejectDriverHandler(IDriverRepository drivers, IApprovalAuditRepository audit,
        DriverAccountService account, DriverDocumentsDeadlineService mail, ITripsNotifyClient push)
        => (_drivers, _audit, _account, _mail, _push) = (drivers, audit, account, mail, push);

    public async Task<DriverDto> Handle(RejectDriverCommand cmd, CancellationToken ct)
    {
        var d = await _drivers.GetByIdAsync(cmd.DriverId, ct)
            ?? throw new KeyNotFoundException("Conductor no encontrado.");
        var reason = DriverAccountService.ValidateReason(cmd.Reason);

        switch(d.Status)
        {
            case DriverStatus.Approved:
                throw new InvalidOperationException(
                    "El conductor ya está aprobado. Para quitarle el acceso usa «Suspender».");
            case DriverStatus.Suspended:
                throw new InvalidOperationException(
                    "El conductor está suspendido. El rechazo solo aplica a registros no aprobados: " +
                    "mantén la suspensión o reactívalo.");
            case DriverStatus.Rejected:
                throw new InvalidOperationException("El conductor ya está rechazado.");
        }

        var from = d.Status;
        var wasOnline = d.IsOnline;
        d.RejectRegistration(reason);
        await _drivers.UpdateAsync(d, ct);
        await _account.TakeOfflineAsync(d, wasOnline, ct);

        await _audit.AddAsync(ApprovalAudit.Create(
            d.Id, ApprovalAudit.ActionRejected, cmd.AdminUserId, cmd.AdminName,
            reason, null, null, (int)from, (int)d.Status), ct);

        await _mail.SendEmailAsync(d.UserId,
            "Tu registro como conductor de Bugie no fue aceptado",
            (name, city) => DriverEmailTemplates.DriverRejected(name, reason, city), ct);

        await _push.SendPushAsync(d.UserId,
            "Tu registro no fue aceptado",
            "Motivo: " + DriverAccountService.Short(reason),
            DriverPush.Data(DriverPush.Rejected, DriverPush.RouteHome), ct);

        return RegisterDriverHandler.ToDto(d);
    }
}

/// <summary>
/// Suspender: solo conductores Approved. Until opcional (yyyy-MM-dd, Perú):
/// futura y máximo 365 días. Se guarda SuspendedUntil = 23:59:59 hora de Perú
/// de ese día (en UTC); el job lo reactiva en su siguiente pasada.
/// </summary>
public class SuspendDriverHandler : IRequestHandler<SuspendDriverCommand, DriverDto>
{
    private readonly IDriverRepository _drivers;
    private readonly IApprovalAuditRepository _audit;
    private readonly DriverAccountService _account;
    private readonly DriverDocumentsDeadlineService _mail;
    private readonly ITripsNotifyClient _push;

    public SuspendDriverHandler(IDriverRepository drivers, IApprovalAuditRepository audit,
        DriverAccountService account, DriverDocumentsDeadlineService mail, ITripsNotifyClient push)
        => (_drivers, _audit, _account, _mail, _push) = (drivers, audit, account, mail, push);

    public async Task<DriverDto> Handle(SuspendDriverCommand cmd, CancellationToken ct)
    {
        var d = await _drivers.GetByIdAsync(cmd.DriverId, ct)
            ?? throw new KeyNotFoundException("Conductor no encontrado.");
        var reason = DriverAccountService.ValidateReason(cmd.Reason);

        DateTime? untilUtc = null;
        DateTime? untilPeru = null;
        if(!string.IsNullOrWhiteSpace(cmd.Until))
        {
            if(!DateOnly.TryParseExact(cmd.Until.Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture,
                   DateTimeStyles.None, out var date))
                throw new ArgumentException("La fecha de fin debe tener el formato yyyy-MM-dd.");

            var today = DateOnly.FromDateTime(BugieTime.Today);
            if(date <= today)
                throw new ArgumentException("La fecha de fin de la suspensión debe ser futura.");
            if(date > today.AddDays(DriverAccountService.MaxSuspensionDays))
                throw new ArgumentException(
                    $"La suspensión no puede durar más de {DriverAccountService.MaxSuspensionDays} días.");

            untilPeru = date.ToDateTime(new TimeOnly(23, 59, 59));
            untilUtc = BugieTime.PeruToUtc(untilPeru.Value);
        }

        if(d.Status == DriverStatus.Suspended)
            throw new InvalidOperationException("El conductor ya está suspendido.");
        if(d.Status != DriverStatus.Approved)
            throw new InvalidOperationException(
                "Solo se puede suspender a un conductor aprobado. Para un registro no aprobado usa «Rechazar».");

        var from = d.Status;
        var wasOnline = d.IsOnline;
        d.SuspendAccount(reason, untilUtc);
        await _drivers.UpdateAsync(d, ct);
        await _account.TakeOfflineAsync(d, wasOnline, ct);

        await _audit.AddAsync(ApprovalAudit.Create(
            d.Id, ApprovalAudit.ActionSuspended, cmd.AdminUserId, cmd.AdminName,
            reason, null, untilUtc, (int)from, (int)d.Status), ct);

        await _mail.SendEmailAsync(d.UserId,
            "Tu cuenta de conductor de Bugie fue suspendida",
            (name, city) => DriverEmailTemplates.DriverSuspended(name, reason, untilPeru, city), ct);

        await _push.SendPushAsync(d.UserId,
            "Tu cuenta fue suspendida",
            (untilPeru is null ? "" : $"Hasta el {untilPeru.Value:dd/MM/yyyy}. ") +
            "Motivo: " + DriverAccountService.Short(reason),
            DriverPush.Data(DriverPush.Suspended, DriverPush.RouteHome), ct);

        return RegisterDriverHandler.ToDto(d);
    }
}

/// <summary>
/// Reactivar (admin): Rejected -> UnderReview; Suspended -> según documentos
/// (Approved / ExpiredDocs / UnderReview / PendingDocs). Cierra la solicitud
/// abierta como "accepted".
/// </summary>
public class ReactivateDriverHandler : IRequestHandler<ReactivateDriverCommand, DriverDto>
{
    private readonly IDriverRepository _drivers;
    private readonly DriverAccountService _account;
    private readonly DriverDocumentsDeadlineService _deadline;

    public ReactivateDriverHandler(IDriverRepository drivers, DriverAccountService account,
        DriverDocumentsDeadlineService deadline)
        => (_drivers, _account, _deadline) = (drivers, account, deadline);

    public async Task<DriverDto> Handle(ReactivateDriverCommand cmd, CancellationToken ct)
    {
        var d = await _drivers.GetByIdAsync(cmd.DriverId, ct)
            ?? throw new KeyNotFoundException("Conductor no encontrado.");
        var reason = DriverAccountService.ValidateReason(cmd.Reason);

        if(d.Status is not (DriverStatus.Rejected or DriverStatus.Suspended))
            throw new InvalidOperationException("Solo se puede reactivar a un conductor rechazado o suspendido.");

        await _account.ReactivateAsync(d, reason, cmd.AdminUserId, cmd.AdminName, auto: false, ct);

        var missing = await _deadline.GetMissingAsync(d.Id, ct);
        return RegisterDriverHandler.ToDto(d) with { MissingDocuments = missing };
    }
}

/// <summary>
/// Mantener rechazo/suspensión: exige una solicitud de revisión abierta y la
/// cierra como "rejected". El estado no cambia.
/// </summary>
public class KeepDriverStatusHandler : IRequestHandler<KeepDriverStatusCommand, DriverDto>
{
    private readonly IDriverRepository _drivers;
    private readonly IDriverReviewRequestRepository _reviews;
    private readonly IApprovalAuditRepository _audit;
    private readonly DriverDocumentsDeadlineService _mail;
    private readonly ITripsNotifyClient _push;

    public KeepDriverStatusHandler(IDriverRepository drivers, IDriverReviewRequestRepository reviews,
        IApprovalAuditRepository audit, DriverDocumentsDeadlineService mail, ITripsNotifyClient push)
        => (_drivers, _reviews, _audit, _mail, _push) = (drivers, reviews, audit, mail, push);

    public async Task<DriverDto> Handle(KeepDriverStatusCommand cmd, CancellationToken ct)
    {
        var d = await _drivers.GetByIdAsync(cmd.DriverId, ct)
            ?? throw new KeyNotFoundException("Conductor no encontrado.");
        var reason = DriverAccountService.ValidateReason(cmd.Reason);

        if(d.Status is not (DriverStatus.Rejected or DriverStatus.Suspended))
            throw new InvalidOperationException("El conductor no está rechazado ni suspendido.");

        var closed = await _reviews.CloseOpenAsync(d.Id, DriverReviewRequest.StatusRejected,
            cmd.AdminUserId, cmd.AdminName, reason, ct);
        if(closed is null)
            throw new InvalidOperationException("El conductor no tiene una solicitud de revisión abierta.");

        await _audit.AddAsync(ApprovalAudit.Create(
            d.Id, ApprovalAudit.ActionReviewKept, cmd.AdminUserId, cmd.AdminName,
            reason, null, null), ct);

        var suspended = d.Status == DriverStatus.Suspended;
        await _mail.SendEmailAsync(d.UserId,
            "Respuesta a tu solicitud de revisión en Bugie",
            (name, city) => DriverEmailTemplates.DriverReviewKept(name, suspended, reason, city), ct);

        await _push.SendPushAsync(d.UserId,
            "Respuesta a tu solicitud de revisión",
            (suspended ? "Se mantiene la suspensión: " : "Se mantiene el rechazo: ") +
            DriverAccountService.Short(reason),
            DriverPush.Data(DriverPush.ReviewKept, DriverPush.RouteHome), ct);

        return RegisterDriverHandler.ToDto(d);
    }
}

/// <summary>
/// Solicitud de revisión del conductor: solo Rejected/Suspended, mensaje 10-1000,
/// sin límite de veces pero una abierta a la vez (409). Avisa al admin en vivo.
/// </summary>
public class RequestDriverReviewHandler : IRequestHandler<RequestDriverReviewCommand, ReviewRequestDto>
{
    private readonly IDriverRepository _drivers;
    private readonly IDriverReviewRequestRepository _reviews;
    private readonly IApprovalAuditRepository _audit;
    private readonly IAuthClient _auth;
    private readonly IAdminEventsPublisher _adminEvents;

    public RequestDriverReviewHandler(IDriverRepository drivers, IDriverReviewRequestRepository reviews,
        IApprovalAuditRepository audit, IAuthClient auth, IAdminEventsPublisher adminEvents)
        => (_drivers, _reviews, _audit, _auth, _adminEvents) = (drivers, reviews, audit, auth, adminEvents);

    public async Task<ReviewRequestDto> Handle(RequestDriverReviewCommand cmd, CancellationToken ct)
    {
        var d = await _drivers.GetByUserIdAsync(cmd.UserId, ct)
            ?? throw new KeyNotFoundException("Conductor no encontrado.");
        var message = DriverAccountService.ValidateText(
            cmd.Message, DriverAccountService.MessageMin, DriverAccountService.MessageMax, "mensaje");

        if(d.Status is not (DriverStatus.Rejected or DriverStatus.Suspended))
            throw new InvalidOperationException(
                "Solo puedes solicitar una revisión si tu cuenta está rechazada o suspendida.");

        if(await _reviews.GetOpenByDriverAsync(d.Id, ct) is not null)
            throw new InvalidOperationException(
                "Ya tienes una solicitud de revisión abierta. Espera la respuesta del equipo de Bugie.");

        var request = DriverReviewRequest.Create(d.Id, message, (int)d.Status);
        await _reviews.AddAsync(request, ct);   // 409 si otra petición la creó a la vez

        // Nombre del conductor para la auditoría y el aviso (si Auth falla, genérico).
        string name = "Conductor";
        try
        {
            var users = await _auth.GetUsersByIdsAsync(new[] { d.UserId }, ct);
            if(users.TryGetValue(d.UserId, out var u) && !string.IsNullOrWhiteSpace(u.FullName))
                name = u.FullName;
        }
        catch { /* sin nombre: no rompe la solicitud */ }

        await _audit.AddAsync(ApprovalAudit.Create(
            d.Id, ApprovalAudit.ActionReviewRequested, d.UserId, name,
            message, null, null, actorRole: ApprovalAudit.RoleDriver), ct);

        // Aviso en vivo al panel admin (Centro de avisos). Fire-and-forget.
        _adminEvents.Publish("driver_review",
            "Solicitud de revisión de conductor",
            $"{name} pide revisar {(d.Status == DriverStatus.Suspended ? "su suspensión" : "el rechazo de su registro")}.",
            $"/admin/conductores/{d.Id}", "view:drivers");

        return DriverAccountService.ToDto(request)!;
    }
}
