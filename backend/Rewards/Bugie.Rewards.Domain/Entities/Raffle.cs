namespace Bugie.Rewards.Domain.Entities;

public static class RaffleTypes
{
    public const string Weekly  = "weekly";
    public const string Monthly = "monthly";
    public const string Special = "special";
}

public static class RaffleStatus
{
    /// <summary>Acepta tickets.</summary>
    public const string Open      = "open";
    /// <summary>Ya no acepta tickets, pero todavía no se sorteó.</summary>
    public const string Closed    = "closed";
    public const string Drawn     = "drawn";
    public const string Cancelled = "cancelled";
}

public static class TicketSources
{
    public const string LevelBenefit     = "level_benefit";
    public const string PointsRedemption = "points_redemption";
    public const string Promotion        = "promotion";
    public const string MonthlyPoints    = "monthly_points";
}

public class Raffle
{
    public Guid      Id               { get; set; }
    public string    Name             { get; set; } = string.Empty;
    public string    RaffleType       { get; set; } = RaffleTypes.Monthly;
    public string    PrizeDescription { get; set; } = string.Empty;
    public decimal?  PrizeValue       { get; set; }
    public DateTime  DrawDate         { get; set; }

    /// <summary>Nivel mínimo para participar. Null = todos.</summary>
    public string?   MinLevelRequired { get; set; }

    /// <summary>Meses mínimos acumulando puntos. Para el sorteo especial.</summary>
    public int?      MinMonthsActive  { get; set; }

    public string    TargetUserType   { get; set; } = "both";
    public int       WinnersCount     { get; set; } = 1;
    public string    Status           { get; set; } = RaffleStatus.Open;

    public string?   DrawSeed         { get; set; }
    public DateTime? DrawnAt          { get; set; }
    public int?      TicketsAtDraw    { get; set; }

    public DateTime  CreatedAt        { get; set; }
    public DateTime  UpdatedAt        { get; set; }

    public bool IsOpen => Status == RaffleStatus.Open;

    /// <summary>Ya pasó la fecha y todavía no se sorteó.</summary>
    public bool IsDue(DateTime utcNow) =>
        Status is RaffleStatus.Open or RaffleStatus.Closed && DrawDate <= utcNow;

    public bool AppliesTo(string userType) =>
        TargetUserType == "both" || TargetUserType == userType;

    /// <summary>Cuántos tickets da cada nivel según el tipo de sorteo.</summary>
    public int TicketsForLevel(RewardLevel level) => RaffleType switch
    {
        RaffleTypes.Weekly => level.WeeklyRaffleTickets,
        _                  => level.MonthlyRaffleTickets,
    };
}

public class RaffleTicket
{
    public Guid     Id           { get; set; }
    public Guid     RaffleId     { get; set; }
    public Guid     UserId       { get; set; }
    public Guid     ProfileId    { get; set; }
    public string   TicketNumber { get; set; } = string.Empty;
    public string   Source       { get; set; } = TicketSources.LevelBenefit;
    public Guid?    ReferenceId  { get; set; }
    public DateTime CreatedAt    { get; set; }
}

public class RaffleWinner
{
    public Guid      Id           { get; set; }
    public Guid      RaffleId     { get; set; }
    public Guid      UserId       { get; set; }
    public string    TicketNumber { get; set; } = string.Empty;
    public int       PrizeRank    { get; set; }
    public string?   PrizeDetail  { get; set; }
    public string    Status       { get; set; } = "pending";
    public DateTime? DeliveredAt  { get; set; }
    public Guid?     DeliveredBy  { get; set; }
    public string?   Note         { get; set; }
    public DateTime  CreatedAt    { get; set; }
}
