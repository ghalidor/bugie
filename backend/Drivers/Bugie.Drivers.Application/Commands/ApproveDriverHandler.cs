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

/// <summary>
/// Aprobación del conductor por el admin:
/// - Documentos completos (obligatorios subidos y aprobados) -> aprobación normal.
/// - Incompletos -> solo con MOTIVO (aprobación por excepción): queda aprobado con
///   plazo de 3 días para completar. Se registra en la auditoría.
/// - Con 1 o más faltas ya no se aprueba por excepción (InvalidOperationException -> 409).
/// - Motivo vacío o muy largo -> ArgumentException (400).
/// </summary>
public class ApproveDriverHandler : IRequestHandler<ApproveDriverCommand, DriverDto>
{
    private const int MaxReasonLength = 1000;

    private readonly IDriverRepository _drivers;
    private readonly IApprovalAuditRepository _audit;
    private readonly DriverDocumentsDeadlineService _deadline;
    private readonly ITripsNotifyClient _push;

    public ApproveDriverHandler(
        IDriverRepository drivers,
        IApprovalAuditRepository audit,
        DriverDocumentsDeadlineService deadline,
        ITripsNotifyClient push)
    {
        _drivers = drivers;
        _audit = audit;
        _deadline = deadline;
        _push = push;
    }

    public async Task<DriverDto> Handle(ApproveDriverCommand cmd, CancellationToken ct)
    {
        var d = await _drivers.GetByIdAsync(cmd.DriverId, ct)
            ?? throw new KeyNotFoundException("Conductor no encontrado.");

        // Rechazado/suspendido: se sale con "Reactivar" (queda auditado y cierra la solicitud de revisión).
        if(d.Status is DriverStatus.Rejected or DriverStatus.Suspended)
            throw new InvalidOperationException(
                $"El conductor está {(d.Status == DriverStatus.Rejected ? "rechazado" : "suspendido")}. " +
                "Usa «Reactivar» para devolverle el acceso.");

        var reason = string.IsNullOrWhiteSpace(cmd.Reason) ? null : cmd.Reason.Trim();
        if(reason is not null && reason.Length > MaxReasonLength)
            throw new ArgumentException($"El motivo no puede superar {MaxReasonLength} caracteres.");

        var missing = await _deadline.GetMissingAsync(d.Id, ct);

        if(missing.Count == 0)
        {
            // -- Aprobación normal --
            // Si tenía un plazo abierto, se cierra ("completó documentos").
            await _deadline.CloseDeadlineIfCompleteAsync(d, ct);

            d.Approve();
            await _drivers.UpdateAsync(d, ct);
            await _audit.AddAsync(ApprovalAudit.Create(
                d.Id, ApprovalAudit.ActionApproved, cmd.AdminUserId, cmd.AdminName,
                reason, null, null), ct);

            await _deadline.SendEmailAsync(d.UserId,
                "Tu cuenta de conductor de Bugie está activa",
                (name, city) => DriverEmailTemplates.DriverApproved(name, city), ct);

            // Push al conductor (no bloquea si falla: el cliente solo registra el error).
            await _push.SendPushAsync(d.UserId,
                "¡Tu cuenta fue aprobada!",
                "Ya puedes conectarte y recibir viajes en Bugie.",
                DriverPush.Data(DriverPush.Approved, DriverPush.RouteHome), ct);

            return ToDto(d, missing);
        }

        // -- Aprobación por excepción --
        var missingLabels = missing.Select(RequiredDocuments.Label).ToList();

        if(d.Strikes >= 1)
            throw new InvalidOperationException(
                $"Este conductor tiene {d.Strikes} falta(s) por no completar sus documentos a tiempo. " +
                $"Solo puede aprobarse con todos los documentos completos y aprobados. " +
                $"Faltan: {string.Join(", ", missingLabels)}.");

        if(d.Status == DriverStatus.Approved && d.DocumentsDeadline is not null)
            throw new InvalidOperationException(
                $"El conductor ya está aprobado por excepción con plazo hasta el " +
                $"{BugieTime.ToPeru(d.DocumentsDeadline.Value):dd/MM/yyyy HH:mm}. No se puede extender el plazo.");

        if(reason is null)
            throw new ArgumentException(
                $"Faltan documentos ({string.Join(", ", missingLabels)}). " +
                "Para aprobar por excepción escribe el motivo.");

        var deadline = DateTime.UtcNow.AddDays(RequiredDocuments.ExceptionDeadlineDays);
        d.ApproveWithDeadline(deadline);
        await _drivers.UpdateAsync(d, ct);
        await _audit.AddAsync(ApprovalAudit.Create(
            d.Id, ApprovalAudit.ActionApprovedException, cmd.AdminUserId, cmd.AdminName,
            reason, missing, deadline), ct);

        await _deadline.SendEmailAsync(d.UserId,
            "Tu cuenta de conductor de Bugie está activa: completa tus documentos",
            (name, city) => DriverEmailTemplates.DriverApprovedWithException(
                name, BugieTime.ToPeru(deadline), missingLabels, city), ct);

        await _push.SendPushAsync(d.UserId,
            "¡Tu cuenta fue aprobada!",
            $"Tienes {RequiredDocuments.ExceptionDeadlineDays} días para completar tus documentos: " +
            string.Join(", ", missingLabels) + ".",
            DriverPush.Data(DriverPush.Approved, DriverPush.RouteHome), ct);

        return ToDto(d, missing);
    }

    private static DriverDto ToDto(Driver d, List<string> missing) =>
        RegisterDriverHandler.ToDto(d) with { MissingDocuments = missing };
}
