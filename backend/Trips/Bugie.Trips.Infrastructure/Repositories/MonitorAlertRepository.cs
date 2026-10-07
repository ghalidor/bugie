using System.Data;
using Dapper;
using Bugie.Trips.Domain.Entities;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Infrastructure.Repositories;

/// <summary>
/// Alertas de monitoreo (trips.MonitorAlerts). Las horas se ponen en SQL, en UTC.
/// Nombres de conductor, pasajero y admin salen de auth.Users (misma base).
/// </summary>
public class MonitorAlertRepository : IMonitorAlertRepository
{
    private const string NowUtc = "(NOW() AT TIME ZONE 'utc')";

    private readonly IDbConnection _db;
    public MonitorAlertRepository(IDbConnection db) => _db = db;

    public async Task<List<MonitorTripSnapshot>> GetMonitoredTripsAsync(CancellationToken ct = default)
    {
        // Viajes con conductor en 2 (aceptado), 3 (en curso) o 6 (SOS). Un
        // programado aceptado solo cuenta cuando "llega su momento" (mismo
        // criterio que el viaje activo del conductor en TripRepository).
        var rows = await _db.QueryAsync<MonitorTripSnapshot>($@"
            SELECT
                t.Id                 AS TripId,
                t.DriverId           AS DriverId,
                t.PassengerId        AS PassengerId,
                t.Status             AS Status,
                t.ServiceType        AS ServiceType,
                t.CreatedAt          AS CreatedAt,
                t.AcceptedAt         AS AcceptedAt,
                t.StartedAt          AS StartedAt,
                t.ScheduledAt        AS ScheduledAt,
                t.OriginLat          AS OriginLat,
                t.OriginLng          AS OriginLng,
                t.DestLat            AS DestLat,
                t.DestLng            AS DestLng,
                t.DistanceKm         AS DistanceKm,
                ud.FullName          AS DriverName,
                d.CurrentLat         AS DriverLat,
                d.CurrentLng         AS DriverLng,
                d.CurrentLocationAt  AS DriverLocationAt,
                pr.DistanceMeters    AS PlannedDistanceM
            FROM trips.Trips t
            LEFT JOIN drivers.Drivers d          ON d.UserId = t.DriverId
            LEFT JOIN auth.Users ud              ON ud.Id = t.DriverId
            LEFT JOIN trips.TripPlannedRoutes pr ON pr.TripId = t.Id AND pr.Leg = 'trip'
            WHERE t.DriverId IS NOT NULL
              AND t.Status IN (2, 3, 6)
              AND (t.ScheduledAt IS NULL OR t.Status IN (3, 6) OR t.DriverArrivedAt IS NOT NULL
                   OR t.ScheduledAt <= {NowUtc} + interval '30 minutes')
            LIMIT 2000");
        return rows.ToList();
    }

    public async Task<List<MonitorAlert>> GetOpenAsync(CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<MonitorAlert>(@"
            SELECT Id, TripId, DriverId, Type, StartedAt, LastSeenAt, ResolvedAt,
                   ReviewedAt, ReviewedBy, ReviewNote, Details::text AS Details
            FROM trips.MonitorAlerts
            WHERE ResolvedAt IS NULL");
        return rows.ToList();
    }

    public Task<MonitorAlert?> OpenAsync(Guid tripId, Guid driverId, string type, string detailsJson,
                                         CancellationToken ct = default) =>
        // ON CONFLICT con el indice unico parcial (una abierta por viaje y tipo).
        _db.QueryFirstOrDefaultAsync<MonitorAlert>($@"
            INSERT INTO trips.MonitorAlerts
                (Id, TripId, DriverId, Type, StartedAt, LastSeenAt, Details)
            VALUES
                (gen_random_uuid(), @TripId, @DriverId, @Type, {NowUtc}, {NowUtc}, CAST(@Details AS jsonb))
            ON CONFLICT (TripId, Type) WHERE ResolvedAt IS NULL DO NOTHING
            RETURNING Id, TripId, DriverId, Type, StartedAt, LastSeenAt, ResolvedAt,
                      ReviewedAt, ReviewedBy, ReviewNote, Details::text AS Details",
            new { TripId = tripId, DriverId = driverId, Type = type, Details = detailsJson });

    public Task TouchAsync(Guid id, string detailsJson, CancellationToken ct = default) =>
        _db.ExecuteAsync($@"
            UPDATE trips.MonitorAlerts
            SET LastSeenAt = {NowUtc}, Details = CAST(@Details AS jsonb)
            WHERE Id = @Id AND ResolvedAt IS NULL",
            new { Id = id, Details = detailsJson });

    public async Task<bool> ResolveAsync(Guid id, CancellationToken ct = default) =>
        await _db.ExecuteAsync($@"
            UPDATE trips.MonitorAlerts
            SET ResolvedAt = {NowUtc}
            WHERE Id = @Id AND ResolvedAt IS NULL",
            new { Id = id }) > 0;

    public async Task<(List<MonitorAlertListItem> Items, int Total)> GetPageAsync(
        bool openOnly, int page, int pageSize, CancellationToken ct = default)
    {
        var where = openOnly ? "WHERE a.ResolvedAt IS NULL" : "";
        var p = new { Take = pageSize, Skip = (page - 1) * pageSize };

        var total = await _db.ExecuteScalarAsync<int>(
            $"SELECT COUNT(*) FROM trips.MonitorAlerts a {where}");

        var rows = await _db.QueryAsync<MonitorAlertListItem>($@"
            SELECT
                a.Id, a.TripId, a.DriverId,
                ud.FullName  AS DriverName,
                up.FullName  AS PassengerName,
                a.Type, a.StartedAt, a.LastSeenAt, a.ResolvedAt, a.ReviewedAt,
                ur.FullName  AS ReviewedByName,
                a.ReviewNote,
                CASE WHEN jsonb_typeof(a.Details -> 'minutes') = 'number'
                     THEN ROUND((a.Details ->> 'minutes')::numeric)::int END AS Minutes,
                a.Details::text AS Details
            FROM trips.MonitorAlerts a
            LEFT JOIN trips.Trips t ON t.Id = a.TripId
            LEFT JOIN auth.Users ud ON ud.Id = a.DriverId
            LEFT JOIN auth.Users up ON up.Id = t.PassengerId
            LEFT JOIN auth.Users ur ON ur.Id = a.ReviewedBy
            {where}
            ORDER BY a.StartedAt DESC, a.Id
            LIMIT @Take OFFSET @Skip", p);

        return (rows.ToList(), total);
    }

    public async Task<bool> ReviewAsync(Guid id, Guid adminUserId, string? note, CancellationToken ct = default) =>
        // Si ya estaba revisada se conserva la primera revision (quien, cuando y nota).
        await _db.ExecuteAsync($@"
            UPDATE trips.MonitorAlerts
            SET ReviewedAt = COALESCE(ReviewedAt, {NowUtc}),
                ReviewedBy = COALESCE(ReviewedBy, @AdminId),
                ReviewNote = CASE WHEN ReviewedAt IS NULL THEN @Note ELSE ReviewNote END
            WHERE Id = @Id",
            new { Id = id, AdminId = adminUserId, Note = note }) > 0;
}
