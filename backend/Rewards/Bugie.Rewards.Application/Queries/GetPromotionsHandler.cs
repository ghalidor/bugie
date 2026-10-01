using MediatR;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Application.Queries;

public class GetPromotionsHandler : IRequestHandler<GetPromotionsQuery, List<PromotionDto>>
{
    private readonly IPromotionRepository _promotions;
    public GetPromotionsHandler(IPromotionRepository promotions) => _promotions = promotions;

    public async Task<List<PromotionDto>> Handle(GetPromotionsQuery q, CancellationToken ct)
    {
        var all   = await _promotions.GetAllAsync(ct);
        var usage = (await _promotions.GetUsageAsync(ct))
            .ToDictionary(u => u.PromotionId, u => (u.Times, u.TotalPoints));

        return all.Select(p =>
        {
            usage.TryGetValue(p.Id, out var u);
            return ToDto(p, u.Times, u.TotalPoints);
        }).ToList();
    }

    internal static PromotionDto ToDto(Promotion p, int times, int points)
    {
        var c = p.Conditions;
        return new PromotionDto(
            p.Id, p.Name, p.Description, p.PromotionType, p.TargetUserType,
            p.MultiplierValue, p.BonusPoints, p.StartDate, p.EndDate, p.IsActive,
            c.DaysOfWeek, c.StartHour, c.EndHour,
            c.FirstTripOfDay == true, c.PaymentMethods, c.MinAmount,
            times, points,
            Warning(p));
    }

    /// <summary>Avisos de por qué una promoción podría no estar haciendo nada.</summary>
    private static string? Warning(Promotion p)
    {
        if (p.PromotionType is "discount" or "free_trip")
            return "Este tipo descuenta sobre la tarifa del viaje y todavía no se aplica.";

        if (p.EndDate is not null && p.EndDate <= DateTime.UtcNow)
            return "Ya venció.";

        if (p.StartDate > DateTime.UtcNow)
            return "Todavía no empieza.";

        if (p.PromotionType == "multiplier" && (p.MultiplierValue ?? 0) <= 1)
            return "El multiplicador es 1 o menos: no agrega puntos.";

        if (p.PromotionType == "bonus_points" && (p.BonusPoints ?? 0) <= 0)
            return "No tiene puntos extra configurados.";

        return null;
    }
}
