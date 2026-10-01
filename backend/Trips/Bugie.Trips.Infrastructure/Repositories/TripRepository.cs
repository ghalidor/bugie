using System.Data;
using Dapper;
using Bugie.Trips.Domain.Entities;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Infrastructure.Repositories;

public class TripRepository : ITripRepository {
    private readonly IDbConnection _db;
    public TripRepository(IDbConnection db) => _db = db;

    public Task<Trip?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<Trip>(
            "SELECT * FROM trips.Trips WHERE Id = @Id", new { Id = id });

    public Task<Trip?> GetActiveTripAsync(Guid userId, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<Trip>(@"
            SELECT * FROM trips.Trips
            WHERE (PassengerId = @Id OR DriverId = @Id)
              AND Status NOT IN (4, 5)
            ORDER BY CreatedAt DESC LIMIT 1",
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

    public async Task<List<Trip>> GetAllAsync(CancellationToken ct = default) {
        var rows = await _db.QueryAsync<Trip>(
            "SELECT * FROM trips.Trips ORDER BY CreatedAt DESC");
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
                 CancelledBy, CancelReason)
            VALUES
                (@Id, @PassengerId, @DriverId, @VehicleId,
                 @OriginAddress, @OriginLat, @OriginLng,
                 @DestAddress, @DestLat, @DestLng, @DistanceKm,
                 @EstimatedFare, @ProposedFare, @ProposedDriverId, @FinalFare,
                 @PaymentMethod, @Status,
                 @ServiceType, @PackageDescription, @PackageWeightKg, @PackageIsFragile, @PackageDetails,
                 @PickupVerified, @PickupObservation,
                 @CreatedAt, @AcceptedAt, @DriverArrivedAt, @StartedAt, @CompletedAt,
                 @CancelledBy, @CancelReason)",
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
                CancelReason     = @CancelReason
            WHERE Id = @Id",
            trip);

    public async Task<List<Guid>> GetDriversWithActiveTripAsync(
        IEnumerable<Guid> driverUserIds, CancellationToken ct = default) {
        var idList = driverUserIds?.Distinct().ToList() ?? new List<Guid>();
        if(idList.Count == 0) return new List<Guid>();

        var rows = await _db.QueryAsync<Guid>(@"
            SELECT DISTINCT DriverId
            FROM trips.Trips
            WHERE DriverId = ANY(@Ids)
              AND Status NOT IN (4, 5)
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
        var rows = await _db.QueryAsync<PassengerLiveLocation>(@"
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
              AND t.PassengerLastLat IS NOT NULL
              AND t.PassengerLastLng IS NOT NULL
            ORDER BY t.PassengerLocationAt DESC
            LIMIT 200");
        return rows.ToList();
    }

    public async Task<(List<Trip> Items, int Total)> GetPagedAsync(
        int page, int pageSize, IEnumerable<int>? statuses, string? search,
        CancellationToken ct = default) {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var skip = (page - 1) * pageSize;

        var where = new List<string>();
        var p = new DynamicParameters();

        // statuses puede tener varios valores (ej: tab "pending" mezcla 1 y 7).
        // Usamos = ANY(@Statuses) (Npgsql) con un arreglo. NO usar IN @Statuses:
        var statusList = statuses?.ToList();
        if(statusList != null && statusList.Count > 0) {
            where.Add("Status = ANY(@Statuses)");
            p.Add("Statuses", statusList.ToArray());
        }
        if(!string.IsNullOrWhiteSpace(search)) {
            where.Add("(OriginAddress LIKE @SearchLike OR DestAddress LIKE @SearchLike)");
            p.Add("SearchLike", $"%{search.Trim()}%");
        }
        var whereSql = where.Count == 0 ? "" : "WHERE " + string.Join(" AND ", where);

        var dataSql = $@"
            SELECT * FROM trips.Trips
            {whereSql}
            ORDER BY CreatedAt DESC
            LIMIT @Take OFFSET @Skip";
        var countSql = $"SELECT COUNT(*) FROM trips.Trips {whereSql}";

        p.Add("Skip", skip);
        p.Add("Take", pageSize);

        var items = (await _db.QueryAsync<Trip>(dataSql, p)).ToList();
        var total = await _db.ExecuteScalarAsync<int>(countSql, p);
        return (items, total);
    }

    public async Task<(int Total, int Pending, int InProgress, int Completed, decimal TotalFare)>
        GetStatsAsync(IEnumerable<int>? statuses, string? search,
            CancellationToken ct = default) {
        var where = new List<string>();
        var p = new DynamicParameters();

        var statusList = statuses?.ToList();
        if(statusList != null && statusList.Count > 0) {
            where.Add("Status = ANY(@Statuses)");
            p.Add("Statuses", statusList.ToArray());
        }
        if(!string.IsNullOrWhiteSpace(search)) {
            where.Add("(OriginAddress LIKE @SearchLike OR DestAddress LIKE @SearchLike)");
            p.Add("SearchLike", $"%{search.Trim()}%");
        }
        var whereSql = where.Count == 0 ? "" : "WHERE " + string.Join(" AND ", where);

        // TripStatus: 1=Pending, 2=Accepted, 3=InProgress, 4=Completed, 5=Cancelled, 6=SosActive, 7=Negotiating
        // - Pending KPI: cuenta pending(1) y negotiating(7) (ambos esperan acción).
        // - InProgress KPI: estado 3.
        // - Completed KPI: estado 4.
        // - TotalFare: suma de FinalFare (o EstimatedFare si null) de los completados.
        //   COALESCE(FinalFare, EstimatedFare) tiene ese fallback.
        var sql = $@"
            SELECT
                COUNT(*)                                                                              AS Total,
                SUM(CASE WHEN Status IN (1, 7)        THEN 1 ELSE 0 END)                              AS Pending,
                SUM(CASE WHEN Status = 3              THEN 1 ELSE 0 END)                              AS InProgress,
                SUM(CASE WHEN Status = 4              THEN 1 ELSE 0 END)                              AS Completed,
                COALESCE(SUM(CASE WHEN Status = 4 THEN COALESCE(FinalFare, EstimatedFare) ELSE 0 END), 0) AS TotalFare
            FROM trips.Trips
            {whereSql}";

        var row = await _db.QuerySingleAsync<TripStatsRow>(sql, p);
        return (row.Total, row.Pending, row.InProgress, row.Completed, row.TotalFare);
    }

    private class TripStatsRow {
        public int Total { get; set; }
        public int Pending { get; set; }
        public int InProgress { get; set; }
        public int Completed { get; set; }
        public decimal TotalFare { get; set; }
    }
}
