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

/// <summary>Admin: un ticket del sorteo con su propietario.</summary>
public record RaffleTicketAdminDto(
    string   TicketNumber,
    Guid     UserId,
    string?  UserName,
    string?  UserRole,
    string   Source,
    DateTime CreatedAt,
    bool     IsWinner);

/// <summary>
/// GET /api/rewards/admin/raffles/{raffleId}/tickets.
/// Total = tickets que cumplen el filtro (para paginar); Participants,
/// TotalTickets y BySource son de todo el sorteo.
/// </summary>
public record RaffleTicketsPageDto(
    List<RaffleTicketAdminDto> Items,
    int                        Total,
    int                        Participants,
    int                        TotalTickets,
    Dictionary<string, int>    BySource);
