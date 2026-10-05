namespace Bugie.Rewards.Application.DTOs;

/// <summary>Item del catalogo tal como lo ve el usuario.</summary>
/// <param name="CanAfford">true si el usuario tiene puntos suficientes ahora mismo.</param>
/// <param name="PointsMissing">Cuantos puntos le faltan. 0 si ya puede canjearlo.</param>
/// <param name="BlockedReason">Null si puede canjearlo. Si no, el motivo en texto.</param>
public record CatalogItemDto(
    Guid     Id,
    string   Code,
    string   UserType,
    string   Name,
    string?  Description,
    int      PointsCost,
    string   RewardType,
    decimal? AmountSoles,
    int?     Quantity,
    decimal? Percentage,
    string?  MinLevel,
    int?     Stock,
    int      ValidityDays,
    short    SortOrder,
    bool     IsActive,

    bool     CanAfford,

    int      PointsMissing,

    string?  BlockedReason);

public record RedemptionDto(
    Guid      Id,
    string    Code,
    string    ItemName,
    int       PointsSpent,
    string    RewardType,
    decimal?  AmountSoles,
    int?      Quantity,
    decimal?  Percentage,
    string    Status,
    DateTime  ExpiresAt,
    DateTime? UsedAt,
    string?   UsedNote,
    DateTime  CreatedAt,
    // Quien canjeo (lo llena el listado del admin)
    Guid?     UserId   = null,
    string?   UserName = null,
    string?   UserRole = null);

/// <summary>Resultado del canje: el cupon y el saldo que quedo.</summary>
public record RedeemResultDto(
    RedemptionDto Redemption,
    int           AvailablePointsAfter,
    string        CurrentLevel);

/// <summary>Respuesta a Trips cuando pregunta si un cupón sirve para un viaje.</summary>
/// <param name="DiscountAmount">Lo que de verdad se descuenta, ya recortado si hizo falta.</param>
/// <param name="FullDiscount">Lo mismo que DiscountAmount. Se conserva por compatibilidad.</param>
/// <param name="Reason">Por qué no se puede usar. Null si sí se puede.</param>
/// <param name="Warning">Aviso cuando se aplicó menos de lo que valía.</param>
public record CouponValidationDto(
    bool     Valid,
    string?  Code,
    string?  ItemName,
    string?  RewardType,
    decimal  DiscountAmount,
    decimal  FullDiscount,
    string?  Reason,
    string?  Warning);
