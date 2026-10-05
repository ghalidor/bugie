using System.Data;
using Dapper;
using Bugie.Trips.Domain.Entities;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Infrastructure.Repositories;

public class TripRepository : ITripRepository {
    private readonly IDbConnection _db;
    public TripRepository(IDbConnection db) => _db = db;

    // "Viaje activo": no terminado ni cancelado y, si es programado, que ya
    // "llego su momento": en curso / SOS, el conductor marco llegada, o faltan
    // 30 min o menos (ScheduledTrips.ActivateBeforeMinutes). Un programado
    // futuro NO bloquea al conductor ni al pasajero.
    private const string ActiveSql = @"Status NOT IN (4, 5)
              AND (ScheduledAt IS NULL OR Status IN (3, 6) OR DriverArrivedAt IS NOT NULL
                   OR ScheduledAt <= (now() at time zone 'utc') + interval '30 minutes')";
    private const string ActiveSqlT = @"t.Status NOT IN (4, 5)
              AND (t.ScheduledAt IS NULL OR t.Status IN (3, 6) OR t.DriverArrivedAt IS NOT NULL
                   OR t.ScheduledAt <= (now() at time zone 'utc') + interval '30 minutes')";

    public Task<Trip?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<Trip>(
            "SELECT * FROM trips.Trips WHERE Id = @Id", new { Id = id });

    public Task<Trip?> GetActiveTripAsync(Guid userId, CancellationToken ct = default) =>
        // Si hay mas de uno (ej. un programado que ya llego + uno normal), primero
        // el que esta en curso, luego el aceptado, luego el mas reciente.
        _db.QuerySingleOrDefaultAsync<Trip>($@"
            SELECT * FROM trips.Trips
            WHERE (PassengerId = @Id OR DriverId = @Id)
              AND {ActiveSql}
            ORDER BY CASE WHEN Status IN (3, 6) THEN 0 WHEN Status = 2 THEN 1 ELSE 2 END,
                     CreatedAt DESC
            LIMIT 1",
            new { Id = userId });

    public async Task<List<Trip>> GetByPassengerAsync(Guid passengerId, CancellationToken ct = default) {
        var rows = await _db.QueryAsync<Trip>(
            "SELECT * FROM trips.Trips WHERE PassengerId = @Id ORDER BY CreatedAt DESC",
            new { Id = passengerId });
        return rows.ToList();
    }

    public async Task<List<Trip>> GetByDriverAsync(Guid driverId, CancellationToken ct = default) {
        var rows = await _db.QueryAsync<Trip>(
            "SELECT * FROM trips.Trips WHERE DriverId = @Id ORDER BY CreatedAt DESC",
            new { Id = driverId });
        return rows.ToList();
    }

    public async Task<List<Trip>> GetPendingAsync(CancellationToken ct = default) {
        var rows = await _db.QueryAsync<Trip>(
            "SELECT * FROM trips.Trips WHERE Status IN (1, 7) ORDER BY CreatedAt ASC");
        return rows.ToList();
    }

    public async Task<List<DemandZone>> GetDemandZonesAsync(double lat, double lng, double radiusMeters,
        int minutes, CancellationToken ct = default) {
        // Mismos estados que la lista del conductor (1 pending, 7 negotiating).
        // Celda ~500 m: lat/lng redondeados a 0.005. Distancia Haversine en metros.
        var rows = await _db.QueryAsync<DemandZone>(@"
            SELECT ROUND((ROUND(t.OriginLat / 0.005) * 0.005)::numeric, 3)::double precision AS Lat,
                   ROUND((ROUND(t.OriginLng / 0.005) * 0.005)::numeric, 3)::double precision AS Lng,
                   COUNT(*)::int AS Count,
                   COUNT(*) FILTER (WHERE t.ServiceType = 1)::int AS Deliveries,
                   COUNT(*) FILTER (WHERE t.ServiceType <> 1)::int AS Trips
            FROM trips.Trips t
            WHERE t.Status IN (1, 7)
              AND t.CreatedAt >= (NOW() AT TIME ZONE 'utc') - make_interval(mins => @Minutes)
              AND (t.ServiceType <> 1 OR EXISTS (
                    SELECT 1 FROM trips.TripPhotos p WHERE p.TripId = t.Id AND p.Kind = 0))
              AND 2 * 6371000 * ASIN(SQRT(
                    POWER(SIN(RADIANS(t.OriginLat - @Lat) / 2), 2) +
                    COS(RADIANS(@Lat)) * COS(RADIANS(t.OriginLat)) *
                    POWER(SIN(RADIANS(t.OriginLng - @Lng) / 2), 2))) <= @RadiusMeters
            GROUP BY 1, 2
            ORDER BY Count DESC",
            new { Lat = lat, Lng = lng, RadiusMeters = radiusMeters, Minutes = minutes });
        return rows.ToList();
    }

    public Task AddAsync(Trip trip, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            INSERT INTO trips.Trips
                (Id, PassengerId, DriverId, VehicleId,
                 OriginAddress, OriginLat, OriginLng,
                 DestAddress, DestLat, DestLng, DistanceKm,
                 EstimatedFare, ProposedFare, ProposedDriverId, FinalFare,
                 PaymentMethod, Status,
                 ServiceType, PackageDescription, PackageWeightKg, PackageIsFragile, PackageDetails,
                 PickupVerified, PickupObservation,
                 CreatedAt, AcceptedAt, DriverArrivedAt, StartedAt, CompletedAt,
                 CancelledBy, CancelReason, RecipientName, RecipientPhone, ScheduledAt)
            VALUES
                (@Id, @PassengerId, @DriverId, @VehicleId,
                 @OriginAddress, @OriginLat, @OriginLng,
                 @DestAddress, @DestLat, @DestLng, @DistanceKm,
                 @EstimatedFare, @ProposedFare, @ProposedDriverId, @FinalFare,
                 @PaymentMethod, @Status,
                 @ServiceType, @PackageDescription, @PackageWeightKg, @PackageIsFragile, @PackageDetails,
                 @PickupVerified, @PickupObservation,
                 @CreatedAt, @AcceptedAt, @DriverArrivedAt, @StartedAt, @CompletedAt,
                 @CancelledBy, @CancelReason, @RecipientName, @RecipientPhone, @ScheduledAt)",
            trip);

    public async Task<List<Trip>> GetSosActiveAsync(CancellationToken ct = default) {
        var rows = await _db.QueryAsync<Trip>(
            "SELECT * FROM trips.Trips WHERE Status = 6 ORDER BY CreatedAt DESC");
        return rows.ToList();
    }

    public async Task<List<TripWaypoint>> GetWaypointsAsync(Guid tripId, CancellationToken ct = default) {
        var rows = await _db.QueryAsync<TripWaypoint>(
            "SELECT * FROM trips.TripWaypoints WHERE TripId = @TripId ORDER BY SortOrder ASC",
            new { TripId = tripId });
        return rows.ToList();
    }

    public async Task SaveWaypointsAsync(Guid tripId, List<TripWaypoint> waypoints, CancellationToken ct = default) {
        await _db.ExecuteAsync(
            "DELETE FROM trips.TripWaypoints WHERE TripId = @TripId",
            new { TripId = tripId });

        for(int i = 0; i < waypoints.Count; i++) {
            waypoints[i].TripId = tripId;
            waypoints[i].SortOrder = i;
            await _db.ExecuteAsync(@"
                INSERT INTO trips.TripWaypoints (Id, TripId, Address, Lat, Lng, SortOrder)
                VALUES (@Id, @TripId, @Address, @Lat, @Lng, @SortOrder)",
                waypoints[i]);
        }
    }

    public Task UpdateAsync(Trip trip, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE trips.Trips SET
                DriverId         = @DriverId,
                VehicleId        = @VehicleId,
                EstimatedFare    = @EstimatedFare,
                ProposedFare     = @ProposedFare,
                ProposedDriverId = @ProposedDriverId,
                FinalFare        = @FinalFare,
                Status           = @Status,
                PickupVerified   = @PickupVerified,
                PickupObservation= @PickupObservation,
                AcceptedAt       = @AcceptedAt,
                DriverArrivedAt  = @DriverArrivedAt,
                StartedAt        = @StartedAt,
                CompletedAt      = @CompletedAt,
                CancelledBy      = @CancelledBy,
                CancelReason     = @CancelReason,
                CancelledAt      = @CancelledAt,
                DeliveryReceivedBy  = @DeliveryReceivedBy,
                DeliveryConfirmedAt = @DeliveryConfirmedAt,
                CouponCode         = @CouponCode,
                DiscountAmount     = @DiscountAmount,
                FareBeforeDiscount = @FareBeforeDiscount,
                ScheduledAt        = @ScheduledAt,
                Reminder30SentAt   = @Reminder30SentAt,
                Reminder10SentAt   = @Reminder10SentAt
            WHERE Id = @Id",
            trip);

    public async Task<List<Guid>> GetDriversWithActiveTripAsync(
        IEnumerable<Guid> driverUserIds, CancellationToken ct = default) {
        var idList = driverUserIds?.Distinct().ToList() ?? new List<Guid>();
        if(idList.Count == 0) return new List<Guid>();

        var rows = await _db.QueryAsync<Guid>($@"
            SELECT DISTINCT DriverId
            FROM trips.Trips
            WHERE DriverId = ANY(@Ids)
              AND {ActiveSql}
              AND DriverId IS NOT NULL",
            new { Ids = idList.ToArray() });

        return rows.ToList();
    }

    public async Task<Guid?> UpdatePassengerLocationAsync(
        Guid passengerId, double lat, double lng, CancellationToken ct = default) {
        // UPDATE directo solo si el pasajero tiene un viaje en estado
        // 1 Pending, 2 Accepted, 3 InProgress, 6 SosActive, 7 Negotiating.
        // (Excluye 4 Completed, 5 Cancelled.)
        // Devuelve el TripId actualizado (o null si no había viaje activo)
        // para que el handler pueda incluirlo en el broadcast SignalR.
        var tripId = await _db.QueryFirstOrDefaultAsync<Guid?>(@"
            UPDATE trips.Trips
            SET PassengerLastLat    = @Lat,
                PassengerLastLng    = @Lng,
                PassengerLocationAt = (now() at time zone 'utc')
            WHERE PassengerId = @PassengerId
              AND Status IN (1, 2, 3, 6, 7)
              AND (ScheduledAt IS NULL OR Status IN (3, 6) OR DriverArrivedAt IS NOT NULL
                   OR ScheduledAt <= (now() at time zone 'utc') + interval '30 minutes')
            RETURNING Id",
            new { PassengerId = passengerId, Lat = lat, Lng = lng });

        return tripId;
    }

    public async Task<List<PassengerLiveLocation>> GetLivePassengerLocationsAsync(
        CancellationToken ct = default) {
        // Devuelve los viajes activos con todos los datos que el monitor necesita
        // para pintar el mapa Y detectar desvíos (origen/destino/posición conductor).
        // Las posiciones de conductor (DriverLat/Lng) salen de drivers.Drivers ya
        // que el monitoreo es near-realtime y prefiero un solo viaje a la BD vs
        // pegarle a Drivers API. Drivers.UserId = Trip.DriverId (mismo Guid).
        // Nombres salen de auth.Users con LEFT JOIN para que el viaje aparezca
        // aunque el usuario no exista (cosa rara, pero defensa).
        // Limitamos a 200 viajes activos.
        var rows = await _db.QueryAsync<PassengerLiveLocation>($@"
            SELECT
                t.Id                  AS TripId,
                t.PassengerId         AS PassengerId,
                t.DriverId            AS DriverId,
                t.Status              AS Status,
                t.PassengerLastLat    AS Lat,
                t.PassengerLastLng    AS Lng,
                t.PassengerLocationAt AS UpdatedAt,
                t.OriginLat           AS OriginLat,
                t.OriginLng           AS OriginLng,
                t.DestLat             AS DestLat,
                t.DestLng             AS DestLng,
                d.CurrentLat          AS DriverLat,
                d.CurrentLng          AS DriverLng,
                COALESCE(up.FullName, 'Pasajero') AS PassengerName,
                up.Phone              AS PassengerPhone,
                up.ProfilePhotoUrl    AS PassengerPhotoUrl,
                ud.FullName           AS DriverName,
                ud.Phone              AS DriverPhone
            FROM trips.Trips t
            LEFT JOIN drivers.Drivers d ON d.UserId = t.DriverId
            LEFT JOIN auth.Users up      ON up.Id  = t.PassengerId
            LEFT JOIN auth.Users ud      ON ud.Id  = t.DriverId
            WHERE t.Status IN (1, 2, 3, 6, 7)
              AND {ActiveSqlT}
              AND t.PassengerLastLat IS NOT NULL
              AND t.PassengerLastLng IS NOT NULL
            ORDER BY t.PassengerLocationAt DESC
            LIMIT 200");
        return rows.ToList();
    }

    /// <summary>
    /// WHERE comun del listado admin y sus KPIs (alias t = trips.Trips).
    /// Pasajero, conductor y placa se buscan en auth.Users y drivers.* (misma base).
    /// </summary>
    private static (string Sql, DynamicParameters P) BuildAdminWhere(TripAdminFilter f) {
        var where = new List<string>();
        var p = new DynamicParameters();

        // Statuses puede tener varios valores (ej: pestaña "pendientes" mezcla 1 y 7).
        // Usamos = ANY(@Statuses) (Npgsql) con un arreglo. NO usar IN @Statuses.
        var statusList = f.Statuses?.ToList();
        if(statusList != null && statusList.Count > 0) {
            where.Add("t.Status = ANY(@Statuses)");
            p.Add("Statuses", statusList.ToArray());
        }
        if(!string.IsNullOrWhiteSpace(f.Search)) {
            var term = f.Search.Trim();
            where.Add(@"(t.OriginAddress ILIKE @SearchLike OR t.DestAddress ILIKE @SearchLike
                OR EXISTS (SELECT 1 FROM auth.Users u
                           WHERE (u.Id = t.PassengerId OR u.Id = t.DriverId)
                             AND (u.FullName ILIKE @SearchLike OR u.Email ILIKE @SearchLike
                                  OR u.DocNumber ILIKE @SearchLike OR u.Phone ILIKE @SearchLike))
                OR EXISTS (SELECT 1 FROM drivers.Vehicles v
                           WHERE (v.Id = t.VehicleId
                                  OR (t.VehicleId IS NULL AND v.DriverId IN
                                      (SELECT d.Id FROM drivers.Drivers d WHERE d.UserId = t.DriverId)))
                             AND REPLACE(UPPER(v.Plate), '-', '') LIKE @PlateLike))");
            p.Add("SearchLike", $"%{term}%");
            p.Add("PlateLike", $"%{term.Replace("-", "").ToUpperInvariant()}%");
        }
        // Tipo de servicio: 0 = viaje, 1 = envío. null = todos.
        if(f.ServiceType.HasValue) {
            where.Add("t.ServiceType = @ServiceType");
            p.Add("ServiceType", (short)f.ServiceType.Value);
        }
        // Programados: true = solo programados, false = solo "ahora", null = todos.
        if(f.Scheduled.HasValue)
            where.Add(f.Scheduled.Value ? "t.ScheduledAt IS NOT NULL" : "t.ScheduledAt IS NULL");
        if(f.PassengerId.HasValue) {
            where.Add("t.PassengerId = @PassengerId");
            p.Add("PassengerId", f.PassengerId.Value);
        }
        if(f.DriverUserId.HasValue) {
            where.Add("t.DriverId = @DriverUserId");
            p.Add("DriverUserId", f.DriverUserId.Value);
        }
        if(f.FromUtc.HasValue) {
            where.Add("t.CreatedAt >= @FromUtc");
            p.Add("FromUtc", f.FromUtc.Value);
        }
        if(f.ToUtc.HasValue) {
            where.Add("t.CreatedAt < @ToUtc");
            p.Add("ToUtc", f.ToUtc.Value);
        }
        var whereSql = where.Count == 0 ? "" : "WHERE " + string.Join(" AND ", where);
        return (whereSql, p);
    }

    public async Task<(List<Trip> Items, int Total)> GetPagedAsync(
        int page, int pageSize, TripAdminFilter filter, CancellationToken ct = default) {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var skip = (page - 1) * pageSize;

        var (whereSql, p) = BuildAdminWhere(filter);

        var dataSql = $@"
            SELECT t.* FROM trips.Trips t
            {whereSql}
            ORDER BY t.CreatedAt DESC
            LIMIT @Take OFFSET @Skip";
        var countSql = $"SELECT COUNT(*) FROM trips.Trips t {whereSql}";

        p.Add("Skip", skip);
        p.Add("Take", pageSize);

        var items = (await _db.QueryAsync<Trip>(dataSql, p)).ToList();
        var total = await _db.ExecuteScalarAsync<int>(countSql, p);
        return (items, total);
    }

    public async Task<(int Total, int Pending, int InProgress, int Completed, decimal TotalFare)>
        GetStatsAsync(TripAdminFilter filter, CancellationToken ct = default) {
        var (whereSql, p) = BuildAdminWhere(filter);

        // TripStatus: 1=Pending, 2=Accepted, 3=InProgress, 4=Completed, 5=Cancelled, 6=SosActive, 7=Negotiating
        // - Pending KPI: cuenta pending(1) y negotiating(7) (ambos esperan acción).
        // - InProgress KPI: estado 3.
        // - Completed KPI: estado 4.
        // - TotalFare: suma de FinalFare (o EstimatedFare si null) de los completados.
        var sql = $@"
            SELECT
                COUNT(*)                                                                                  AS Total,
                SUM(CASE WHEN t.Status IN (1, 7)      THEN 1 ELSE 0 END)                                  AS Pending,
                SUM(CASE WHEN t.Status = 3            THEN 1 ELSE 0 END)                                  AS InProgress,
                SUM(CASE WHEN t.Status = 4            THEN 1 ELSE 0 END)                                  AS Completed,
                COALESCE(SUM(CASE WHEN t.Status = 4 THEN COALESCE(t.FinalFare, t.EstimatedFare) ELSE 0 END), 0) AS TotalFare
            FROM trips.Trips t
            {whereSql}";

        var row = await _db.QuerySingleAsync<TripStatsRow>(sql, p);
        return (row.Total, row.Pending, row.InProgress, row.Completed, row.TotalFare);
    }

    public async Task<List<Trip>> GetScheduledByUserAsync(Guid userId, CancellationToken ct = default) {
        var rows = await _db.QueryAsync<Trip>(@"
            SELECT * FROM trips.Trips
            WHERE (PassengerId = @Id OR DriverId = @Id)
              AND ScheduledAt IS NOT NULL
              AND Status IN (1, 2, 7)
            ORDER BY ScheduledAt ASC",
            new { Id = userId });
        return rows.ToList();
    }

    public Task<Trip?> GetDriverScheduledConflictAsync(
        Guid driverUserId, DateTime scheduledAtUtc, Guid exceptTripId, int marginMinutes,
        CancellationToken ct = default) =>
        _db.QueryFirstOrDefaultAsync<Trip?>(@"
            SELECT * FROM trips.Trips
            WHERE DriverId = @DriverId
              AND Id <> @ExceptId
              AND ScheduledAt IS NOT NULL
              AND Status IN (2, 3, 6)
              AND ScheduledAt > @At - make_interval(mins => @Margin)
              AND ScheduledAt < @At + make_interval(mins => @Margin)
            ORDER BY ScheduledAt ASC
            LIMIT 1",
            new { DriverId = driverUserId, ExceptId = exceptTripId,
                  At = DateTime.SpecifyKind(scheduledAtUtc, DateTimeKind.Unspecified), Margin = marginMinutes });

    public Task<Trip?> GetPassengerScheduledConflictAsync(
        Guid passengerId, DateTime scheduledAtUtc, Guid exceptTripId, int marginMinutes,
        CancellationToken ct = default) =>
        _db.QueryFirstOrDefaultAsync<Trip?>(@"
            SELECT * FROM trips.Trips
            WHERE PassengerId = @PassengerId
              AND Id <> @ExceptId
              AND ScheduledAt IS NOT NULL
              AND Status IN (1, 7, 2, 3, 6)
              AND ScheduledAt > @At - make_interval(mins => @Margin)
              AND ScheduledAt < @At + make_interval(mins => @Margin)
            ORDER BY ScheduledAt ASC
            LIMIT 1",
            new { PassengerId = passengerId, ExceptId = exceptTripId,
                  At = DateTime.SpecifyKind(scheduledAtUtc, DateTimeKind.Unspecified), Margin = marginMinutes });

    public async Task<List<Trip>> GetUnassignedScheduledDueAsync(
        DateTime nowUtc, int withinMinutes, CancellationToken ct = default) {
        var now = DateTime.SpecifyKind(nowUtc, DateTimeKind.Unspecified);
        var rows = await _db.QueryAsync<Trip>(@"
            SELECT * FROM trips.Trips
            WHERE Status IN (1, 7)
              AND DriverId IS NULL
              AND ScheduledAt IS NOT NULL
              AND ScheduledAt <= @Now + make_interval(mins => @Within)
            ORDER BY ScheduledAt ASC",
            new { Now = now, Within = withinMinutes });
        return rows.ToList();
    }

    public async Task<bool> CancelExpiredScheduledAsync(Guid tripId, string reason, CancellationToken ct = default) {
        var n = await _db.ExecuteAsync(@"
            UPDATE trips.Trips
               SET Status = 5, CancelledBy = 'system', CancelReason = @Reason,
                   CancelledAt = (now() at time zone 'utc')
             WHERE Id = @Id AND Status IN (1, 7) AND DriverId IS NULL",
            new { Id = tripId, Reason = reason });
        return n > 0;
    }

    public async Task<List<Trip>> GetScheduledForRemindersAsync(DateTime nowUtc, CancellationToken ct = default) {
        // Aceptados con hora entre hace 5 min y dentro de 31 min, y algun aviso sin mandar.
        var now = DateTime.SpecifyKind(nowUtc, DateTimeKind.Unspecified);
        var rows = await _db.QueryAsync<Trip>(@"
            SELECT * FROM trips.Trips
            WHERE Status = 2
              AND DriverId IS NOT NULL
              AND ScheduledAt IS NOT NULL
              AND ScheduledAt > @Now - interval '5 minutes'
              AND ScheduledAt <= @Now + interval '31 minutes'
              AND (Reminder30SentAt IS NULL OR Reminder10SentAt IS NULL)",
            new { Now = now });
        return rows.ToList();
    }

    public Task MarkReminderSentAsync(Guid tripId, int minutes, CancellationToken ct = default) =>
        _db.ExecuteAsync(minutes <= 10
            ? @"UPDATE trips.Trips SET Reminder10SentAt = (now() at time zone 'utc'),
                       Reminder30SentAt = COALESCE(Reminder30SentAt, (now() at time zone 'utc'))
                WHERE Id = @Id"
            : @"UPDATE trips.Trips SET Reminder30SentAt = (now() at time zone 'utc') WHERE Id = @Id",
            new { Id = tripId });

    public async Task<List<Guid>> GetOnlineApprovedDriverUserIdsAsync(CancellationToken ct = default) {
        // Misma base (como el mapa de monitoreo): conectados (IsOnline) y aprobados (Status 3).
        var rows = await _db.QueryAsync<Guid>(@"
            SELECT DISTINCT UserId FROM drivers.Drivers
            WHERE IsOnline = TRUE AND Status = 3");
        return rows.ToList();
    }

    private class TripStatsRow {
        public int Total { get; set; }
        public int Pending { get; set; }
        public int InProgress { get; set; }
        public int Completed { get; set; }
        public decimal TotalFare { get; set; }
    }
}
