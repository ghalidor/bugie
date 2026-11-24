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
    /// <summary>Valor en soles del premio PRINCIPAL (puesto 1).</summary>
    public decimal?  PrizeValue       { get; set; }

    /// <summary>
    /// Premio de los puestos 2 en adelante (si hay más de un ganador). Null =
    /// "Premio secundario #n" sin monto: el admin escribe cuánto pagó.
    /// </summary>
    public string?   SecondaryPrizeDescription { get; set; }
    public decimal?  SecondaryPrizeValue       { get; set; }

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

    /// <summary>Todavía se puede sortear (ni sorteado ni cancelado).</summary>
    public bool IsPendingDraw => Status is RaffleStatus.Open or RaffleStatus.Closed;

    /// <summary>Qué se gana en ese puesto.</summary>
    public string PrizeDetailFor(int rank) =>
        rank == 1 ? PrizeDescription
        : !string.IsNullOrWhiteSpace(SecondaryPrizeDescription) ? SecondaryPrizeDescription!
        : $"Premio secundario #{rank}";

    /// <summary>
    /// Valor en soles del premio de ese puesto. Los puestos 2+ NUNCA heredan
    /// el valor del principal: si no se definió, null (monto a criterio del admin).
    /// </summary>
    public decimal? PrizeValueFor(int rank) =>
        rank == 1 ? PrizeValue : SecondaryPrizeValue;

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
    /// <summary>Valor en soles del premio de ESTE puesto (copiado al sortear). Null = sin monto fijo.</summary>
    public decimal?  PrizeValue   { get; set; }
    public string    Status       { get; set; } = "pending";
    public DateTime? DeliveredAt  { get; set; }
    public Guid?     DeliveredBy  { get; set; }
    public string?   Note         { get; set; }
    public DateTime  CreatedAt    { get; set; }
    /// <summary>
    /// Código del premio (PZ-XXXXXX). Lo genera la base al guardar el ganador
    /// y es el que el conductor presenta para cobrar.
    /// </summary>
    public string?   PrizeCode    { get; set; }
}
