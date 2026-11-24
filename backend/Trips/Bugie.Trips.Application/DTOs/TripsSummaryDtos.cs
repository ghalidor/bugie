using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Application.DTOs;

/// <summary>
/// Resumen de gestion de viajes por periodo (dias de Peru, ambos inclusive).
/// Fechas como texto "YYYY-MM-DD" para que no pasen por el conversor de hora.
/// </summary>
public record TripsSummaryDto(
    string From,
    string To,
    TripsSummaryTripsDto Trips,
    TripsSummaryPeopleDto People,
    SosSummaryRow Sos,
    SafetySummaryRow Safety,
    IReadOnlyList<TripsDailyRow> Daily,
    IReadOnlyList<TripsHourlyRow> Hourly);

public record TripsSummaryTripsDto(
    int Created,
    int Completed,
    int Cancelled,
    int InProgressNow,
    int CompletedRides,
    int CompletedDeliveries,
    int CancelledByPassenger,
    int CancelledByDriver,
    int CancelledByAdmin,
    int CancelledBySystem,
    decimal? CancellationRate,
    decimal TotalFares,
    decimal? AvgFare,
    decimal TotalDiscounts,
    decimal? AvgDistanceKm,
    decimal? AvgTripMin,
    decimal? AvgPickupMin);

/// <summary>Pasajeros y conductores distintos con al menos un viaje completado.</summary>
public record TripsSummaryPeopleDto(int ActivePassengers, int ActiveDrivers);
