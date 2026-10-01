using Bugie.Auth.Domain.Entities;

namespace Bugie.Auth.Domain.Interfaces;

public interface IUserFcmTokenRepository
{
    /// <summary>
    /// Lista todos los tokens activos de un usuario (un usuario puede
    /// tener varios dispositivos).
    /// </summary>
    Task<List<UserFcmToken>> GetByUserIdAsync(Guid userId, CancellationToken ct = default);

    /// <summary>
    /// Busca un token por su valor exacto. Útil para hacer "upsert":
    /// si ya existe se actualiza el dueño, si no se crea.
    /// </summary>
    Task<UserFcmToken?> GetByTokenAsync(string token, CancellationToken ct = default);

    /// <summary>
    /// Lista tokens de varios usuarios a la vez. Esto lo usa el módulo
    /// Trips para mandar push a todos los conductores cercanos sin hacer
    /// N consultas separadas.
    /// </summary>
    Task<List<UserFcmToken>> GetByUserIdsAsync(IEnumerable<Guid> userIds, CancellationToken ct = default);

    Task AddAsync(UserFcmToken token, CancellationToken ct = default);
    Task UpdateAsync(UserFcmToken token, CancellationToken ct = default);
    Task DeleteByTokenAsync(string token, CancellationToken ct = default);

    /// <summary>
    /// Borra TODOS los tokens de un usuario. Lo usa el logout cuando se
    /// quiere cerrar sesión en todos los dispositivos.
    /// </summary>
    Task DeleteByUserIdAsync(Guid userId, CancellationToken ct = default);
}
