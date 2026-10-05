using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Trips.Domain.Enums;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Api.Controllers;

/// <summary>
/// Consultas de verificacion que hacen otros modulos (Rewards, Drivers) antes
/// de dar puntos o mostrar datos sensibles. Solo lectura.
///
/// No usa JWT de usuario: se protege con el header X-Internal-Token
/// (comparacion de tiempo constante).
/// </summary>
[ApiController]
[Route("api/trips/internal/verify")]
[AllowAnonymous]
public class TripsVerificationInternalController : ControllerBase
{
    private readonly ITripRepository _trips;
    private readonly ITripRatingRepository _ratings;
    private readonly IConfiguration _cfg;

    public TripsVerificationInternalController(
        ITripRepository trips, ITripRatingRepository ratings, IConfiguration cfg)
    {
        _trips   = trips;
        _ratings = ratings;
        _cfg     = cfg;
    }

    /// <summary>
    /// GET /api/trips/internal/verify/rating/{tripId}
    /// Dice si el viaje existe, si esta completado y si el pasajero ya lo califico.
    /// Rewards lo usa antes de acreditar puntos por calificacion.
    /// </summary>
    [HttpGet("rating/{tripId:guid}")]
    public async Task<IActionResult> Rating(
        Guid tripId,
        [FromHeader(Name = "X-Internal-Token")] string? token,
        CancellationToken ct)
    {
        if (!TokenValido(token, out var error)) return error!;

        var trip = await _trips.GetByIdAsync(tripId, ct);
        if (trip is null)
            return Ok(new { tripId, exists = false, completed = false, rated = false });

        var rating = await _ratings.GetByTripAsync(tripId, ct);
        return Ok(new
        {
            tripId,
            exists      = true,
            completed   = trip.Status == TripStatus.Completed,
            passengerId = trip.PassengerId,
            driverId    = trip.DriverId,
            rated       = rating is not null,
            ratedBy     = rating?.PassengerId,
            stars       = rating?.Stars,
        });
    }

    /// <summary>
    /// GET /api/trips/internal/verify/active-pair?passengerId=..&amp;driverUserId=..
    /// Dice si el pasajero tiene ahora un viaje activo (aceptado, en curso o
    /// con SOS) con ese conductor (UserId). Drivers lo usa para dejar ver la
    /// ubicacion del conductor solo a su pasajero.
    /// </summary>
    [HttpGet("active-pair")]
    public async Task<IActionResult> ActivePair(
        [FromQuery] Guid passengerId,
        [FromQuery] Guid driverUserId,
        [FromHeader(Name = "X-Internal-Token")] string? token,
        CancellationToken ct)
    {
        if (!TokenValido(token, out var error)) return error!;
        if (passengerId == Guid.Empty || driverUserId == Guid.Empty)
            return Ok(new { active = false });

        var trip = await _trips.GetActiveTripAsync(passengerId, ct);
        var active = trip is not null
            && trip.PassengerId == passengerId
            && trip.DriverId == driverUserId
            && trip.Status is TripStatus.Accepted or TripStatus.InProgress or TripStatus.SosActive;

        return Ok(new { active, tripId = active ? trip!.Id : (Guid?)null });
    }

    private bool TokenValido(string? token, out IActionResult? error)
    {
        var esperado = _cfg["InternalToken"];
        if (string.IsNullOrWhiteSpace(esperado))
        {
            error = StatusCode(500, new { error = "InternalToken no configurado en Trips." });
            return false;
        }
        if (string.IsNullOrEmpty(token) || !CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(token), Encoding.UTF8.GetBytes(esperado)))
        {
            error = Unauthorized(new { error = "Token interno invalido." });
            return false;
        }
        error = null;
        return true;
    }
}
