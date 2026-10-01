using MediatR;
using Bugie.Trips.Application.DTOs;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Application.Queries;

public class GetRouteWithWaypointsHandler : IRequestHandler<GetRouteWithWaypointsQuery, RouteDto>
{
    private readonly IRoutingService _routing;

    public GetRouteWithWaypointsHandler(IRoutingService routing)
        => _routing = routing;

    public async Task<RouteDto> Handle(GetRouteWithWaypointsQuery q, CancellationToken ct)
    {
        var pts = q.Points;
        if(pts == null || pts.Count < 2)
            return new RouteDto(0, 0, new List<RouteOptionDto>());

        double totalDist = 0;
        double totalDur = 0;
        var allCoords = new List<double[]>();

        for(int i = 0; i < pts.Count - 1; i++)
        {
            var from = pts[i];
            var to = pts[i + 1];

            var result = await _routing.GetRouteAsync(
                from.Lat, from.Lng, to.Lat, to.Lng, ct);

            if(result != null && result.Options.Count > 0)
            {
                totalDist += result.DistanceMeters;
                totalDur += result.DurationSeconds;
                var coords = result.Options[0].Coordinates;
                if(allCoords.Count > 0 && coords.Count > 0)
                    coords = coords.Skip(1).ToList();
                allCoords.AddRange(coords);
            }
            else
            {
                const double R = 6371000;
                var dLat = (to.Lat - from.Lat) * Math.PI / 180;
                var dLng = (to.Lng - from.Lng) * Math.PI / 180;
                var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                           Math.Cos(from.Lat * Math.PI / 180) *
                           Math.Cos(to.Lat * Math.PI / 180) *
                           Math.Sin(dLng / 2) * Math.Sin(dLng / 2);
                var dist = R * 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a)) * 1.3;
                totalDist += dist;
                // 6.1 m/s = 22 km/h urbano realista (antes 8 m/s = optimista)
                totalDur += dist / 6.1;
                if(allCoords.Count == 0)
                    allCoords.Add(new[] { from.Lng, from.Lat });
                allCoords.Add(new[] { to.Lng, to.Lat });
            }
        }

        var km = Math.Round(totalDist / 1000, 2);
        var mins = Math.Round(totalDur / 60, 1);

        return new RouteDto(km, mins, new List<RouteOptionDto>
        {
            new RouteOptionDto(km, mins, allCoords)
        });
    }
}
