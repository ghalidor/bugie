using MediatR;
using Bugie.Rewards.Application.Config;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Application.Queries;

/// <summary>
/// Promociones vigentes, redactadas para el usuario.
///
/// Las condiciones se traducen a una frase («Lun a Vie de 12:00 a 14:00»)
/// porque a quien viaja no le sirve ver un JSON ni saber si la promoción es de
/// tipo multiplicador o de puntos fijos.
/// </summary>
public class GetActivePromotionsHandler
    : IRequestHandler<GetActivePromotionsQuery, List<ActivePromotionDto>>
{
    private readonly IPromotionRepository      _promotions;
    private readonly IRewardSettingsRepository _settings;

    public GetActivePromotionsHandler(
        IPromotionRepository promotions, IRewardSettingsRepository settings)
    {
        _promotions = promotions;
        _settings   = settings;
    }

    private static readonly string[] Dias =
        { "", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom" };

    public async Task<List<ActivePromotionDto>> Handle(
        GetActivePromotionsQuery q, CancellationToken ct)
    {
        var options = RewardsOptions.From(await _settings.GetMapAsync(ct));
        if (!options.PromotionsEnabled) return new List<ActivePromotionDto>();

        var live = await _promotions.GetLiveAsync(q.UserType, ct);
        var ahoraLocal = DateTime.UtcNow.AddHours(options.TimezoneOffsetHours);

        return live
            // Las de descuento sobre la tarifa todavía no se aplican: no se
            // anuncian, para no prometer algo que no va a ocurrir.
            .Where(p => p.PromotionType is "multiplier" or "bonus_points")
            .Select(p => new ActivePromotionDto(
                p.Id, p.Name, p.Description,
                Reward(p), When(p.Conditions),
                ActiveNow(p.Conditions, ahoraLocal),
                p.EndDate))
            .OrderByDescending(p => p.ActiveNow)
            .ToList();
    }

    private static string Reward(Promotion p) =>
        p.PromotionType == "multiplier"
            ? $"{Numero(p.MultiplierValue ?? 1)}x puntos"
            : $"+{p.BonusPoints} puntos";

    private static string Numero(decimal v) =>
        v % 1 == 0 ? ((int)v).ToString() : v.ToString("0.#");

    /// <summary>Las condiciones, en una frase.</summary>
    private static string When(PromotionConditions c)
    {
        var partes = new List<string>();

        if (c.DaysOfWeek is { Length: > 0 })
        {
            var dias = c.DaysOfWeek.OrderBy(d => d).ToArray();
            // "Lun a Vie" cuando son días seguidos, si no la lista completa.
            var seguidos = dias.Length > 2 && dias.Last() - dias.First() == dias.Length - 1;
            partes.Add(seguidos
                ? $"{Dias[dias.First()]} a {Dias[dias.Last()]}"
                : string.Join(", ", dias.Select(d => Dias[d])));
        }

        if (c.HasHours)
            partes.Add($"de {c.StartHour:00}:00 a {c.EndHour:00}:00");

        if (c.FirstTripOfDay == true)     partes.Add("en tu primer viaje del día");
        if (c.PaymentMethods is { Length: > 0 })
            partes.Add($"pagando con {string.Join(" o ", c.PaymentMethods.Select(Capitalizar))}");
        if (c.MinAmount is > 0)           partes.Add($"en viajes desde S/ {c.MinAmount}");

        return partes.Count == 0 ? "En todos tus viajes" : string.Join(", ", partes);
    }

    private static string Capitalizar(string s) =>
        string.IsNullOrEmpty(s) ? s : char.ToUpper(s[0]) + s[1..];

    /// <summary>
    /// ¿Aplica en este momento? Solo mira día y hora: lo demás depende del
    /// viaje concreto y no se puede saber de antemano.
    /// </summary>
    private static bool ActiveNow(PromotionConditions c, DateTime local)
    {
        if (c.DaysOfWeek is { Length: > 0 })
        {
            var dia = (int)local.DayOfWeek;
            if (dia == 0) dia = 7;
            if (!c.DaysOfWeek.Contains(dia)) return false;
        }

        if (c.HasHours)
        {
            var h = local.Hour;
            var inside = c.StartHour <= c.EndHour
                ? h >= c.StartHour && h < c.EndHour
                : h >= c.StartHour || h < c.EndHour;
            if (!inside) return false;
        }

        return true;
    }
}

/// <summary>
/// Sorteos para el usuario: en los que ya participa y los que vienen.
///
/// Mostrar solo aquellos donde ya tiene tickets deja fuera lo importante: que
/// sepa qué sorteo se viene y qué le falta para entrar.
/// </summary>
public record GetUserRafflesQuery(Guid UserId, string UserType)
    : IRequest<List<UserRaffleDto>>;

public class GetUserRafflesHandler
    : IRequestHandler<GetUserRafflesQuery, List<UserRaffleDto>>
{
    private readonly IRaffleRepository         _raffles;
    private readonly IPointsProfileRepository  _profiles;
    private readonly IRewardLevelRepository    _levels;
    private readonly IRewardSettingsRepository _settings;

    public GetUserRafflesHandler(
        IRaffleRepository raffles,
        IPointsProfileRepository profiles,
        IRewardLevelRepository levels,
        IRewardSettingsRepository settings)
    {
        _raffles  = raffles;
        _profiles = profiles;
        _levels   = levels;
        _settings = settings;
    }

    public async Task<List<UserRaffleDto>> Handle(GetUserRafflesQuery q, CancellationToken ct)
    {
        var options = RewardsOptions.From(await _settings.GetMapAsync(ct));
        if (!options.RafflesEnabled) return new List<UserRaffleDto>();

        var abiertos = await _raffles.GetOpenAsync(ct);
        var mios     = await _raffles.GetUserTicketsSummaryAsync(q.UserId, ct);
        var ganados  = await _raffles.GetWinnersByUserAsync(q.UserId, ct);

        var profile = await _profiles.GetByUserIdAsync(q.UserId, ct);
        var niveles = await _levels.GetByUserTypeAsync(q.UserType, ct);
        var miNivel = niveles.FirstOrDefault(l => l.Name == (profile?.CurrentLevel ?? "bronze"));

        // Los abiertos, más los sorteados donde el usuario tuvo tickets.
        var todos = abiertos
            .Concat(mios.Select(m => m.Raffle).Where(r => abiertos.All(a => a.Id != r.Id)))
            .ToList();

        var salida = new List<UserRaffleDto>();

        foreach (var r in todos)
        {
            var tickets = mios.FirstOrDefault(m => m.Raffle.Id == r.Id).Tickets;
            var premio  = ganados.FirstOrDefault(w => w.RaffleId == r.Id);

            var (puede, motivo) = Eligibility(r, q.UserType, profile, miNivel, niveles);

            salida.Add(new UserRaffleDto(
                r.Id, r.Name, r.RaffleType, r.PrizeDescription, r.PrizeValue,
                r.DrawDate, r.Status, tickets, puede, motivo,
                premio is not null, premio?.PrizeRank, premio?.TicketNumber));
        }

        return salida.OrderBy(r => r.Status == "drawn" ? 1 : 0)
                     .ThenBy(r => r.DrawDate)
                     .ToList();
    }

    /// <summary>Si no puede participar, el motivo en palabras del usuario.</summary>
    private static (bool, string?) Eligibility(
        Raffle r, string userType, PointsProfile? profile,
        RewardLevel? miNivel, List<RewardLevel> niveles)
    {
        if (!r.AppliesTo(userType))
            return (false, "Este sorteo es para otro tipo de cuenta.");

        if (profile is null)
            return (false, "Completa un viaje para empezar a participar.");

        if (r.MinLevelRequired is not null)
        {
            var minimo = niveles.FirstOrDefault(l => l.Name == r.MinLevelRequired);
            if (minimo is not null && (miNivel?.SortOrder ?? 0) < minimo.SortOrder)
                return (false, $"Necesitas nivel {minimo.DisplayName}.");
        }

        if (r.MinMonthsActive is > 0)
        {
            var meses = (DateTime.UtcNow - profile.CreatedAt).TotalDays / 30.0;
            if (meses < r.MinMonthsActive.Value)
            {
                var faltan = (int)Math.Ceiling(r.MinMonthsActive.Value - meses);
                return (false, $"Te faltan {faltan} {(faltan == 1 ? "mes" : "meses")} de antigüedad.");
            }
        }

        return (true, null);
    }
}
