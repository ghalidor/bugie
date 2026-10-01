namespace Bugie.Rewards.Application.DTOs;

public record RaffleDto(
    Guid      Id,
    string    Name,
    string    RaffleType,
    string    PrizeDescription,
    decimal?  PrizeValue,
    DateTime  DrawDate,
    string?   MinLevelRequired,
    int?      MinMonthsActive,
    string    TargetUserType,
    int       WinnersCount,
    string    Status,
    DateTime? DrawnAt,
    int?      TicketsAtDraw,
    /// <summary>Semilla del sorteo. Permite recalcular y comprobar el ganador.</summary>
    string?   DrawSeed,
    /// <summary>Tickets repartidos hasta ahora.</summary>
    int       TicketsNow,
    List<RaffleWinnerDto> Winners);

public record RaffleWinnerDto(
    Guid      Id,
    Guid      UserId,
    string    TicketNumber,
    int       PrizeRank,
    string?   PrizeDetail,
    string    Status,
    DateTime? DeliveredAt,
    string?   Note);

public record RaffleInput(
    string    Name,
    string    RaffleType,
    string    PrizeDescription,
    decimal?  PrizeValue,
    DateTime  DrawDate,
    string?   MinLevelRequired,
    int?      MinMonthsActive,
    string    TargetUserType,
    int       WinnersCount,
    bool      Open);

/// <summary>Lo que ve el usuario: en qué sorteos participa y con cuántos tickets.</summary>
public record MyRaffleDto(
    Guid      RaffleId,
    string    Name,
    string    RaffleType,
    string    PrizeDescription,
    DateTime  DrawDate,
    string    Status,
    int       MyTickets,
    bool      IWon,
    int?      MyPrizeRank);
