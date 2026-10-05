using Bugie.Auth.Domain.Entities;

namespace Bugie.Auth.Domain.Interfaces;

public interface IPassengerDocumentRepository {
    Task<List<PassengerDocument>> GetByUserAsync(Guid userId, CancellationToken ct = default);
    Task<PassengerDocument?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<PassengerDocument?> GetByUserAndTypeAsync(Guid userId, string docType, CancellationToken ct = default);
    Task AddAsync(PassengerDocument doc, CancellationToken ct = default);
    Task UpdateAsync(PassengerDocument doc, CancellationToken ct = default);
    Task DeleteAsync(Guid id, CancellationToken ct = default);

    /// <summary>
    /// Pasajeros sin verificar y no eliminados, con el DNI completo (frente y
    /// reverso), foto de perfil y al menos un lado esperando revisión.
    /// Es lo que el admin debe aprobar.
    /// </summary>
    Task<int> CountPassengersPendingReviewAsync(CancellationToken ct = default);
}