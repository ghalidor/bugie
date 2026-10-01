using MediatR;
using Bugie.Rewards.Application.Config;
using Bugie.Rewards.Domain.Constants;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.External;
using Bugie.Rewards.Domain.Interfaces;
using Bugie.Rewards.Domain.Services;

namespace Bugie.Rewards.Application.Commands;

public class RunPointsExpirationHandler
    : IRequestHandler<RunPointsExpirationCommand, PointsExpirationResult>
{
    private readonly IPointsProfileRepository  _profiles;
    private readonly IRewardLevelRepository    _levels;
    private readonly IRewardSettingsRepository _settings;
    private readonly IFcmSender                _push;

    public RunPointsExpirationHandler(
        IPointsProfileRepository profiles,
        IRewardLevelRepository levels,
        IRewardSettingsRepository settings,
        IFcmSender push)
    {
        _profiles = profiles;
        _levels   = levels;
        _settings = settings;
        _push     = push;
    }

    public async Task<PointsExpirationResult> Handle(
        RunPointsExpirationCommand cmd, CancellationToken ct)
    {
        var options = RewardsOptions.From(await _settings.GetMapAsync(ct));

        if (!options.ExpiryEnabled)
            return new PointsExpirationResult(0, 0, 0);

        var warned = await SendWarningsAsync(options, cmd.BatchSize, ct);
        var (expired, lost) = await ExpireAsync(options, cmd.BatchSize, ct);

        return new PointsExpirationResult(warned, expired, lost);
    }

    // ------------------------------------------------------------------------
    // Aviso previo
    // ------------------------------------------------------------------------
    private async Task<int> SendWarningsAsync(
        RewardsOptions options, int batchSize, CancellationToken ct)
    {
        // El hito mas lejano define la ventana que hay que traer de la base.
        var widestWindow = options.ExpiryWarningMilestones.Max();

        var pending = await _profiles.GetPendingWarningAsync(widestWindow, batchSize, ct);

        var sent = 0;
        foreach (var profile in pending)
        {
            if (ct.IsCancellationRequested) break;

            // Decide que hito toca, o null si ya se aviso o todavia falta mucho.
            var milestone = profile.NextExpiryWarningMilestone(options.ExpiryWarningMilestones);
            if (milestone is null) continue;

            var days = profile.DaysUntilExpiry();

            await _push.SendToUserAsync(profile.UserId, new FcmPushMessage(
                Title: "Tus puntos estan por vencer",
                Body:  days <= 1
                    ? $"Tienes {profile.AvailablePoints} puntos que vencen manana. Completa un viaje y renuevas su vigencia."
                    : $"Tienes {profile.AvailablePoints} puntos que vencen en {days} dias. Completa un viaje y renuevas su vigencia.",
                Route: "/rewards",
                ExtraData: new Dictionary<string, string>
                {
                    ["type"]      = "points_expiring",
                    ["points"]    = profile.AvailablePoints.ToString(),
                    ["days"]      = days.ToString(),
                    ["milestone"] = milestone.Value.ToString(),
                }), ct);

            // Se marca aunque el push no haya salido. Si Firebase esta caido,
            // reintentar al dia siguiente es preferible a acumular avisos.
            profile.MarkExpiryWarningSent(milestone.Value);
            await _profiles.MarkWarningSentAsync(profile, ct);
            sent++;
        }

        return sent;
    }

    // ------------------------------------------------------------------------
    // Vencimiento
    // ------------------------------------------------------------------------
    private async Task<(int Expired, int PointsLost)> ExpireAsync(
        RewardsOptions options, int batchSize, CancellationToken ct)
    {
        var due = await _profiles.GetExpiredAsync(batchSize, ct);

        var count = 0;
        var lostTotal = 0;

        foreach (var profile in due)
        {
            if (ct.IsCancellationRequested) break;

            var balanceBefore = profile.AvailablePoints;
            var lost = profile.ExpireAll();
            if (lost <= 0) continue;

            // Si el nivel se calcula por saldo disponible, vencer lo hace caer.
            // Con la configuracion por defecto (historico) el nivel no cambia.
            var levels = await _levels.GetByUserTypeAsync(profile.UserType, ct);
            var level  = PointsRules.ResolveLevel(levels, profile.PointsForLevel(options.LevelBasis));
            if (level is not null) profile.SetLevel(level.Name);

            var movement = PointsTransaction.Expire(
                profileId:     profile.Id,
                points:        lost,
                sourceEvent:   SourceEvents.PointsExpired,
                balanceBefore: balanceBefore,
                notes:         "Puntos vencidos por inactividad.");

            var applied = await _profiles.ApplyExpirationAsync(profile, movement, ct);

            // false significa que el usuario gano puntos justo ahora y su fecha
            // se renovo. No se vence nada y en la proxima pasada se reevalua.
            if (!applied) continue;

            count++;
            lostTotal += lost;

            await _push.SendToUserAsync(profile.UserId, new FcmPushMessage(
                Title: "Tus puntos vencieron",
                Body:  $"Se vencieron {lost} puntos por inactividad. Completa un viaje para empezar a acumular de nuevo.",
                Route: "/rewards",
                ExtraData: new Dictionary<string, string>
                {
                    ["type"]   = "points_expired",
                    ["points"] = lost.ToString(),
                }), ct);
        }

        return (count, lostTotal);
    }
}
