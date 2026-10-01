namespace Bugie.Trips.Application.DTOs;

public record RouteDto(
    double DistanceKm,
    double DurationMinutes,
    List<RouteOptionDto> Options,
    bool IsFallback = false);  // true = Haversine, false = ruta real

public record RouteOptionDto(
    double DistanceKm,
    double DurationMinutes,
    List<double[]> Coordinates);