namespace Bugie.Payments.Domain.Interfaces;

/// <summary>Nombres de usuarios (auth.users) para mostrarlos en el admin.</summary>
public interface IUserNames
{
    Task<Dictionary<Guid, string>> GetByIdsAsync(IEnumerable<Guid> ids, CancellationToken ct = default);
}
