using MediatR;
using Bugie.Rewards.Application.Config;
using Bugie.Rewards.Domain.Constants;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.Interfaces;
using Bugie.Rewards.Domain.Services;

namespace Bugie.Rewards.Application.Commands;

/// <summary>
/// El pasajero calificó al conductor.
///
/// Puede dar puntos a los dos, con montos distintos:
///   · al pasajero, por tomarse el trabajo de calificar
///   · al conductor, por recibir una buena nota
///
/// Sobre exigir 5 estrellas para pagarle al pasajero: el PDF lo pide así, pero
/// es una mala idea. Si solo se paga por poner 5 estrellas, todos van a poner
/// 5 estrellas y las calificaciones dejan de servir para detectar conductores
/// malos, que es para lo único que existen.
///
/// Por eso es configurable. Con RatingRequireFiveStars en false, el pasajero
/// cobra por calificar sin importar la nota, y la nota vuelve a ser honesta.
/// El conductor sí cobra solo con 5, que ahí el incentivo es el correcto.
/// </summary>
public record AccrueRatingPointsCommand(
    Guid TripId,
    Guid PassengerId,
    Guid DriverId,
    byte Stars) : IRequest<RatingPointsResult>;

public record RatingPointsResult(int PassengerPoints, int DriverPoints, string? Reason);

public class AccrueRatingPointsHandler
    : IRequestHandler<AccrueRatingPointsCommand, RatingPointsResult>
{
    private readonly IPointsProfileRepository  _profiles;
    private readonly IRewardLevelRepository    _levels;
    private readonly IRewardSettingsRepository _settings;

    public AccrueRatingPointsHandler(
        IPointsProfileRepository profiles,
        IRewardLevelRepository levels,
        IRewardSettingsRepository settings)
    {
        _profiles = profiles;
        _levels   = levels;
        _settings = settings;
    }

    public async Task<RatingPointsResult> Handle(
        AccrueRatingPointsCommand cmd, CancellationToken ct)
    {
        var options = RewardsOptions.From(await _settings.GetMapAsync(ct));

        if (!options.Enabled)
            return new RatingPointsResult(0, 0, "Motor de puntos desactivado.");

        if (cmd.Stars is < 1 or > 5)
            return new RatingPointsResult(0, 0, "Calificación fuera de rango.");

        var cincoEstrellas = cmd.Stars == 5;

        // ── Pasajero: por calificar ───────────────────────────────────────
        var puntosPasajero = 0;
        if (options.RatingPointsPassenger > 0
            && (cincoEstrellas || !options.RatingRequireFiveStars))
        {
            puntosPasajero = await AwardAsync(
                cmd.PassengerId, UserTypes.Passenger, options,
                options.RatingPointsPassenger, cmd.TripId,
                $"Calificaste tu viaje con {cmd.Stars} estrellas", ct);
        }

        // ── Conductor: por recibir 5 estrellas ────────────────────────────
        var puntosConductor = 0;
        if (options.RatingPointsDriver > 0 && cincoEstrellas)
        {
            puntosConductor = await AwardAsync(
                cmd.DriverId, UserTypes.Driver, options,
                options.RatingPointsDriver, cmd.TripId,
                "Recibiste 5 estrellas", ct);
        }

        return new RatingPointsResult(puntosPasajero, puntosConductor, null);
    }

    /// <summary>
    /// Acredita. Devuelve 0 si ya se había acreditado por este viaje: el
    /// índice único de (perfil, origen, referencia) lo impide, igual que con
    /// los puntos del viaje.
    /// </summary>
    private async Task<int> AwardAsync(
        Guid userId, string userType, RewardsOptions options,
        int points, Guid tripId, string nota, CancellationToken ct)
    {
        var profile = await _profiles.GetByUserIdAsync(userId, ct);
        if (profile is null)
        {
            profile = PointsProfile.Create(userId, userType);
            await _profiles.AddAsync(profile, ct);
        }

        var balanceBefore = profile.AvailablePoints;
        profile.Earn(points, options.ExpiryMonthsFor(profile.UserType));

        var levels = await _levels.GetByUserTypeAsync(profile.UserType, ct);
        var level  = PointsRules.ResolveLevel(levels, profile.PointsForLevel(options.LevelBasis));
        if (level is not null) profile.SetLevel(level.Name);

        var movement = PointsTransaction.Earn(
            profileId:     profile.Id,
            points:        points,
            sourceEvent:   SourceEvents.Rating,
            referenceId:   tripId,
            balanceBefore: balanceBefore,
            expiryDate:    profile.PointsExpiryDate,
            notes:         nota);

        return await _profiles.ApplyEarnAsync(profile, movement, ct) ? points : 0;
    }
}
