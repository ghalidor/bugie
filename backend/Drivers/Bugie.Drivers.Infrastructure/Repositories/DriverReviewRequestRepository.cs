using System.Data;
using Dapper;
using Npgsql;
using Bugie.Drivers.Domain.Entities;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Infrastructure.Repositories;

public class DriverReviewRequestRepository : IDriverReviewRequestRepository
{
    private readonly IDbConnection _db;
    public DriverReviewRequestRepository(IDbConnection db) => _db = db;

    public async Task AddAsync(DriverReviewRequest request, CancellationToken ct = default)
    {
        try
        {
            await _db.ExecuteAsync(@"
                INSERT INTO drivers.DriverReviewRequests
                    (Id, DriverId, Message, Status, DriverStatus, CreatedAt)
                VALUES
                    (@Id, @DriverId, @Message, @Status, @DriverStatus, @CreatedAt)",
                request);
        }
        catch(PostgresException ex) when(ex.SqlState == PostgresErrorCodes.UniqueViolation)
        {
            // ux_driverreviewrequests_open: ya hay una abierta (doble clic, dos pestañas)
            throw new InvalidOperationException("Ya tienes una solicitud de revisión abierta.");
        }
    }

    public Task<DriverReviewRequest?> GetOpenByDriverAsync(Guid driverId, CancellationToken ct = default) =>
        _db.QueryFirstOrDefaultAsync<DriverReviewRequest?>(@"
            SELECT * FROM drivers.DriverReviewRequests
            WHERE DriverId = @DriverId AND Status = 'open'
            LIMIT 1",
            new { DriverId = driverId });

    public async Task<List<DriverReviewRequest>> GetOpenByDriversAsync(
        IEnumerable<Guid> driverIds, CancellationToken ct = default)
    {
        var ids = driverIds.Distinct().ToArray();
        if(ids.Length == 0) return new List<DriverReviewRequest>();
        var rows = await _db.QueryAsync<DriverReviewRequest>(@"
            SELECT * FROM drivers.DriverReviewRequests
            WHERE DriverId = ANY(@Ids) AND Status = 'open'",
            new { Ids = ids });
        return rows.ToList();
    }

    public Task<DriverReviewRequest?> CloseOpenAsync(
        Guid driverId, string status, Guid? resolvedByUserId, string? resolvedByName,
        string? resolution, CancellationToken ct = default) =>
        _db.QueryFirstOrDefaultAsync<DriverReviewRequest?>(@"
            UPDATE drivers.DriverReviewRequests SET
                Status           = @Status,
                ResolvedAt       = @Now,
                ResolvedByUserId = @UserId,
                ResolvedByName   = @Name,
                Resolution       = @Resolution
            WHERE DriverId = @DriverId AND Status = 'open'
            RETURNING *",
            new
            {
                DriverId = driverId, Status = status, Now = DateTime.UtcNow,
                UserId = resolvedByUserId, Name = resolvedByName, Resolution = resolution,
            });
}
