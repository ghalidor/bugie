using Bugie.Rewards.Domain.Constants;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Application.Commands;

/// <summary>
/// Obtiene el perfil de puntos de un usuario y lo crea si todavía no existe.
/// </summary>
public static class PointsProfileLookup
{
    /// <summary>
    /// Cuando se sabe el tipo (p. ej. el viaje dice si es pasajero o conductor).
    /// </summary>
    public static async Task<PointsProfile> GetOrCreateAsync(
        IPointsProfileRepository profiles, Guid userId, string userType, CancellationToken ct)
    {
        return await profiles.GetByUserIdAsync(userId, ct)
            ?? await profiles.GetOrAddAsync(PointsProfile.Create(userId, userType), ct);
    }

    /// <summary>
    /// Cuando no se sabe el tipo (referidos, ajustes del admin, cupones): se
    /// toma del rol real de la cuenta. Antes se asumía pasajero y un conductor
    /// que ganaba puntos antes de su primer viaje quedaba como pasajero.
    /// </summary>
    public static async Task<PointsProfile> GetOrCreateAsync(
        IPointsProfileRepository profiles, IUserDirectory users, Guid userId, CancellationToken ct)
    {
        var profile = await profiles.GetByUserIdAsync(userId, ct);
        if (profile is not null) return profile;

        var dir  = await users.GetByIdsAsync(new[] { userId }, ct);
        var tipo = UserTypes.FromRole(dir.TryGetValue(userId, out var u) ? u.Role : null);

        return await profiles.GetOrAddAsync(PointsProfile.Create(userId, tipo), ct);
    }
}
