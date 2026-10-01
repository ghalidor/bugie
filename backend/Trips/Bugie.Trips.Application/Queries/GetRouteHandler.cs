using MediatR;
using Bugie.Trips.Application.DTOs;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Application.Queries;

public class GetRouteHandler : IRequestHandler<GetRouteQuery, RouteDto>
{
    private readonly IRoutingService _routing;
    public GetRouteHandler(IRoutingService routing) => _routing = routing;

    public async Task<RouteDto> Handle(GetRouteQuery q, CancellationToken ct)
    {
        var result = await _routing.GetRouteAsync(
            q.OriginLat, q.OriginLng, q.DestLat, q.DestLng, ct);

        if(result is null) return Fallback(q);

        return new RouteDto(
            Math.Round(result.DistanceMeters / 1000, 2),
            Math.Round(result.DurationSeconds / 60, 1),
            result.Options.Select(o => new RouteOptionDto(
                Math.Round(o.DistanceMeters / 1000, 2),
                Math.Round(o.DurationSeconds / 60, 1),
                o.Coordinates)).ToList(),
            IsFallback: false);
    }

    private static RouteDto Fallback(GetRouteQuery q)
    {
        const double R = 6371000;
        var dLat = (q.DestLat - q.OriginLat) * Math.PI / 180;
        var dLng = (q.DestLng - q.OriginLng) * Math.PI / 180;
        var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                   Math.Cos(q.OriginLat * Math.PI / 180) * Math.Cos(q.DestLat * Math.PI / 180) *
                   Math.Sin(dLng / 2) * Math.Sin(dLng / 2);
        var dist = R * 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a)) * 1.3;
        // 6.1 m/s ? 22 km/h, velocidad urbana realista de Trujillo (con tráfico
        // y semáforos). Antes era 8 m/s = 28.8 km/h que daba tiempos cortos.
        var dur = dist / 6.1;
        var coords = new List<double[]>
        {
            new[] { q.OriginLng, q.OriginLat },
            new[] { q.DestLng,   q.DestLat   }
        };
        return new RouteDto(
            Math.Round(dist / 1000, 2),
            Math.Round(dur / 60, 1),
            new List<RouteOptionDto> { new(Math.Round(dist / 1000, 2), Math.Round(dur / 60, 1), coords) },
            IsFallback: true);
    }
}