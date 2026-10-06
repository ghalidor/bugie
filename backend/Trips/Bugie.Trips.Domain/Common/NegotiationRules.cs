using System.Globalization;
using Bugie.Trips.Domain.Entities;
using Bugie.Trips.Domain.External;

namespace Bugie.Trips.Domain.Common;

/// <summary>
/// Reglas de la negociacion pasajero-conductor que el admin configura en
/// Admin > Configuracion (landing.systemsettings). Si Landing no responde o
/// la clave no existe se usan los valores por defecto de aqui.
/// </summary>
public static class NegotiationRules
{
    public const string KeyBaseFare              = "base_fare";
    public const string KeyFareMaxMultiplier     = "fare_max_multiplier";
    public const string KeyNoDriverCancelMinutes = "trip_no_driver_cancel_min";
    public const string KeyConfirmImmediateMin   = "driver_confirm_immediate_min";
    public const string KeyConfirmScheduledMin   = "driver_confirm_scheduled_before_min";

    public const decimal DefaultFareMaxMultiplier     = 3m;
    public const int     DefaultNoDriverCancelMinutes = 10;
    public const int     DefaultConfirmImmediateMin   = 2;
    public const int     DefaultConfirmScheduledMin   = 60;

    /// <summary>Lee los valores vigentes (Landing cachea 30 s).</summary>
    public static async Task<NegotiationSettings> LoadAsync(ILandingClient landing, CancellationToken ct = default)
    {
        var baseFare = ParseDecimal(await landing.GetSettingAsync(KeyBaseFare, ct));
        var mult     = ParseDecimal(await landing.GetSettingAsync(KeyFareMaxMultiplier, ct));
        var noDriver = ParseInt(await landing.GetSettingAsync(KeyNoDriverCancelMinutes, ct));
        var confImm  = ParseInt(await landing.GetSettingAsync(KeyConfirmImmediateMin, ct));
        var confSch  = ParseInt(await landing.GetSettingAsync(KeyConfirmScheduledMin, ct));

        return new NegotiationSettings(
            BaseFare: baseFare is > 0 ? baseFare : null,
            FareMaxMultiplier: mult is >= 1 ? mult.Value : DefaultFareMaxMultiplier,
            NoDriverCancelMinutes: noDriver is > 0 ? noDriver.Value : DefaultNoDriverCancelMinutes,
            ConfirmImmediateMinutes: confImm is > 0 ? confImm.Value : DefaultConfirmImmediateMin,
            ConfirmScheduledBeforeMinutes: confSch is >= 0 ? confSch.Value : DefaultConfirmScheduledMin);
    }

    private static decimal? ParseDecimal(string? v) =>
        decimal.TryParse(v?.Trim(), NumberStyles.Number, CultureInfo.InvariantCulture, out var d) ? d : null;

    private static int? ParseInt(string? v) =>
        int.TryParse(v?.Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var i) ? i : null;

    /// <summary>"S/ 12.50" (siempre con punto, igual que el resto de avisos).</summary>
    public static string Soles(decimal amount) =>
        "S/ " + amount.ToString("0.00", CultureInfo.InvariantCulture);
}

/// <summary>Valores vigentes de la negociacion (ver NegotiationRules).</summary>
public record NegotiationSettings(
    decimal? BaseFare,
    decimal FareMaxMultiplier,
    int NoDriverCancelMinutes,
    int ConfirmImmediateMinutes,
    int ConfirmScheduledBeforeMinutes)
{
    /// <summary>
    /// Rango permitido para proponer o contraofertar en un viaje:
    /// minimo = tarifa base de la plataforma; maximo = multiplicador x la
    /// tarifa que el pasajero pidio al crear el viaje (nunca menor que el minimo).
    /// </summary>
    public (decimal Min, decimal Max) FareRange(decimal suggestedFare)
    {
        var min = BaseFare ?? 0.01m;
        var max = Math.Round(suggestedFare * FareMaxMultiplier, 2, MidpointRounding.AwayFromZero);
        return (min, Math.Max(min, max));
    }

    /// <summary>Mensaje de error si el monto esta fuera del rango; null si es valido.</summary>
    public string? FareError(decimal amount, decimal suggestedFare)
    {
        var (min, max) = FareRange(suggestedFare);
        return amount < min || amount > max
            ? $"El monto debe estar entre {NegotiationRules.Soles(min)} y {NegotiationRules.Soles(max)}."
            : null;
    }

    /// <summary>Al crear el viaje solo aplica el minimo (el maximo depende de este mismo monto).</summary>
    public string? CreateFareError(decimal amount) =>
        BaseFare.HasValue && amount < BaseFare.Value
            ? $"El monto debe ser al menos {NegotiationRules.Soles(BaseFare.Value)}."
            : null;

    /// <summary>
    /// Hasta cuando el conductor puede confirmar la oferta que el pasajero acepto.
    /// Inmediato: aceptacion + ConfirmImmediateMinutes.
    /// Programado: ConfirmScheduledBeforeMinutes antes de la hora, pero nunca
    /// menos que el plazo de un inmediato desde la aceptacion.
    /// </summary>
    public DateTime ConfirmDeadline(Trip trip, TripProposal proposal)
    {
        var acceptedAt = AsUtc(proposal.AcceptedByPassengerAt ?? proposal.CreatedAt);
        var minimum = acceptedAt.AddMinutes(ConfirmImmediateMinutes);
        if(trip.ScheduledAt is null) return minimum;
        var beforeTrip = AsUtc(trip.ScheduledAt.Value).AddMinutes(-ConfirmScheduledBeforeMinutes);
        return beforeTrip > minimum ? beforeTrip : minimum;
    }

    /// <summary>
    /// Cuando Bugie cancela un viaje inmediato que nadie tomo. null si no
    /// aplica (programado, o ya tiene conductor / no esta buscando).
    /// </summary>
    public DateTime? NoDriverDeadline(Trip trip)
    {
        if(trip.ScheduledAt is not null || trip.DriverId is not null) return null;
        if(trip.Status is not (Enums.TripStatus.Pending or Enums.TripStatus.Negotiating)) return null;
        return AsUtc(trip.PublishedAt ?? trip.CreatedAt).AddMinutes(NoDriverCancelMinutes);
    }

    private static DateTime AsUtc(DateTime d) =>
        d.Kind == DateTimeKind.Utc ? d : DateTime.SpecifyKind(d, DateTimeKind.Utc);
}
