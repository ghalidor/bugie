using MediatR;
using Bugie.Rewards.Application.Config;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Application.Queries;

/// <summary>
/// Qué viajes usaron un cupón y cuánto se descontó.
///
/// Mientras el interruptor de cupones esté apagado esto no crece, y la
/// respuesta lo dice para que la pantalla no parezca rota cuando sale vacía.
/// </summary>
public record GetCouponUsageQuery : IRequest<CouponUsageReportDto>;

public class GetCouponUsageHandler
    : IRequestHandler<GetCouponUsageQuery, CouponUsageReportDto>
{
    private readonly IAdminQueryRepository     _admin;
    private readonly IRewardSettingsRepository _settings;

    public GetCouponUsageHandler(
        IAdminQueryRepository admin, IRewardSettingsRepository settings)
    {
        _admin    = admin;
        _settings = settings;
    }

    public async Task<CouponUsageReportDto> Handle(
        GetCouponUsageQuery q, CancellationToken ct)
    {
        var options = RewardsOptions.From(await _settings.GetMapAsync(ct));
        var totales = await _admin.GetCouponTotalsAsync(ct);
        var filas   = await _admin.GetCouponUsageAsync(50, ct);

        var promedio = totales.Trips > 0
            ? Math.Round(totales.TotalDiscount / totales.Trips, 2)
            : 0m;

        return new CouponUsageReportDto(
            totales.Trips,
            totales.TripsCompleted,
            totales.TripsCancelled,
            totales.TotalDiscount,
            totales.TotalOwed,
            promedio,
            options.CouponsApplyToFare,
            filas.Select(f => new CouponUsageDto(
                f.TripId, f.CouponCode, f.ItemName,
                f.FareBeforeDiscount, f.DiscountAmount, f.AmountPaid,
                f.PlatformOwesDriver, f.PassengerName, f.DriverName,
                Estado(f.Status), f.CreatedAt, f.CompletedAt)).ToList());
    }

    /// <summary>Los números de TripStatus, en palabras.</summary>
    private static string Estado(short status) => status switch
    {
        4 => "completed",
        5 => "cancelled",
        _ => "in_progress",
    };
}
