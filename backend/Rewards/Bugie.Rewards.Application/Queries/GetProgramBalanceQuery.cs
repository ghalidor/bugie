using MediatR;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Application.Queries;

/// <summary>
/// Balance del programa de puntos.
///
/// El número que importa es PointsAvailable: los puntos que los usuarios
/// pueden canjear son una DEUDA. Alguien va a tener que pagar lo que se
/// canjee, y conviene saber cuánto es antes de que llegue.
/// </summary>
public record GetProgramBalanceQuery : IRequest<ProgramBalanceDto>;

public class GetProgramBalanceHandler
    : IRequestHandler<GetProgramBalanceQuery, ProgramBalanceDto>
{
    private readonly IAdminQueryRepository _admin;
    public GetProgramBalanceHandler(IAdminQueryRepository admin) => _admin = admin;

    /// <summary>Nombres legibles de cada origen de puntos.</summary>
    private static readonly Dictionary<string, string> Etiquetas = new()
    {
        ["trip_completed"]     = "Viajes completados",
        ["rating"]             = "Calificaciones",
        ["referral"]           = "Referidos",
        ["referral_qualified"] = "Referidos activos",
        ["streak"]             = "Rachas",
        ["weekly_goal"]        = "Metas semanales",
        ["anniversary"]        = "Aniversarios",
        ["promotion"]          = "Promociones",
        ["redemption_refund"]  = "Canjes anulados",
        ["admin_adjustment"]   = "Ajustes manuales",
    };

    public async Task<ProgramBalanceDto> Handle(
        GetProgramBalanceQuery q, CancellationToken ct)
    {
        var t         = await _admin.GetTotalsAsync(ct);
        var breakdown = await _admin.GetBreakdownAsync(null, ct);
        var mensual   = await _admin.GetMonthlyAsync(6, ct);

        var tasa = t.PointsIssued > 0
            ? (int)Math.Round(t.PointsRedeemed * 100.0 / t.PointsIssued)
            : 0;

        return new ProgramBalanceDto(
            t.Profiles,
            t.ProfilesWithPoints,
            t.PointsIssued,
            t.PointsAvailable,
            t.PointsRedeemed,
            t.PointsExpired,
            t.ActiveRedemptions,
            tasa,
            breakdown.Select(b => new SourceBreakdownDto(
                b.SourceEvent,
                Etiquetas.TryGetValue(b.SourceEvent, out var e) ? e : b.SourceEvent,
                b.Transactions, b.Points)).ToList(),
            mensual.Select(m => new MonthlyPointsDto(m.Month, m.Issued, m.Redeemed)).ToList());
    }
}
