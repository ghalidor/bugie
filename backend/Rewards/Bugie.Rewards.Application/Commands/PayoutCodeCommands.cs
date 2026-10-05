using MediatR;
using Bugie.Rewards.Domain.Constants;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Application.Commands;

// ─────────────────────────────────────────────────────────────────────
// Cobro con código: el conductor va donde el admin con un código
//   - de canje de puntos (BG-XXXXXX), o
//   - de premio de sorteo (PZ-XXXXXX).
// Payments consulta aquí qué es, de quién, cuánto y si se puede pagar,
// y al registrar el pago lo marca como entregado.
// ─────────────────────────────────────────────────────────────────────

/// <summary>Lo que hay detrás de un código de cobro.</summary>
/// <param name="Kind">reward_redemption | raffle_prize (igual que el origen del pago en Payments).</param>
/// <param name="Code">Código normalizado (BG-... o PZ-...).</param>
/// <param name="WinnerId">Id del ganador del sorteo (pagos antiguos se guardaban con este id).</param>
/// <param name="Amount">Monto a pagar en soles; null si el premio no tiene valor en dinero.</param>
/// <param name="Status">active | used | expired | cancelled (canje) · pending | delivered | cancelled (premio)</param>
/// <param name="Reason">Si no se puede pagar, por qué (en palabras del admin).</param>
public record PayoutCodeDto(
    string    Kind,
    string    Code,
    Guid?     WinnerId,
    Guid      UserId,
    string?   UserName,
    string?   UserRole,
    string    Title,
    string?   Detail,
    decimal?  Amount,
    string    Status,
    string    StatusLabel,
    bool      Payable,
    string?   Reason,
    DateTime? ExpiresAt,
    DateTime? SettledAt,
    DateTime  CreatedAt);

public record LookupPayoutCodeQuery(string Code) : IRequest<PayoutCodeDto>;

public class LookupPayoutCodeHandler : IRequestHandler<LookupPayoutCodeQuery, PayoutCodeDto>
{
    private readonly IRedemptionRepository _redemptions;
    private readonly IRaffleRepository     _raffles;
    private readonly IUserDirectory        _users;

    public LookupPayoutCodeHandler(
        IRedemptionRepository redemptions, IRaffleRepository raffles, IUserDirectory users)
        => (_redemptions, _raffles, _users) = (redemptions, raffles, users);

    public async Task<PayoutCodeDto> Handle(LookupPayoutCodeQuery q, CancellationToken ct)
    {
        var code = Normalize(q.Code);
        if (code.Length == 0) throw new KeyNotFoundException("Escribe el código.");

        // 1) Premio de sorteo: por código PZ-... o por id del ganador.
        RaffleWinner? winner = null;
        if (code.StartsWith("PZ-"))
            winner = await _raffles.GetWinnerByPrizeCodeAsync(code, ct);
        else if (Guid.TryParse(code, out var winnerId))
            winner = await _raffles.GetWinnerByIdAsync(winnerId, ct);

        if (winner is not null) return await FromWinner(winner, ct);

        // 2) Canje de puntos.
        var redemption = await _redemptions.GetByCodeAsync(code, ct)
            ?? throw new KeyNotFoundException($"No existe ningún canje ni premio con el código {code}.");
        return await FromRedemption(redemption, ct);
    }

    internal static string Normalize(string? code) => (code ?? "").Trim().ToUpperInvariant();

    private async Task<UserNameRow?> UserAsync(Guid id, CancellationToken ct) =>
        (await _users.GetByIdsAsync([id], ct)).GetValueOrDefault(id);

    private async Task<PayoutCodeDto> FromRedemption(Redemption r, CancellationToken ct)
    {
        var user = await UserAsync(r.UserId, ct);
        var expired = r.Status == RedemptionStatus.Expired
                   || (r.Status == RedemptionStatus.Active && r.IsExpired);
        var status = expired ? RedemptionStatus.Expired : r.Status;

        var (label, reason) = status switch
        {
            RedemptionStatus.Used      => ("Pagado / entregado", "Este código ya se pagó o se entregó."),
            RedemptionStatus.Expired   => ("Vencido",            "Este código está vencido."),
            RedemptionStatus.Cancelled => ("Anulado",            "Este código fue anulado."),
            _                          => ("Vigente",            (string?)null),
        };

        // Descuentos y viajes gratis se aplican solos en la app: no se pagan en caja.
        if (reason is null && (RewardTypes.IsAutomatic(r.RewardType) || r.RewardType == RewardTypes.RaffleTicket))
            reason = "Este canje se usa dentro de la app; no se paga en dinero.";
        if (reason is null && user?.Role != "driver")
            reason = "El código no es de un conductor. Solo se pagan códigos de conductores.";

        return new PayoutCodeDto(
            "reward_redemption", r.Code, null, r.UserId, user?.FullName, user?.Role,
            $"Canje: {r.ItemName}", $"{r.PointsSpent:N0} puntos", r.AmountSoles,
            status, label, reason is null, reason, r.ExpiresAt, r.UsedAt, r.CreatedAt);
    }

    private async Task<PayoutCodeDto> FromWinner(RaffleWinner w, CancellationToken ct)
    {
        var user   = await UserAsync(w.UserId, ct);
        var raffle = await _raffles.GetByIdAsync(w.RaffleId, ct);

        var (label, reason) = w.Status switch
        {
            "delivered" => ("Pagado / entregado", "Este premio ya se pagó o se entregó."),
            "cancelled" => ("Anulado",            "Este premio fue anulado."),
            _           => ("Pendiente de pago",  (string?)null),
        };
        if (reason is null && user?.Role != "driver")
            reason = "El premio no es de un conductor. Solo se pagan premios de conductores.";

        var puesto = w.PrizeRank == 1 ? "Premio principal" : $"Puesto {w.PrizeRank}";
        return new PayoutCodeDto(
            "raffle_prize", w.PrizeCode ?? w.Id.ToString(), w.Id, w.UserId, user?.FullName, user?.Role,
            $"Premio de sorteo: {raffle?.Name ?? "Sorteo"}",
            $"{puesto} · {w.PrizeDetail ?? raffle?.PrizeDescription} · ticket {w.TicketNumber}",
            raffle?.PrizeValue, w.Status, label, reason is null, reason,
            null, w.DeliveredAt, w.CreatedAt);
    }
}

/// <summary>
/// Marca el código como pagado/entregado. Reúsa los mismos comandos que los
/// botones del admin (canje "usar" y premio "entregar").
/// </summary>
public record SettlePayoutCodeCommand(string Code, Guid? AdminId, string? Note) : IRequest<PayoutCodeDto>;

public class SettlePayoutCodeHandler : IRequestHandler<SettlePayoutCodeCommand, PayoutCodeDto>
{
    private readonly IMediator _mediator;
    public SettlePayoutCodeHandler(IMediator mediator) => _mediator = mediator;

    public async Task<PayoutCodeDto> Handle(SettlePayoutCodeCommand cmd, CancellationToken ct)
    {
        var info = await _mediator.Send(new LookupPayoutCodeQuery(cmd.Code), ct);
        if (!info.Payable) throw new InvalidOperationException(info.Reason ?? "Este código no se puede pagar.");

        var note = string.IsNullOrWhiteSpace(cmd.Note) ? "Pagado por el administrador." : cmd.Note.Trim();
        if (note.Length > 200) note = note[..200];   // usednote es varchar(200)

        if (info.Kind == "raffle_prize")
            await _mediator.Send(new DeliverPrizeCommand(info.WinnerId!.Value, cmd.AdminId, note), ct);
        else
            await _mediator.Send(new UseRedemptionCommand(info.Code, null, note), ct);

        return await _mediator.Send(new LookupPayoutCodeQuery(info.Code), ct);
    }
}
