namespace Bugie.Rewards.Domain.Entities;

public static class ReferralStatus
{
    /// <summary>Se registró con el código pero aún no completa los viajes.</summary>
    public const string Pending   = "pending";
    public const string Qualified = "qualified";
}

/// <summary>
/// Código fijo de un usuario. No cambia nunca: se comparte por donde sea.
/// </summary>
public class ReferralCode
{
    public Guid     Id        { get; set; }
    public Guid     UserId    { get; set; }
    public string   Code      { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}

/// <summary>Quién trajo a quién.</summary>
public class Referral
{
    public Guid      Id               { get; set; }
    public Guid      ReferrerUserId   { get; set; }
    public Guid      ReferredUserId   { get; set; }
    public string    ReferredUserType { get; set; } = "passenger";
    public string    Code             { get; set; } = string.Empty;
    public string    Status           { get; set; } = ReferralStatus.Pending;
    public int       TripsCompleted   { get; set; }

    /// <summary>Puntos ya pagados. Se guardan para no pagar dos veces.</summary>
    public int       SignupPoints     { get; set; }
    public int       QualifyPoints    { get; set; }

    public DateTime  CreatedAt        { get; set; }
    public DateTime? QualifiedAt      { get; set; }
}

public class ReferralInvitation
{
    public Guid      Id             { get; set; }
    public Guid      ReferrerUserId { get; set; }
    public string    Email          { get; set; } = string.Empty;
    public string    Code           { get; set; } = string.Empty;
    public DateTime  SentAt         { get; set; }
    public DateTime? AcceptedAt     { get; set; }
}
