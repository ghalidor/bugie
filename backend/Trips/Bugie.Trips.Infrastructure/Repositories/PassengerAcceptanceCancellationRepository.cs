using System.Data;
using Dapper;
using Bugie.Trips.Domain.Entities;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Infrastructure.Repositories;

/// <summary>
/// Repositorio inmutable de cancelaciones de aceptación del pasajero.
/// </summary>
public class PassengerAcceptanceCancellationRepository
    : IPassengerAcceptanceCancellationRepository
{
    private readonly IDbConnection _db;
    public PassengerAcceptanceCancellationRepository(IDbConnection db) => _db = db;

    public Task AddAsync(PassengerAcceptanceCancellation row, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            INSERT INTO trips.PassengerAcceptanceCancellations
                (Id, TripId, ProposalId, PassengerId, CanceledAt)
            VALUES
                (@Id, @TripId, @ProposalId, @PassengerId, @CanceledAt)",
            row);

    public Task<int> CountByPassengerSinceAsync(
        Guid passengerId, DateTime sinceUtc, CancellationToken ct = default) =>
        _db.ExecuteScalarAsync<int>(@"
            SELECT COUNT(*) FROM trips.PassengerAcceptanceCancellations
            WHERE PassengerId = @PassengerId AND CanceledAt >= @Since",
            new { PassengerId = passengerId, Since = sinceUtc });
}
