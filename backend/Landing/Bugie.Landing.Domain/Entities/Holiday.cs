namespace Bugie.Landing.Domain.Entities;

/// <summary>
/// Feriado que no cuenta como dia habil (landing.holidays).
///   fijo:  Month/Day, se repite cada anio.
///   movil: Movable = 'jueves_santo' | 'viernes_santo' (calculado desde la Pascua).
///   extra: Date exacta ("yyyy-MM-dd") de un solo anio.
/// </summary>
public class Holiday
{
    public const string Fixed = "fijo";
    public const string Movable = "movil";
    public const string Extra = "extra";

    public const string HolyThursday = "jueves_santo";
    public const string GoodFriday = "viernes_santo";

    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    /// <summary>'fijo' | 'movil' | 'extra'</summary>
    public string Kind { get; set; } = Fixed;
    public int? Month { get; set; }
    public int? Day { get; set; }
    /// <summary>'jueves_santo' | 'viernes_santo' (solo moviles).</summary>
    public string? MovableKey { get; set; }
    /// <summary>Fecha exacta "yyyy-MM-dd" (solo extras).</summary>
    public string? Date { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }
}
