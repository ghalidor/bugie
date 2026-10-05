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
    private readonly IPayoutCodeClient     _codes;
    public RegisterPayoutHandler(IWithdrawalRepository payouts, IPayoutNotifier notifier, IPayoutCodeClient codes)
        => (_payouts, _notifier, _codes) = (payouts, notifier, codes);

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

        if (sourceType == "manual")
        {
            // Pago sin código (bono especial): el motivo es obligatorio y se genera
            // un comprobante propio PAG-2026-000123 que ve el conductor.
            if (string.IsNullOrWhiteSpace(r.Note))
                throw new InvalidOperationException("En un pago manual escribe el motivo en la nota.");
            sourceRef = await _payouts.NextReceiptCodeAsync(BugieTime.ToPeru(DateTime.UtcNow).Year, ct);
        }
        else
        {
            // Con código: tiene que existir en Rewards, ser de este conductor y estar sin pagar.
            var info = await _codes.LookupAsync(sourceRef!, ct)
                ?? throw new InvalidOperationException($"No existe ningún canje ni premio con el código {sourceRef}.");
            if (info.Kind != sourceType)
                throw new InvalidOperationException("El código no corresponde al origen del pago.");
            if (info.UserId != r.DriverId)
                throw new InvalidOperationException("El código es de otro usuario.");

            var refs = new List<string> { info.Code, sourceRef! };
            if (info.WinnerId is not null) refs.Add(info.WinnerId.Value.ToString());
            if (await _payouts.GetBySourceAsync(sourceType, refs, ct) is not null)
                throw new PayoutAlreadyRegisteredException("Ese canje o premio ya tiene un pago registrado.");
            if (!info.Payable)
                throw new InvalidOperationException(info.Reason ?? "Este código no se puede pagar.");
            sourceRef = info.Code;   // siempre se guarda el código legible (BG-... / PZ-...)
        }

        // Sin fecha = ahora. La fecha llega en hora de Peru y ya viene en UTC (ver BugieTime).
        var paidAt = r.PaidAt is null ? DateTime.UtcNow : BugieTime.ToUtcFromInput(r.PaidAt.Value);
        if (paidAt > DateTime.UtcNow.AddMinutes(5))
            throw new InvalidOperationException("La fecha de pago no puede ser futura.");

        var w = Withdrawal.CreatePaid(
            r.DriverId, Trim(r.DriverName, 120), Math.Round(r.Amount, 2), method,
            Trim(r.AccountRef, 100), Trim(operation, 50), paidAt,
            cmd.AdminId, Trim(cmd.AdminName, 120), Trim(r.Note, 300),
            sourceType, Trim(sourceRef, 60));

        try { await _payouts.AddAsync(w, ct); }
        catch (Exception ex) when (ex.Message.Contains("uq_wd_source"))
        {
            // Dos registros al mismo tiempo: la base deja pasar solo uno.
            throw new PayoutAlreadyRegisteredException("Ese canje o premio ya tiene un pago registrado.");
        }
        // Aviso al conductor (push + correo). No bloquea ni falla el registro.
        _ = _notifier.NotifyAsync(w);
        return ToDto(w);
    }

    private static string? Trim(string? s, int max) =>
        string.IsNullOrWhiteSpace(s) ? null : (s.Trim().Length > max ? s.Trim()[..max] : s.Trim());

    internal static PayoutDto ToDto(Withdrawal w) => new(
        w.Id, w.DriverId, w.DriverName, w.Amount, w.Method, w.AccountRef, w.OperationNumber,
        w.PaidAt, w.PaidByAdminName, w.Note, w.SourceType, w.SourceRef, w.CreatedAt,
        // Codigo visible (BG-..., PZ-..., PAG-...). Los pagos antiguos de premios guardaban un id.
        w.SourceRef is null || Guid.TryParse(w.SourceRef, out _) ? null : w.SourceRef);
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
