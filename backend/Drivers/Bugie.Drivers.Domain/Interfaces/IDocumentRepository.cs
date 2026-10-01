using Bugie.Drivers.Domain.Entities;

namespace Bugie.Drivers.Domain.Interfaces;

public interface IDocumentRepository
{
    Task<List<DriverDocument>> GetByDriverAsync(Guid driverId, CancellationToken ct = default);
    Task<List<DriverDocument>> GetActiveByDriverAsync(Guid driverId, CancellationToken ct = default);
    Task<DriverDocument?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<DriverDocument?> GetByDriverAndTypeAsync(Guid driverId, string docType, CancellationToken ct = default);
    Task<DriverDocument?> GetActiveByDriverAndTypeAsync(Guid driverId, string docType, CancellationToken ct = default);
    Task AddAsync(DriverDocument doc, CancellationToken ct = default);
    Task UpdateAsync(DriverDocument doc, CancellationToken ct = default);
    Task DeleteAsync(Guid id, CancellationToken ct = default);

    /// <summary>
    /// Busca documentos APROBADOS de conductores Approved que caducan en exactamente
    /// 6, 3 o 0 días (usado por el job de notificaciones).
    /// </summary>
    Task<List<ExpiringDocumentDto>> GetExpiringSoonAsync(CancellationToken ct = default);

    /// <summary>
    /// Busca documentos APROBADOS de conductores Approved que caducan en
    /// los próximos N días (incluye los ya vencidos). Usado por el panel admin
    /// y por el banner del conductor.
    /// </summary>
    Task<List<ExpiringDocumentDto>> GetExpiringWithinDaysAsync(int days, CancellationToken ct = default);

    /// <summary>
    /// Igual al anterior pero filtrado a un solo conductor.
    /// </summary>
    Task<List<ExpiringDocumentDto>> GetExpiringWithinDaysByDriverAsync(
        Guid driverId, int days, CancellationToken ct = default);
}

public record ExpiringDocumentDto(
    Guid DocumentId,
    Guid DriverId,
    Guid DriverUserId,
    string DocType,
    DateTime ExpiresAt,
    int DaysUntilExpiry);