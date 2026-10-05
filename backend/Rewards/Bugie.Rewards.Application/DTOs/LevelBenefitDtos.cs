namespace Bugie.Rewards.Application.DTOs;

/// <summary>Cupo del mes de un beneficio de nivel.</summary>
public record LevelBenefitQuotaDto(
    int Total,
    int Used,
    int Available);

/// <summary>Viajes gratis del mes. MaxAmount = tope en soles de cada viaje.</summary>
public record LevelFreeTripsDto(
    int      Total,
    int      Used,
    int      Available,
    decimal? MaxAmount);

/// <summary>
/// Beneficios de nivel del pasajero en el mes actual (mes local de Perú).
/// </summary>
/// <param name="Eligible">false si no puede reclamar (conductor, puntos o canje apagados, cupones sin aplicar a la tarifa).</param>
/// <param name="NotEligibleReason">El motivo, en palabras del usuario.</param>
/// <param name="Level">Nombre interno del nivel (bronze, silver, gold, platinum).</param>
/// <param name="LevelName">Nombre para mostrar (Bronce, Plata…).</param>
/// <param name="Period">Mes local, formato YYYY-MM.</param>
/// <param name="PeriodEndsAt">Último instante del mes (hora de Perú). Los cupones reclamados vencen ahí.</param>
/// <param name="CouponsApplyToFare">Setting coupons_apply_to_fare: si los cupones descuentan de la tarifa.</param>
/// <param name="CanClaim">true si es elegible y le queda al menos un cupón o viaje gratis.</param>
public record LevelBenefitsDto(
    bool                 Eligible,
    string?              NotEligibleReason,
    string               Level,
    string               LevelName,
    decimal              DiscountPercentage,
    LevelBenefitQuotaDto DiscountCoupons,
    LevelFreeTripsDto    FreeTrips,
    string               Period,
    DateTime             PeriodEndsAt,
    bool                 CouponsApplyToFare,
    bool                 CanClaim);

/// <summary>Resultado de reclamar un beneficio: el cupón creado y cómo queda el mes.</summary>
public record LevelBenefitClaimResultDto(
    RedemptionDto    Coupon,
    LevelBenefitsDto Benefits);

/// <summary>Resultado de usar un cupón de ticket en un sorteo.</summary>
/// <param name="TicketNumbers">Números de los tickets creados.</param>
/// <param name="MyTickets">Total de tickets del usuario en el sorteo, ya con los nuevos.</param>
/// <param name="TicketCouponsLeft">Cupones de ticket activos que le quedan.</param>
public record UseTicketCouponResultDto(
    Guid                  RaffleId,
    string                RaffleName,
    int                   TicketsAdded,
    IReadOnlyList<string> TicketNumbers,
    int                   MyTickets,
    int                   TicketCouponsLeft,
    RedemptionDto         Coupon);
