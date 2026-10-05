using System.Data;
using Dapper;
using Bugie.Drivers.Domain.Entities;
using Bugie.Drivers.Domain.Interfaces;
using Bugie.Drivers.Domain.Enums;

namespace Bugie.Drivers.Infrastructure.Repositories;

public class DriverRepository : IDriverRepository
{
    private readonly IDbConnection _db;
    public DriverRepository(IDbConnection db) => _db = db;

    public Task<Driver?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<Driver>(
            "SELECT * FROM drivers.Drivers WHERE Id = @Id", new { Id = id });

    public Task<Driver?> GetByUserIdAsync(Guid userId, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<Driver>(
            "SELECT * FROM drivers.Drivers WHERE UserId = @UserId", new { UserId = userId });

    public async Task<List<Driver>> GetByStatusAsync(DriverStatus status, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<Driver>(
            "SELECT * FROM drivers.Drivers WHERE Status = @Status ORDER BY CreatedAt DESC",
            new { Status = (int)status });
        return rows.ToList();
    }

    public async Task<List<Driver>> GetOnlineAsync(CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<Driver>(
            "SELECT * FROM drivers.Drivers WHERE IsOnline = TRUE AND Status = 3");
        return rows.ToList();
    }

    public async Task<List<NearbyDriverDto>> GetNearbyAsync(
        double lat, double lng, double radiusKm, int maxResults = 10,
        CancellationToken ct = default)
    {
        // Distancia calculada con la formula de Haversine sobre CurrentLat/CurrentLng
        // (en km). No requiere PostGIS. El LEAST/GREATEST evita errores de dominio en acos().
        var rows = await _db.QueryAsync<NearbyDriverDto>(@"
            SELECT * FROM (
                SELECT
                    d.Id           AS DriverId,
                    d.UserId,
                    d.CurrentLat   AS Lat,
                    d.CurrentLng   AS Lng,
                    ROUND((6371 * acos(LEAST(1, GREATEST(-1,
                        cos(radians(@Lat)) * cos(radians(d.CurrentLat)) *
                        cos(radians(d.CurrentLng) - radians(@Lng)) +
                        sin(radians(@Lat)) * sin(radians(d.CurrentLat))
                    ))))::numeric, 2)::double precision AS DistanceKm,
                    COALESCE(d.Rating, 0) AS Rating,
                    v.Plate        AS VehiclePlate,
                    v.Brand || ' ' || v.Model AS VehicleModel,
                    v.Color        AS VehicleColor
                FROM drivers.Drivers d
                LEFT JOIN drivers.Vehicles v
                    ON v.DriverId = d.Id AND v.IsActive = TRUE
                WHERE d.IsOnline = TRUE
                  AND d.Status   = 3
                  AND d.CurrentLat IS NOT NULL
                  AND d.CurrentLng IS NOT NULL
            ) q
            WHERE q.DistanceKm <= @RadiusKm
            ORDER BY q.DistanceKm ASC
            LIMIT @MaxResults",
            new { Lat = lat, Lng = lng, RadiusKm = radiusKm, MaxResults = maxResults });

        return rows.ToList();
    }

    public Task AddAsync(Driver driver, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            INSERT INTO drivers.Drivers
                (Id, UserId, Status, IsOnline, CurrentLat, CurrentLng, CurrentLocationAt,
                 FaceIdPhotoUrl, ProfilePhotoUrl, Rating, TotalRatings, CreatedAt, ApprovedAt)
            VALUES
                (@Id, @UserId, @Status, @IsOnline, @CurrentLat, @CurrentLng, @CurrentLocationAt,
                 @FaceIdPhotoUrl, @ProfilePhotoUrl, @Rating, @TotalRatings, @CreatedAt, @ApprovedAt)",
            driver);

    public Task UpdateAsync(Driver driver, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE drivers.Drivers SET
                Status            = @Status,
                IsOnline          = @IsOnline,
                CurrentLat        = @CurrentLat,
                CurrentLng        = @CurrentLng,
                CurrentLocationAt = @CurrentLocationAt,
                FaceIdPhotoUrl  = @FaceIdPhotoUrl,
                ProfilePhotoUrl = @ProfilePhotoUrl,
                Rating          = @Rating,
                TotalRatings    = @TotalRatings,
                ApprovedAt      = @ApprovedAt,
                DocumentsDeadline = @DocumentsDeadline,
                Strikes         = @Strikes,
                SuspendedUntil  = @SuspendedUntil,
                StatusReason    = @StatusReason
            WHERE Id = @Id",
            driver);

    public async Task<List<Driver>> GetWithExpiredDeadlineAsync(DateTime nowUtc, CancellationToken ct = default)
    {
        // Solo aprobados: si ya fue suspendido/rechazado por otro motivo, no aplica.
        var rows = await _db.QueryAsync<Driver>(@"
            SELECT * FROM drivers.Drivers
            WHERE DocumentsDeadline IS NOT NULL
              AND DocumentsDeadline <= @Now
              AND Status = 3",
            new { Now = nowUtc });
        return rows.ToList();
    }

    public async Task<List<Driver>> GetWithEndedSuspensionAsync(DateTime nowUtc, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<Driver>(@"
            SELECT * FROM drivers.Drivers
            WHERE Status = 4
              AND SuspendedUntil IS NOT NULL
              AND SuspendedUntil <= @Now",
            new { Now = nowUtc });
        return rows.ToList();
    }

    // Filtro "con solicitud de revisión abierta" (drivers.DriverReviewRequests)
    private const string OpenReviewExists =
        "EXISTS (SELECT 1 FROM drivers.DriverReviewRequests r WHERE r.DriverId = d.Id AND r.Status = 'open')";

    public async Task<List<VehicleBulkDto>> GetVehiclesByUserIdsAsync(
        IEnumerable<Guid> driverUserIds, CancellationToken ct = default)
    {
        var idList = driverUserIds?.Distinct().ToList() ?? new List<Guid>();
        if(idList.Count == 0) return new List<VehicleBulkDto>();

        var rows = await _db.QueryAsync<VehicleBulkDto>(@"
            SELECT
                d.UserId AS DriverUserId,
                v.Plate,
                v.Brand,
                v.Model,
                v.Color,
                v.PhotoUrl
            FROM drivers.Drivers d
            INNER JOIN drivers.Vehicles v
                ON v.DriverId = d.Id AND v.IsActive = TRUE
            WHERE d.UserId = ANY(@Ids)",
            new { Ids = idList.ToArray() });

        return rows.ToList();
    }

    /// <summary>
    /// Marca como offline a los conductores cuyo último GPS es más viejo que cutoffUtc.
    /// EXCLUYE a quienes tienen viaje activo en curso: ese conductor (aunque parezca
    /// "dormido") debe seguir online porque el pasajero depende de ver su pin.
    /// Si el problema es real, ese caso se maneja por otro lado (cancelación, soporte).
    ///
    /// Devuelve UserIds para que el caller pueda emitir 'driver:offline' por SignalR.
    /// </summary>
    public async Task<List<Guid>> MarkStaleAsOfflineAsync(
        DateTime cutoffUtc, CancellationToken ct = default)
    {
        // RETURNING UserId nos devuelve los que efectivamente se actualizaron.
        // El WHERE ya filtra IsOnline=TRUE, así que solo cambian los necesarios.
        var rows = await _db.QueryAsync<Guid>(@"
            UPDATE drivers.Drivers
            SET IsOnline = FALSE
            WHERE IsOnline = TRUE
              AND (CurrentLocationAt IS NULL OR CurrentLocationAt < @Cutoff)
            RETURNING UserId",
            new { Cutoff = cutoffUtc });

        return rows.ToList();
    }

    /// <summary>
    /// Busqueda del admin: nombre, correo o documento (auth.Users, misma base) o
    /// placa de cualquiera de sus vehiculos (sin importar guiones ni mayusculas).
    /// </summary>
    private const string SearchSql = @"(u.FullName ILIKE @SearchLike OR u.Email ILIKE @SearchLike
        OR u.DocNumber ILIKE @SearchLike OR u.Phone ILIKE @SearchLike
        OR EXISTS (SELECT 1 FROM drivers.Vehicles v
                   WHERE v.DriverId = d.Id AND REPLACE(UPPER(v.Plate), '-', '') LIKE @PlateLike))";

    private static void AddSearch(DynamicParameters p, string search)
    {
        var term = search.Trim();
        p.Add("SearchLike", $"%{term}%");
        p.Add("PlateLike", $"%{term.Replace("-", "").ToUpperInvariant()}%");
    }

    public async Task<(List<Driver> Items, int Total)> GetPagedAsync(
        int page, int pageSize, int? status, bool? online, string? search,
        bool? openReview = null, CancellationToken ct = default, bool? deleted = false)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var skip = (page - 1) * pageSize;

        var where = new List<string>();
        var p = new DynamicParameters();

        // Cuentas eliminadas (auth.Users.DeletedAt): por defecto no se incluyen.
        if(deleted.HasValue)
            where.Add(deleted.Value ? "u.DeletedAt IS NOT NULL" : "u.DeletedAt IS NULL");

        if(openReview.HasValue)
            where.Add(openReview.Value ? OpenReviewExists : "NOT " + OpenReviewExists);

        if(status.HasValue)
        {
            where.Add("d.Status = @Status");
            p.Add("Status", status.Value);
        }
        if(online.HasValue)
        {
            where.Add("d.IsOnline = @Online");
            p.Add("Online", online.Value);
        }
        if(!string.IsNullOrWhiteSpace(search))
        {
            // JOIN con auth.Users para buscar por nombre o email.
            // Como ambas tablas están en la misma BD (Bugie), no es cross-database.
            where.Add(SearchSql);
            AddSearch(p, search);
        }
        var whereSql = where.Count == 0 ? "" : "WHERE " + string.Join(" AND ", where);

        // SELECT d.* (sin columnas de Users) para que Dapper hidrate Driver correctamente.
        var dataSql = $@"
            SELECT d.*
            FROM drivers.Drivers d
            INNER JOIN auth.Users u ON u.Id = d.UserId
            {whereSql}
            ORDER BY d.CreatedAt DESC
            LIMIT @Take OFFSET @Skip";
        var countSql = $@"
            SELECT COUNT(*)
            FROM drivers.Drivers d
            INNER JOIN auth.Users u ON u.Id = d.UserId
            {whereSql}";

        p.Add("Skip", skip);
        p.Add("Take", pageSize);

        var items = (await _db.QueryAsync<Driver>(dataSql, p)).ToList();
        var total = await _db.ExecuteScalarAsync<int>(countSql, p);
        return (items, total);
    }

    /// <summary>
    /// Lista paginada de pendientes: status IN (1, 2, 6) = PendingDocs,
    /// UnderReview, ExpiredDocs. Ordenada por CreatedAt ASC (los más viejos
    /// primero, así el admin atiende por orden de llegada).
    /// </summary>
    public async Task<(List<Driver> Items, int Total)> GetPendingPagedAsync(
        int page, int pageSize, string? search,
        CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var skip = (page - 1) * pageSize;

        var where = new List<string> { "d.Status IN (1, 2, 6)", "u.DeletedAt IS NULL" };
        var p = new DynamicParameters();

        if(!string.IsNullOrWhiteSpace(search))
        {
            where.Add(SearchSql);
            AddSearch(p, search);
        }
        var whereSql = "WHERE " + string.Join(" AND ", where);

        // ASC: pendientes más viejos primero (FIFO).
        var dataSql = $@"
            SELECT d.*
            FROM drivers.Drivers d
            INNER JOIN auth.Users u ON u.Id = d.UserId
            {whereSql}
            ORDER BY d.CreatedAt ASC
            LIMIT @Take OFFSET @Skip";
        var countSql = $@"
            SELECT COUNT(*)
            FROM drivers.Drivers d
            INNER JOIN auth.Users u ON u.Id = d.UserId
            {whereSql}";

        p.Add("Skip", skip);
        p.Add("Take", pageSize);

        var items = (await _db.QueryAsync<Driver>(dataSql, p)).ToList();
        var total = await _db.ExecuteScalarAsync<int>(countSql, p);
        return (items, total);
    }

    public async Task<DriverStats> GetStatsAsync(int? status, bool? online, string? search,
        bool? openReview = null, CancellationToken ct = default, bool? deleted = false)
    {
        var where = new List<string>();
        var p = new DynamicParameters();

        if(deleted.HasValue)
            where.Add(deleted.Value ? "u.DeletedAt IS NOT NULL" : "u.DeletedAt IS NULL");

        if(openReview.HasValue)
            where.Add(openReview.Value ? OpenReviewExists : "NOT " + OpenReviewExists);

        if(status.HasValue)
        {
            where.Add("d.Status = @Status");
            p.Add("Status", status.Value);
        }
        if(online.HasValue)
        {
            where.Add("d.IsOnline = @Online");
            p.Add("Online", online.Value);
        }
        if(!string.IsNullOrWhiteSpace(search))
        {
            where.Add(SearchSql);
            AddSearch(p, search);
        }
        var whereSql = where.Count == 0 ? "" : "WHERE " + string.Join(" AND ", where);

        // DriverStatus: PendingDocs=1, UnderReview=2, Approved=3, Suspended=4, Rejected=5, ExpiredDocs=6
        var sql = $@"
            SELECT
                COUNT(*)                                              AS Total,
                SUM(CASE WHEN d.IsOnline = TRUE            THEN 1 ELSE 0 END) AS Online,
                SUM(CASE WHEN d.Status   = 1            THEN 1 ELSE 0 END) AS PendingDocs,
                SUM(CASE WHEN d.Status   = 2            THEN 1 ELSE 0 END) AS UnderReview,
                SUM(CASE WHEN d.Status   = 3            THEN 1 ELSE 0 END) AS Approved,
                SUM(CASE WHEN d.Status   = 4            THEN 1 ELSE 0 END) AS Suspended,
                SUM(CASE WHEN d.Status   = 5            THEN 1 ELSE 0 END) AS Rejected,
                SUM(CASE WHEN d.Status   = 6            THEN 1 ELSE 0 END) AS Expired,
                SUM(CASE WHEN {OpenReviewExists}        THEN 1 ELSE 0 END) AS OpenReviewRequests
            FROM drivers.Drivers d
            INNER JOIN auth.Users u ON u.Id = d.UserId
            {whereSql}";

        // Si no hay filas, SUM devuelve NULL y Dapper deja el 0 por defecto.
        return await _db.QuerySingleAsync<DriverStats>(sql, p);
    }
}