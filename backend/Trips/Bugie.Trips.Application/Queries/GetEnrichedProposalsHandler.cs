using Bugie.Trips.Application.DTOs;
using Bugie.Trips.Domain.External;
using Bugie.Trips.Domain.Interfaces;
using MediatR;

namespace Bugie.Trips.Application.Queries;

public class GetEnrichedProposalsHandler
    : IRequestHandler<GetEnrichedProposalsQuery, List<ProposalDto>>
{
    private readonly ITripProposalRepository _proposals;
    private readonly IAuthClient _auth;
    private readonly IDriversClient _drivers;

    public GetEnrichedProposalsHandler(
        ITripProposalRepository proposals,
        IAuthClient auth,
        IDriversClient drivers)
    {
        _proposals = proposals;
        _auth = auth;
        _drivers = drivers;
    }

    public async Task<List<ProposalDto>> Handle(
        GetEnrichedProposalsQuery q, CancellationToken ct)
    {
        var list = await _proposals.GetByTripAsync(q.TripId, ct);
        if(list.Count == 0) return new List<ProposalDto>();

        var driverIds = list.Select(p => p.DriverId).Distinct().ToList();

        var usersTask = _auth.GetUsersByIdsAsync(driverIds, ct);
        var vehiclesTask = _drivers.GetVehiclesByDriverUserIdsAsync(driverIds, ct);
        // Trae foto y rating del conductor desde el servicio Drivers (ahi vive
        // la foto de perfil editable del conductor, no en Auth).
        var driverInfoTask = _drivers.GetDriverTripInfoAsync(driverIds, ct);
        await Task.WhenAll(usersTask, vehiclesTask, driverInfoTask);

        var users = await usersTask;
        var vehicles = await vehiclesTask;
        var driverInfos = await driverInfoTask;

        var result = new List<ProposalDto>(list.Count);
        foreach(var p in list)
        {
            var history = await _proposals.GetHistoryByDriverAsync(q.TripId, p.DriverId, ct);
            var previous = history.FirstOrDefault(h => h.Id != p.Id && h.Status == "superseded");

            string trend;
            decimal? prevFare = previous?.Fare;
            if(previous is null) trend = "new";
            else if(p.Fare < previous.Fare) trend = "down";
            else if(p.Fare > previous.Fare) trend = "up";
            else trend = "new";

            var user = users.GetValueOrDefault(p.DriverId);
            var vehicle = vehicles.GetValueOrDefault(p.DriverId);
            var di = driverInfos.GetValueOrDefault(p.DriverId);

            result.Add(new ProposalDto(
                p.Id,
                p.TripId,
                p.DriverId,
                p.Fare,
                p.Status,
                p.CreatedAt,
                user?.FullName ?? "Conductor",
                vehicle?.Plate,
                vehicle?.Brand,
                vehicle?.Model,
                vehicle?.Color,
                trend,
                prevFare,
                p.ProposedByRole,
                p.RejectedBy,
                di?.PhotoUrl ?? user?.ProfilePhotoUrl));
        }

        return result;
    }
}