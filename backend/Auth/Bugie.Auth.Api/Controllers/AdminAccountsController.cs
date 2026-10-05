using System.Security.Claims;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Auth.Application.Commands;
using Bugie.Auth.Application.DTOs;
using Bugie.Auth.Domain.Interfaces;
using Bugie.Auth.Api.Security;

namespace Bugie.Auth.Api.Controllers;

public record AdminDocumentRequest(string? DocType, string? DocNumber, string? Reason);
public record AdminNamesRequest(string? FirstNames, string? LastNamePaternal, string? LastNameMaternal, string? Reason);
public record AdminRestoreRequest(string? Reason);

/// <summary>
/// Panel admin: cuenta de cualquier usuario (pasajero, conductor o admin).
/// - Corregir documento / nombres (motivo obligatorio, auditado).
/// - Restaurar una cuenta eliminada.
/// - Ver la auditoría de la cuenta.
/// Si el usuario objetivo es admin, solo un super_admin puede corregirlo.
/// </summary>
[ApiController]
[Route("api/auth/admin/users")]
[Authorize(Roles = "admin")]
public class AdminAccountsController : ControllerBase
{
    private readonly IMediator _mediator;
    private readonly IUserRepository _users;
    private readonly IAdminRoleRepository _roles;

    public AdminAccountsController(IMediator mediator, IUserRepository users, IAdminRoleRepository roles)
        => (_mediator, _users, _roles) = (mediator, users, roles);

    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    private string? CurrentName => User.FindFirstValue("fullName");

    /// <summary>Detalle de la cuenta (incluye documento, nombres y estado "Eliminada").</summary>
    [HttpGet("{userId:guid}")]
    public async Task<IActionResult> Detail(Guid userId, CancellationToken ct)
    {
        var guard = await GuardAsync(userId, write: false, ct);
        if(guard is not null) return guard;
        var user = await _users.GetByIdAsync(userId, ct);
        return user is null ? NotFound(new { error = "Usuario no encontrado." }) : Ok(UserProfileDto.From(user));
    }

    /// <summary>PUT /api/auth/admin/users/{userId}/document — corrige el documento.</summary>
    [HttpPut("{userId:guid}/document")]
    public async Task<IActionResult> UpdateDocument(Guid userId, [FromBody] AdminDocumentRequest req, CancellationToken ct)
    {
        var guard = await GuardAsync(userId, write: true, ct);
        if(guard is not null) return guard;
        return Ok(await _mediator.Send(new AdminUpdateDocumentCommand(
            CurrentUserId, CurrentName, userId, req.DocType, req.DocNumber, req.Reason), ct));
    }

    /// <summary>PUT /api/auth/admin/users/{userId}/names — corrige nombres y apellidos.</summary>
    [HttpPut("{userId:guid}/names")]
    public async Task<IActionResult> UpdateNames(Guid userId, [FromBody] AdminNamesRequest req, CancellationToken ct)
    {
        var guard = await GuardAsync(userId, write: true, ct);
        if(guard is not null) return guard;
        return Ok(await _mediator.Send(new AdminUpdateNamesCommand(
            CurrentUserId, CurrentName, userId, req.FirstNames, req.LastNamePaternal, req.LastNameMaternal, req.Reason), ct));
    }

    /// <summary>POST /api/auth/admin/users/{userId}/restore — restaura una cuenta eliminada.</summary>
    [HttpPost("{userId:guid}/restore")]
    public async Task<IActionResult> Restore(Guid userId, [FromBody] AdminRestoreRequest req, CancellationToken ct)
    {
        var guard = await GuardAsync(userId, write: true, ct);
        if(guard is not null) return guard;
        return Ok(await _mediator.Send(new RestoreUserCommand(CurrentUserId, CurrentName, userId, req.Reason), ct));
    }

    /// <summary>
    /// POST /api/auth/admin/users/{userId}/revoke-sessions — cierra TODAS las
    /// sesiones del usuario (sello nuevo: sus JWT dejan de valer en las 6 APIs).
    /// Body opcional { reason }. Auditado. Puede volver a iniciar sesión.
    /// </summary>
    [HttpPost("{userId:guid}/revoke-sessions")]
    public async Task<IActionResult> RevokeSessions(Guid userId, [FromBody] AccountReasonRequest? req, CancellationToken ct)
    {
        var guard = await GuardAsync(userId, write: true, ct);
        if(guard is not null) return guard;
        await _mediator.Send(new RevokeSessionsCommand(CurrentUserId, CurrentName, userId, req?.Reason), ct);
        return Ok(new { revoked = true, message = "Se cerraron todas sus sesiones." });
    }

    /// <summary>GET /api/auth/admin/users/{userId}/audit — historial de la cuenta (más reciente primero).</summary>
    [HttpGet("{userId:guid}/audit")]
    public async Task<IActionResult> Audit(Guid userId, CancellationToken ct)
    {
        var guard = await GuardAsync(userId, write: false, ct);
        if(guard is not null) return guard;
        return Ok(await _mediator.Send(new GetUserAccountAuditQuery(userId), ct));
    }

    /// <summary>
    /// Permiso segun la cuenta (view:users o el de su seccion) y, para
    /// modificar a un admin, super_admin. Ver AdminTargetGuard.
    /// </summary>
    private Task<IActionResult?> GuardAsync(Guid userId, bool write, CancellationToken ct) =>
        AdminTargetGuard.CheckAsync(HttpContext, _users, userId, CurrentUserId, write, selfForbidden: false, ct);
}
