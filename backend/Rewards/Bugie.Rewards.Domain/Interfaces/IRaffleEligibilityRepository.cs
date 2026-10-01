using Bugie.Rewards.Domain.Entities;

namespace Bugie.Rewards.Domain.Interfaces;

/// <summary>Datos de un participante para repartir tickets.</summary>
public record RaffleCandidate(
    Guid     UserId,
    Guid     ProfileId,
    string   UserType,
    string   CurrentLevel,
    DateTime ProfileCreatedAt,
    int      PointsEarnedThisMonth);

public interface IRaffleEligibilityRepository
{
    /// <summary>
    /// Perfiles que pueden participar en un sorteo, ya filtrados por tipo de
    /// usuario. El nivel y la antigüedad se evalúan en el repartidor, que es
    /// donde están las reglas.
    /// </summary>
    Task<List<RaffleCandidate>> GetCandidatesAsync(
        string targetUserType, DateTime monthStartUtc, CancellationToken ct = default);
}
