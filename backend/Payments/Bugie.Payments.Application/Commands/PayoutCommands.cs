using MediatR;
using Bugie.Payments.Application.DTOs;
using Bugie.Payments.Domain.Common;
using Bugie.Payments.Domain.Entities;
using Bugie.Payments.Domain.External;
using Bugie.Payments.Domain.Interfaces;

namespace Bugie.Payments.Application.Commands;

/// <summary>El admin registra un pago ya hecho a un conductor.</summary>
public record RegisterPayoutCommand(RegisterPayoutRequest Request, Guid AdminId, string? AdminName)
    : IRequest<PayoutDto>;

/// <summary>Ese canje o premio ya tenia un pago registrado.</summary>
public class PayoutAlreadyRegisteredException(string message) : Exception(message);

public class RegisterPayoutHandler : IRequestHandler<RegisterPayoutCommand, PayoutDto>
{
    public static readonly HashSet<string> Methods     = ["yape", "plin", "transferencia", "efectivo"];
    public static readonly HashSet<string> SourceTypes = ["reward_redemption", "raffle_prize", "manual"];

    private readonly IWithdrawalRepository _payouts;
    private readonly IPayoutNotifier       _notifier;
    public RegisterPayoutHandler(IWithdrawalRepository payouts, IPayoutNotifier notifier)
        => (_payouts, _notifier) = (payouts, notifier);

    public async Task<PayoutDto> Handle(RegisterPayoutCommand cmd, CancellationToken ct)
    {
        var r = cmd.Request;
        var method     = (r.Method ?? "").Trim().ToLowerInvariant();
        var sourceType = string.IsNullOrWhiteSpace(r.SourceType) ? "manual" : r.SourceType.Trim().ToLowerInvariant();
        var operation  = string.IsNullOrWhiteSpace(r.OperationNumber) ? null : r.OperationNumber.Trim();
        var sourceRef  = string.IsNullOrWhiteSpace(r.SourceRef) ? null : r.SourceRef.Trim();

        if (r.DriverId == Guid.Empty)
            throw new InvalidOperationException("Falta el conductor que recibe el pago.");
        if (r.Amount <= 0 || r.Amount > 100000)
            throw new InvalidOperationException("El monto debe ser mayor a 0.");
        if (!Methods.Contains(method))
            throw new InvalidOperationException("Método no válido. Usa yape, plin, transferencia o efectivo.");
        if (method != "efectivo" && operation is null)
            throw new InvalidOperationException("Ingresa el número de operación del pago.");
        if (!SourceTypes.Contains(sourceType))
            throw new InvalidOperationException("Origen del pago no válido.");
        if (sourceType != "manual" && sourceRef is null)
            throw new InvalidOperationException("Falta el código del canje o del premio.");

        if (sourceRef is not null && await _payouts.ExistsBySourceAsync(sourceType, sourceRef, ct))
            throw new PayoutAlreadyRegisteredException("Ese canje o premio ya tiene un pago registrado.");

        // Sin fecha = ahora. La fecha llega en hora de Peru y ya viene en UTC (ver BugieTime).
        var paidAt = r.PaidAt is null ? DateTime.UtcNow : BugieTime.ToUtcFromInput(r.PaidAt.Value);
        if (paidAt > DateTime.UtcNow.AddMinutes(5))
            throw new InvalidOperationException("La fecha de pago no puede ser futura.");

        var w = Withdrawal.CreatePaid(
            r.DriverId, Trim(r.DriverName, 120), Math.Round(r.Amount, 2), method,
            Trim(r.AccountRef, 100), Trim(operation, 50), paidAt,
            cmd.AdminId, Trim(cmd.AdminName, 120), Trim(r.Note, 300),
            sourceType, Trim(sourceRef, 60));

        await _payouts.AddAsync(w, ct);
        // Aviso al conductor (push + correo). No bloquea ni falla el registro.
        _ = _notifier.NotifyAsync(w);
        return ToDto(w);
    }

    private static string? Trim(string? s, int max) =>
        string.IsNullOrWhiteSpace(s) ? null : (s.Trim().Length > max ? s.Trim()[..max] : s.Trim());

    internal static PayoutDto ToDto(Withdrawal w) => new(
        w.Id, w.DriverId, w.DriverName, w.Amount, w.Method, w.AccountRef, w.OperationNumber,
        w.PaidAt, w.PaidByAdminName, w.Note, w.SourceType, w.SourceRef, w.CreatedAt);
}

/// <summary>Reporte de pagos a conductores (filtros + totales).</summary>
public record GetPayoutsQuery(
    Guid?     DriverId,
    DateTime? From,
    DateTime? To,
    string?   Method,
    string?   SourceType,
    string?   Search,
    int       Page,
    int       PageSize) : IRequest<PayoutReportDto>;

public class GetPayoutsHandler : IRequestHandler<GetPayoutsQuery, PayoutReportDto>
{
    private readonly IWithdrawalRepository _payouts;
    public GetPayoutsHandler(IWithdrawalRepository payouts) => _payouts = payouts;

    public async Task<PayoutReportDto> Handle(GetPayoutsQuery q, CancellationToken ct)
    {
        var page     = Math.Max(1, q.Page);
        var pageSize = Math.Clamp(q.PageSize, 1, 1000);

        // Las fechas del filtro son dias de Peru: desde el inicio de "From"
        // hasta el final de "To".
        var filter = new PayoutFilter(
            q.DriverId,
            q.From is null ? null : BugieTime.PeruToUtc(q.From.Value.Date),
            q.To   is null ? null : BugieTime.PeruToUtc(q.To.Value.Date.AddDays(1)),
            q.Method, q.SourceType, q.Search);

        var (items, total) = await _payouts.GetPagedAsync(filter, page, pageSize, ct);
        var totals = await _payouts.GetTotalsAsync(filter, ct);

        return new PayoutReportDto(
            items.Select(RegisterPayoutHandler.ToDto).ToList(),
            total, page, pageSize,
            totals.Sum(t => t.Amount),
            totals.Select(t => new PayoutTotalDto(t.Method, t.Count, t.Amount)).ToList());
    }
}
