using System.Globalization;
using MediatR;
using Bugie.Rewards.Application.Config;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Application.Queries;
using Bugie.Rewards.Domain.Constants;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.External;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Application.Commands;

/// <summary>
/// Reglas comunes de los beneficios de nivel con cupones (solo pasajero):
/// mes local, cupo del nivel, nombres de los cupones y texto del aviso.
/// </summary>
public static class LevelBenefitRules
{
    /// <summary>Mes local de Perú (YYYY-MM) y su último instante, en UTC.</summary>
    public static (string Period, DateTime EndsAtUtc) CurrentPeriod(RewardsOptions options)
    {
        var local     = DateTime.UtcNow.AddHours(options.TimezoneOffsetHours);
        var inicioMes = new DateTime(local.Year, local.Month, 1);
        var finUtc    = inicioMes.AddMonths(1).AddHours(-options.TimezoneOffsetHours).AddSeconds(-1);
        return (inicioMes.ToString("yyyy-MM", CultureInfo.InvariantCulture),
                DateTime.SpecifyKind(finUtc, DateTimeKind.Utc));
    }

    /// <summary>Cupones de descuento del mes. 0 si el nivel no tiene % de descuento.</summary>
    public static int DiscountCoupons(RewardLevel? l) =>
        l is null || l.DiscountPercentage <= 0 ? 0 : Math.Max(0, l.MonthlyDiscountCoupons);

    /// <summary>Viajes gratis del mes. 0 si el nivel no tiene tope configurado.</summary>
    public static int FreeTrips(RewardLevel? l) =>
        l is null || l.FreeTripMaxAmount is not > 0 ? 0 : Math.Max(0, l.MonthlyFreeTrips);

    public static string Pct(decimal p) => p.ToString("0.##", CultureInfo.InvariantCulture);

    public static string Soles(decimal s) =>
        s % 1 == 0 ? s.ToString("0", CultureInfo.InvariantCulture)
                   : s.ToString("0.00", CultureInfo.InvariantCulture);

    public static string DiscountName(RewardLevel l) =>
        $"Cupón de nivel {l.DisplayName} · {Pct(l.DiscountPercentage)} %";

    public static string FreeTripName(RewardLevel l) =>
        $"Viaje gratis de nivel {l.DisplayName} · hasta S/ {Soles(l.FreeTripMaxAmount ?? 0)}";

    /// <summary>
    /// "Este mes tienes N cupones de X % y M viajes gratis de tu nivel Plata.
    /// Reclámalos en Puntos." Null si el nivel no da nada.
    /// </summary>
    public static string? NoticeBody(RewardLevel l)
    {
        var cupones = DiscountCoupons(l);
        var viajes  = FreeTrips(l);
        if (cupones == 0 && viajes == 0) return null;

        var partes = new List<string>();
        if (cupones > 0)
            partes.Add($"{cupones} {(cupones == 1 ? "cupón" : "cupones")} de {Pct(l.DiscountPercentage)} %");
        if (viajes > 0)
            partes.Add($"{viajes} {(viajes == 1 ? "viaje gratis" : "viajes gratis")}");

        return $"Este mes tienes {string.Join(" y ", partes)} de tu nivel {l.DisplayName}. Reclámalos en Puntos.";
    }
}

/* ══════════════════════════ CONSULTA ══════════════════════════ */

/// <summary>Beneficios de nivel del usuario en el mes actual.</summary>
public record GetMyLevelBenefitsQuery(Guid UserId, string UserType) : IRequest<LevelBenefitsDto>;

public class GetMyLevelBenefitsHandler : IRequestHandler<GetMyLevelBenefitsQuery, LevelBenefitsDto>
{
    private readonly IPointsProfileRepository  _profiles;
    private readonly IRewardLevelRepository    _levels;
    private readonly IRewardSettingsRepository _settings;
    private readonly ILevelBenefitRepository   _claims;

    public GetMyLevelBenefitsHandler(
        IPointsProfileRepository profiles, IRewardLevelRepository levels,
        IRewardSettingsRepository settings, ILevelBenefitRepository claims)
        => (_profiles, _levels, _settings, _claims) = (profiles, levels, settings, claims);

    public async Task<LevelBenefitsDto> Handle(GetMyLevelBenefitsQuery q, CancellationToken ct)
    {
        var options = RewardsOptions.From(await _settings.GetMapAsync(ct));
        return await Build(q.UserId, q.UserType, options, _profiles, _levels, _claims, ct);
    }

    /// <summary>Arma el estado del mes. Lo reutiliza el reclamo para devolverlo actualizado.</summary>
    internal static async Task<LevelBenefitsDto> Build(
        Guid userId, string userType, RewardsOptions options,
        IPointsProfileRepository profiles, IRewardLevelRepository levelsRepo,
        ILevelBenefitRepository claims, CancellationToken ct)
    {
        var (period, endsAt) = LevelBenefitRules.CurrentPeriod(options);

        var profile = await profiles.GetByUserIdAsync(userId, ct);
        var levels  = await levelsRepo.GetByUserTypeAsync(UserTypes.Passenger, ct);
        var level   = levels.FirstOrDefault(l => l.Name == (profile?.CurrentLevel ?? "bronze"))
                      ?? levels.OrderBy(l => l.SortOrder).FirstOrDefault();

        var reason = NotEligibleReason(userType, options);
        var esPasajero = userType == UserTypes.Passenger;

        var totalCupones = esPasajero ? LevelBenefitRules.DiscountCoupons(level) : 0;
        var totalViajes  = esPasajero ? LevelBenefitRules.FreeTrips(level) : 0;

        var usados = esPasajero
            ? await claims.CountClaimsAsync(userId, period, ct)
            : new Dictionary<string, int>();
        var cuponesUsados = usados.GetValueOrDefault(LevelBenefitTypes.Discount);
        var viajesUsados  = usados.GetValueOrDefault(LevelBenefitTypes.FreeTrip);

        var cupones = new LevelBenefitQuotaDto(
            totalCupones, cuponesUsados, Math.Max(0, totalCupones - cuponesUsados));
        var viajes = new LevelFreeTripsDto(
            totalViajes, viajesUsados, Math.Max(0, totalViajes - viajesUsados),
            esPasajero && totalViajes > 0 ? level?.FreeTripMaxAmount : null);

        return new LevelBenefitsDto(
            Eligible:           reason is null,
            NotEligibleReason:  reason,
            Level:              level?.Name ?? profile?.CurrentLevel ?? "bronze",
            LevelName:          level?.DisplayName ?? "Bronce",
            DiscountPercentage: esPasajero ? level?.DiscountPercentage ?? 0 : 0,
            DiscountCoupons:    cupones,
            FreeTrips:          viajes,
            Period:             period,
            PeriodEndsAt:       endsAt,
            CouponsApplyToFare: options.CouponsApplyToFare,
            CanClaim:           reason is null && (cupones.Available > 0 || viajes.Available > 0));
    }

    /// <summary>Null si puede reclamar. Si no, el motivo para mostrarle.</summary>
    internal static string? NotEligibleReason(string userType, RewardsOptions options)
    {
        if (userType != UserTypes.Passenger)
            return "Los beneficios de nivel con cupones son solo para pasajeros.";
        if (!options.Enabled)
            return "El programa de puntos está desactivado por el momento.";
        if (!options.RedemptionEnabled)
            return "El canje de beneficios está deshabilitado por el momento.";
        if (!options.CouponsApplyToFare)
            return "Los cupones todavía no se aplican a los viajes.";
        return null;
    }
}

/* ══════════════════════════ RECLAMO ══════════════════════════ */

/// <summary>
/// El pasajero reclama un cupón de su nivel: 'discount' (cupón del % de su
/// nivel) o 'free_trip' (viaje gratis hasta el tope). No cuesta puntos y vence
/// al terminar el mes.
/// </summary>
public record ClaimLevelBenefitCommand(Guid UserId, string UserType, string Type)
    : IRequest<LevelBenefitClaimResultDto>;

public class ClaimLevelBenefitHandler
    : IRequestHandler<ClaimLevelBenefitCommand, LevelBenefitClaimResultDto>
{
    private readonly IPointsProfileRepository  _profiles;
    private readonly IRewardLevelRepository    _levels;
    private readonly IRewardSettingsRepository _settings;
    private readonly ILevelBenefitRepository   _claims;

    public ClaimLevelBenefitHandler(
        IPointsProfileRepository profiles, IRewardLevelRepository levels,
        IRewardSettingsRepository settings, ILevelBenefitRepository claims)
        => (_profiles, _levels, _settings, _claims) = (profiles, levels, settings, claims);

    public async Task<LevelBenefitClaimResultDto> Handle(ClaimLevelBenefitCommand cmd, CancellationToken ct)
    {
        var tipo = (cmd.Type ?? string.Empty).Trim().ToLowerInvariant();
        if (!LevelBenefitTypes.IsValid(tipo))
            throw new ArgumentException("El tipo debe ser 'discount' o 'free_trip'.");

        var options = RewardsOptions.From(await _settings.GetMapAsync(ct));
        var motivo  = GetMyLevelBenefitsHandler.NotEligibleReason(cmd.UserType, options);
        if (motivo is not null) throw new InvalidOperationException(motivo);

        // El perfil hace falta para el cupón. Si todavía no existe (pasajero
        // sin viajes), se crea en Bronce, igual que al acreditar puntos.
        var profile = await _profiles.GetByUserIdAsync(cmd.UserId, ct);
        if (profile is null)
        {
            profile = PointsProfile.Create(cmd.UserId, UserTypes.Passenger);
            await _profiles.AddAsync(profile, ct);
        }

        var levels = await _levels.GetByUserTypeAsync(UserTypes.Passenger, ct);
        var level  = levels.FirstOrDefault(l => l.Name == profile.CurrentLevel)
            ?? throw new InvalidOperationException("No encontramos tu nivel. Intenta más tarde.");

        var (period, endsAt) = LevelBenefitRules.CurrentPeriod(options);

        Redemption cupon;
        int limite;
        if (tipo == LevelBenefitTypes.Discount)
        {
            limite = LevelBenefitRules.DiscountCoupons(level);
            if (limite == 0)
                throw new InvalidOperationException($"Tu nivel {level.DisplayName} no incluye cupones de descuento.");
            cupon = Redemption.CreateLevelBenefit(profile, LevelBenefitRules.DiscountName(level),
                RewardTypes.DiscountPeriod, null, level.DiscountPercentage, endsAt);
        }
        else
        {
            limite = LevelBenefitRules.FreeTrips(level);
            if (limite == 0)
                throw new InvalidOperationException($"Tu nivel {level.DisplayName} no incluye viajes gratis.");
            cupon = Redemption.CreateLevelBenefit(profile, LevelBenefitRules.FreeTripName(level),
                RewardTypes.FreeTrip, level.FreeTripMaxAmount, null, endsAt);
        }

        // Cuenta y crea dentro de una transacción con bloqueo por usuario.
        var ok = await _claims.ClaimAsync(cupon, tipo, period, level.Name, limite, ct);
        if (!ok)
            throw new InvalidOperationException(tipo == LevelBenefitTypes.Discount
                ? "Ya reclamaste todos los cupones de descuento de este mes."
                : "Ya reclamaste todos los viajes gratis de este mes.");

        var estado = await GetMyLevelBenefitsHandler.Build(
            cmd.UserId, cmd.UserType, options, _profiles, _levels, _claims, ct);

        return new LevelBenefitClaimResultDto(GetMyRedemptionsHandler.ToDto(cupon), estado);
    }
}

/* ══════════════════════════ AVISOS ══════════════════════════ */

/// <summary>
/// Atajo para los puntos donde se recalcula el nivel: si el nivel cambió,
/// pide el aviso de beneficios (el handler decide si de verdad subió y si
/// corresponde avisar). Nunca lanza.
/// </summary>
public static class LevelUpNotice
{
    public static async Task SendIfChangedAsync(
        IMediator mediator, PointsProfile profile, string levelBefore, CancellationToken ct)
    {
        if (profile.CurrentLevel == levelBefore) return;
        try
        {
            await mediator.Send(new NotifyLevelBenefitsCommand(
                profile.UserId, profile.UserType, levelBefore, profile.CurrentLevel,
                LevelBenefitNoticeReasons.LevelUp), ct);
        }
        catch
        {
            // El aviso nunca rompe la acreditación de puntos.
        }
    }
}

public static class LevelBenefitNoticeReasons
{
    public const string LevelUp = "level_up";
    public const string Monthly = "monthly";
}

/// <summary>
/// Avisa al pasajero (push + bandeja de notificaciones) los cupones de su
/// nivel. Se usa al subir de nivel y en el aviso de inicio de mes.
///
/// No hace nada si: no es pasajero, el nivel no da beneficios, el programa o
/// el canje están apagados, o coupons_apply_to_fare está apagado. Con
/// level_up, solo si el nivel nuevo es MAYOR que el anterior.
///
/// Nunca lanza: un aviso que no sale no puede romper la acreditación de
/// puntos. El envío del push ya registra sus fallos en el log (FcmSender).
/// </summary>
public record NotifyLevelBenefitsCommand(
    Guid    UserId,
    string  UserType,
    string? PreviousLevel,
    string  NewLevel,
    string  Reason) : IRequest<bool>;

public class NotifyLevelBenefitsHandler : IRequestHandler<NotifyLevelBenefitsCommand, bool>
{
    private readonly IRewardLevelRepository    _levels;
    private readonly IRewardSettingsRepository _settings;
    private readonly ILevelBenefitRepository   _claims;
    private readonly IFcmSender                _push;

    public NotifyLevelBenefitsHandler(
        IRewardLevelRepository levels, IRewardSettingsRepository settings,
        ILevelBenefitRepository claims, IFcmSender push)
        => (_levels, _settings, _claims, _push) = (levels, settings, claims, push);

    public async Task<bool> Handle(NotifyLevelBenefitsCommand cmd, CancellationToken ct)
    {
        try
        {
            if (cmd.UserType != UserTypes.Passenger) return false;
            if (cmd.Reason == LevelBenefitNoticeReasons.LevelUp && cmd.PreviousLevel == cmd.NewLevel) return false;

            var options = RewardsOptions.From(await _settings.GetMapAsync(ct));
            if (GetMyLevelBenefitsHandler.NotEligibleReason(cmd.UserType, options) is not null) return false;

            var levels = await _levels.GetByUserTypeAsync(UserTypes.Passenger, ct);
            var nuevo  = levels.FirstOrDefault(l => l.Name == cmd.NewLevel);
            if (nuevo is null) return false;

            if (cmd.Reason == LevelBenefitNoticeReasons.LevelUp)
            {
                var anterior = levels.FirstOrDefault(l => l.Name == cmd.PreviousLevel);
                if (anterior is not null && nuevo.SortOrder <= anterior.SortOrder) return false;
            }

            var body = LevelBenefitRules.NoticeBody(nuevo);
            if (body is null) return false;

            var (period, _) = LevelBenefitRules.CurrentPeriod(options);

            // El aviso de subida ya cuenta los cupones del mes: se marca el mes
            // para que el aviso mensual no le repita lo mismo.
            if (cmd.Reason == LevelBenefitNoticeReasons.LevelUp)
                await _claims.TryMarkNoticeAsync(cmd.UserId, period, ct);

            await SendAsync(_push, cmd.UserId, nuevo, body, cmd.Reason, period, ct);
            return true;
        }
        catch
        {
            return false;
        }
    }

    internal static Task SendAsync(
        IFcmSender push, Guid userId, RewardLevel level, string body,
        string reason, string period, CancellationToken ct) =>
        push.SendToUserAsync(userId, new FcmPushMessage(
            Title: reason == LevelBenefitNoticeReasons.LevelUp
                ? $"¡Subiste a nivel {level.DisplayName}!"
                : $"Tus cupones de nivel {level.DisplayName}",
            Body:  body,
            Route: "/rewards?tab=summary",
            ExtraData: new Dictionary<string, string>
            {
                ["type"]   = "level_benefits",
                ["reason"] = reason,
                ["level"]  = level.Name,
                ["period"] = period,
                ["tab"]    = "summary",
            }), ct);
}

/// <summary>
/// Aviso de inicio de mes: a cada pasajero con beneficios de nivel, una sola
/// vez por mes (rewards.levelbenefitnotices). Lo corre a diario
/// LevelBenefitsNoticeService; los que ya recibieron el aviso se saltan.
/// Devuelve cuántos avisos salieron.
/// </summary>
public record RunLevelBenefitsNoticeCommand : IRequest<int>;

public class RunLevelBenefitsNoticeHandler : IRequestHandler<RunLevelBenefitsNoticeCommand, int>
{
    private readonly IRewardLevelRepository    _levels;
    private readonly IRewardSettingsRepository _settings;
    private readonly ILevelBenefitRepository   _claims;
    private readonly IFcmSender                _push;

    public RunLevelBenefitsNoticeHandler(
        IRewardLevelRepository levels, IRewardSettingsRepository settings,
        ILevelBenefitRepository claims, IFcmSender push)
        => (_levels, _settings, _claims, _push) = (levels, settings, claims, push);

    public async Task<int> Handle(RunLevelBenefitsNoticeCommand cmd, CancellationToken ct)
    {
        var options = RewardsOptions.From(await _settings.GetMapAsync(ct));
        if (GetMyLevelBenefitsHandler.NotEligibleReason(UserTypes.Passenger, options) is not null) return 0;

        var (period, _) = LevelBenefitRules.CurrentPeriod(options);
        var levels      = await _levels.GetByUserTypeAsync(UserTypes.Passenger, ct);
        var candidatos  = await _claims.GetPassengersWithoutNoticeAsync(period, ct);

        var enviados = 0;
        foreach (var c in candidatos)
        {
            if (ct.IsCancellationRequested) break;

            var nivel = levels.FirstOrDefault(l => l.Name == c.CurrentLevel);
            var body  = nivel is null ? null : LevelBenefitRules.NoticeBody(nivel);
            if (body is null) continue;

            // Marca primero: si dos procesos corren a la vez, solo uno avisa.
            if (!await _claims.TryMarkNoticeAsync(c.UserId, period, ct)) continue;

            await NotifyLevelBenefitsHandler.SendAsync(
                _push, c.UserId, nivel!, body, LevelBenefitNoticeReasons.Monthly, period, ct);
            enviados++;
        }
        return enviados;
    }
}
