namespace Bugie.Rewards.Application.DTOs;

/// <summary>Promoción vigente, contada para el usuario.</summary>
public record ActivePromotionDto(
    Guid     Id,
    string   Name,
    string?  Description,
    /// <summary>Qué gana, en texto: «2x puntos» o «+50 puntos».</summary>
    string   Reward,
    /// <summary>Cuándo aplica, en texto: «Lun a Vie de 12:00 a 14:00».</summary>
    string   When,
    /// <summary>true si aplica justo ahora. Sirve para destacarla.</summary>
    bool     ActiveNow,
    DateTime? EndDate);

/// <summary>Sorteo visto por el usuario.</summary>
public record UserRaffleDto(
    Guid      Id,
    string    Name,
    string    RaffleType,
    string    PrizeDescription,
    decimal?  PrizeValue,
    DateTime  DrawDate,
    string    Status,
    /// <summary>Tickets que ya tiene el usuario en este sorteo.</summary>
    int       MyTickets,
    /// <summary>true si el usuario cumple los requisitos para participar.</summary>
    bool      Eligible,
    /// <summary>Si no participa, por qué.</summary>
    string?   NotEligibleReason,
    bool      IWon,
    int?      MyPrizeRank,
    string?   MyTicketNumber);
