namespace Bugie.Rewards.Domain.Entities;

/// <summary>
/// Item del catalogo de recompensas. Lo administra el back office.
/// </summary>
public class CatalogItem
{
    public Guid     Id           { get; set; }
    public string   Code         { get; set; } = string.Empty;
    public string   UserType     { get; set; } = string.Empty;
    public string   Name         { get; set; } = string.Empty;
    public string?  Description  { get; set; }
    public int      PointsCost   { get; set; }
    public string   RewardType   { get; set; } = string.Empty;
    public decimal? AmountSoles  { get; set; }
    public int?     Quantity     { get; set; }
    public decimal? Percentage   { get; set; }

    /// <summary>Nivel minimo requerido. Null = para todos.</summary>
    public string?  MinLevel     { get; set; }

    /// <summary>Unidades disponibles. Null = ilimitado.</summary>
    public int?     Stock        { get; set; }

    public int      ValidityDays { get; set; } = 30;
    public short    SortOrder    { get; set; }
    public bool     IsActive     { get; set; } = true;
    public DateTime CreatedAt    { get; set; }
    public DateTime UpdatedAt    { get; set; }

    public bool HasStock => Stock is null || Stock > 0;
}
