using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using Bugie.Trips.Domain.Entities;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Api.Controllers;

/// <summary>
/// Favoritos del pasajero: conductores marcados con ❤️ y direcciones guardadas.
/// Todos los endpoints requieren autenticación; el PassengerId siempre se toma
/// del token JWT — el cliente nunca lo envía como parámetro.
/// </summary>
[ApiController]
[Route("api/favorites")]
[Authorize]
public class FavoritesController : ControllerBase {
    private readonly IFavoriteDriverRepository _drivers;
    private readonly IFavoriteAddressRepository _addresses;

    public FavoritesController(
        IFavoriteDriverRepository drivers,
        IFavoriteAddressRepository addresses) {
        _drivers = drivers;
        _addresses = addresses;
    }

    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    // ═══════════════════════════════════════════════════════════════════
    // CONDUCTORES FAVORITOS
    // ═══════════════════════════════════════════════════════════════════

    /// <summary>
    /// GET /api/favorites/drivers
    /// Devuelve los IDs de conductores favoritos del usuario actual.
    /// El frontend usa esto para mostrar la corona ⭐ junto al conductor.
    /// </summary>
    [HttpGet("drivers")]
    public async Task<IActionResult> GetFavoriteDrivers(CancellationToken ct) =>
        Ok(new { driverUserIds = await _drivers.GetByPassengerAsync(CurrentUserId, ct) });

    /// <summary>
    /// GET /api/favorites/drivers/{driverUserId}/is-favorite
    /// Devuelve { isFavorite: true|false } para mostrar el corazón lleno o vacío.
    /// </summary>
    [HttpGet("drivers/{driverUserId:guid}/is-favorite")]
    public async Task<IActionResult> IsFavorite(Guid driverUserId, CancellationToken ct) =>
        Ok(new { isFavorite = await _drivers.IsFavoriteAsync(CurrentUserId, driverUserId, ct) });

    /// <summary>
    /// POST /api/favorites/drivers/{driverUserId}
    /// Marca al conductor como favorito. Idempotente: si ya está, devuelve added=false.
    /// </summary>
    [HttpPost("drivers/{driverUserId:guid}")]
    public async Task<IActionResult> AddFavoriteDriver(Guid driverUserId, CancellationToken ct) {
        if(driverUserId == CurrentUserId)
            return BadRequest(new { error = "No puedes marcarte a ti mismo como favorito." });

        var added = await _drivers.AddAsync(CurrentUserId, driverUserId, ct);
        return Ok(new { added });
    }

    /// <summary>
    /// DELETE /api/favorites/drivers/{driverUserId}
    /// Quita el favorito. Si no existía, no falla.
    /// </summary>
    [HttpDelete("drivers/{driverUserId:guid}")]
    public async Task<IActionResult> RemoveFavoriteDriver(Guid driverUserId, CancellationToken ct) {
        await _drivers.RemoveAsync(CurrentUserId, driverUserId, ct);
        return Ok(new { removed = true });
    }

    // ═══════════════════════════════════════════════════════════════════
    // DIRECCIONES FAVORITAS
    // ═══════════════════════════════════════════════════════════════════

    /// <summary>
    /// GET /api/favorites/addresses
    /// Direcciones del pasajero, ordenadas por SortOrder.
    /// </summary>
    [HttpGet("addresses")]
    public async Task<IActionResult> GetAddresses(CancellationToken ct) =>
        Ok(await _addresses.GetByPassengerAsync(CurrentUserId, ct));

    /// <summary>
    /// POST /api/favorites/addresses
    /// Crea una dirección nueva. Se inserta al final (SortOrder = max+1).
    /// </summary>
    [HttpPost("addresses")]
    public async Task<IActionResult> AddAddress(
        [FromBody] FavoriteAddressRequest req, CancellationToken ct) {
        if(string.IsNullOrWhiteSpace(req.Label))
            return BadRequest(new { error = "La etiqueta es obligatoria." });
        if(string.IsNullOrWhiteSpace(req.Address))
            return BadRequest(new { error = "La dirección es obligatoria." });

        if(await _addresses.ExistsByLabelAsync(CurrentUserId, req.Label.Trim(), null, ct))
            return Conflict(new { error = "Ya tienes una direccion guardada con ese nombre." });

        var nextOrder = await _addresses.GetMaxSortOrderAsync(CurrentUserId, ct) + 1;

        var fav = new FavoriteAddress {
            Id = Guid.NewGuid(),
            PassengerId = CurrentUserId,
            Label = req.Label.Trim(),
            Icon = string.IsNullOrWhiteSpace(req.Icon) ? "location_on" : req.Icon.Trim(),
            Address = req.Address.Trim(),
            Lat = req.Lat,
            Lng = req.Lng,
            Description = string.IsNullOrWhiteSpace(req.Description) ? null : req.Description.Trim(),
            SortOrder = nextOrder,
            CreatedAt = DateTime.UtcNow,
        };
        await _addresses.AddAsync(fav, ct);
        return Ok(fav);
    }

    /// <summary>
    /// PUT /api/favorites/addresses/{id}
    /// Edita una dirección. Solo el dueño puede.
    /// </summary>
    [HttpPut("addresses/{id:guid}")]
    public async Task<IActionResult> UpdateAddress(
        Guid id, [FromBody] FavoriteAddressRequest req, CancellationToken ct) {
        var existing = await _addresses.GetByIdAsync(id, ct);
        if(existing is null) return NotFound();
        if(existing.PassengerId != CurrentUserId) return Forbid();

        if(string.IsNullOrWhiteSpace(req.Label))
            return BadRequest(new { error = "La etiqueta es obligatoria." });
        if(string.IsNullOrWhiteSpace(req.Address))
            return BadRequest(new { error = "La dirección es obligatoria." });

        if(await _addresses.ExistsByLabelAsync(CurrentUserId, req.Label.Trim(), id, ct))
            return Conflict(new { error = "Ya tienes una direccion guardada con ese nombre." });

        existing.Label = req.Label.Trim();
        existing.Description = string.IsNullOrWhiteSpace(req.Description) ? null : req.Description.Trim();
        existing.Icon = string.IsNullOrWhiteSpace(req.Icon) ? existing.Icon : req.Icon.Trim();
        existing.Address = req.Address.Trim();
        existing.Lat = req.Lat;
        existing.Lng = req.Lng;
        await _addresses.UpdateAsync(existing, ct);
        return Ok(existing);
    }

    /// <summary>
    /// DELETE /api/favorites/addresses/{id}
    /// Borra. Solo el dueño puede.
    /// </summary>
    [HttpDelete("addresses/{id:guid}")]
    public async Task<IActionResult> DeleteAddress(Guid id, CancellationToken ct) {
        var existing = await _addresses.GetByIdAsync(id, ct);
        if(existing is null) return NotFound();
        if(existing.PassengerId != CurrentUserId) return Forbid();

        await _addresses.DeleteAsync(id, ct);
        return Ok(new { deleted = true });
    }
}

public record FavoriteAddressRequest(
    string Label, string? Icon, string Address, decimal Lat, decimal Lng, string? Description = null);
