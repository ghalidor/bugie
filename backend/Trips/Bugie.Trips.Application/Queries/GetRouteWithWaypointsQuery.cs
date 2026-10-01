using MediatR;
using Bugie.Trips.Application.DTOs;

namespace Bugie.Trips.Application.Queries;

public record RoutePoint(double Lat, double Lng);
public record WaypointsRouteRequest(List<RoutePoint> Points);
public record GetRouteWithWaypointsQuery(List<RoutePoint> Points) : IRequest<RouteDto>;
