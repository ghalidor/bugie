using System.Security.Claims;
using Bugie.Auth.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Bugie.Auth.Api.Controllers;

[ApiController]
[Route("api/auth/users")]
[Authorize]
public class UsersController : ControllerBase {
    private readonly IUserRepository _users;

    public UsersController(IUserRepository users) => _users = users;

    /// <summary>
    /// Devuelve el estado del usuario logueado: si está activo y verificado.
    /// El frontend lo usa para mostrar el banner "tu cuenta está pendiente".
    /// </summary>
    [HttpGet("me/status")]
    public async Task<IActionResult> Status(CancellationToken ct) {
        var userId = GetUserId();
        if(userId is null) return Unauthorized();

        var user = await _users.GetByIdAsync(userId.Value, ct);
        if(user is null) return NotFound();

        return Ok(new {
            id = user.Id,
            email = user.Email,
            fullName = user.FullName,
            role = user.Role,
            isActive = user.IsActive,
            isVerified = user.IsVerified,
        });
    }

    private Guid? GetUserId() {
        var claim = User.FindFirstValue(ClaimTypes.NameIdentifier)
                 ?? User.FindFirstValue("sub")
                 ?? User.FindFirstValue("userId");
        return Guid.TryParse(claim, out var id) ? id : null;
    }
}