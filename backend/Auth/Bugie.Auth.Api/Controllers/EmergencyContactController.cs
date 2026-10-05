using System.Net.Mail;
using System.Security.Claims;
using Bugie.Auth.Domain.Entities;
using Bugie.Auth.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Security;

namespace Bugie.Auth.Api.Controllers;

public record EmergencyContactRequest(string? FullName, string? Phone, string? Relationship, string? Email);

/// <summary>
/// Contacto de emergencia (pasajero o conductor). Uno por usuario.
/// Endpoints:
///   - GET /api/auth/me/emergency-contact                      (el propio usuario)
///   - PUT /api/auth/me/emergency-contact                      (crea o reemplaza)
///   - GET /api/auth/admin/users/{userId}/emergency-contact    (solo admin)
///
/// Si no hay contacto, el GET devuelve 200 con null (no es un error: el
/// contacto es recomendado, no obligatorio).
/// </summary>
[ApiController]
[Authorize]
public class EmergencyContactController : ControllerBase
{
    private readonly IEmergencyContactRepository _contacts;
    private readonly ILogger<EmergencyContactController> _log;

    public EmergencyContactController(
        IEmergencyContactRepository contacts,
        ILogger<EmergencyContactController> log)
    {
        _contacts = contacts;
        _log = log;
    }

    [HttpGet("api/auth/me/emergency-contact")]
    public async Task<IActionResult> GetMine(CancellationToken ct)
    {
        var userId = GetUserId();
        if(userId is null) return Unauthorized();
        return Json(await _contacts.GetByUserIdAsync(userId.Value, ct));
    }

    [HttpPut("api/auth/me/emergency-contact")]
    public async Task<IActionResult> SaveMine([FromBody] EmergencyContactRequest req, CancellationToken ct)
    {
        var userId = GetUserId();
        if(userId is null) return Unauthorized();

        var fullName = req.FullName?.Trim() ?? "";
        var phone = req.Phone?.Trim() ?? "";
        var relationship = req.Relationship?.Trim() ?? "";
        var email = string.IsNullOrWhiteSpace(req.Email) ? null : req.Email.Trim();

        // Validaciones simples
        if(fullName.Length == 0 || fullName.Length > 120)
            return BadRequest(new { error = "Ingresa el nombre del contacto (máx. 120 caracteres)." });
        var digits = new string(phone.Where(char.IsDigit).ToArray());
        if(digits.Length < 6 || phone.Length > 20)
            return BadRequest(new { error = "Ingresa un teléfono válido." });
        if(relationship.Length == 0 || relationship.Length > 50)
            return BadRequest(new { error = "Indica el parentesco o relación (máx. 50 caracteres)." });
        if(email is not null && (email.Length > 200 || !MailAddress.TryCreate(email, out _)))
            return BadRequest(new { error = "El correo no es válido." });

        var now = DateTime.UtcNow;
        var contact = new EmergencyContact
        {
            Id = Guid.NewGuid(),
            UserId = userId.Value,
            FullName = fullName,
            Phone = phone,
            Relationship = relationship,
            Email = email,
            CreatedAt = now,
            UpdatedAt = now,
        };
        await _contacts.UpsertAsync(contact, ct);

        _log.LogInformation("Contacto de emergencia guardado: user {UserId}", userId);
        return Json(await _contacts.GetByUserIdAsync(userId.Value, ct));
    }

    [Authorize(Roles = "admin")]
    [RequirePermission(Perm.ViewUsers, Perm.ViewPassengers, Perm.ViewDrivers, Perm.ViewSosCenter)]
    [HttpGet("api/auth/admin/users/{userId:guid}/emergency-contact")]
    public async Task<IActionResult> GetForAdmin(Guid userId, CancellationToken ct) =>
        Json(await _contacts.GetByUserIdAsync(userId, ct));

    // Siempre 200 con JSON: el contacto o null. (Ok(null) devolveria 204 sin
    // cuerpo y los clientes que hacen res.json() fallarian.)
    private static JsonResult Json(EmergencyContact? c) => new(ToDto(c));

    // Lo que ve el cliente (sin Id interno ni fechas de creación).
    internal static object? ToDto(EmergencyContact? c) => c is null ? null : new
    {
        c.UserId,
        c.FullName,
        c.Phone,
        c.Relationship,
        c.Email,
        c.UpdatedAt,
    };

    private Guid? GetUserId()
    {
        var raw = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(raw, out var id) ? id : null;
    }
}
