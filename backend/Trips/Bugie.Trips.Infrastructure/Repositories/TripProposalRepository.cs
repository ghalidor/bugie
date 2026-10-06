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
                           WHEN Status IN ('driver_accepted', 'accepted_by_passenger') THEN 0
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
                     -- Propuesta que el pasajero acept� y espera la confirmaci�n del conductor.
                     OR Status = 'accepted_by_passenger'
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
                   ProposedByRole, RejectedBy, CreatedAt, AcceptedByPassengerAt
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

    public async Task<bool> TransitionAsync(Guid id, string[] from, string to, string? rejectedBy = null,
        CancellationToken ct = default)
    {
        var n = await _db.ExecuteAsync(@"
            UPDATE trips.TripProposals
               SET Status = @To, RejectedBy = @RejectedBy
             WHERE Id = @Id AND Status = ANY(@From)",
            new { Id = id, From = from, To = to, RejectedBy = rejectedBy });
        return n > 0;
    }

    public async Task<bool> MarkAcceptedByPassengerAsync(Guid id, CancellationToken ct = default)
    {
        var n = await _db.ExecuteAsync(@"
            UPDATE trips.TripProposals
               SET Status = 'accepted_by_passenger', RejectedBy = NULL,
                   AcceptedByPassengerAt = (now() at time zone 'utc')
             WHERE Id = @Id AND Status = 'pending'",
            new { Id = id });
        return n > 0;
    }

    public async Task<bool> UndoAcceptedByPassengerAsync(Guid id, CancellationToken ct = default)
    {
        var n = await _db.ExecuteAsync(@"
            UPDATE trips.TripProposals
               SET Status = 'pending', AcceptedByPassengerAt = NULL
             WHERE Id = @Id AND Status = 'accepted_by_passenger'",
            new { Id = id });
        return n > 0;
    }

    public Task<TripProposal?> GetAcceptedByPassengerOnTripAsync(Guid tripId, CancellationToken ct = default) =>
        _db.QueryFirstOrDefaultAsync<TripProposal?>(@"
            SELECT * FROM trips.TripProposals
            WHERE TripId = @TripId AND Status = 'accepted_by_passenger'
            ORDER BY CreatedAt DESC LIMIT 1",
            new { TripId = tripId });

    public async Task<List<ClosedProposal>> RejectOthersAsync(Guid tripId, Guid acceptedId, CancellationToken ct = default)
    {
        // Incluye la aceptada por el pasajero (si eligio a otro conductor) para avisarle a ese conductor.
        var rows = await _db.QueryAsync<ClosedProposal>(@"
            WITH Objetivo AS (
                SELECT Id, Status AS OldStatus FROM trips.TripProposals
                WHERE TripId = @TripId AND Id <> @AcceptedId
                  AND Status IN ('pending', 'driver_accepted', 'accepted_by_passenger')
                FOR UPDATE
            )
            UPDATE trips.TripProposals p
               SET Status = 'rejected', RejectedBy = 'passenger'
              FROM Objetivo o, trips.Trips t
             WHERE p.Id = o.Id AND t.Id = p.TripId
            RETURNING p.Id AS ProposalId, p.TripId, p.DriverId, p.Fare, o.OldStatus,
                      t.PassengerId, t.ServiceType",
            new { TripId = tripId, AcceptedId = acceptedId });
        return rows.ToList();
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

    public async Task<int> SupersedePendingAsync(Guid tripId, Guid driverId, bool includeDriverAccepted = false,
        CancellationToken ct = default)
    {
        var statuses = includeDriverAccepted
            ? new[] { "pending", "driver_accepted" }
            : new[] { "pending" };
        return await _db.ExecuteAsync(@"
            UPDATE trips.TripProposals
            SET Status = 'superseded'
            WHERE TripId = @TripId AND DriverId = @DriverId AND Status = ANY(@Statuses)",
            new { TripId = tripId, DriverId = driverId, Statuses = statuses });
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
            WHERE TripId = @TripId AND DriverId = @DriverId
              AND Status IN ('pending', 'driver_accepted', 'accepted_by_passenger')",
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
    public async Task<List<Guid>> RejectAllByPassengerAsync(Guid tripId, CancellationToken ct = default)
    {
        // Tambien las aceptaciones a tarifa (driver_accepted). La aceptada por el
        // pasajero no: esa se deshace con cancel-acceptance.
        var drivers = await _db.QueryAsync<Guid>(@"
            UPDATE trips.TripProposals
            SET Status = 'rejected', RejectedBy = 'passenger'
            WHERE TripId = @TripId AND Status IN ('pending', 'driver_accepted')
            RETURNING DriverId",
            new { TripId = tripId });
        return drivers.ToList();
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
              -- Una aceptacion en un PROGRAMADO no bloquea los viajes de ahora.
              AND TripId IN (SELECT Id FROM trips.Trips WHERE ScheduledAt IS NULL)
            ORDER BY CreatedAt DESC LIMIT 1",
            new { DriverId = driverId });

    /// <summary>
    /// Cuando el conductor confirma una propuesta, todas las demás propuestas
    /// pending o accepted_by_passenger del mismo conductor en OTROS viajes
    /// se rechazan en cascada (RejectedBy = 'driver_busy').
    /// El motivo 'driver_busy' deja claro en el historial que el rechazo fue
    /// automático y no de mala fe.
    /// </summary>
    public async Task<List<ClosedProposal>> RejectAllOtherPendingByDriverAsync(
        Guid driverId, Guid exceptTripId, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<ClosedProposal>(@"
            WITH Objetivo AS (
                SELECT p.Id, p.Status AS OldStatus FROM trips.TripProposals p
                JOIN trips.Trips t ON t.Id = p.TripId
                WHERE p.DriverId = @DriverId
                  AND p.TripId  <> @ExceptTripId
                  AND p.Status IN ('pending', 'accepted_by_passenger', 'driver_accepted')
                  -- Las negociaciones de PROGRAMADOS siguen vigentes: no chocan con un viaje de ahora.
                  AND t.ScheduledAt IS NULL
                FOR UPDATE OF p
            )
            UPDATE trips.TripProposals p
               SET Status = 'rejected', RejectedBy = 'driver_busy'
              FROM Objetivo o, trips.Trips t
             WHERE p.Id = o.Id AND t.Id = p.TripId
            RETURNING p.Id AS ProposalId, p.TripId, p.DriverId, p.Fare, o.OldStatus,
                      t.PassengerId, t.ServiceType",
            new { DriverId = driverId, ExceptTripId = exceptTripId });
        return rows.ToList();
    }

    /// <summary>
    /// Expira propuestas 'accepted_by_passenger' que el conductor no confirmo a tiempo.
    /// El motivo 'driver_no_confirm' es claro en el historial: el conductor
    /// recibió aceptación pero no confirmó.
    ///
    /// El plazo corre desde AcceptedByPassengerAt (CreatedAt en filas antiguas):
    /// inmediato = + immediateMinutes; programado = hora del viaje - scheduledBeforeMinutes,
    /// pero nunca antes de + immediateMinutes (misma regla que NegotiationSettings.ConfirmDeadline).
    /// </summary>
    public async Task<List<ClosedProposal>> ExpireUnconfirmedAsync(
        DateTime nowUtc, int immediateMinutes, int scheduledBeforeMinutes, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<ClosedProposal>(@"
            UPDATE trips.TripProposals p
               SET Status = 'rejected', RejectedBy = 'driver_no_confirm'
              FROM trips.Trips t
             WHERE t.Id = p.TripId
               AND p.Status = 'accepted_by_passenger'
               AND @Now >= CASE
                     WHEN t.ScheduledAt IS NULL
                       THEN COALESCE(p.AcceptedByPassengerAt, p.CreatedAt) + make_interval(mins => @Imm)
                     ELSE GREATEST(t.ScheduledAt - make_interval(mins => @Sched),
                                   COALESCE(p.AcceptedByPassengerAt, p.CreatedAt) + make_interval(mins => @Imm))
                   END
            RETURNING p.Id AS ProposalId, p.TripId, p.DriverId, p.Fare,
                      'accepted_by_passenger' AS OldStatus, t.PassengerId, t.ServiceType",
            new { Now = DateTime.SpecifyKind(nowUtc, DateTimeKind.Unspecified),
                  Imm = immediateMinutes, Sched = scheduledBeforeMinutes });
        return rows.ToList();
    }

    public async Task<List<Guid>> CancelOpenByTripAsync(Guid tripId, string closedBy = "trip_cancelled",
        CancellationToken ct = default)
    {
        // Viaje cancelado (o reabierto) = negociacion cerrada. RejectedBy deja constancia del motivo.
        var drivers = await _db.QueryAsync<Guid>(@"
            UPDATE trips.TripProposals
               SET Status = 'cancelled', RejectedBy = @ClosedBy
             WHERE TripId = @TripId
               AND Status IN ('pending', 'accepted_by_passenger', 'driver_accepted')
            RETURNING DriverId",
            new { TripId = tripId, ClosedBy = closedBy });
        return drivers.Distinct().ToList();
    }

    public Task<int> RejectDriverOnTripAsync(
        Guid tripId, Guid driverId, string rejectedBy, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE trips.TripProposals
               SET Status = 'rejected', RejectedBy = @By
             WHERE TripId = @TripId AND DriverId = @DriverId
               AND Status <> 'rejected'",
            new { TripId = tripId, DriverId = driverId, By = rejectedBy });
}