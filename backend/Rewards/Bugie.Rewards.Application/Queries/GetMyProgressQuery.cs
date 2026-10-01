using MediatR;
using Bugie.Rewards.Application.Config;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Domain.Interfaces;
using Bugie.Rewards.Domain.Services;

namespace Bugie.Rewards.Application.Queries;

/// <summary>
/// Cómo va el usuario con sus logros EN CURSO.
///
/// Hasta ahora los logros solo se calculaban al terminar un viaje, para
/// decidir si pagar el bono. Eso deja afuera lo que da sentido a una racha:
/// que la persona sepa que lleva 4 días y le faltan 3. Si solo se entera
/// cuando ya ganó, la racha no motiva nada.
/// </summary>
public record GetMyProgressQuery(Guid UserId) : IRequest<ProgressDto>;

public class GetMyProgressHandler : IRequestHandler<GetMyProgressQuery, ProgressDto>
{
    private readonly IMilestoneRepository      _milestones;
    private readonly IPointsProfileRepository  _profiles;
    private readonly IRewardSettingsRepository _settings;

    public GetMyProgressHandler(
        IMilestoneRepository milestones,
        IPointsProfileRepository profiles,
        IRewardSettingsRepository settings)
    {
        _milestones = milestones;
        _profiles   = profiles;
        _settings   = settings;
    }

    public async Task<ProgressDto> Handle(GetMyProgressQuery q, CancellationToken ct)
    {
        var options = RewardsOptions.From(await _settings.GetMapAsync(ct));
        var tz      = options.TimezoneOffsetHours;
        var hoy     = DateTime.UtcNow.AddHours(tz).Date;

        var profile = await _profiles.GetByUserIdAsync(q.UserId, ct);

        // Sin perfil todavía no viajó: se devuelve todo en cero, con las metas
        // configuradas, para que igual vea qué puede conseguir.
        if (profile is null)
            return Vacio(options, hoy, "passenger");

        // Se piden los días justos para dibujar la tira y medir la racha.
        var diasAtras = Math.Max(options.StreakDays * 2, 14);
        var desdeUtc  = hoy.AddDays(-diasAtras).AddHours(-tz);

        var momentos = await _milestones.GetTripTimesAsync(profile.Id, desdeUtc, ct);
        var diasConViaje = momentos.Select(m => m.AddHours(tz).Date).ToHashSet();

        var racha = MilestoneRules.CurrentStreak(diasConViaje, hoy);

        // La tira de los últimos N días, del más viejo al de hoy.
        var tira = Enumerable.Range(0, Math.Max(options.StreakDays, 7))
            .Select(i => hoy.AddDays(-(Math.Max(options.StreakDays, 7) - 1 - i)))
            .Select(d => new ProgressDayDto(d, diasConViaje.Contains(d), d == hoy))
            .ToList();

        // Meta semanal.
        var lunes   = MilestoneRules.WeekStart(hoy);
        var meta    = options.WeeklyGoalFor(profile.UserType);
        var viajes  = meta > 0
            ? await _milestones.CountTripsAsync(
                profile.Id, lunes.AddHours(-tz), lunes.AddDays(7).AddHours(-tz), ct)
            : 0;

        // Aniversario.
        var joinedLocal = profile.CreatedAt.AddHours(tz);
        var aniversario = options.AnniversaryMultiplier > 1
                          && MilestoneRules.IsAnniversaryMonth(joinedLocal, hoy);

        // Cuántos días faltan para cerrar el bloque de racha en curso.
        var faltanRacha = options.StreakDays > 0
            ? options.StreakDays - (racha % options.StreakDays)
            : 0;
        if (options.StreakDays > 0 && racha > 0 && racha % options.StreakDays == 0)
            faltanRacha = 0;   // justo hoy lo completó

        return new ProgressDto(
            StreakDays:            racha,
            StreakTarget:          options.StreakDays,
            StreakPoints:          options.StreakPoints,
            StreakDaysToGo:        faltanRacha,
            TraveledToday:         diasConViaje.Contains(hoy),
            Days:                  tira,

            WeeklyTrips:           viajes,
            WeeklyGoal:            meta,
            WeeklyPoints:          options.WeeklyGoalPoints,

            IsAnniversaryMonth:    aniversario,
            AnniversaryMultiplier: options.AnniversaryMultiplier,
            MemberSince:           joinedLocal);
    }

    private static ProgressDto Vacio(RewardsOptions o, DateTime hoy, string userType)
    {
        var dias = Enumerable.Range(0, Math.Max(o.StreakDays, 7))
            .Select(i => hoy.AddDays(-(Math.Max(o.StreakDays, 7) - 1 - i)))
            .Select(d => new ProgressDayDto(d, false, d == hoy))
            .ToList();

        return new ProgressDto(
            0, o.StreakDays, o.StreakPoints, o.StreakDays, false, dias,
            0, o.WeeklyGoalFor(userType), o.WeeklyGoalPoints,
            false, o.AnniversaryMultiplier, null);
    }
}
