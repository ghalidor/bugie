using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Bugie.Trips.Domain.External;

namespace Bugie.Trips.Api.Security;

/// <summary>
/// Reglas de acceso compartidas por los controllers de Trips.
/// Clases estaticas: no se registran en Program.cs.
/// </summary>
public static class DriverAccess
{
    public const int StatusApproved  = 3;
    public const int StatusSuspended = 4;
    public const int StatusRejected  = 5;

    public const string NotDriverMessage    = "Esta acción es solo para conductores.";
    public const string SuspendedMessage    = "Tu cuenta está suspendida. No puedes aceptar ni proponer viajes.";
    public const string RejectedMessage     = "Tu registro como conductor no fue aceptado. No puedes aceptar ni proponer viajes.";
    public const string NotApprovedMessage  = "Tu cuenta de conductor aún no está aprobada.";

    /// <summary>
    /// Solo un usuario con rol driver y perfil de conductor APROBADO (estado 3)
    /// puede actuar como conductor. Devuelve null si puede; si no, la respuesta
    /// de error lista para devolver:
    ///  - 403 si el usuario no tiene rol driver.
    ///  - 409 si es conductor pero esta suspendido, rechazado, pendiente,
    ///    sin perfil, o Drivers no responde (no se deja pasar sin verificar).
    /// </summary>
    public static async Task<IActionResult?> EnsureApprovedDriverAsync(
        ControllerBase controller, IDriversClient drivers, Guid userId, CancellationToken ct)
    {
        if(!controller.User.IsInRole("driver"))
            return controller.StatusCode(403, new { error = NotDriverMessage });

        var message = await ApprovedStatusMessageAsync(drivers, userId, ct);
        return message is null ? null : controller.Conflict(new { error = message });
    }

    /// <summary>
    /// Misma regla que <see cref="EnsureApprovedDriverAsync"/> pero devolviendo solo el
    /// mensaje (null = conductor aprobado). Para contextos sin ControllerBase, como el
    /// hub SignalR (TripsHub.JoinDriverRequests).
    /// </summary>
    public static async Task<string?> ApprovedDriverMessageAsync(
        System.Security.Claims.ClaimsPrincipal user, IDriversClient drivers, Guid userId, CancellationToken ct)
    {
        if(!user.IsInRole("driver")) return NotDriverMessage;
        return await ApprovedStatusMessageAsync(drivers, userId, ct);
    }

    /// <summary>Mensaje segun el estado del perfil en Drivers; null si esta aprobado.</summary>
    private static async Task<string?> ApprovedStatusMessageAsync(
        IDriversClient drivers, Guid userId, CancellationToken ct)
    {
        var status = await drivers.GetDriverStatusByUserIdAsync(userId, ct);
        return status?.Status switch
        {
            StatusApproved  => null,
            StatusSuspended => SuspendedMessage,
            StatusRejected  => RejectedMessage,
            _               => NotApprovedMessage,
        };
    }
}

/// <summary>
/// Comparacion del header X-Internal-Token en tiempo constante.
/// </summary>
public static class InternalToken
{
    public static bool Matches(string? provided, string? expected)
    {
        if(string.IsNullOrEmpty(provided) || string.IsNullOrEmpty(expected)) return false;
        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(provided), Encoding.UTF8.GetBytes(expected));
    }
}
