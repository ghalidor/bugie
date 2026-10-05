using Microsoft.AspNetCore.Mvc;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Api.Controllers;

/// <summary>
/// Endpoints internos llamados por OTROS módulos (Trips, Payments).
/// Protegidos por un token interno en header X-Internal-Token.
/// </summary>
[ApiController]
[Route("api/drivers/internal")]
public class DriversInternalEnrichmentController : ControllerBase
{
    private readonly IDriverRepository _drivers;
    private readonly IVehicleRepository _vehicles;
    private readonly IConfiguration _cfg;

    public DriversInternalEnrichmentController(
        IDriverRepository drivers,
        IVehicleRepository vehicles,
        IConfiguration cfg)
    {
        _drivers = drivers;
        _vehicles = vehicles;
        _cfg = cfg;
    }

    /// <summary>
    /// POST /api/drivers/internal/trip-info
    /// Recibe lista de USERIDS de conductores y devuelve info enriquecida.
    /// La foto del conductor usa ProfilePhotoUrl si existe, si no FaceIdPhotoUrl
    /// como fallback. Esto permite a conductores viejos seguir mostrando foto
    /// y a los nuevos personalizarla.
    /// </summary>
    [HttpPost("trip-info")]
    public async Task<IActionResult> TripInfo(
        [FromBody] TripInfoRequest req,
        [FromHeader(Name = "X-Internal-Token")] string? token,
        CancellationToken ct)
    {
        var expected = _cfg["InternalToken"];
        if(!Bugie.Drivers.Api.Security.InternalTokenCheck.Matches(token, expected))
            return Unauthorized(new { error = "Token interno inválido." });

        if(req?.UserIds is null || req.UserIds.Count == 0)
            return Ok(new List<DriverTripInfoDto>());

        var result = new List<DriverTripInfoDto>();
        foreach(var userId in req.UserIds.Distinct())
        {
            var driver = await _drivers.GetByUserIdAsync(userId, ct);
            if(driver is null) continue;

            var vehicle = await _vehicles.GetActiveByDriverAsync(driver.Id, ct);

            // Preferir ProfilePhotoUrl, si no usar FaceIdPhotoUrl como fallback
            var photoUrl = !string.IsNullOrWhiteSpace(driver.ProfilePhotoUrl)
                ? driver.ProfilePhotoUrl
                : driver.FaceIdPhotoUrl;

            result.Add(new DriverTripInfoDto(
                DriverId: driver.Id,
                UserId: driver.UserId,
                PhotoUrl: photoUrl,
                Rating: driver.Rating,
                TotalRatings: driver.TotalRatings,
                VehiclePlate: vehicle?.Plate,
                VehicleBrand: vehicle?.Brand,
                VehicleModel: vehicle?.Model,
                VehicleColor: vehicle?.Color,
                VehicleYear: vehicle?.Year,
                VehiclePhotoUrl: vehicle?.PhotoUrl));
        }

        return Ok(result);
    }
}

public record TripInfoRequest(List<Guid> UserIds);

public record DriverTripInfoDto(
    Guid DriverId,
    Guid UserId,
    string? PhotoUrl,
    decimal Rating,
    int TotalRatings,
    string? VehiclePlate,
    string? VehicleBrand,
    string? VehicleModel,
    string? VehicleColor,
    short? VehicleYear,
    string? VehiclePhotoUrl);