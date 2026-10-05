namespace Bugie.Rewards.Application.DTOs;

/// <summary>Promoción vigente, contada para el usuario.</summary>
/// <param name="Reward">Qué gana, en texto: «2x puntos» o «+50 puntos».</param>
/// <param name="When">Cuándo aplica, en texto: «Lun a Vie de 12:00 a 14:00».</param>
/// <param name="ActiveNow">true si aplica justo ahora. Sirve para destacarla.</param>
public record ActivePromotionDto(
    Guid     Id,
    string   Name,
    string?  Description,
    string   Reward,
    string   When,
    bool     ActiveNow,
    DateTime? EndDate);

/// <summary>Sorteo visto por el usuario.</summary>
/// <param name="MyTickets">Tickets que ya tiene el usuario en este sorteo.</param>
/// <param name="Eligible">true si el usuario cumple los requisitos para participar.</param>
/// <param name="NotEligibleReason">Si no participa, por qué.</param>
/// <param name="MyPrizeCode">Si ganó: código para cobrar el premio (PZ-XXXXXX).</param>
/// <param name="MyPrizeDelivered">Si ganó: el premio ya se entregó/pagó (aunque el admin lo marcara sin registrar un pago).</param>
/// <param name="TicketCouponsAvailable">Cupones de ticket de sorteo (canjeados en el catálogo) activos del usuario. Mismo valor en todos los sorteos.</param>
/// <param name="CanUseTicketCoupon">true si puede usar un cupón de ticket en ESTE sorteo (abierto, cumple requisitos y tiene cupones).</param>
/// <param name="NextTicketCouponId">Cupón que se usaría (el que vence primero). Null si no tiene.</param>
public record UserRaffleDto(
    Guid      Id,
    string    Name,
    string    RaffleType,
    string    PrizeDescription,
    decimal?  PrizeValue,
    DateTime  DrawDate,
    string    Status,
    int       MyTickets,
    bool      Eligible,
    string?   NotEligibleReason,
    bool      IWon,
    int?      MyPrizeRank,
    string?   MyTicketNumber,
    string?   MyPrizeCode = null,
    bool      MyPrizeDelivered = false,
    int       TicketCouponsAvailable = 0,
    bool      CanUseTicketCoupon = false,
    Guid?     NextTicketCouponId = null);
