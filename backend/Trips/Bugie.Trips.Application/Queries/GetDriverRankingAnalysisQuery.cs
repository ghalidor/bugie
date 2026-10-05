using MediatR;
using Bugie.Trips.Application.DTOs;
using Bugie.Trips.Domain.Common;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Application.Queries;

/// <summary>
/// Ranking de varios meses: el top N de cada mes y, por conductor, cuántos meses
/// fue 1.º, cuántos estuvo en el top 3, mejor/peor puesto, promedio y tendencia.
/// El rango termina en EndYear/EndMonth (por defecto, el mes actual de Peru).
/// </summary>
public record GetDriverRankingAnalysisQuery(int Months, int Top, int? EndYear, int? EndMonth)
    : IRequest<DriverRankingAnalysisDto>;

public class GetDriverRankingAnalysisHandler
    : IRequestHandler<GetDriverRankingAnalysisQuery, DriverRankingAnalysisDto>
{
    private readonly IAdminReportsRepository _reports;
    public GetDriverRankingAnalysisHandler(IAdminReportsRepository reports) => _reports = reports;

    public async Task<DriverRankingAnalysisDto> Handle(GetDriverRankingAnalysisQuery q, CancellationToken ct)
    {
        var months = Math.Clamp(q.Months, 1, 24);
        var top    = Math.Clamp(q.Top, 1, 20);

        var hoy    = BugieTime.Today;
        var endMes = q.EndYear is int y && q.EndMonth is int m && m is >= 1 and <= 12
            ? new DateTime(y, m, 1)
            : new DateTime(hoy.Year, hoy.Month, 1);
        var startMes = endMes.AddMonths(-(months - 1));

        // Rango en hora de Peru [inicio del primer mes, inicio del mes siguiente al último), en UTC.
        var rows = await _reports.GetMonthlyRankingAsync(
            BugieTime.PeruToUtc(startMes), BugieTime.PeruToUtc(endMes.AddMonths(1)), ct);

        var meses = Enumerable.Range(0, months).Select(i => startMes.AddMonths(i)).ToList();
        int Index(MonthlyRankingRow r) => meses.FindIndex(x => x.Year == r.Year && x.Month == r.Month);

        // Top N de cada mes
        var periods = meses.Select(mes =>
        {
            var delMes = rows.Where(r => r.Year == mes.Year && r.Month == mes.Month).ToList();
            return new RankingMonthDto(mes.Year, mes.Month, delMes.Count,
                delMes.Where(r => r.Place <= top)
                      .OrderBy(r => r.Place)
                      .Select(r => new RankingTopItemDto(r.DriverUserId, r.FullName, r.Place, r.AvgStars, r.RatingCount))
                      .ToList());
        }).ToList();

        // Resumen por conductor: solo quienes estuvieron alguna vez en el top N.
        var drivers = rows
            .GroupBy(r => r.DriverUserId)
            .Where(g => g.Any(r => r.Place <= top))
            .Select(g =>
            {
                var lista  = g.OrderBy(r => r.Year).ThenBy(r => r.Month).ToList();
                var places = new int?[months];
                foreach (var r in lista) { var i = Index(r); if (i >= 0) places[i] = r.Place; }

                var puestos = lista.Select(r => r.Place).ToList();
                var (trend, delta) = Trend(puestos);
                var ultimo = lista[^1];

                return new RankingDriverStatsDto(
                    g.Key, ultimo.FullName, ultimo.PhotoUrl,
                    MonthsRanked: puestos.Count,
                    MonthsFirst:  puestos.Count(p => p == 1),
                    MonthsTop3:   puestos.Count(p => p <= 3),
                    MonthsInTop:  puestos.Count(p => p <= top),
                    BestPlace:    puestos.Min(),
                    WorstPlace:   puestos.Max(),
                    AvgPlace:     Math.Round((decimal)puestos.Average(), 2),
                    AvgStars:     Math.Round(lista.Average(r => r.AvgStars), 2),
                    Trend:        trend,
                    TrendDelta:   delta,
                    Places:       places);
            })
            .OrderByDescending(d => d.MonthsFirst)
            .ThenByDescending(d => d.MonthsTop3)
            .ThenByDescending(d => d.MonthsInTop)
            .ThenBy(d => d.AvgPlace)
            .ThenBy(d => d.FullName)
            .ToList();

        return new DriverRankingAnalysisDto(months, top, periods, drivers);
    }

    /// <summary>
    /// Compara el puesto promedio de la primera mitad de sus meses con el de la
    /// segunda. Delta &gt; 0 = ahora está más arriba. Con un solo mes: estable.
    /// </summary>
    private static (string Trend, decimal Delta) Trend(List<int> puestos)
    {
        if (puestos.Count < 2) return ("flat", 0);
        var mitad  = puestos.Count / 2;
        var antes  = puestos.Take(mitad).Average();
        var ahora  = puestos.Skip(mitad).Average();
        var delta  = Math.Round((decimal)(antes - ahora), 2);
        return (delta >= 0.5m ? "up" : delta <= -0.5m ? "down" : "flat", delta);
    }
}
