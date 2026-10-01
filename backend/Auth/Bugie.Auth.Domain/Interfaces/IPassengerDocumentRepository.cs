using Bugie.Auth.Domain.Entities;

namespace Bugie.Auth.Domain.Interfaces;

public interface IPassengerDocumentRepository {
    Task<List<PassengerDocument>> GetByUserAsync(Guid userId, CancellationToken ct = default);
    Task<PassengerDocument?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<PassengerDocument?> GetByUserAndTypeAsync(Guid userId, string docType, CancellationToken ct = default);
    Task AddAsync(PassengerDocument doc, CancellationToken ct = default);
    Task UpdateAsync(PassengerDocument doc, CancellationToken ct = default);
    Task DeleteAsync(Guid id, CancellationToken ct = default);
}