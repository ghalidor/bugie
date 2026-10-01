namespace Bugie.Rewards.Domain.Constants;

/// <summary>Tipos de usuario que acumulan puntos.</summary>
public static class UserTypes
{
    public const string Passenger = "passenger";
    public const string Driver    = "driver";

    public static bool IsValid(string? v) => v is Passenger or Driver;
}

/// <summary>Tipos de movimiento en el libro de puntos.</summary>
public static class TransactionTypes
{
    public const string Earn   = "earn";    // suma puntos
    public const string Redeem = "redeem";  // resta por canje
    public const string Expire = "expire";  // resta por vencimiento
    public const string Bonus  = "bonus";   // suma por ajuste manual o promocion
}

/// <summary>Evento que origino la transaccion. Sirve para trazabilidad.</summary>
public static class SourceEvents
{
    public const string TripCompleted = "trip_completed";
    public const string PointsExpired = "points_expired";
    public const string Promotion         = "promotion";
    public const string Referral          = "referral";
    public const string ReferralQualified = "referral_qualified";
    public const string Streak            = "streak";
    public const string WeeklyGoal        = "weekly_goal";
    public const string Anniversary       = "anniversary";
}

/// <summary>Claves de rewards.settings.</summary>
public static class SettingKeys
{
    public const string Enabled              = "points_enabled";
    public const string RedemptionEnabled    = "redemption_enabled";
    public const string RatePassenger        = "points_rate_passenger";
    public const string RateDriver           = "points_rate_driver";
    public const string ExpiryMonthsPassenger = "points_expiry_months_passenger";
    public const string ExpiryMonthsDriver    = "points_expiry_months_driver";
    public const string LevelBasis           = "points_level_basis";
    public const string ExpiryEnabled        = "points_expiry_enabled";
    public const string ExpiryWarningDays    = "points_expiry_warning_days";
    public const string PromotionsEnabled    = "promotions_enabled";
    public const string TimezoneOffsetHours  = "timezone_offset_hours";
    public const string RafflesEnabled       = "raffles_enabled";
    public const string RafflePointsPerTicket = "raffle_points_per_ticket";
    public const string ReferralsEnabled        = "referrals_enabled";
    public const string ReferralPointsPassenger = "referral_points_passenger";
    public const string ReferralPointsDriver    = "referral_points_driver";
    public const string ReferralQualifyTrips    = "referral_qualify_trips";
    public const string ReferralQualifyPoints   = "referral_qualify_points";
    public const string StreakDays              = "streak_days";
    public const string StreakPoints            = "streak_points";
    public const string WeeklyGoalPassenger     = "weekly_goal_trips_passenger";
    public const string WeeklyGoalDriver        = "weekly_goal_trips_driver";
    public const string WeeklyGoalPoints        = "weekly_goal_points";
    public const string AnniversaryMultiplier   = "anniversary_multiplier";
}

/// <summary>Como se decide el nivel del usuario.</summary>
public static class LevelBasis
{
    /// <summary>Por puntos historicos acumulados. El nivel nunca baja.</summary>
    public const string Total = "total";

    /// <summary>Por saldo disponible. El nivel baja si el usuario canjea.</summary>
    public const string Available = "available";
}
