using System.Data;
using Dapper;
using Bugie.Trips.Domain.Entities;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Infrastructure.Repositories;

public class SosRepository : ISosRepository
{
    private readonly IDbConnection _db;
    public SosRepository(IDbConnection db) => _db = db;

    public async Task<SosAlert?> GetByIdAsync(Guid id, CancellationToken ct = default)
    {
        // Cargamos manualmente (con SQL explícito) en lugar de usar mapeo
        // automático de Dapper, porque la entidad tiene private setters que
        // requieren constructor parameterless + reflection. Dapper lo hace
        // pero queremos control total para que el match con la columna
        // ResolutionReason (nullable) no falle.
        var row = await _db.QueryFirstOrDefaultAsync<SosAlertRow>(
            "SELECT * FROM trips.SosAlerts WHERE Id = @Id",
            new { Id = id });
        return row?.ToEntity();
    }

    public async Task<List<SosAlert>> GetActiveAsync(CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<SosAlertRow>(
            "SELECT * FROM trips.SosAlerts WHERE Resolved = FALSE ORDER BY CreatedAt ASC");
        return rows.Select(r => r.ToEntity()).ToList();
    }

    public Task AddAsync(SosAlert alert, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            INSERT INTO trips.SosAlerts
                (Id, TripId, UserId, UserRole, Lat, Lng, Resolved, CreatedAt)
            VALUES
                (@Id, @TripId, @UserId, @UserRole, @Lat, @Lng, @Resolved, @CreatedAt)",
            alert);

    public Task UpdateAsync(SosAlert alert, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE trips.SosAlerts SET
                Resolved         = @Resolved,
                ResolvedBy       = @ResolvedBy,
                ResolvedAt       = @ResolvedAt,
                ResolutionReason = @ResolutionReason
            WHERE Id = @Id",
            alert);

    public async Task<bool> HasActiveByTripExceptAsync(
        Guid tripId, Guid exceptId, CancellationToken ct = default)
    {
        // Una sola query con COUNT(*). Si > 0, hay otras alertas activas
        // y el trip debe quedarse en SosActive.
        var count = await _db.ExecuteScalarAsync<int>(@"
            SELECT COUNT(*) FROM trips.SosAlerts
            WHERE TripId = @TripId
              AND Id    <> @ExceptId
              AND Resolved = FALSE",
            new { TripId = tripId, ExceptId = exceptId });
        return count > 0;
    }

    public async Task<int> ResolveAllActiveByTripAsync(
        Guid tripId, Guid adminId, string reason, CancellationToken ct = default)
    {
        // Una sola query: marca TODAS las alertas activas del viaje como
        // resueltas. Útil para limpiar alertas huérfanas de activaciones
        // anteriores que el admin no había resuelto antes.
        var rows = await _db.ExecuteAsync(@"
            UPDATE trips.SosAlerts SET
                Resolved         = TRUE,
                ResolvedBy       = @AdminId,
                ResolvedAt       = (now() at time zone 'utc'),
                ResolutionReason = @Reason
            WHERE TripId = @TripId AND Resolved = FALSE",
            new { TripId = tripId, AdminId = adminId, Reason = reason });
        return rows;
    }

    /// <summary>
    /// DTO interno para deserialización de Dapper. Tiene props con setters
    /// públicos así que Dapper no tiene problemas con tipos nullable / matching
    /// de constructor. Después convertimos a la entidad de dominio.
    /// </summary>
    private class SosAlertRow
    {
        public Guid Id { get; set; }
        public Guid TripId { get; set; }
        public Guid UserId { get; set; }
        public string UserRole { get; set; } = string.Empty;
        public double Lat { get; set; }
        public double Lng { get; set; }
        public bool Resolved { get; set; }
        public Guid? ResolvedBy { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? ResolvedAt { get; set; }
        public string? ResolutionReason { get; set; }

        public SosAlert ToEntity() => SosAlert.Rehydrate(
            Id, TripId, UserId, UserRole, Lat, Lng,
            Resolved, ResolvedBy, CreatedAt, ResolvedAt, ResolutionReason);
    }
}
