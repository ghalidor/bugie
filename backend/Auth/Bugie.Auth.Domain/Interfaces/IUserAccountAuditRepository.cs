using Bugie.Auth.Domain.Entities;

namespace Bugie.Auth.Domain.Interfaces;

public interface IUserAccountAuditRepository
{
    Task AddAsync(UserAccountAudit audit, CancellationToken ct = default);

    /// <summary>Historial de la cuenta, el más reciente primero.</summary>
    Task<List<UserAccountAudit>> GetByUserAsync(Guid userId, CancellationToken ct = default);
}
