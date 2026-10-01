using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using Bugie.Auth.Application.Commands;
using Bugie.Auth.Application.DTOs;
using Bugie.Auth.Application.Queries;
using Bugie.Auth.Domain.Interfaces;

namespace Bugie.Auth.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly IMediator _mediator;
    private readonly IPermissionService _perms;
    public AuthController(IMediator mediator, IPermissionService perms)
    {
        _mediator = mediator;
        _perms = perms;
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest req, CancellationToken ct) =>
        Ok(await _mediator.Send(
            new RegisterUserCommand(req.FullName, req.Email, req.Password, req.Phone, req.Role,
                req.AcceptedTerms, req.SignatureImage), ct));

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

    [Authorize(Roles = "admin")]
    [HttpGet("users")]
    public async Task<IActionResult> GetUsers([FromQuery] string? role, CancellationToken ct) =>
        Ok(await _mediator.Send(new GetUsersQuery(role), ct));

    /// <summary>
    /// Lista paginada de usuarios. Recomendado para 1000+ usuarios.
    /// GET /api/auth/users/paged?page=1&amp;pageSize=25&amp;search=jose&amp;role=driver
    /// Devuelve: { items, page, pageSize, total }
    /// </summary>
    [Authorize(Roles = "admin")]
    [HttpGet("users/paged")]
    public async Task<IActionResult> GetUsersPaged(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        [FromQuery] string? search = null,
        [FromQuery] string? role = null,
        CancellationToken ct = default) =>
        Ok(await _mediator.Send(
            new GetUsersPagedQuery(page, pageSize, search, role), ct));

    /// <summary>
    /// Estadísticas de los KPIs del panel admin. Respeta los mismos filtros
    /// que /users/paged. Una sola query SQL eficiente, escala a millones de filas.
    /// GET /api/auth/users/stats?search=jose&amp;role=driver
    /// Devuelve: { total, activos, pasajeros, conductores }
    /// </summary>
    [Authorize(Roles = "admin")]
    [HttpGet("users/stats")]
    public async Task<IActionResult> GetUsersStats(
        [FromQuery] string? search = null,
        [FromQuery] string? role = null,
        CancellationToken ct = default) =>
        Ok(await _mediator.Send(new GetUsersStatsQuery(search, role), ct));

    /// <summary>
    /// Devuelve los usuarios cuyos Ids se pasan por query string.
    /// Pensado para que otras APIs internas (Drivers, Trips, etc.) obtengan
    /// nombres en lote sin tener que hacer JOIN cross-database.
    /// Cualquier usuario autenticado puede consultarlo (incluye reenvío JWT entre APIs).
    /// </summary>
    [Authorize]
    [HttpGet("users/bulk")]
    public async Task<IActionResult> GetUsersBulk(
        [FromQuery(Name = "ids")] Guid[] ids, CancellationToken ct) =>
        Ok(await _mediator.Send(new GetUsersBulkQuery(ids ?? Array.Empty<Guid>()), ct));

    [Authorize(Roles = "admin")]
    [HttpPut("users/{id:guid}/deactivate")]
    public async Task<IActionResult> Deactivate(Guid id, CancellationToken ct)
    {
        await _mediator.Send(new DeactivateUserCommand(id), ct);
        return Ok(new { deactivated = true });
    }

    /// <summary>
    /// Solicita reset de contraseña. No revela si el correo existe.
    /// En producción envía email con token.
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
