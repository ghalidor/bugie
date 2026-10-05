using System.Data;
using System.Text.Json;
using Dapper;
using Bugie.Trips.Domain.Entities;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Infrastructure.Repositories;

/// <summary>
/// Rutas planificadas (trips.TripPlannedRoutes) y alertas de desvio
/// (trips.RouteDeviations). Las horas se ponen en SQL, en UTC.
/// </summary>
public class RouteDeviationRepository : IRouteDeviationRepository
{
    private const string NowUtc = "(NOW() AT TIME ZONE 'utc')";

    private readonly IDbConnection _db;
    public RouteDeviationRepository(IDbConnection db) => _db = db;

    // ── Ruta planificada ──────────────────────────────────────────────────

    // Fila tal cual viene de la base: Points es el JSON en texto.
    private class PlannedRouteRow
    {
        public Guid Id { get; set; }
        public Guid TripId { get; set; }
        public string Leg { get; set; } = "";
        public string Source { get; set; } = "";
        public string Points { get; set; } = "[]";
        public double? DistanceMeters { get; set; }
        public int OffRouteStreak { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public async Task<TripPlannedRoute?> GetPlannedRouteAsync(Guid tripId, string leg, CancellationToken ct = default)
    {
        var row = await _db.QueryFirstOrDefaultAsync<PlannedRouteRow>(@"
            SELECT Id, TripId, Leg, Source, Points::text AS Points, DistanceMeters,
                   OffRouteStreak, CreatedAt
            FROM trips.TripPlannedRoutes
            WHERE TripId = @TripId AND Leg = @Leg",
            new { TripId = tripId, Leg = leg });
        if(row is null) return null;
        return new TripPlannedRoute
        {
            Id = row.Id,
            TripId = row.TripId,
            Leg = row.Leg,
            Source = row.Source,
            Points = JsonSerializer.Deserialize<List<double[]>>(row.Points) ?? new(),
            DistanceMeters = row.DistanceMeters,
            OffRouteStreak = row.OffRouteStreak,
            CreatedAt = row.CreatedAt,
        };
    }

    public Task SavePlannedRouteAsync(TripPlannedRoute route, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            INSERT INTO trips.TripPlannedRoutes
                (Id, TripId, Leg, Source, Points, DistanceMeters, OffRouteStreak)
            VALUES
                (@Id, @TripId, @Leg, @Source, CAST(@Points AS jsonb), @DistanceMeters, 0)
            ON CONFLICT (TripId, Leg) DO NOTHING",
            new
            {
                route.Id,
                route.TripId,
                route.Leg,
                route.Source,
                Points = JsonSerializer.Serialize(route.Points),
                route.DistanceMeters,
            });

    public Task SetOffRouteStreakAsync(Guid routeId, int streak, CancellationToken ct = default) =>
        _db.ExecuteAsync(
            "UPDATE trips.TripPlannedRoutes SET OffRouteStreak = @Streak WHERE Id = @Id",
            new { Id = routeId, Streak = streak });

    // ── Alertas ───────────────────────────────────────────────────────────

    public Task<RouteDeviation?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        _db.QueryFirstOrDefaultAsync<RouteDeviation>(
            "SELECT * FROM trips.RouteDeviations WHERE Id = @Id", new { Id = id });

    public Task<RouteDeviation?> GetOpenByTripAsync(Guid tripId, CancellationToken ct = default) =>
        _db.QueryFirstOrDefaultAsync<RouteDeviation>(
            "SELECT * FROM trips.RouteDeviations WHERE TripId = @TripId AND Status = 'open'",
            new { TripId = tripId });

    public async Task<bool> AddAsync(RouteDeviation d, CancellationToken ct = default)
    {
        // ON CONFLICT con el indice unico parcial (una abierta por viaje).
        var startedAt = await _db.QueryFirstOrDefaultAsync<DateTime?>($@"
            INSERT INTO trips.RouteDeviations
                (Id, TripId, DriverId, Leg, Lat, Lng, DistanceM, MaxDistanceM, Status, StartedAt)
            VALUES
                (@Id, @TripId, @DriverId, @Leg, @Lat, @Lng, @DistanceM, @MaxDistanceM, 'open', {NowUtc})
            ON CONFLICT (TripId) WHERE Status = 'open' DO NOTHING
            RETURNING StartedAt",
            d);
        if(startedAt is null) return false;
        d.StartedAt = startedAt.Value;
        d.Status = RouteDeviation.StatusOpen;
        return true;
    }

    public Task UpdateMaxDistanceAsync(Guid id, double distanceM, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE trips.RouteDeviations
            SET MaxDistanceM = GREATEST(MaxDistanceM, @DistanceM)
            WHERE Id = @Id",
            new { Id = id, DistanceM = distanceM });

    public Task CloseAsync(Guid id, string reason, CancellationToken ct = default) =>
        _db.ExecuteAsync($@"
            UPDATE trips.RouteDeviations
            SET Status = 'closed', CloseReason = @Reason, EndedAt = {NowUtc}
            WHERE Id = @Id AND Status = 'open'",
            new { Id = id, Reason = reason });

    public async Task<List<RouteDeviation>> CloseOpenForEndedTripsAsync(Guid driverUserId, CancellationToken ct = default)
    {
        // Viaje ya no en curso: completado, cancelado o (raro) volvio a otro estado.
        var rows = await _db.QueryAsync<RouteDeviation>($@"
            UPDATE trips.RouteDeviations d
            SET Status = 'closed', CloseReason = 'trip_ended', EndedAt = {NowUtc}
            FROM trips.Trips t
            WHERE d.DriverId = @DriverId AND d.Status = 'open'
              AND t.Id = d.TripId AND t.Status NOT IN (3, 6)
            RETURNING d.*",
            new { DriverId = driverUserId });
        return rows.ToList();
    }

    public async Task<bool> ReviewAsync(Guid id, Guid adminUserId, string note, CancellationToken ct = default)
    {
        var n = await _db.ExecuteAsync($@"
            UPDATE trips.RouteDeviations
            SET ReviewedBy = @AdminId, ReviewedAt = {NowUtc}, ReviewNote = @Note
            WHERE Id = @Id AND ReviewedAt IS NULL",
            new { Id = id, AdminId = adminUserId, Note = note });
        return n > 0;
    }

    public async Task<List<RouteDeviation>> GetActiveAsync(CancellationToken ct = default)
    {
        // Sin revisar y (siguen abiertas o su viaje sigue activo).
        var rows = await _db.QueryAsync<RouteDeviation>(@"
            SELECT d.*
            FROM trips.RouteDeviations d
            JOIN trips.Trips t ON t.Id = d.TripId
            WHERE d.ReviewedAt IS NULL
              AND (d.Status = 'open' OR t.Status IN (2, 3, 6))
            ORDER BY d.StartedAt DESC
            LIMIT 200");
        return rows.ToList();
    }

    public async Task<List<RouteDeviation>> GetByTripAsync(Guid tripId, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<RouteDeviation>(
            "SELECT * FROM trips.RouteDeviations WHERE TripId = @TripId ORDER BY StartedAt ASC",
            new { TripId = tripId });
        return rows.ToList();
    }
}
