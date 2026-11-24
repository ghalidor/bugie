using MediatR;
using Bugie.Trips.Application.DTOs;
using Bugie.Trips.Domain.Common;
using Bugie.Trips.Domain.External;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Application.Queries;

/// <summary>Resumen de gestion de viajes del periodo (panel admin).</summary>
public record GetTripsSummaryQuery(ReportPeriod Period) : IRequest<TripsSummaryDto>;

public class GetTripsSummaryHandler : IRequestHandler<GetTripsSummaryQuery, TripsSummaryDto>
{
    private readonly IAdminReportsRepository _reports;
    private readonly ILandingClient _landing;

    public GetTripsSummaryHandler(IAdminReportsRepository reports, ILandingClient landing)
    {
        _reports = reports;
        _landing = landing;
    }

    public async Task<TripsSummaryDto> Handle(GetTripsSummaryQuery q, CancellationToken ct)
    {
        // Meta SOS: Configuracion -> sos_response_min (respaldo 2 min).
        var sosGoal = await SosResponseGoal.LoadAsync(_landing, ct);
        var data = await _reports.GetTripsSummaryAsync(q.Period, sosGoal, ct);
        var t    = data.Totals;

        var trips = new TripsSummaryTripsDto(
            t.Created, t.Completed, t.Cancelled, t.InProgressNow,
            t.CompletedRides, t.CompletedDeliveries,
            t.CancelledByPassenger, t.CancelledByDriver, t.CancelledByAdmin, t.CancelledBySystem,
            t.CancellationRate, t.TotalFares, t.AvgFare, t.TotalDiscounts,
            t.AvgDistanceKm, t.AvgTripMin, t.AvgPickupMin);

        return new TripsSummaryDto(
            q.Period.FromText, q.Period.ToText,
            trips,
            new TripsSummaryPeopleDto(t.ActivePassengers, t.ActiveDrivers),
            data.Sos, data.Safety, data.Daily, data.Hourly);
    }
}
