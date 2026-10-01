using System.Globalization;
using Bugie.Rewards.Domain.Constants;

namespace Bugie.Rewards.Application.Config;

/// <summary>
/// Lectura tipada de rewards.settings. Si una clave falta o viene con un valor
/// invalido, se usa el default y el motor sigue funcionando.
/// </summary>
public sealed class RewardsOptions
{
    public bool    Enabled                { get; init; } = true;
    public bool    RedemptionEnabled      { get; init; } = true;
    public bool    ExpiryEnabled          { get; init; } = true;
    public bool    PromotionsEnabled      { get; init; } = true;
    public bool    RafflesEnabled         { get; init; } = true;
    public bool    ReferralsEnabled       { get; init; } = true;
    public int     ReferralPointsPassenger { get; init; } = 500;
    public int     ReferralPointsDriver    { get; init; } = 375;
    public int     ReferralQualifyTrips    { get; init; } = 5;
    public int     ReferralQualifyPoints   { get; init; } = 200;

    // ── Logros personales ──
    public int     StreakDays              { get; init; } = 7;
    public int     StreakPoints            { get; init; } = 150;
    public int     WeeklyGoalPassenger     { get; init; } = 0;
    public int     WeeklyGoalDriver        { get; init; } = 50;
    public int     WeeklyGoalPoints        { get; init; } = 200;

    /// <summary>Multiplicador del mes de aniversario. 1 lo desactiva.</summary>
    public decimal AnniversaryMultiplier   { get; init; } = 3m;

    // ── Calificaciones ──
    public int     RatingPointsPassenger   { get; init; } = 30;
    public int     RatingPointsDriver      { get; init; } = 50;

    /// <summary>
    /// Si es true, el pasajero solo cobra cuando pone 5 estrellas. Es lo que
    /// pide el PDF, pero sesga las calificaciones: con false cobra por
    /// calificar sin importar la nota.
    /// </summary>
    public bool    RatingRequireFiveStars  { get; init; } = true;

    /// <summary>Meta semanal según el tipo de cuenta.</summary>
    public int WeeklyGoalFor(string userType) =>
        userType == UserTypes.Driver ? WeeklyGoalDriver : WeeklyGoalPassenger;

    /// <summary>Puntos del mes que dan un ticket extra. 0 lo desactiva.</summary>
    public int     RafflePointsPerTicket  { get; init; } = 500;

    /// <summary>Horas de diferencia con UTC. Perú es -5.</summary>
    public int     TimezoneOffsetHours    { get; init; } = -5;
    /// <summary>Hitos de aviso en dias, del mas lejano al mas cercano.</summary>
    public IReadOnlyList<int> ExpiryWarningMilestones { get; init; } = new[] { 30, 7, 1 };
    public decimal RatePassenger          { get; init; } = 10m;
    public decimal RateDriver             { get; init; } = 5m;
    public int     ExpiryMonthsPassenger  { get; init; } = 12;
    public int     ExpiryMonthsDriver     { get; init; } = 12;
    public string  LevelBasis             { get; init; } = Bugie.Rewards.Domain.Constants.LevelBasis.Total;

    public decimal RateFor(string userType) =>
        userType == UserTypes.Driver ? RateDriver : RatePassenger;

    public int ExpiryMonthsFor(string userType) =>
        userType == UserTypes.Driver ? ExpiryMonthsDriver : ExpiryMonthsPassenger;

    public static RewardsOptions From(IDictionary<string, string> settings) => new()
    {
        Enabled               = Bool(settings, SettingKeys.Enabled, true),
        RedemptionEnabled     = Bool(settings, SettingKeys.RedemptionEnabled, true),
        ExpiryEnabled         = Bool(settings, SettingKeys.ExpiryEnabled, true),
        PromotionsEnabled     = Bool(settings, SettingKeys.PromotionsEnabled, true),
        RafflesEnabled        = Bool(settings, SettingKeys.RafflesEnabled, true),
        ReferralsEnabled      = Bool(settings, SettingKeys.ReferralsEnabled, true),
        ReferralPointsPassenger = IntOrZero(settings, SettingKeys.ReferralPointsPassenger, 500),
        ReferralPointsDriver    = IntOrZero(settings, SettingKeys.ReferralPointsDriver, 375),
        ReferralQualifyTrips    = IntOrZero(settings, SettingKeys.ReferralQualifyTrips, 5),
        ReferralQualifyPoints   = IntOrZero(settings, SettingKeys.ReferralQualifyPoints, 200),
        StreakDays              = IntOrZero(settings, SettingKeys.StreakDays, 7),
        StreakPoints            = IntOrZero(settings, SettingKeys.StreakPoints, 150),
        WeeklyGoalPassenger     = IntOrZero(settings, SettingKeys.WeeklyGoalPassenger, 0),
        WeeklyGoalDriver        = IntOrZero(settings, SettingKeys.WeeklyGoalDriver, 50),
        WeeklyGoalPoints        = IntOrZero(settings, SettingKeys.WeeklyGoalPoints, 200),
        AnniversaryMultiplier   = Dec(settings, SettingKeys.AnniversaryMultiplier, 3m),
        RatingPointsPassenger   = IntOrZero(settings, SettingKeys.RatingPointsPassenger, 30),
        RatingPointsDriver      = IntOrZero(settings, SettingKeys.RatingPointsDriver, 50),
        RatingRequireFiveStars  = Bool(settings, SettingKeys.RatingRequireFiveStars, true),
        RafflePointsPerTicket = IntOrZero(settings, SettingKeys.RafflePointsPerTicket, 500),
        TimezoneOffsetHours   = Offset(settings, SettingKeys.TimezoneOffsetHours, -5),
        ExpiryWarningMilestones = Milestones(settings, SettingKeys.ExpiryWarningDays),
        RatePassenger         = Dec (settings, SettingKeys.RatePassenger, 10m),
        RateDriver            = Dec (settings, SettingKeys.RateDriver, 5m),
        ExpiryMonthsPassenger = Int (settings, SettingKeys.ExpiryMonthsPassenger, 12),
        ExpiryMonthsDriver    = Int (settings, SettingKeys.ExpiryMonthsDriver, 12),
        LevelBasis            = Str (settings, SettingKeys.LevelBasis, Bugie.Rewards.Domain.Constants.LevelBasis.Total),
    };

    /// <summary>
    /// Lee "30,7,1" y devuelve [30, 7, 1]. Ignora lo que no sea un numero
    /// valido. Si no queda ninguno, usa 30 dias, que es lo que pide el PDF.
    /// </summary>
    private static IReadOnlyList<int> Milestones(
        IDictionary<string, string> s, string key)
    {
        if (!s.TryGetValue(key, out var raw) || string.IsNullOrWhiteSpace(raw))
            return new[] { 30 };

        var days = raw
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(part => int.TryParse(part, NumberStyles.Integer, CultureInfo.InvariantCulture, out var d) ? d : 0)
            .Where(d => d > 0 && d <= 365)
            .Distinct()
            .OrderByDescending(d => d)
            .ToList();

        return days.Count > 0 ? days : new[] { 30 };
    }

    // Siempre con InvariantCulture: "10.5" debe leerse igual en cualquier servidor.
    private static decimal Dec(IDictionary<string, string> s, string key, decimal fallback) =>
        s.TryGetValue(key, out var v)
        && decimal.TryParse(v.Trim(), NumberStyles.Any, CultureInfo.InvariantCulture, out var d)
        && d > 0
            ? d : fallback;

    private static int Int(IDictionary<string, string> s, string key, int fallback) =>
        s.TryGetValue(key, out var v)
        && int.TryParse(v.Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var i)
        && i > 0
            ? i : fallback;

    /// <summary>Lee un desfase horario, que puede ser negativo.</summary>
    private static int Offset(IDictionary<string, string> s, string key, int fallback) =>
        s.TryGetValue(key, out var v)
        && int.TryParse(v.Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var i)
        && i >= -12 && i <= 14
            ? i : fallback;

    /// <summary>Entero que SÍ admite 0, porque 0 significa "desactivado".</summary>
    private static int IntOrZero(IDictionary<string, string> s, string key, int fallback) =>
        s.TryGetValue(key, out var v)
        && int.TryParse(v.Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var i)
        && i >= 0
            ? i : fallback;

    private static bool Bool(IDictionary<string, string> s, string key, bool fallback) =>
        s.TryGetValue(key, out var v) && bool.TryParse(v.Trim(), out var b) ? b : fallback;

    private static string Str(IDictionary<string, string> s, string key, string fallback) =>
        s.TryGetValue(key, out var v) && !string.IsNullOrWhiteSpace(v) ? v.Trim() : fallback;
}
