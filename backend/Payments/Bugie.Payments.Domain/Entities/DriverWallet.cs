namespace Bugie.Payments.Domain.Entities;

public class DriverWallet
{
    public Guid     Id             { get; private set; }
    public Guid     DriverId       { get; private set; }
    public decimal  Balance        { get; private set; }
    public decimal  TotalEarned    { get; private set; }
    public decimal  TotalWithdrawn { get; private set; }
    public DateTime UpdatedAt      { get; private set; }

    private DriverWallet() { }

    public static DriverWallet Create(Guid driverId) => new()
    {
        Id        = Guid.NewGuid(),
        DriverId  = driverId,
        Balance   = 0,
        UpdatedAt = DateTime.UtcNow,
    };

    public void Credit(decimal amount)
    {
        if (amount <= 0) throw new ArgumentException("El monto debe ser positivo.");
        Balance     += amount;
        TotalEarned += amount;
        UpdatedAt    = DateTime.UtcNow;
    }

    public void Debit(decimal amount)
    {
        if (amount > Balance) throw new InvalidOperationException("Saldo insuficiente.");
        Balance        -= amount;
        TotalWithdrawn += amount;
        UpdatedAt       = DateTime.UtcNow;
    }
}
