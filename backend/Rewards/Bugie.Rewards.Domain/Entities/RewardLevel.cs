namespace Bugie.Rewards.Domain.Entities;

/// <summary>
/// Nivel configurable (bronce, plata, oro, platino) para un tipo de usuario.
/// Los umbrales y beneficios se editan desde el admin, no en codigo.
/// </summary>
public class RewardLevel
{
    public Guid    Id                   { get; set; }
    public string  UserType             { get; set; } = string.Empty;
    public string  Name                 { get; set; } = string.Empty;
    public string  DisplayName          { get; set; } = string.Empty;
    public short   SortOrder            { get; set; }
    public int     MinPoints            { get; set; }

    /// <summary>Null en el nivel mas alto (sin techo).</summary>
    public int?    MaxPoints            { get; set; }

    public decimal DiscountPercentage   { get; set; }
    public int     MonthlyFreeTrips     { get; set; }
    public int     WeeklyRaffleTickets  { get; set; }
    public int     MonthlyRaffleTickets { get; set; }

    /// <summary>
    /// Solo pasajero: cuantos cupones de DiscountPercentage puede reclamar al mes.
    /// Lo no reclamado no se acumula.
    /// </summary>
    public int     MonthlyDiscountCoupons { get; set; }

    /// <summary>
    /// Solo pasajero: tope en soles de cada viaje gratis del mes
    /// (MonthlyFreeTrips). Null = sin viajes gratis.
    /// </summary>
    public decimal? FreeTripMaxAmount   { get; set; }
    public bool    IsActive             { get; set; } = true;
    public DateTime CreatedAt           { get; set; }
    public DateTime UpdatedAt           { get; set; }
}
