namespace Bugie.Trips.Application.DTOs;

/// <summary>Request del pasajero para calificar un viaje.</summary>
public record CreateRatingRequest(byte Stars, string? Comment);

/// <summary>
/// DTO de calificación. Incluye el nombre del pasajero porque el conductor
/// puede ver quién lo calificó (decisión del producto). El nombre se trae
/// del Auth.Api vía IAuthClient.
/// </summary>
public record TripRatingDto(
    Guid Id,
    Guid TripId,
    Guid PassengerId,
    string PassengerName,
    Guid DriverId,
    byte Stars,
    string? Comment,
    DateTime CreatedAt);

/// <summary>Lista paginada de ratings con totales para UI.</summary>
public record TripRatingPageDto(
    List<TripRatingDto> Items,
    int Page,
    int PageSize,
    int Total);
