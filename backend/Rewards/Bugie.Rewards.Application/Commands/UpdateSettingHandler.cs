using System.Globalization;
using MediatR;
using Bugie.Rewards.Domain.Constants;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Application.Commands;

public class UpdateSettingHandler : IRequestHandler<UpdateSettingCommand, Unit>
{
    private readonly IRewardSettingsRepository _settings;
    public UpdateSettingHandler(IRewardSettingsRepository settings) => _settings = settings;

    public async Task<Unit> Handle(UpdateSettingCommand cmd, CancellationToken ct)
    {
        var key   = (cmd.SettingKey ?? string.Empty).Trim();
        var value = (cmd.Value ?? string.Empty).Trim();

        if (string.IsNullOrWhiteSpace(key))
            throw new ArgumentException("La clave es requerida.");
        if (string.IsNullOrWhiteSpace(value))
            throw new ArgumentException("El valor es requerido.");

        Validate(key, value);

        await _settings.UpsertAsync(key, value, cmd.UpdatedBy, ct);
        return Unit.Value;
    }

    /// <summary>
    /// Evita que un valor mal escrito rompa el motor en silencio.
    /// </summary>
    private static void Validate(string key, string value)
    {
        switch (key)
        {
            case SettingKeys.Enabled:
            case SettingKeys.RedemptionEnabled:
            case SettingKeys.ExpiryEnabled:
            case SettingKeys.PromotionsEnabled:
            case SettingKeys.RafflesEnabled:
            case SettingKeys.RatingRequireFiveStars:
            case SettingKeys.CouponsApplyToFare:
            case SettingKeys.CouponMaxIsCommission:
            case SettingKeys.ReferralsEnabled:
                if (!bool.TryParse(value, out _))
                    throw new ArgumentException("Debe ser true o false.");
                break;

            case SettingKeys.AnniversaryMultiplier:
                if (!decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var am)
                    || am < 1 || am > 10)
                    throw new ArgumentException("El multiplicador debe estar entre 1 y 10. Con 1 se desactiva.");
                break;

            case SettingKeys.RatePassenger:
            case SettingKeys.RateDriver:
                if (!decimal.TryParse(value, NumberStyles.Any, CultureInfo.InvariantCulture, out var rate)
                    || rate <= 0 || rate > 1000)
                    throw new ArgumentException("La tasa debe ser un numero mayor a 0 y menor o igual a 1000. Use punto decimal.");
                break;

            case SettingKeys.RatingPointsPassenger:
            case SettingKeys.RatingPointsDriver:
            case SettingKeys.NoCancelMinTrips:
            case SettingKeys.NoCancelPoints:
            case SettingKeys.StreakDays:
            case SettingKeys.StreakPoints:
            case SettingKeys.WeeklyGoalPassenger:
            case SettingKeys.WeeklyGoalDriver:
            case SettingKeys.WeeklyGoalPoints:
            case SettingKeys.ReferralPointsPassenger:
            case SettingKeys.ReferralPointsDriver:
            case SettingKeys.ReferralQualifyPoints:
            case SettingKeys.ReferralQualifyTrips:
                if (!int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var rf)
                    || rf < 0 || rf > 100000)
                    throw new ArgumentException("Debe ser un entero entre 0 y 100000. Con 0 se desactiva.");
                break;

            case SettingKeys.RafflePointsPerTicket:
                if (!int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var ppt)
                    || ppt < 0 || ppt > 100000)
                    throw new ArgumentException("Debe ser un entero entre 0 y 100000. Con 0 se desactivan los tickets por puntos.");
                break;

            case SettingKeys.TimezoneOffsetHours:
                if (!int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var tz)
                    || tz < -12 || tz > 14)
                    throw new ArgumentException("El desfase horario debe estar entre -12 y 14. Perú es -5.");
                break;

            case SettingKeys.ExpiryWarningDays:
            {
                // Lista de dias separados por coma. Ej: "30,7,1" o "30".
                var parts = value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                if (parts.Length == 0)
                    throw new ArgumentException("Indica al menos un hito de aviso. Ej: 30,7,1");

                foreach (var part in parts)
                {
                    if (!int.TryParse(part, NumberStyles.Integer, CultureInfo.InvariantCulture, out var d)
                        || d < 1 || d > 365)
                        throw new ArgumentException(
                            $"'{part}' no es valido. Cada hito debe ser un entero entre 1 y 365 dias.");
                }
                break;
            }

            case SettingKeys.ExpiryMonthsPassenger:
            case SettingKeys.ExpiryMonthsDriver:
                if (!int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var months)
                    || months < 1 || months > 120)
                    throw new ArgumentException("La vigencia debe ser un entero entre 1 y 120 meses.");
                break;

            case SettingKeys.LevelBasis:
                if (value != LevelBasis.Total && value != LevelBasis.Available)
                    throw new ArgumentException("Debe ser 'total' o 'available'.");
                break;

            default:
                throw new ArgumentException($"Clave de configuracion desconocida: {key}");
        }
    }
}
