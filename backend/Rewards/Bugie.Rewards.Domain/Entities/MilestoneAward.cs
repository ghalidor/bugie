namespace Bugie.Rewards.Domain.Entities;

public static class MilestoneTypes
{
    public const string Streak      = "streak";
    public const string WeeklyGoal  = "weekly_goal";
    public const string Anniversary = "anniversary";
    public const string NoCancellations = "no_cancellations";
}

/// <summary>Un logro pagado. El par (perfil, tipo, periodo) es único.</summary>
public class MilestoneAward
{
    public long     Id        { get; set; }
    public Guid     ProfileId { get; set; }
    public string   Type      { get; set; } = string.Empty;
    public string   PeriodKey { get; set; } = string.Empty;
    public int      Points    { get; set; }

    /// <summary>Días de racha o viajes de la semana, para poder revisarlo después.</summary>
    public int?     Detail    { get; set; }

    public DateTime CreatedAt { get; set; }
}
