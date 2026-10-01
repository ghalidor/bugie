namespace Bugie.Payments.Domain.Entities;

public class Withdrawal
{
    public Guid      Id          { get; private set; }
    public Guid      DriverId    { get; private set; }
    public decimal   Amount      { get; private set; }
    public string    Method      { get; private set; }
    public string    AccountRef  { get; private set; }
    public string    Status      { get; private set; }
    public DateTime? ProcessedAt { get; private set; }
    public DateTime  CreatedAt   { get; private set; }

    private Withdrawal() { }

    public static Withdrawal Create(Guid driverId, decimal amount,
                                     string method, string accountRef) => new()
    {
        Id         = Guid.NewGuid(),
        DriverId   = driverId,
        Amount     = amount,
        Method     = method,
        AccountRef = accountRef,
        Status     = "pending",
        CreatedAt  = DateTime.UtcNow,
    };

    public void Process() { Status = "processing"; }
    public void Complete() { Status = "completed"; ProcessedAt = DateTime.UtcNow; }
    public void Reject()   { Status = "rejected";  ProcessedAt = DateTime.UtcNow; }
}
