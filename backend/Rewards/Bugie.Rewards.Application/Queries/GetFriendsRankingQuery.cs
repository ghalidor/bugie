using System.Globalization;
using MediatR;
using Bugie.Rewards.Application.Config;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Application.Queries;

/// <summary>
/// Ranking entre amigos: el usuario comparado con quienes invitó y con quien
/// lo invitó a él. Esa es su red dentro de Bugie.
///
/// Se mide por puntos del MES, no histórico: si fuera histórico, quien lleva
/// un año siempre estaría arriba y el ranking dejaría de motivar a nadie.
/// </summary>
public record GetFriendsRankingQuery(Guid UserId) : IRequest<FriendsRankingDto>;

public class GetFriendsRankingHandler
    : IRequestHandler<GetFriendsRankingQuery, FriendsRankingDto>
{
    private readonly IReferralRepository       _referrals;
    private readonly IRewardSettingsRepository _settings;

    public GetFriendsRankingHandler(
        IReferralRepository referrals, IRewardSettingsRepository settings)
    {
        _referrals = referrals;
        _settings  = settings;
    }

    public async Task<FriendsRankingDto> Handle(
        GetFriendsRankingQuery q, CancellationToken ct)
    {
        var options = RewardsOptions.From(await _settings.GetMapAsync(ct));
        var tz      = options.TimezoneOffsetHours;

        // El mes se calcula en hora local: si no, el 1 de mes a las 7pm
        // todavía contaría como el mes anterior.
        var ahoraLocal  = DateTime.UtcNow.AddHours(tz);
        var inicioLocal = new DateTime(ahoraLocal.Year, ahoraLocal.Month, 1);
        var finLocal    = inicioLocal.AddMonths(1);

        var amigos = await _referrals.GetFriendIdsAsync(q.UserId, ct);

        // El usuario siempre está en su propio ranking, aunque no tenga amigos.
        var todos = amigos.Append(q.UserId).Distinct().ToList();

        var puntos = await _referrals.GetMonthlyPointsAsync(
            todos, inicioLocal.AddHours(-tz), finLocal.AddHours(-tz), ct);

        // Quienes invitaron a este usuario, para etiquetar la relación.
        var quienesMeInvitaron = (await _referrals.GetByReferredUserAsync(q.UserId, ct)) is { } r
            ? new HashSet<Guid> { r.ReferrerUserId }
            : new HashSet<Guid>();

        var ordenados = puntos
            .OrderByDescending(p => p.Points)
            .ThenByDescending(p => p.Trips)
            .ToList();

        var entries = ordenados.Select((p, i) => new RankingEntryDto(
            i + 1,
            p.UserId,
            p.UserId == q.UserId ? "Tú" : Abreviar(p.FullName),
            p.Level,
            p.Points,
            p.Trips,
            p.UserId == q.UserId,
            p.UserId == q.UserId      ? "tú"
            : quienesMeInvitaron.Contains(p.UserId) ? "te invitó"
            : "lo invitaste")).ToList();

        var mio = entries.FirstOrDefault(e => e.IsMe);

        var mes = CultureInfo.GetCultureInfo("es-PE").DateTimeFormat
            .GetMonthName(ahoraLocal.Month);

        return new FriendsRankingDto(
            mio?.Position ?? 0,
            mio?.PointsThisMonth ?? 0,
            char.ToUpper(mes[0]) + mes[1..],
            entries);
    }

    /// <summary>
    /// Nombre y la inicial del apellido: «Carlos R.».
    ///
    /// El ranking lo ven otras personas, y mostrar el nombre completo de
    /// alguien que solo compartió un código de invitación es más de lo que
    /// esa persona aceptó.
    /// </summary>
    private static string Abreviar(string? fullName)
    {
        if (string.IsNullOrWhiteSpace(fullName)) return "Usuario";

        var partes = fullName.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (partes.Length == 1) return partes[0];
        return $"{partes[0]} {char.ToUpper(partes[1][0])}.";
    }
}
