using MediatR;
using Bugie.Rewards.Application.Config;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Domain.Interfaces;
using Bugie.Rewards.Domain.Services;
using Bugie.Rewards.Domain.Common;

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
        // Los días se trabajan como fecha de Perú SIN zona (Kind = Unspecified).
        // Ojo: .Date conserva Kind = Utc, y el convertidor JSON volvía a restar
        // las 5 h, mostrando cada día como el anterior a las 19:00.
        var hoy     = DiaLocal(DateTime.UtcNow);

        var profile = await _profiles.GetByUserIdAsync(q.UserId, ct);

        // Sin perfil todavía no viajó: se devuelve todo en cero, con las metas
        // configuradas, para que igual vea qué puede conseguir.
        if (profile is null)
            return Vacio(options, hoy, "passenger");

        // Días con viaje (hora real del viaje, en Perú), del más reciente hacia
        // atrás: la racha se mide hasta el primer día sin viaje.
        var diasConViaje = (await _milestones.GetTripDaysAsync(
                q.UserId, hoy, MilestoneRules.MaxStreakDays, ct))
            .Select(d => DateTime.SpecifyKind(d.Date, DateTimeKind.Unspecified))
            .ToHashSet();

        // Si hoy todavía no viajó, la racha que viene hasta ayer sigue viva:
        // se muestra esa, no 0.
        var viajoHoy = diasConViaje.Contains(hoy);
        var racha    = MilestoneRules.LiveStreak(diasConViaje, hoy);

        // La tira de los últimos N días, del más viejo al de hoy.
        var tira = Enumerable.Range(0, Math.Max(options.StreakDays, 7))
            .Select(i => hoy.AddDays(-(Math.Max(options.StreakDays, 7) - 1 - i)))
            .Select(d => new ProgressDayDto(d, diasConViaje.Contains(d), d == hoy))
            .ToList();

        // Meta semanal.
        var lunes   = MilestoneRules.WeekStart(hoy);
        var meta    = options.WeeklyGoalFor(profile.UserType);
        var viajes  = meta > 0
            ? await _milestones.CountUserTripsAsync(
                q.UserId, AUtc(lunes), AUtc(lunes.AddDays(7)), ct)
            : 0;

        // Aniversario.
        var joinedLocal = BugieTime.ToPeru(profile.CreatedAt);
        var aniversario = options.AnniversaryMultiplier > 1
                          && MilestoneRules.IsAnniversaryMonth(joinedLocal, hoy);

        // Cuántos días faltan para cerrar el bloque de racha en curso.
        var faltanRacha = options.StreakDays > 0
            ? options.StreakDays - (racha % options.StreakDays)
            : 0;
        if (options.StreakDays > 0 && viajoHoy && racha > 0 && racha % options.StreakDays == 0)
            faltanRacha = 0;   // justo hoy lo completó

        return new ProgressDto(
            StreakDays:            racha,
            StreakTarget:          options.StreakDays,
            StreakPoints:          options.StreakPoints,
            StreakDaysToGo:        faltanRacha,
            TraveledToday:         viajoHoy,
            Days:                  tira,

            WeeklyTrips:           viajes,
            WeeklyGoal:            meta,
            WeeklyPoints:          options.WeeklyGoalPoints,

            IsAnniversaryMonth:    aniversario,
            AnniversaryMultiplier: options.AnniversaryMultiplier,
            // En UTC: el convertidor JSON la pasa a hora de Perú una sola vez.
            MemberSince:           DateTime.SpecifyKind(profile.CreatedAt, DateTimeKind.Utc));
    }

    /// <summary>Fecha de Perú (sin hora, Kind = Unspecified) de un instante UTC.</summary>
    private static DateTime DiaLocal(DateTime utc) =>
        DateTime.SpecifyKind(BugieTime.ToPeru(utc).Date, DateTimeKind.Unspecified);

    /// <summary>Medianoche de un día de Perú expresada en UTC (para filtrar en la BD).</summary>
    private static DateTime AUtc(DateTime diaLocal) => BugieTime.PeruToUtc(diaLocal);

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
