namespace Bugie.Payments.Domain.Entities;

public class Payment
{
    public Guid      Id           { get; private set; }
    public Guid      TripId       { get; private set; }
    public Guid      PassengerId  { get; private set; }
    public Guid      DriverId     { get; private set; }
    public decimal   Amount       { get; private set; }
    public decimal   PlatformFee  { get; private set; }
    public decimal   DriverAmount { get; private set; }
    public string    Method       { get; private set; }
    public string    Status       { get; private set; }
    public string?   Reference    { get; private set; }
    public DateTime  CreatedAt    { get; private set; }
    public DateTime? PaidAt       { get; private set; }

    private Payment() { }

    public static Payment Create(Guid tripId, Guid passengerId, Guid driverId,
                                  decimal amount, string method,
                                  decimal platformFeeRate = 0.10m) => new()
    {
        Id           = Guid.NewGuid(),
        TripId       = tripId,
        PassengerId  = passengerId,
        DriverId     = driverId,
        Amount       = amount,
        PlatformFee  = Math.Round(amount * platformFeeRate, 2),
        DriverAmount = Math.Round(amount * (1 - platformFeeRate), 2),
        Method       = method,
        Status       = "pending",
        CreatedAt    = DateTime.UtcNow,
    };

    public void Complete(string? reference = null)
    {
        Status    = "completed";
        Reference = reference;
        PaidAt    = DateTime.UtcNow;
    }

    public void Refund() => Status = "refunded";
    public void Fail()   => Status = "failed";
}
