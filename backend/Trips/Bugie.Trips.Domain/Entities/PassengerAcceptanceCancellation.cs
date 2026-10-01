namespace Bugie.Trips.Domain.Entities;

/// <summary>
/// Registro histórico inmutable de cuando un pasajero decide "deshacer"
/// una aceptación de propuesta antes de que el conductor confirme.
///
/// La propuesta original vuelve a 'pending' (no se rechaza), así el conductor
/// puede confirmar después si quiere. Este registro queda como auditoría.
///
/// Usos futuros: detectar pasajeros indecisos, métricas, soporte.
/// </summary>
public class PassengerAcceptanceCancellation
{
    public Guid Id { get; private set; }
    public Guid TripId { get; private set; }
    public Guid ProposalId { get; private set; }
    public Guid PassengerId { get; private set; }
    public DateTime CanceledAt { get; private set; }

    private PassengerAcceptanceCancellation() { }

    public static PassengerAcceptanceCancellation Create(
        Guid tripId, Guid proposalId, Guid passengerId) =>
        new()
        {
            Id = Guid.NewGuid(),
            TripId = tripId,
            ProposalId = proposalId,
            PassengerId = passengerId,
            CanceledAt = DateTime.UtcNow,
        };
}
