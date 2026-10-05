using System.Data;
using Dapper;
using Bugie.Payments.Domain.Interfaces;

namespace Bugie.Payments.Infrastructure.Repositories;

/// <summary>Lee el viaje de trips.trips (misma base de datos, como auth.users en UserNames).</summary>
public class TripLookup : ITripLookup
{
    private readonly IDbConnection _db;
    public TripLookup(IDbConnection db) => _db = db;

    public Task<TripForPayment?> GetAsync(Guid tripId, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<TripForPayment>(@"
            SELECT Id, PassengerId, DriverId, Status, FinalFare, PaymentMethod
            FROM trips.Trips WHERE Id = @Id", new { Id = tripId });
}
