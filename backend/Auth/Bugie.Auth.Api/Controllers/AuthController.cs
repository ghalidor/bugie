using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using Bugie.Auth.Application.Commands;
using Bugie.Auth.Application.DTOs;
using Bugie.Auth.Application.Queries;
using Bugie.Auth.Domain.Interfaces;
using Bugie.Auth.Api.Security;
using Bugie.Security;

namespace Bugie.Auth.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly IMediator _mediator;
    private readonly IPermissionService _perms;
    private readonly IUserRepository _users;
    public AuthController(IMediator mediator, IPermissionService perms, IUserRepository users)
    {
        _mediator = mediator;
        _perms = perms;
        _users = users;
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest req, CancellationToken ct) =>
        Ok(await _mediator.Send(
            new RegisterUserCommand(req.FullName, req.Email, req.Password, req.Phone, req.Role,
                req.AcceptedTerms, req.SignatureImage, req.ReferralCode,
                req.DocType, req.DocNumber, req.FirstNames, req.LastNamePaternal, req.LastNameMaternal), ct));

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest req, CancellationToken ct) =>
        Ok(await _mediator.Send(new LoginCommand(req.Email, req.Password), ct));

    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> Me(CancellationToken ct)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        return Ok(await _mediator.Send(new GetCurrentUserQuery(userId), ct));
    }

    /// <summary>
    /// Devuelve los permisos efectivos del usuario actual. Para super_admin
    /// devuelve TODO el catálogo. Para otros admins, lo que esté asignado al rol.
    /// Para pasajeros/conductores, lista vacía (no usan el admin).
    /// El frontend lo llama al cargar el admin para saber qué módulos mostrar.
    /// </summary>
    [Authorize]
    [HttpGet("me/permissions")]
    public async Task<IActionResult> MyPermissions(CancellationToken ct)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var permissions = await _perms.GetUserPermissionsAsync(userId, ct);
        return Ok(new { permissions });
    }

    // ── Cuenta del usuario logueado ────────────────────────────────────

    /// <summary>
    /// Completa (una sola vez) el documento y los nombres separados de una cuenta
    /// antigua. Solo funciona mientras /me devuelve needsProfileCompletion=true.
    /// Si la cuenta ya tenía documento, docType/docNumber pueden omitirse.
    /// </summary>
    [Authorize]
    [HttpPut("me/profile-completion")]
    public async Task<IActionResult> CompleteProfile([FromBody] ProfileCompletionRequest req, CancellationToken ct) =>
        Ok(await _mediator.Send(new CompleteProfileCommand(CurrentUserId, req.DocType, req.DocNumber,
            req.FirstNames, req.LastNamePaternal, req.LastNameMaternal), ct));

    /// <summary>Registra el documento (una sola vez) en una cuenta que no lo tiene.</summary>
    [Authorize]
    [HttpPut("me/document")]
    public async Task<IActionResult> SetMyDocument([FromBody] DocumentRequest req, CancellationToken ct) =>
        Ok(await _mediator.Send(new SetMyDocumentCommand(CurrentUserId, req.DocType, req.DocNumber), ct));

    /// <summary>
    /// Cambia la contraseña (pide la actual). Envía correo de constancia.
    /// Cierra todas las sesiones del usuario y devuelve { success, message, token }:
    /// token = JWT nuevo para seguir en la sesion actual.
    /// </summary>
    [Authorize]
    [HttpPost("me/change-password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest req, CancellationToken ct)
    {
        // El cambio cierra TODAS las sesiones (sello nuevo). La sesion actual
        // sigue con el token nuevo de la respuesta: el cliente debe guardarlo.
        var token = await _mediator.Send(new ChangePasswordCommand(CurrentUserId, req.CurrentPassword, req.NewPassword), ct);
        return Ok(new { success = true, message = "Tu contraseña fue cambiada.", token });
    }

    /// <summary>
    /// Elimina la cuenta (pasajero o conductor). No borra datos: queda en estado
    /// "Eliminada". 409 si tiene un viaje/envío sin terminar o comisiones pendientes.
    /// </summary>
    [Authorize(Roles = "passenger,driver")]
    [HttpPost("me/delete-account")]
    public async Task<IActionResult> DeleteAccount([FromBody] DeleteAccountRequest req, CancellationToken ct)
    {
        await _mediator.Send(new DeleteAccountCommand(CurrentUserId, req.Password, req.Reason), ct);
        return Ok(new { deleted = true, message = "Tu cuenta fue eliminada." });
    }

    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    /// <summary>
    /// Lista paginada de usuarios. Recomendado para 1000+ usuarios.
    /// GET /api/auth/users/paged?page=1&amp;pageSize=25&amp;search=jose&amp;role=driver
    /// Devuelve: { items, page, pageSize, total }
    /// </summary>
    [Authorize(Roles = "admin")]
    [RequirePermission(Perm.ViewUsers)]
    [HttpGet("users/paged")]
    public async Task<IActionResult> GetUsersPaged(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        [FromQuery] string? search = null,
        [FromQuery] string? role = null,
        [FromQuery] bool? deleted = false,
        CancellationToken ct = default) =>
        Ok(await _mediator.Send(
            new GetUsersPagedQuery(page, pageSize, search, role, null, deleted), ct));

    /// <summary>
    /// Estadísticas de los KPIs del panel admin. Respeta los mismos filtros
    /// que /users/paged. Una sola query SQL eficiente, escala a millones de filas.
    /// GET /api/auth/users/stats?search=jose&amp;role=driver
    /// Devuelve: { total, activos, pasajeros, conductores }
    /// </summary>
    [Authorize(Roles = "admin")]
    [RequirePermission(Perm.ViewUsers)]
    [HttpGet("users/stats")]
    public async Task<IActionResult> GetUsersStats(
        [FromQuery] string? search = null,
        [FromQuery] string? role = null,
        [FromQuery] bool? deleted = false,
        CancellationToken ct = default) =>
        Ok(await _mediator.Send(new GetUsersStatsQuery(search, role, null, deleted), ct));

    /// <summary>
    /// Devuelve los usuarios cuyos Ids se pasan por query string.
    /// Admin: perfil completo (incluye documento). Cualquier otro usuario
    /// autenticado: solo { id, fullName, profilePhotoUrl }.
    /// Las otras APIs usan GET /api/internal/users/bulk (X-Internal-Token).
    /// </summary>
    [Authorize]
    [HttpGet("users/bulk")]
    public async Task<IActionResult> GetUsersBulk(
        [FromQuery(Name = "ids")] Guid[] ids, CancellationToken ct)
    {
        var list = (ids ?? Array.Empty<Guid>()).Distinct().Take(500).ToArray();
        var isAdmin = User.IsInRole("admin");
        var users = await _mediator.Send(new GetUsersBulkQuery(list, isAdmin), ct);
        if(isAdmin) return Ok(users);
        return Ok(users.Select(u => new { u.Id, u.FullName, u.ProfilePhotoUrl }));
    }

    /// <summary>
    /// Desactiva la cuenta (body opcional { reason }). No puede iniciar sesion ni
    /// usar su token: se cierran todas sus sesiones. Auditado.
    /// </summary>
    [Authorize(Roles = "admin")]
    [HttpPut("users/{id:guid}/deactivate")]
    public async Task<IActionResult> Deactivate(Guid id, [FromBody] AccountReasonRequest? req, CancellationToken ct)
    {
        // view:users, o view:passengers / view:drivers segun la cuenta; a otro
        // admin solo un super_admin; nunca a si mismo.
        var denied = await AdminTargetGuard.CheckAsync(HttpContext, _users, id, CurrentUserId,
            write: true, selfForbidden: true, ct);
        if(denied is not null) return denied;
        await _mediator.Send(new DeactivateUserCommand(id, CurrentUserId, User.FindFirstValue("fullName"), req?.Reason), ct);
        return Ok(new { deactivated = true });
    }

    /// <summary>
    /// Reactiva una cuenta desactivada (body opcional { reason }). Mismo permiso
    /// que desactivar. Auditado. Devuelve el perfil actualizado.
    /// </summary>
    [Authorize(Roles = "admin")]
    [HttpPut("users/{id:guid}/reactivate")]
    public async Task<IActionResult> Reactivate(Guid id, [FromBody] AccountReasonRequest? req, CancellationToken ct)
    {
        var denied = await AdminTargetGuard.CheckAsync(HttpContext, _users, id, CurrentUserId,
            write: true, selfForbidden: false, ct);
        if(denied is not null) return denied;
        return Ok(await _mediator.Send(new ReactivateUserCommand(CurrentUserId, User.FindFirstValue("fullName"), id, req?.Reason), ct));
    }

    /// <summary>
    /// Solicita reset de contraseña. No revela si el correo existe.
    /// Si existe, envía un correo con un enlace que vale 1 hora y un solo uso.
    /// </summary>
    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword(
        [FromBody] ForgotPasswordRequest req, CancellationToken ct)
    {
        var message = await _mediator.Send(new ForgotPasswordCommand(req.Email), ct);
        return Ok(new { message });
    }

    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword(
        [FromBody] ResetPasswordRequest req, CancellationToken ct)
    {
        var ok = await _mediator.Send(new ResetPasswordCommand(req.Token, req.NewPassword), ct);
        return Ok(new { success = ok });
    }

    /// <summary>
    /// ¿El enlace de recuperacion sigue vigente? (1 hora, un solo uso)
    /// La pagina lo consulta al abrirse para avisar si ya vencio.
    /// </summary>
    [HttpGet("reset-password/validate")]
    public async Task<IActionResult> ValidateResetToken(
        [FromQuery] string token, CancellationToken ct)
    {
        var valid = await _mediator.Send(new ValidateResetTokenQuery(token), ct);
        return Ok(new { valid });
    }

    // ── Firebase Cloud Messaging ────────────────────────────────────────
    //
    // Endpoints que el Flutter llama para registrar/desregistrar el token
    // FCM del dispositivo del usuario logueado.
    //
    // POST /api/auth/me/fcm-token   → registra (o actualiza) el token actual
    // DELETE /api/auth/me/fcm-token → borra el token del dispositivo
    //
    // Ambos requieren [Authorize]: el usuario tiene que estar logueado.

    [Authorize]
    [HttpPost("me/fcm-token")]
    public async Task<IActionResult> RegisterFcmToken(
        [FromBody] FcmTokenRequest req, CancellationToken ct)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        await _mediator.Send(
            new RegisterFcmTokenCommand(userId, req.Token, req.Platform),
            ct);
        return Ok(new { registered = true });
    }

    [Authorize]
    [HttpDelete("me/fcm-token")]
    public async Task<IActionResult> UnregisterFcmToken(
        [FromQuery] string? token, CancellationToken ct)
    {
        // Si viene token en la query, borra solo ese (logout del dispositivo
        // actual). Sin token, borra TODOS los del usuario (cerrar sesión en
        // todos los dispositivos).
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        await _mediator.Send(
            new UnregisterFcmTokenCommand(userId, token),
            ct);
        return Ok(new { unregistered = true });
    }
}

public record ForgotPasswordRequest(string Email);
public record ResetPasswordRequest(string Token, string NewPassword);
public record FcmTokenRequest(string Token, string Platform);
public record ProfileCompletionRequest(string? DocType, string? DocNumber,
    string? FirstNames, string? LastNamePaternal, string? LastNameMaternal);
public record DocumentRequest(string? DocType, string? DocNumber);
public record ChangePasswordRequest(string? CurrentPassword, string? NewPassword);
public record DeleteAccountRequest(string? Password, string? Reason);
/// <summary>Motivo opcional (desactivar, reactivar, cerrar sesiones).</summary>
public record AccountReasonRequest(string? Reason);
