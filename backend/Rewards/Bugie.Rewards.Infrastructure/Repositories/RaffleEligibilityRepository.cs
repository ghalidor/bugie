using System.Data;
using Dapper;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Infrastructure.Repositories;

/// <summary>
/// Quiénes pueden participar en un sorteo.
///
/// Devuelve, de una sola consulta, el perfil con su nivel y cuántos puntos
/// ganó en el mes. Lo segundo hace falta para los tickets extra por puntos
/// acumulados, y pedirlo usuario por usuario sería una consulta por persona.
/// </summary>
public class RaffleEligibilityRepository : IRaffleEligibilityRepository
{
    private readonly IDbConnection _db;
    public RaffleEligibilityRepository(IDbConnection db) => _db = db;

    public async Task<List<RaffleCandidate>> GetCandidatesAsync(
        string targetUserType, DateTime monthStartUtc, CancellationToken ct = default)
    {
        // 'both' no filtra por tipo de usuario.
        var filtro = targetUserType is "passenger" or "driver"
            ? "WHERE p.UserType = @UserType"
            : "";

        var rows = await _db.QueryAsync<RaffleCandidate>($@"
            SELECT p.UserId,
                   p.Id         AS ProfileId,
                   p.UserType,
                   p.CurrentLevel,
                   p.CreatedAt  AS ProfileCreatedAt,
                   COALESCE(m.Puntos, 0) AS PointsEarnedThisMonth
            FROM rewards.PointsProfiles p
            LEFT JOIN (
                SELECT ProfileId, SUM(Points) AS Puntos
                FROM rewards.PointsTransactions
                WHERE Type = 'earn' AND CreatedAt >= @MonthStart
                GROUP BY ProfileId
            ) m ON m.ProfileId = p.Id
            {filtro}",
            new { UserType = targetUserType, MonthStart = monthStartUtc });

        return rows.ToList();
    }
}
