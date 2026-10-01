namespace Bugie.Drivers.Domain.Entities;

public class Review
{
    public Guid     Id          { get; private set; }
    public Guid     DriverId    { get; private set; }
    public Guid     PassengerId { get; private set; }
    public Guid     TripId      { get; private set; }
    public byte     Rating      { get; private set; }
    public string?  Comment     { get; private set; }
    public DateTime CreatedAt   { get; private set; }

    private Review() { }

    public static Review Create(Guid driverId, Guid passengerId,
                                 Guid tripId, byte rating, string? comment = null)
    {
        if (rating < 1 || rating > 5)
            throw new ArgumentException("Rating debe estar entre 1 y 5.");
        return new Review
        {
            Id          = Guid.NewGuid(),
            DriverId    = driverId,
            PassengerId = passengerId,
            TripId      = tripId,
            Rating      = rating,
            Comment     = comment,
            CreatedAt   = DateTime.UtcNow,
        };
    }
}
