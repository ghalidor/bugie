using Dapper;
using System.Data;
using Bugie.Trips.Domain.Entities;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Infrastructure.Repositories;

public class TripProposalRepository : ITripProposalRepository
{
    private readonly IDbConnection _db;
    public TripProposalRepository(IDbConnection db) => _db = db;

    /// <summary>
    /// Devuelve UNA sola propuesta por cada conductor del viaje:
    ///   - Si el conductor tiene una propuesta 'pending' (sea suya o contrapropuesta del pasajero), esa.
    ///   - Si no, la última 'rejected/driver' de las últimas 24h (para mostrar feedback "declinó").
    /// Esto garantiza que el pasajero vea un solo card por conductor en todo momento.
    /// </summary>
    public async Task<List<TripProposal>> GetByTripAsync(Guid tripId, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<TripProposal>(@"
            WITH Candidatas AS (
                SELECT *,
                       CASE
                           WHEN Status = 'driver_accepted' THEN 0
                           WHEN Status = 'pending' THEN 1
                           WHEN Status = 'rejected' AND RejectedBy = 'driver'
                                AND CreatedAt > ((now() at time zone 'utc') - INTERVAL '24 hours') THEN 2
                           ELSE 99
                       END AS Prioridad
                FROM trips.TripProposals
                WHERE TripId = @TripId
                  AND (
                        Status = 'pending'
                     OR Status = 'driver_accepted'
                     OR (Status = 'rejected' AND RejectedBy = 'driver'
                         AND CreatedAt > ((now() at time zone 'utc') - INTERVAL '24 hours'))
                  )
            ),
            Numeradas AS (
                SELECT *, ROW_NUMBER() OVER (
                    PARTITION BY DriverId
                    ORDER BY Prioridad ASC, CreatedAt DESC
                ) AS Rn
                FROM Candidatas
            )
            SELECT Id, TripId, DriverId, Fare, Status,
                   ProposedByRole, RejectedBy, CreatedAt
            FROM Numeradas
            WHERE Rn = 1
            ORDER BY CreatedAt DESC",
            new { TripId = tripId });
        return rows.ToList();
    }

    public async Task AddAsync(TripProposal proposal, CancellationToken ct = default)
    {
        await _db.ExecuteAsync(@"
            INSERT INTO trips.TripProposals
                (Id, TripId, DriverId, Fare, Status, ProposedByRole, RejectedBy, CreatedAt)
            VALUES
                (@Id, @TripId, @DriverId, @Fare, @Status, @ProposedByRole, @RejectedBy, @CreatedAt)",
            proposal);
    }

    public async Task<TripProposal?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        await _db.QueryFirstOrDefaultAsync<TripProposal>(
            "SELECT * FROM trips.TripProposals WHERE Id = @Id", new { Id = id });

    public async Task UpdateStatusAsync(Guid id, string status, string? rejectedBy, CancellationToken ct = default)
    {
        await _db.ExecuteAsync(@"
            UPDATE trips.TripProposals
            SET Status = @Status, RejectedBy = @RejectedBy
            WHERE Id = @Id",
            new { Id = id, Status = status, RejectedBy = rejectedBy });
    }

    public async Task RejectOthersAsync(Guid tripId, Guid acceptedId, CancellationToken ct = default)
    {
        await _db.ExecuteAsync(@"
            UPDATE trips.TripProposals
            SET Status = 'rejected', RejectedBy = 'passenger'
            WHERE TripId = @TripId AND Id != @AcceptedId
              AND Status IN ('pending', 'driver_accepted')",
            new { TripId = tripId, AcceptedId = acceptedId });
    }

    /// <summary>
    /// �Este conductor ya tiene una aceptaci�n (driver_accepted) pendiente
    /// para este viaje? Evita que acepte dos veces el mismo.
    /// </summary>
    public async Task<TripProposal?> GetDirectAcceptAsync(
        Guid tripId, Guid driverId, CancellationToken ct = default) =>
        await _db.QueryFirstOrDefaultAsync<TripProposal>(@"
            SELECT * FROM trips.TripProposals
            WHERE TripId = @TripId AND DriverId = @DriverId
              AND Status = 'driver_accepted'
            ORDER BY CreatedAt DESC LIMIT 1",
            new { TripId = tripId, DriverId = driverId });

    public async Task<int> SupersedePendingAsync(Guid tripId, Guid driverId, CancellationToken ct = default)
    {
        return await _db.ExecuteAsync(@"
            UPDATE trips.TripProposals
            SET Status = 'superseded'
            WHERE TripId = @TripId AND DriverId = @DriverId AND Status = 'pending'",
            new { TripId = tripId, DriverId = driverId });
    }

    public async Task<List<TripProposal>> GetHistoryByDriverAsync(
        Guid tripId, Guid driverId, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<TripProposal>(@"
            SELECT * FROM trips.TripProposals
            WHERE TripId = @TripId AND DriverId = @DriverId
            ORDER BY CreatedAt DESC LIMIT 20",
            new { TripId = tripId, DriverId = driverId });
        return rows.ToList();
    }

    /// <summary>
    /// El conductor declina: marca como rejected/driver TODAS las propuestas pending
    /// entre él y este viaje (incluyendo contrapropuestas del pasajero hacia él).
    /// </summary>
    public async Task<int> RejectAllBetweenAsync(Guid tripId, Guid driverId, CancellationToken ct = default)
    {
        return await _db.ExecuteAsync(@"
            UPDATE trips.TripProposals
            SET Status = 'rejected', RejectedBy = 'driver'
            WHERE TripId = @TripId AND DriverId = @DriverId AND Status = 'pending'",
            new { TripId = tripId, DriverId = driverId });
    }

    /// <summary>
    /// Devuelve la última propuesta (de los últimos 24h) que el pasajero rechazó
    /// hacia este conductor. Sirve para mostrar feedback al conductor.
    /// </summary>
    public async Task<TripProposal?> GetLastRejectedByPassengerAsync(
        Guid tripId, Guid driverId, CancellationToken ct = default)
    {
        return await _db.QueryFirstOrDefaultAsync<TripProposal>(@"
            SELECT * FROM trips.TripProposals
            WHERE TripId = @TripId
              AND DriverId = @DriverId
              AND Status = 'rejected'
              AND RejectedBy = 'passenger'
              AND CreatedAt > ((now() at time zone 'utc') - INTERVAL '24 hours')
            ORDER BY CreatedAt DESC LIMIT 1",
            new { TripId = tripId, DriverId = driverId });
    }

    /// <summary>
    /// Devuelve la propuesta pending más reciente entre un viaje y un conductor.
    /// La usamos al aceptar el viaje: si hay una contrapropuesta del pasajero
    /// pendiente, su tarifa es la que debe quedar como EstimatedFare.
    /// </summary>
    public async Task<TripProposal?> GetPendingBetweenAsync(
        Guid tripId, Guid driverId, CancellationToken ct = default)
    {
        return await _db.QueryFirstOrDefaultAsync<TripProposal>(@"
            SELECT * FROM trips.TripProposals
            WHERE TripId = @TripId
              AND DriverId = @DriverId
              AND Status = 'pending'
            ORDER BY CreatedAt DESC LIMIT 1",
            new { TripId = tripId, DriverId = driverId });
    }

    /// <summary>
    /// Rechaza TODAS las propuestas pending del viaje desde el lado del pasajero.
    /// </summary>
    public async Task<int> RejectAllByPassengerAsync(Guid tripId, CancellationToken ct = default)
    {
        return await _db.ExecuteAsync(@"
            UPDATE trips.TripProposals
            SET Status = 'rejected', RejectedBy = 'passenger'
            WHERE TripId = @TripId AND Status = 'pending'",
            new { TripId = tripId });
    }

    /// <summary>
    /// Devuelve TripIds donde el conductor tiene propuestas NO-rejected.
    /// Se usa para que esos viajes se vean en la lista del conductor
    /// aunque estén fuera del radio de cercanía.
    /// </summary>
    public async Task<List<Guid>> GetTripIdsWithActiveProposalAsync(
        Guid driverId, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<Guid>(@"
            SELECT DISTINCT TripId FROM trips.TripProposals
            WHERE DriverId = @DriverId AND Status <> 'rejected'",
            new { DriverId = driverId });
        return rows.ToList();
    }

    /// <summary>
    /// Devuelve la propuesta del conductor que el pasajero ya aceptó (en estado
    /// 'accepted_by_passenger') y está esperando confirmación.
    /// Si tiene una, el conductor NO debe poder aceptar/proponer en otros viajes.
    /// </summary>
    public Task<TripProposal?> GetAcceptedByPassengerForDriverAsync(
        Guid driverId, CancellationToken ct = default) =>
        _db.QueryFirstOrDefaultAsync<TripProposal?>(@"
            SELECT * FROM trips.TripProposals
            WHERE DriverId = @DriverId AND Status = 'accepted_by_passenger'
            ORDER BY CreatedAt DESC LIMIT 1",
            new { DriverId = driverId });

    /// <summary>
    /// Cuando el conductor confirma una propuesta, todas las demás propuestas
    /// pending o accepted_by_passenger del mismo conductor en OTROS viajes
    /// se rechazan en cascada (RejectedBy = 'driver_busy').
    /// El motivo 'driver_busy' deja claro en el historial que el rechazo fue
    /// automático y no de mala fe.
    /// </summary>
    public async Task<int> RejectAllOtherPendingByDriverAsync(
        Guid driverId, Guid exceptTripId, CancellationToken ct = default)
    {
        return await _db.ExecuteAsync(@"
            UPDATE trips.TripProposals
            SET Status = 'rejected', RejectedBy = 'driver_busy'
            WHERE DriverId   = @DriverId
              AND TripId    <> @ExceptTripId
              AND Status IN ('pending', 'accepted_by_passenger', 'driver_accepted')",
            new { DriverId = driverId, ExceptTripId = exceptTripId });
    }

    /// <summary>
    /// Expira propuestas 'accepted_by_passenger' viejas (CreatedAt &lt; cutoff).
    /// El motivo 'driver_no_confirm' es claro en el historial: el conductor
    /// recibió aceptación pero no confirmó.
    ///
    /// Nota: usamos CreatedAt como aproximación. Idealmente tendríamos
    /// AcceptedByPassengerAt pero no agregamos esa columna para no complicar
    /// el schema. Con cutoff ~30min es seguro: las negociaciones reales no
    /// duran tanto.
    /// </summary>
    public async Task<int> ExpireStaleAcceptedByPassengerAsync(
        DateTime cutoffUtc, CancellationToken ct = default)
    {
        return await _db.ExecuteAsync(@"
            UPDATE trips.TripProposals
            SET Status = 'rejected', RejectedBy = 'driver_no_confirm'
            WHERE Status     = 'accepted_by_passenger'
              AND CreatedAt  < @Cutoff",
            new { Cutoff = cutoffUtc });
    }

    public async Task<List<Guid>> CancelOpenByTripAsync(Guid tripId, CancellationToken ct = default)
    {
        // Viaje cancelado = negociacion cerrada. RejectedBy deja constancia del motivo.
        var drivers = await _db.QueryAsync<Guid>(@"
            UPDATE trips.TripProposals
               SET Status = 'cancelled', RejectedBy = 'trip_cancelled'
             WHERE TripId = @TripId
               AND Status IN ('pending', 'accepted_by_passenger', 'driver_accepted')
            RETURNING DriverId",
            new { TripId = tripId });
        return drivers.Distinct().ToList();
    }
}