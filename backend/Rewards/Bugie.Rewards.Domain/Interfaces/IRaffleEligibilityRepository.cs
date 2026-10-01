using Bugie.Rewards.Domain.Entities;

namespace Bugie.Rewards.Domain.Interfaces;

/// <summary>
/// Datos de un participante para repartir tickets.
///
/// Con propiedades y no como record posicional: lo materializa Dapper.
/// </summary>
public class RaffleCandidate
{
    public Guid     UserId                { get; set; }
    public Guid     ProfileId             { get; set; }
    public string   UserType              { get; set; } = string.Empty;
    public string   CurrentLevel          { get; set; } = string.Empty;
    public DateTime ProfileCreatedAt      { get; set; }
    public int      PointsEarnedThisMonth { get; set; }
}

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
