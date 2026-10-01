namespace Bugie.Rewards.Application.DTOs;

/// <summary>Item del catalogo tal como lo ve el usuario.</summary>
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

    /// <summary>true si el usuario tiene puntos suficientes ahora mismo.</summary>
    bool     CanAfford,

    /// <summary>Cuantos puntos le faltan. 0 si ya puede canjearlo.</summary>
    int      PointsMissing,

    /// <summary>Null si puede canjearlo. Si no, el motivo en texto.</summary>
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
    DateTime  CreatedAt);

/// <summary>Resultado del canje: el cupon y el saldo que quedo.</summary>
public record RedeemResultDto(
    RedemptionDto Redemption,
    int           AvailablePointsAfter,
    string        CurrentLevel);
