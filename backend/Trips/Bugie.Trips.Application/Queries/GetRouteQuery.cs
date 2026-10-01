using MediatR;
using Bugie.Trips.Application.DTOs;

namespace Bugie.Trips.Application.Queries;

public record GetRouteQuery(
    double OriginLat, double OriginLng,
    double DestLat,   double DestLng)
    : IRequest<RouteDto>;
