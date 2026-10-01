namespace Bugie.Trips.Domain.Entities;

public class TripProposal
{
    public Guid Id { get; set; }
    public Guid TripId { get; set; }
    public Guid DriverId { get; set; }
    public decimal Fare { get; set; }
    public string Status { get; set; } = "pending";  // pending | accepted | rejected | superseded
    public string ProposedByRole { get; set; } = "driver";   // driver | passenger
    public string? RejectedBy { get; set; }               // passenger | driver | null
    public DateTime CreatedAt { get; set; }

    public static TripProposal Create(Guid tripId, Guid driverId, decimal fare) => new()
    {
        Id = Guid.NewGuid(),
        TripId = tripId,
        DriverId = driverId,
        Fare = fare,
        Status = "pending",
        ProposedByRole = "driver",
        RejectedBy = null,
        CreatedAt = DateTime.UtcNow,
    };

    public static TripProposal CreateCounter(Guid tripId, Guid driverId, decimal fare) => new()
    {
        Id = Guid.NewGuid(),
        TripId = tripId,
        DriverId = driverId,
        Fare = fare,
        Status = "pending",
        ProposedByRole = "passenger",
        RejectedBy = null,
        CreatedAt = DateTime.UtcNow,
    };
}