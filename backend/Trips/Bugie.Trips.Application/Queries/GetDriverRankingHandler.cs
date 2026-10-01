using MediatR;
using Bugie.Trips.Application.DTOs;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Application.Queries;

public class GetDriverRankingHandler
    : IRequestHandler<GetDriverRankingQuery, DriverRankingPagedDto>
{
    private readonly IAdminReportsRepository _reports;
    public GetDriverRankingHandler(IAdminReportsRepository reports) => _reports = reports;

    public async Task<DriverRankingPagedDto> Handle(
        GetDriverRankingQuery q, CancellationToken ct)
    {
        // Normalización defensiva — el controller ya valida, pero por las
        // dudas no rompemos si alguien llama el handler desde otro lado.
        var year = q.Year;
        var month = q.Month;
        var page = q.Page < 1 ? 1 : q.Page;
        var pageSize = q.PageSize < 1 ? 20 : (q.PageSize > 100 ? 100 : q.PageSize);

        // Rango de fechas del mes (inicio inclusivo, fin exclusivo).
        var from = new DateTime(year, month, 1);
        var to = from.AddMonths(1);

        // 1) Total para paginación
        var total = await _reports.CountDriversRatedInRangeAsync(from, to, ct);

        // 2) Página de filas
        var skip = (page - 1) * pageSize;
        var rows = await _reports.GetDriverRankingPagedAsync(from, to, skip, pageSize, ct);

        // 3) Mapear a DTO público
        var items = rows.Select(r => new DriverRankingItemDto(
            r.DriverUserId, r.FullName, r.Email, r.Phone, r.PhotoUrl,
            r.AvgStars, r.RatingCount, r.TripsCompletedInMonth, r.EarningsInMonth
        )).ToList();

        var totalPages = (int)Math.Ceiling(total / (double)pageSize);
        return new DriverRankingPagedDto(year, month, page, pageSize, total, totalPages, items);
    }
}
