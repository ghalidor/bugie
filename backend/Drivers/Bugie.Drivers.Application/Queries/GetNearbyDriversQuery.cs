using MediatR;
using Bugie.Drivers.Application.DTOs;

namespace Bugie.Drivers.Application.Queries;

public record GetNearbyDriversQuery(
    double Lat, double Lng,
    double RadiusKm = 5, int MaxResults = 10) : IRequest<List<NearbyDriverResponse>>;
