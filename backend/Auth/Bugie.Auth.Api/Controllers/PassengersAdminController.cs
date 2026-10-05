using Bugie.Auth.Application.Common;
using Bugie.Auth.Application.Email;
using Bugie.Auth.Domain.External;
using Bugie.Auth.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Security;

namespace Bugie.Auth.Api.Controllers;

public record PassengerRejectRequest(string? Reason);

[ApiController]
[Route("api/auth/admin/passengers")]
[Authorize(Roles = "admin")]
[RequirePermission(Perm.ViewPassengers)]
public class PassengersAdminController : ControllerBase
{
    private readonly IUserRepository _users;
    private readonly IPassengerDocumentRepository _docs;
    private readonly IEmailService _email;
    private readonly ILandingSettingsClient _settings;
    private readonly MediatR.IMediator _mediator;
    private readonly ILogger<PassengersAdminController> _log;

    public PassengersAdminController(
        IUserRepository users,
        IPassengerDocumentRepository docs,
        IEmailService email,
        ILandingSettingsClient settings,
        MediatR.IMediator mediator,
        ILogger<PassengersAdminController> log)
    {
        _users = users;
        _docs = docs;
        _email = email;
        _settings = settings;
        _mediator = mediator;
        _log = log;
    }

    /// <summary>
    /// Lista paginada de pasajeros. Recomendado para 1000+ pasajeros.
    /// GET /api/auth/admin/passengers/paged?page=1&amp;pageSize=25&amp;search=jose&amp;verified=false
    /// - verified=true → solo verificados
    /// - verified=false → solo pendientes
    /// - sin verified → todos los pasajeros
    /// - deleted=false (defecto) → sin cuentas eliminadas; deleted=true → solo eliminadas
    /// </summary>
    [HttpGet("paged")]
    public async Task<IActionResult> Paged(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        [FromQuery] string? search = null,
        [FromQuery] bool? verified = null,
        [FromQuery] bool? deleted = false,
        CancellationToken ct = default) =>
        Ok(await _mediator.Send(
            new Application.Queries.GetUsersPagedQuery(
                page, pageSize, search, "passenger", verified, deleted), ct));

    /// <summary>
    /// KPIs de pasajeros (total, verificados, pendientes). Misma query SQL
    /// que estadísticas globales, filtrada a role='passenger'.
    /// GET /api/auth/admin/passengers/stats?search=jose&amp;verified=false
    /// </summary>
    [HttpGet("stats")]
    public async Task<IActionResult> Stats(
        [FromQuery] string? search = null,
        [FromQuery] bool? verified = null,
        [FromQuery] bool? deleted = false,
        CancellationToken ct = default) =>
        Ok(await _mediator.Send(
            new Application.Queries.GetUsersStatsQuery(
                search, "passenger", verified, deleted), ct));

    /// <summary>
    /// Cuántos pasajeros subieron su DNI y esperan aprobación (solo el número).
    /// Lo usa el Centro de avisos del panel (vía Trips, resumen de avisos).
    /// GET /api/auth/admin/passengers/pending-review/count
    /// </summary>
    [HttpGet("pending-review/count")]
    public async Task<IActionResult> PendingReviewCount(CancellationToken ct) =>
        Ok(new { count = await _docs.CountPassengersPendingReviewAsync(ct) });

    [HttpGet("{userId:guid}")]
    public async Task<IActionResult> Detail(Guid userId, CancellationToken ct)
    {
        var user = await _users.GetByIdAsync(userId, ct);
        if(user is null) return NotFound();

        var docs = await _docs.GetByUserAsync(userId, ct);

        return Ok(new
        {
            user = ToDto(user),
            documents = docs.Select(d => new
            {
                id = d.Id,
                docType = d.DocType,
                fileUrl = d.FileUrl,
                originalFileName = d.OriginalFileName,
                mimeType = d.MimeType,
                status = d.Status,
                rejectionReason = d.RejectionReason,
                createdAt = d.CreatedAt,
            }),
            // Requisitos de verificación (DNI frente/reverso + foto de perfil)
            requirements = PassengerRequirements.Build(user, docs),
        });
    }

    [HttpPut("{userId:guid}/approve")]
    [RequirePermission(Perm.ActionApprovePassenger)]
    public async Task<IActionResult> Approve(Guid userId, CancellationToken ct)
    {
        var user = await _users.GetByIdAsync(userId, ct);
        if(user is null) return NotFound();
        if(user.Role != "passenger")
            return BadRequest(new { error = "Solo aplica a pasajeros." });
        if(user.IsDeleted)
            return Conflict(new { error = "La cuenta del pasajero está eliminada. Restáurala antes de verificarla." });
        // La foto de perfil es requisito de la verificación (junto al DNI).
        if(string.IsNullOrWhiteSpace(user.ProfilePhotoUrl))
            return Conflict(new { error = PassengerRequirements.MissingPhotoMessage });

        user.Activate();
        await _users.UpdateAsync(user, ct);

        var city = await _settings.GetDefaultCityAsync(ct);

        await _email.SendAsync(
            toEmail: user.Email,
            toName: user.FullName,
            subject: "Tu cuenta de Bugie está activa",
            htmlBody: EmailTemplates.AccountActivated(user.FullName, city),
            ct);

        return Ok(ToDto(user));
    }

    [HttpPut("{userId:guid}/reject")]
    [RequirePermission(Perm.ActionApprovePassenger)]
    public async Task<IActionResult> Reject(Guid userId, [FromBody] PassengerRejectRequest body, CancellationToken ct)
    {
        var user = await _users.GetByIdAsync(userId, ct);
        if(user is null) return NotFound();

        var city = await _settings.GetDefaultCityAsync(ct);

        await _email.SendAsync(
            toEmail: user.Email,
            toName: user.FullName,
            subject: "Bugie · Necesitamos que vuelvas a subir tus documentos",
            htmlBody: EmailTemplates.DocumentsRejected(user.FullName, body.Reason, city),
            ct);

        return Ok(new { message = "Correo de rechazo enviado." });
    }

    private static object ToDto(Domain.Entities.User u) => new
    {
        id = u.Id,
        email = u.Email,
        fullName = u.FullName,
        phone = u.Phone,
        role = u.Role,
        isActive = u.IsActive,
        isVerified = u.IsVerified,
        profilePhotoUrl = u.ProfilePhotoUrl,
        createdAt = u.CreatedAt,
        termsAccepted = u.TermsAccepted,
        termsAcceptedAt = u.TermsAcceptedAt,
        signatureImage = u.SignatureImage,
        docType = u.DocType,
        docNumber = u.DocNumber,
        firstNames = u.FirstNames,
        lastNamePaternal = u.LastNamePaternal,
        lastNameMaternal = u.LastNameMaternal,
        needsProfileCompletion = u.NeedsProfileCompletion,
        deletedAt = u.DeletedAt,
        deletedReason = u.DeletedReason,
        deactivatedAt = u.DeactivatedAt,
        deactivatedReason = u.DeactivatedReason,
    };
}