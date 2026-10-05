using Bugie.Drivers.Application.DTOs;
using Bugie.Drivers.Application.Email;
using Bugie.Drivers.Domain.Common;
using Bugie.Drivers.Domain.Entities;
using Bugie.Drivers.Domain.Enums;
using Bugie.Drivers.Domain.External;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Application.Services;

/// <summary>
/// Reglas compartidas de rechazo / suspensión / reactivación del conductor.
/// Lo usan los handlers del admin, la solicitud de revisión del conductor y
/// el job que termina las suspensiones con fecha (DriverSuspensionEndService).
/// </summary>
public class DriverAccountService
{
    public const int ReasonMin = 10;
    public const int ReasonMax = 500;
    public const int MessageMin = 10;
    public const int MessageMax = 1000;
    public const int MaxSuspensionDays = 365;

    /// <summary>Nombre del actor cuando la acción la hace el sistema.</summary>
    public const string SystemName = "Sistema";

    private readonly IDriverRepository _drivers;
    private readonly IDocumentRepository _docs;
    private readonly IVehicleRepository _vehicles;
    private readonly IApprovalAuditRepository _audit;
    private readonly IDriverReviewRequestRepository _reviews;
    private readonly IDriverPresenceCheckInRepository _checkIns;
    private readonly ITripsNotifyClient _push;
    private readonly DriverDocumentsDeadlineService _mail;

    public DriverAccountService(
        IDriverRepository drivers,
        IDocumentRepository docs,
        IVehicleRepository vehicles,
        IApprovalAuditRepository audit,
        IDriverReviewRequestRepository reviews,
        IDriverPresenceCheckInRepository checkIns,
        ITripsNotifyClient push,
        DriverDocumentsDeadlineService mail)
    {
        _drivers = drivers;
        _docs = docs;
        _vehicles = vehicles;
        _audit = audit;
        _reviews = reviews;
        _checkIns = checkIns;
        _push = push;
        _mail = mail;
    }

    // ── Validaciones ─────────────────────────────────────────────────────

    /// <summary>Texto obligatorio entre min y max caracteres (ArgumentException = 400).</summary>
    public static string ValidateText(string? text, int min, int max, string field)
    {
        var t = text?.Trim() ?? string.Empty;
        if(t.Length < min)
            throw new ArgumentException($"El {field} es obligatorio (mínimo {min} caracteres).");
        if(t.Length > max)
            throw new ArgumentException($"El {field} no puede superar {max} caracteres.");
        return t;
    }

    public static string ValidateReason(string? reason) => ValidateText(reason, ReasonMin, ReasonMax, "motivo");

    public static string StatusLabel(DriverStatus s) => s switch
    {
        DriverStatus.PendingDocs => "Documentos pendientes",
        DriverStatus.UnderReview => "En revisión",
        DriverStatus.Approved => "Aprobado",
        DriverStatus.Suspended => "Suspendido",
        DriverStatus.Rejected => "Rechazado",
        DriverStatus.ExpiredDocs => "Documentos vencidos",
        _ => s.ToString(),
    };

    public static ReviewRequestDto? ToDto(DriverReviewRequest? r) =>
        r is null ? null : new ReviewRequestDto(r.Id, r.Message, r.CreatedAt);

    /// <summary>Texto corto para el push (el motivo completo va en el correo y en la app).</summary>
    public static string Short(string text, int max = 140) =>
        text.Length <= max ? text : text[..(max - 1)].TrimEnd() + "…";

    // ── Acciones compartidas ─────────────────────────────────────────────

    /// <summary>
    /// Saca al conductor de línea: cierra su check-in activo y, si estaba en
    /// línea, quita su pin del mapa del admin (IsOnline=false ya lo puso la entidad).
    /// Un viaje en curso NO se cancela.
    /// </summary>
    public async Task TakeOfflineAsync(Driver d, bool wasOnline, CancellationToken ct = default)
    {
        await _checkIns.CloseAllActiveAsync(d.UserId, ct);
        if(wasOnline) await _push.NotifyDriverOfflineAsync(d.UserId, ct);
    }

    /// <summary>
    /// Estado al terminar una suspensión, según sus documentos:
    /// - algún documento aprobado ya vencido          -> ExpiredDocs
    /// - todos los obligatorios subidos y aprobados (y foto de perfil) -> Approved
    /// - faltan, pero subió documentos por revisar    -> UnderReview
    /// - faltan y no hay nada por revisar             -> PendingDocs
    /// </summary>
    public async Task<DriverStatus> ResolveStatusByDocumentsAsync(Driver d, CancellationToken ct = default)
    {
        var docs = await _docs.GetActiveByDriverAsync(d.Id, ct);
        var now = DateTime.UtcNow;
        if(docs.Any(x => x.Status == "approved" && x.ExpiresAt.HasValue && x.ExpiresAt.Value <= now))
            return DriverStatus.ExpiredDocs;

        var vehicle = await _vehicles.GetActiveByDriverAsync(d.Id, ct);
        if(RequiredDocuments.GetMissing(docs, vehicle, d.ProfilePhotoUrl).Count == 0)
            return DriverStatus.Approved;

        return docs.Any(x => x.Status == "pending") ? DriverStatus.UnderReview : DriverStatus.PendingDocs;
    }

    /// <summary>
    /// Reactiva al conductor (admin o fin automático de la suspensión):
    /// - Rejected  -> UnderReview (sus documentos se revisan y se aprueba como siempre).
    /// - Suspended -> según sus documentos (ResolveStatusByDocumentsAsync).
    /// Cierra la solicitud de revisión abierta como "accepted", audita, push y correo.
    /// actorUserId NULL = sistema.
    /// </summary>
    public async Task<DriverStatus> ReactivateAsync(
        Driver d, string reason, Guid? actorUserId, string? actorName, bool auto, CancellationToken ct = default)
    {
        var from = d.Status;
        var target = from == DriverStatus.Rejected
            ? DriverStatus.UnderReview
            : await ResolveStatusByDocumentsAsync(d, ct);

        d.Reactivate(target);
        await _drivers.UpdateAsync(d, ct);

        await _reviews.CloseOpenAsync(d.Id, DriverReviewRequest.StatusAccepted,
            actorUserId, actorName ?? SystemName, reason, ct);

        await _audit.AddAsync(ApprovalAudit.Create(
            d.Id, auto ? ApprovalAudit.ActionAutoReactivated : ApprovalAudit.ActionReactivated,
            actorUserId, actorName, reason, null, null, (int)from, (int)target), ct);

        var approved = target == DriverStatus.Approved;
        var label = StatusLabel(target);
        await _mail.SendEmailAsync(d.UserId,
            "Tu cuenta de conductor de Bugie fue reactivada",
            (name, city) => DriverEmailTemplates.DriverReactivated(name, approved, label, auto, city), ct);

        await _push.SendPushAsync(d.UserId,
            "¡Tu cuenta fue reactivada!",
            target switch
            {
                DriverStatus.Approved => "Ya puedes conectarte y recibir viajes.",
                DriverStatus.UnderReview => "Revisaremos tus documentos para aprobar tu cuenta.",
                DriverStatus.ExpiredDocs => "Renueva tus documentos vencidos para volver a conectarte.",
                _ => "Completa tus documentos para volver a conectarte.",
            },
            DriverPush.Data(DriverPush.Reactivated, DriverPush.RouteHome), ct);

        return target;
    }

    /// <summary>
    /// Job: reactiva a los suspendidos cuya fecha de fin ya pasó.
    /// Devuelve cuántos se reactivaron.
    /// </summary>
    public async Task<int> EndSuspensionsAsync(CancellationToken ct = default)
    {
        var ended = await _drivers.GetWithEndedSuspensionAsync(DateTime.UtcNow, ct);
        foreach(var d in ended)
            await ReactivateAsync(d, "Terminó la suspensión programada.", null, null, auto: true, ct);
        return ended.Count;
    }
}
