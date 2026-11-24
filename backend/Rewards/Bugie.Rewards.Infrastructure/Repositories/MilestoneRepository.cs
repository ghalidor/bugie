using System.Data;
using System.Globalization;
using Dapper;
using Bugie.Rewards.Domain.Common;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Infrastructure.Repositories;

public class MilestoneRepository : IMilestoneRepository
{
    private readonly IDbConnection _db;
    public MilestoneRepository(IDbConnection db) => _db = db;

    public async Task<bool> RecordTripAsync(
        Guid userId, Guid tripId, string userType, DateTime completedAtUtc,
        CancellationToken ct = default)
    {
        var inserted = await _db.ExecuteAsync(@"
            INSERT INTO rewards.TripActivity (UserId, TripId, UserType, CompletedAt, CreatedAt)
            VALUES (@UserId, @TripId, @UserType, @CompletedAt, now())
            ON CONFLICT (UserId, TripId) DO NOTHING",
            new { UserId = userId, TripId = tripId, UserType = userType, CompletedAt = completedAtUtc });
        return inserted > 0;
    }

    /// <summary>
    /// El día se calcula en SQL en hora de Perú (AT TIME ZONE) y vuelve como
    /// texto 'yyyy-MM-dd': así no pasa por la conversión de fechas de Dapper,
    /// que trata toda fecha de la base como UTC.
    /// </summary>
    public async Task<List<DateTime>> GetTripDaysAsync(
        Guid userId, DateTime untilLocalDay, int maxDays, CancellationToken ct = default)
    {
        var hastaUtc = BugieTime.PeruToUtc(untilLocalDay.Date.AddDays(1));

        var rows = await _db.QueryAsync<string>(@"
            SELECT to_char(d.Dia, 'YYYY-MM-DD')
            FROM (
                SELECT DISTINCT (CompletedAt AT TIME ZONE @Zone)::date AS Dia
                FROM rewards.TripActivity
                WHERE UserId = @UserId
                  AND CompletedAt < @Hasta
            ) d
            ORDER BY d.Dia DESC
            LIMIT @Max",
            new { UserId = userId, Hasta = hastaUtc, Zone = BugieTime.ZoneId, Max = Math.Max(1, maxDays) });

        return rows
            .Select(s => DateTime.ParseExact(s, "yyyy-MM-dd", CultureInfo.InvariantCulture))
            .ToList();
    }

    public Task<int> CountUserTripsAsync(
        Guid userId, DateTime fromUtc, DateTime toUtc, CancellationToken ct = default) =>
        _db.ExecuteScalarAsync<int>(@"
            SELECT COUNT(*) FROM rewards.TripActivity
            WHERE UserId       = @UserId
              AND CompletedAt >= @From
              AND CompletedAt  < @To",
            new { UserId = userId, From = fromUtc, To = toUtc });

    public Task<bool> HasOtherTripInRangeAsync(
        Guid userId, DateTime fromUtc, DateTime toUtc, Guid excludeTripId,
        CancellationToken ct = default) =>
        _db.ExecuteScalarAsync<bool>(@"
            SELECT EXISTS (
                SELECT 1 FROM rewards.TripActivity
                WHERE UserId       = @UserId
                  AND TripId      <> @ExcludeTripId
                  AND CompletedAt >= @From
                  AND CompletedAt  < @To)",
            new { UserId = userId, ExcludeTripId = excludeTripId, From = fromUtc, To = toUtc });

    public async Task<List<MilestoneAward>> GetRecentAsync(
        Guid profileId, int take, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<MilestoneAward>(@"
            SELECT * FROM rewards.MilestoneAwards
            WHERE ProfileId = @ProfileId
            ORDER BY CreatedAt DESC
            LIMIT @Take",
            new { ProfileId = profileId, Take = take });
        return rows.ToList();
    }

    public async Task<DateTime?> GetLastNoCancelDayAsync(CancellationToken ct = default)
    {
        var s = await _db.ExecuteScalarAsync<string?>(
            "SELECT to_char(MAX(Day), 'YYYY-MM-DD') FROM rewards.NoCancellationRuns");
        return s is null
            ? null
            : DateTime.ParseExact(s, "yyyy-MM-dd", CultureInfo.InvariantCulture);
    }

    public Task MarkNoCancelDayAsync(
        DateTime localDay, int driversChecked, int awarded, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            INSERT INTO rewards.NoCancellationRuns (Day, DriversChecked, Awarded, ProcessedAt)
            VALUES (CAST(@Day AS date), @Checked, @Awarded, now())
            ON CONFLICT (Day) DO UPDATE SET
                DriversChecked = EXCLUDED.DriversChecked,
                Awarded        = rewards.NoCancellationRuns.Awarded + EXCLUDED.Awarded,
                ProcessedAt    = now()",
            new
            {
                Day     = localDay.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                Checked = driversChecked,
                Awarded = awarded,
            });
}
