using MediatR;
using Bugie.Payments.Application.DTOs;
using Bugie.Payments.Domain.Common;
using Bugie.Payments.Domain.External;
using Bugie.Payments.Domain.Interfaces;

namespace Bugie.Payments.Application.Commands;

// ─────────────────────────────────────────────────────────────────────
// Cobro con código: el conductor llega con el código de su canje (BG-...)
// o de su premio de sorteo (PZ-...). El admin lo escribe, ve qué es y,
// si se puede, registra el pago. El código queda pagado y no se repite.
// ─────────────────────────────────────────────────────────────────────

/// <summary>Consulta un código antes de pagarlo.</summary>
public record GetPayoutCodeQuery(string Code) : IRequest<PayoutCodeLookupDto>;

public class GetPayoutCodeHandler : IRequestHandler<GetPayoutCodeQuery, PayoutCodeLookupDto>
{
    private readonly IPayoutCodeClient     _codes;
    private readonly IWithdrawalRepository _payouts;
    public GetPayoutCodeHandler(IPayoutCodeClient codes, IWithdrawalRepository payouts)
        => (_codes, _payouts) = (codes, payouts);

    public async Task<PayoutCodeLookupDto> Handle(GetPayoutCodeQuery q, CancellationToken ct)
    {
        var code = (q.Code ?? "").Trim().ToUpperInvariant();
        if (code.Length == 0) throw new KeyNotFoundException("Escribe el código.");

        var info = await _codes.LookupAsync(code, ct)
            ?? throw new KeyNotFoundException($"No existe ningún canje ni premio con el código {code}.");

        var existing = await _payouts.GetBySourceAsync(info.Kind, PayoutCodeRules.Refs(info), ct);
        return PayoutCodeRules.ToDto(info, existing is null ? null : RegisterPayoutHandler.ToDto(existing));
    }
}

/// <summary>Registra el pago de un código y lo marca como pagado en Rewards.</summary>
public record PayByCodeCommand(string Code, PayByCodeRequest Request, Guid AdminId, string? AdminName)
    : IRequest<PayoutDto>;

public class PayByCodeHandler : IRequestHandler<PayByCodeCommand, PayoutDto>
{
    private readonly IMediator             _mediator;
    private readonly IPayoutCodeClient     _codes;
    private readonly IWithdrawalRepository _payouts;
    public PayByCodeHandler(IMediator mediator, IPayoutCodeClient codes, IWithdrawalRepository payouts)
        => (_mediator, _codes, _payouts) = (mediator, codes, payouts);

    public async Task<PayoutDto> Handle(PayByCodeCommand cmd, CancellationToken ct)
    {
        var code = (cmd.Code ?? "").Trim().ToUpperInvariant();
        var r    = cmd.Request;

        var info = await _codes.LookupAsync(code, ct)
            ?? throw new InvalidOperationException($"No existe ningún canje ni premio con el código {code}.");

        // Ya pagado en Payments: si en Rewards quedó sin cerrar (falló el aviso), se cierra ahora.
        var existing = await _payouts.GetBySourceAsync(info.Kind, PayoutCodeRules.Refs(info), ct);
        if (existing is not null)
        {
            if (info.Payable) await _codes.SettleAsync(info.Code, cmd.AdminId, SettleNote(existing.Method, existing.OperationNumber, existing.Amount), ct);
            throw new PayoutAlreadyRegisteredException(
                $"El código {info.Code} ya se pagó el {BugieTime.ToPeru(existing.PaidAt ?? existing.CreatedAt):dd/MM/yyyy}. No se puede pagar dos veces.");
        }
        if (!info.Payable)
            throw new InvalidOperationException(info.Reason ?? "Este código no se puede pagar.");

        // El monto lo fija el código; solo si el premio no tiene valor en dinero lo escribe el admin.
        var amount = info.Amount is > 0 ? info.Amount.Value : (r.Amount ?? 0);
        if (amount <= 0)
            throw new InvalidOperationException("Este premio no tiene monto: ingresa cuánto se pagó.");

        // Mismas validaciones que cualquier pago (método, n. de operación, fecha, duplicado).
        var payout = await _mediator.Send(new RegisterPayoutCommand(
            new RegisterPayoutRequest(
                info.UserId, info.UserName, amount, r.Method, null, r.OperationNumber,
                r.PaidAt, r.Note, info.Kind, info.Code),
            cmd.AdminId, cmd.AdminName), ct);

        // El canje queda usado / el premio entregado. Si falla, el pago ya está guardado y
        // volver a intentar con el mismo código solo cierra el canje (ver arriba).
        var error = await _codes.SettleAsync(info.Code, cmd.AdminId, SettleNote(payout.Method, payout.OperationNumber, payout.Amount), ct);
        if (error is not null)
            throw new InvalidOperationException(
                $"El pago quedó registrado, pero no se pudo marcar el código como pagado: {error} Vuelve a intentarlo con el mismo código.");

        return payout;
    }

    private static string SettleNote(string method, string? operation, decimal amount) =>
        $"Pagado por {method}{(operation is null ? "" : $" · op {operation}")} · S/ {amount.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture)}";
}

internal static class PayoutCodeRules
{
    /// <summary>Referencias con las que pudo guardarse un pago de ese código.</summary>
    public static List<string> Refs(PayoutCodeInfo i)
    {
        var refs = new List<string> { i.Code };
        if (i.WinnerId is not null) refs.Add(i.WinnerId.Value.ToString());
        return refs;
    }

    public static PayoutCodeLookupDto ToDto(PayoutCodeInfo i, PayoutDto? existing)
    {
        var payable = i.Payable && existing is null;
        var reason  = existing is not null ? "Este código ya tiene un pago registrado." : i.Reason;
        return new PayoutCodeLookupDto(
            i.Kind, i.Code, i.UserId, i.UserName, i.UserRole, i.Title, i.Detail, i.Amount,
            i.Status, existing is not null ? "Pagado" : i.StatusLabel, payable, reason,
            i.ExpiresAt, i.SettledAt, i.CreatedAt, existing);
    }
}
