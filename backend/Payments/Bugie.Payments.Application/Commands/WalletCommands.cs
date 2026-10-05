using MediatR;
using Bugie.Payments.Application.DTOs;
using Bugie.Payments.Domain.Common;
using Bugie.Payments.Domain.Entities;
using Bugie.Payments.Domain.Interfaces;

namespace Bugie.Payments.Application.Commands;

// =====================================================================
// Billetera del conductor.
// El conductor cobra todo en mano; Bugie cobra una comision por viaje que
// el conductor le debe. Aqui se consulta esa deuda y el admin registra
// los pagos de comision que recibe.
// =====================================================================

/// <summary>Billetera de un conductor con sus ultimos movimientos.</summary>
public record GetDriverWalletQuery(Guid DriverId, int Page, int PageSize) : IRequest<DriverWalletDto>;

public class GetDriverWalletHandler : IRequestHandler<GetDriverWalletQuery, DriverWalletDto>
{
    private readonly IWalletRepository      _wallets;
    private readonly IPlatformFeeRepository _fees;
    private readonly IUserNames             _names;
    public GetDriverWalletHandler(IWalletRepository wallets, IPlatformFeeRepository fees, IUserNames names)
        => (_wallets, _fees, _names) = (wallets, fees, names);

    public async Task<DriverWalletDto> Handle(GetDriverWalletQuery q, CancellationToken ct)
    {
        var page     = Math.Max(1, q.Page);
        var pageSize = Math.Clamp(q.PageSize, 1, 100);

        // Sin viajes todavia = billetera en cero
        var wallet = await _wallets.GetByDriverAsync(q.DriverId, ct) ?? DriverWallet.Empty(q.DriverId);
        var (items, total) = await _wallets.GetTransactionsAsync(q.DriverId, page, pageSize, ct);
        var names = await _names.GetByIdsAsync([q.DriverId], ct);

        return new DriverWalletDto(
            ToSummary(wallet, names.GetValueOrDefault(q.DriverId)),
            await _fees.GetFeePercentAsync(ct),
            items.Select(ToMovement).ToList(),
            total, page, pageSize);
    }

    internal static WalletSummaryDto ToSummary(DriverWallet w, string? name) => new(
        w.DriverId, name, w.TotalEarned, w.TotalCommission, w.TotalCommissionPaid,
        w.PendingDebt, w.Balance, w.UpdatedAt);

    internal static WalletMovementDto ToMovement(WalletTransaction t) => new(
        t.Id, t.Type, t.Amount, t.BalanceAfter, t.TripId, t.TripAmount, t.Method,
        t.OperationNumber, t.Note, t.PaidAt, t.AdminName, t.CreatedAt);
}

/// <summary>Admin: billeteras de conductores, de la mayor deuda a la menor.</summary>
public record GetWalletsQuery(string? Search, bool OnlyDebt, int Page, int PageSize) : IRequest<WalletsReportDto>;

public class GetWalletsHandler : IRequestHandler<GetWalletsQuery, WalletsReportDto>
{
    private readonly IWalletRepository _wallets;
    public GetWalletsHandler(IWalletRepository wallets) => _wallets = wallets;

    public async Task<WalletsReportDto> Handle(GetWalletsQuery q, CancellationToken ct)
    {
        var page     = Math.Max(1, q.Page);
        var pageSize = Math.Clamp(q.PageSize, 1, 100);
        var (items, total, totalDebt, withDebt) =
            await _wallets.GetWalletsAsync(q.Search, q.OnlyDebt, page, pageSize, ct);

        return new WalletsReportDto(
            items.Select(w => new WalletSummaryDto(
                w.DriverId, w.DriverName, w.TotalEarned, w.TotalCommission, w.TotalCommissionPaid,
                w.Balance < 0 ? -w.Balance : 0, w.Balance, w.UpdatedAt)).ToList(),
            total, page, pageSize, totalDebt, withDebt);
    }
}

/// <summary>El admin registra un pago de comision que le hizo el conductor.</summary>
public record RegisterCommissionPaymentCommand(
    RegisterCommissionPaymentRequest Request, Guid AdminId, string? AdminName) : IRequest<CommissionPaymentDto>;

public class RegisterCommissionPaymentHandler : IRequestHandler<RegisterCommissionPaymentCommand, CommissionPaymentDto>
{
    private readonly IWalletRepository _wallets;
    private readonly IUserNames        _names;
    public RegisterCommissionPaymentHandler(IWalletRepository wallets, IUserNames names)
        => (_wallets, _names) = (wallets, names);

    public async Task<CommissionPaymentDto> Handle(RegisterCommissionPaymentCommand cmd, CancellationToken ct)
    {
        var r         = cmd.Request;
        var method    = (r.Method ?? "").Trim().ToLowerInvariant();
        var operation = string.IsNullOrWhiteSpace(r.OperationNumber) ? null : r.OperationNumber.Trim();
        var amount    = Math.Round(r.Amount, 2);

        if (r.DriverId == Guid.Empty)
            throw new InvalidOperationException("Falta el conductor que hizo el pago.");
        if (amount <= 0)
            throw new InvalidOperationException("El monto debe ser mayor a 0.");
        // Mismos metodos que los pagos de Bugie: yape, plin, transferencia, efectivo
        if (!RegisterPayoutHandler.Methods.Contains(method))
            throw new InvalidOperationException("Método no válido. Usa yape, plin, transferencia o efectivo.");
        if (method != "efectivo" && operation is null)
            throw new InvalidOperationException("Ingresa el número de operación del pago.");

        // No se acepta mas de lo que debe: evita errores de tipeo (un 0 de mas).
        var wallet = await _wallets.GetByDriverAsync(r.DriverId, ct);
        var debt   = wallet?.PendingDebt ?? 0;
        if (debt <= 0)
            throw new InvalidOperationException("Este conductor no tiene comisión pendiente.");
        if (amount > debt)
            throw new InvalidOperationException(
                $"El monto (S/ {amount.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture)}) supera la deuda actual del conductor " +
                $"(S/ {debt.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture)}). Puedes registrar un pago parcial, pero no mayor a la deuda.");

        // Sin fecha = ahora. La fecha llega en hora de Peru (ver BugieTime).
        var paidAt = r.PaidAt is null ? DateTime.UtcNow : BugieTime.ToUtcFromInput(r.PaidAt.Value);
        if (paidAt > DateTime.UtcNow.AddMinutes(5))
            throw new InvalidOperationException("La fecha de pago no puede ser futura.");

        var tx = WalletTransaction.CommissionPayment(
            r.DriverId, amount, method, Trim(operation, 50), Trim(r.Note, 300),
            paidAt, cmd.AdminId, Trim(cmd.AdminName, 120));
        await _wallets.AddCommissionPaymentAsync(tx, ct);

        var names = await _names.GetByIdsAsync([r.DriverId], ct);
        return new CommissionPaymentDto(
            tx.Id, tx.DriverId, names.GetValueOrDefault(r.DriverId), tx.Amount, tx.BalanceAfter,
            tx.Method, tx.OperationNumber, tx.Note, tx.PaidAt, tx.AdminName, tx.CreatedAt);
    }

    private static string? Trim(string? s, int max) =>
        string.IsNullOrWhiteSpace(s) ? null : (s.Trim().Length > max ? s.Trim()[..max] : s.Trim());
}

/// <summary>Admin: pagos de comision recibidos (todos o de un conductor).</summary>
public record GetCommissionPaymentsQuery(Guid? DriverId, int Page, int PageSize) : IRequest<CommissionPaymentsReportDto>;

public class GetCommissionPaymentsHandler : IRequestHandler<GetCommissionPaymentsQuery, CommissionPaymentsReportDto>
{
    private readonly IWalletRepository _wallets;
    public GetCommissionPaymentsHandler(IWalletRepository wallets) => _wallets = wallets;

    public async Task<CommissionPaymentsReportDto> Handle(GetCommissionPaymentsQuery q, CancellationToken ct)
    {
        var page     = Math.Max(1, q.Page);
        var pageSize = Math.Clamp(q.PageSize, 1, 1000);
        var (items, total, totalAmount) = await _wallets.GetCommissionPaymentsAsync(q.DriverId, page, pageSize, ct);

        return new CommissionPaymentsReportDto(
            items.Select(p => new CommissionPaymentDto(
                p.Id, p.DriverId, p.DriverName, p.Amount, p.BalanceAfter, p.Method,
                p.OperationNumber, p.Note, p.PaidAt, p.AdminName, p.CreatedAt)).ToList(),
            total, page, pageSize, totalAmount);
    }
}
