using Bugie.Payments.Domain.Entities;

namespace Bugie.Payments.Domain.Interfaces;

public interface IPaymentRepository {
    Task<Payment?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<Payment?> GetByTripIdAsync(Guid tripId, CancellationToken ct = default);
    Task<List<Payment>> GetByDriverAsync(Guid driverId, CancellationToken ct = default);
    Task<List<Payment>> GetByPassengerAsync(Guid passengerId, CancellationToken ct = default);

    /// <summary>
    /// Lista paginada con filtros opcionales.
    /// - status: 'pending' | 'completed' | 'refunded' | 'failed' | null (todos).
    /// - search: nombre, correo o documento del pasajero o del conductor, referencia o Id del viaje.
    /// - method: 'cash' | 'yape' | 'plin' | null (todos).
    /// - fromUtc / toUtc: rango de CreatedAt en UTC (toUtc excluyente).
    /// </summary>
    Task<(List<Payment> Items, int Total)> GetPagedAsync(
        int page, int pageSize, string? status,
        CancellationToken ct = default,
        string? search = null, string? method = null, DateTime? fromUtc = null, DateTime? toUtc = null);

    /// <summary>
    /// KPIs de pagos. Una sola query SQL eficiente.
    /// - Total recaudado: suma de Amount de completados.
    /// - Comisión Bugie: suma de PlatformFee de completados.
    /// - A conductores: suma de DriverAmount de completados.
    /// - Pendientes: cantidad con status='pending'.
    /// </summary>
    Task<(decimal TotalAmount, decimal TotalFee, decimal TotalDriver, int PendingCount, int CompletedCount)>
        GetStatsAsync(string? status, CancellationToken ct = default,
            string? search = null, string? method = null, DateTime? fromUtc = null, DateTime? toUtc = null);
    Task AddAsync(Payment payment, CancellationToken ct = default);
    Task UpdateAsync(Payment payment, CancellationToken ct = default);
}
