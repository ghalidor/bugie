using MediatR;
using Bugie.Trips.Application.DTOs;

namespace Bugie.Trips.Application.Queries;

/// <summary>
/// Ranking de conductores por promedio de estrellas en el mes dado.
/// Year en formato 4 dígitos. Month 1..12. PageSize máx 100.
/// </summary>
public record GetDriverRankingQuery(
    int Year, int Month, int Page, int PageSize)
    : IRequest<DriverRankingPagedDto>;
