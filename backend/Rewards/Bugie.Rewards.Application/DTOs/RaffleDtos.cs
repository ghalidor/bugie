namespace Bugie.Rewards.Application.DTOs;

/// <param name="DrawSeed">Semilla del sorteo. Permite recalcular y comprobar el ganador.</param>
/// <param name="TicketsNow">Tickets repartidos hasta ahora.</param>
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
    string?   DrawSeed,
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
    string?   Note,
    // Nombre y rol del ganador (para el admin)
    string?   UserName = null,
    string?   UserRole = null,
    // Codigo que el ganador presenta para cobrar (PZ-XXXXXX)
    string?   PrizeCode = null);

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
