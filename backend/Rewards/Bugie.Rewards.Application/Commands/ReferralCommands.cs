using MediatR;
using Bugie.Rewards.Application.Config;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Domain.Constants;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.External;
using Bugie.Rewards.Domain.Interfaces;
using Bugie.Rewards.Domain.Services;

namespace Bugie.Rewards.Application.Commands;

/* ──────────────────────────────────────────────────────────────────────────
   Referidos.

   El código se pide SOLO al registrarse. Si se pudiera cargar después desde la
   app, cualquiera crearía una segunda cuenta para referirse a sí mismo.

   Aun así hay dos candados en la base, que no dependen de que este código los
   respete: no se puede referir a uno mismo, y a una persona no la pueden
   reclamar dos veces.
   ────────────────────────────────────────────────────────────────────────── */

/// <summary>
/// Devuelve el código del usuario, creándolo la primera vez. Junto con sus
/// estadísticas: a cuántos invitó, cuántos ya calificaron y qué ganó.
/// </summary>
public record GetMyReferralCommand(Guid UserId, string? FullName)
    : IRequest<MyReferralDto>;

public class GetMyReferralHandler : IRequestHandler<GetMyReferralCommand, MyReferralDto>
{
    private readonly IReferralRepository       _referrals;
    private readonly IRewardSettingsRepository _settings;

    public GetMyReferralHandler(
        IReferralRepository referrals, IRewardSettingsRepository settings)
    {
        _referrals = referrals;
        _settings  = settings;
    }

    public async Task<MyReferralDto> Handle(GetMyReferralCommand cmd, CancellationToken ct)
    {
        var options = RewardsOptions.From(await _settings.GetMapAsync(ct));
        var code    = await EnsureCodeAsync(cmd.UserId, cmd.FullName, ct);
        var mios    = await _referrals.GetByReferrerAsync(cmd.UserId, ct);

        return new MyReferralDto(
            code,
            options.ReferralsEnabled,
            mios.Count,
            mios.Count(r => r.Status == ReferralStatus.Qualified),
            mios.Sum(r => r.SignupPoints + r.QualifyPoints),
            options.ReferralPointsPassenger,
            options.ReferralPointsDriver,
            options.ReferralQualifyTrips,
            options.ReferralQualifyPoints,
            mios.Take(20).Select(r => new ReferredPersonDto(
                r.ReferredUserType,
                r.Status,
                r.TripsCompleted,
                r.SignupPoints + r.QualifyPoints,
                r.CreatedAt)).ToList());
    }

    /// <summary>
    /// Devuelve el código, creándolo si no existe.
    ///
    /// Se reintenta ante un choque: con 20 millones de combinaciones por
    /// nombre es raro, pero no imposible, y la base es el único árbitro.
    /// </summary>
    private async Task<string> EnsureCodeAsync(Guid userId, string? fullName, CancellationToken ct)
    {
        var existente = await _referrals.GetCodeByUserAsync(userId, ct);
        if (existente is not null) return existente.Code;

        for (var intento = 0; intento < 10; intento++)
        {
            var nuevo = new ReferralCode
            {
                Id        = Guid.NewGuid(),
                UserId    = userId,
                Code      = ReferralCodeGenerator.Generate(fullName),
                CreatedAt = DateTime.UtcNow,
            };

            if (await _referrals.TryAddCodeAsync(nuevo, ct)) return nuevo.Code;

            // Puede haber fallado porque OTRO proceso creó el código de este
            // mismo usuario al mismo tiempo. Si es eso, se usa el que quedó.
            var ahora = await _referrals.GetCodeByUserAsync(userId, ct);
            if (ahora is not null) return ahora.Code;
        }

        throw new InvalidOperationException(
            "No se pudo generar un código de invitación. Inténtalo de nuevo.");
    }
}

/// <summary>
/// Alguien se registró usando un código. Lo llama Auth por el endpoint interno.
///
/// Nunca lanza excepción por un código inválido: el registro ya ocurrió y no
/// se puede deshacer. Simplemente no se acreditan puntos.
/// </summary>
public record RegisterReferralCommand(
    Guid   NewUserId,
    string NewUserType,
    string Code,
    string? NewUserEmail) : IRequest<ReferralResultDto>;

public class RegisterReferralHandler
    : IRequestHandler<RegisterReferralCommand, ReferralResultDto>
{
    private readonly IReferralRepository          _referrals;
    private readonly IPointsProfileRepository     _profiles;
    private readonly IRewardLevelRepository       _levels;
    private readonly IRewardSettingsRepository    _settings;
    private readonly IMediator                    _mediator;

    public RegisterReferralHandler(
        IReferralRepository referrals,
        IPointsProfileRepository profiles,
        IRewardLevelRepository levels,
        IRewardSettingsRepository settings,
        IMediator mediator)
    {
        _referrals = referrals;
        _profiles  = profiles;
        _levels    = levels;
        _settings  = settings;
        _mediator  = mediator;
    }

    public async Task<ReferralResultDto> Handle(
        RegisterReferralCommand cmd, CancellationToken ct)
    {
        var options = RewardsOptions.From(await _settings.GetMapAsync(ct));

        if (!options.ReferralsEnabled)
            return new ReferralResultDto(false, 0, "El programa de referidos está desactivado.");

        if (string.IsNullOrWhiteSpace(cmd.Code))
            return new ReferralResultDto(false, 0, "No se envió código.");

        var code = await _referrals.GetCodeByValueAsync(cmd.Code.Trim(), ct);
        if (code is null)
            return new ReferralResultDto(false, 0, "El código no existe.");

        if (code.UserId == cmd.NewUserId)
            return new ReferralResultDto(false, 0, "No puedes usar tu propio código.");

        var referral = new Referral
        {
            Id               = Guid.NewGuid(),
            ReferrerUserId   = code.UserId,
            ReferredUserId   = cmd.NewUserId,
            ReferredUserType = cmd.NewUserType,
            Code             = code.Code,
            Status           = ReferralStatus.Pending,
            CreatedAt        = DateTime.UtcNow,
        };

        // La base decide: si ya lo reclamaron, devuelve false.
        if (!await _referrals.TryAddReferralAsync(referral, ct))
            return new ReferralResultDto(false, 0, "Este usuario ya fue referido por alguien.");

        // Puntos para quien invitó, según el tipo de cuenta del referido.
        var puntos = cmd.NewUserType == UserTypes.Driver
            ? options.ReferralPointsDriver
            : options.ReferralPointsPassenger;

        if (puntos > 0)
        {
            await AwardAsync(code.UserId, puntos, referral.Id,
                "Referiste a un nuevo usuario", options, ct);

            referral.SignupPoints = puntos;
            await _referrals.UpdateReferralAsync(referral, ct);
        }

        if (!string.IsNullOrWhiteSpace(cmd.NewUserEmail))
            await _referrals.MarkInvitationAcceptedAsync(cmd.NewUserEmail!, code.Code, ct);

        return new ReferralResultDto(true, puntos, null);
    }

    /// <summary>
    /// Acredita puntos a quien refirió. Crea su perfil si todavía no viajó:
    /// puede invitar gente antes de hacer su primer viaje.
    /// </summary>
    private async Task AwardAsync(
        Guid userId, int points, Guid referenceId, string nota,
        RewardsOptions options, CancellationToken ct)
    {
        var profile = await _profiles.GetByUserIdAsync(userId, ct);
        if (profile is null)
        {
            // Sin viajes previos no se sabe el tipo de cuenta; se asume
            // pasajero, que es el caso habitual. Al completar su primer viaje
            // el perfil ya existe y se usa el correcto.
            profile = PointsProfile.Create(userId, UserTypes.Passenger);
            await _profiles.AddAsync(profile, ct);
        }

        var balanceBefore = profile.AvailablePoints;
        profile.Earn(points, options.ExpiryMonthsFor(profile.UserType));

        var nivelAntes = profile.CurrentLevel;
        var levels = await _levels.GetByUserTypeAsync(profile.UserType, ct);
        var level  = PointsRules.ResolveLevel(levels, profile.PointsForLevel(options.LevelBasis));
        if (level is not null) profile.SetLevel(level.Name);

        var movement = PointsTransaction.Earn(
            profileId:     profile.Id,
            points:        points,
            sourceEvent:   SourceEvents.Referral,
            referenceId:   referenceId,
            balanceBefore: balanceBefore,
            expiryDate:    profile.PointsExpiryDate,
            notes:         nota);

        if (await _profiles.ApplyEarnAsync(profile, movement, ct))
            await LevelUpNotice.SendIfChangedAsync(_mediator, profile, nivelAntes, ct);
    }
}

/// <summary>
/// Suma un viaje al referido y, si llegó a la meta, paga el bono extra.
/// Se llama desde la acreditación de puntos del viaje.
/// </summary>
public record CountReferralTripCommand(Guid ReferredUserId) : IRequest<Unit>;

public class CountReferralTripHandler : IRequestHandler<CountReferralTripCommand, Unit>
{
    private readonly IReferralRepository       _referrals;
    private readonly IPointsProfileRepository  _profiles;
    private readonly IRewardLevelRepository    _levels;
    private readonly IRewardSettingsRepository _settings;
    private readonly IMediator                 _mediator;

    public CountReferralTripHandler(
        IReferralRepository referrals,
        IPointsProfileRepository profiles,
        IRewardLevelRepository levels,
        IRewardSettingsRepository settings,
        IMediator mediator)
    {
        _referrals = referrals;
        _profiles  = profiles;
        _levels    = levels;
        _settings  = settings;
        _mediator  = mediator;
    }

    public async Task<Unit> Handle(CountReferralTripCommand cmd, CancellationToken ct)
    {
        var referral = await _referrals.GetByReferredUserAsync(cmd.ReferredUserId, ct);

        // La mayoría de los usuarios no fueron referidos por nadie.
        if (referral is null || referral.Status == ReferralStatus.Qualified) return Unit.Value;

        var options = RewardsOptions.From(await _settings.GetMapAsync(ct));
        if (!options.ReferralsEnabled) return Unit.Value;

        referral.TripsCompleted++;

        var meta = options.ReferralQualifyTrips;
        if (meta > 0 && referral.TripsCompleted >= meta && referral.QualifyPoints == 0)
        {
            var bono = options.ReferralQualifyPoints;
            if (bono > 0)
            {
                await AwardQualifyAsync(referral.ReferrerUserId, bono, referral.Id, options, ct);
                referral.QualifyPoints = bono;
            }
            referral.Status      = ReferralStatus.Qualified;
            referral.QualifiedAt = DateTime.UtcNow;
        }

        await _referrals.UpdateReferralAsync(referral, ct);
        return Unit.Value;
    }

    private async Task AwardQualifyAsync(
        Guid userId, int points, Guid referenceId, RewardsOptions options, CancellationToken ct)
    {
        var profile = await _profiles.GetByUserIdAsync(userId, ct);
        if (profile is null)
        {
            profile = PointsProfile.Create(userId, UserTypes.Passenger);
            await _profiles.AddAsync(profile, ct);
        }

        var balanceBefore = profile.AvailablePoints;
        profile.Earn(points, options.ExpiryMonthsFor(profile.UserType));

        var nivelAntes = profile.CurrentLevel;
        var levels = await _levels.GetByUserTypeAsync(profile.UserType, ct);
        var level  = PointsRules.ResolveLevel(levels, profile.PointsForLevel(options.LevelBasis));
        if (level is not null) profile.SetLevel(level.Name);

        var movement = PointsTransaction.Earn(
            profileId:     profile.Id,
            points:        points,
            sourceEvent:   SourceEvents.ReferralQualified,
            referenceId:   referenceId,
            balanceBefore: balanceBefore,
            expiryDate:    profile.PointsExpiryDate,
            notes:         $"Tu referido completó {options.ReferralQualifyTrips} viajes");

        if (await _profiles.ApplyEarnAsync(profile, movement, ct))
            await LevelUpNotice.SendIfChangedAsync(_mediator, profile, nivelAntes, ct);
    }
}

/// <summary>Envía el código por correo. El código es el fijo del usuario.</summary>
public record InviteByEmailCommand(Guid UserId, string? FullName, string Email)
    : IRequest<Unit>;

public class InviteByEmailHandler : IRequestHandler<InviteByEmailCommand, Unit>
{
    /// <summary>Tope diario, para que esto no se use como enviador de correo masivo.</summary>
    private const int MaxPorDia = 20;

    private readonly IReferralRepository _referrals;
    private readonly IMediator           _mediator;
    private readonly IEmailSender        _email;

    public InviteByEmailHandler(
        IReferralRepository referrals, IMediator mediator, IEmailSender email)
    {
        _referrals = referrals;
        _mediator  = mediator;
        _email     = email;
    }

    public async Task<Unit> Handle(InviteByEmailCommand cmd, CancellationToken ct)
    {
        var email = (cmd.Email ?? string.Empty).Trim();

        if (email.Length < 5 || !email.Contains('@') || !email.Contains('.'))
            throw new ArgumentException("Escribe un correo válido.");

        var enviadas = await _referrals.CountInvitationsTodayAsync(cmd.UserId, ct);
        if (enviadas >= MaxPorDia)
            throw new InvalidOperationException(
                $"Ya enviaste {MaxPorDia} invitaciones hoy. Inténtalo mañana.");

        // Reutiliza la lógica que crea el código si todavía no existe.
        var mio = await _mediator.Send(new GetMyReferralCommand(cmd.UserId, cmd.FullName), ct);

        await _referrals.AddInvitationAsync(new ReferralInvitation
        {
            Id             = Guid.NewGuid(),
            ReferrerUserId = cmd.UserId,
            Email          = email,
            Code           = mio.Code,
            SentAt         = DateTime.UtcNow,
        }, ct);

        var nombre = string.IsNullOrWhiteSpace(cmd.FullName) ? "Un amigo" : cmd.FullName!;

        await _email.SendAsync(
            email,
            "Te invitaron a Bugie",
            Body(nombre, mio.Code),
            ct);

        return Unit.Value;
    }

    private static string Body(string nombre, string code) => $@"
<div style=""font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1e1b39"">
  <h2 style=""color:#5b5bd6;margin-bottom:4px"">{nombre} te invitó a Bugie</h2>
  <p>Bugie es la app de transporte seguro de tu ciudad. Conductores verificados,
     monitoreo en tiempo real y botón SOS.</p>

  <p style=""margin-bottom:6px"">Usa este código al crear tu cuenta:</p>
  <div style=""font-size:30px;font-weight:800;letter-spacing:4px;color:#5b5bd6;
              background:#f2f1fb;border-radius:12px;padding:16px;text-align:center"">
    {code}
  </div>

  <p style=""margin-top:18px"">Se escribe en el campo <strong>«Código de invitación»</strong>
     del formulario de registro. Es opcional, pero si lo pones, {nombre} gana puntos
     y tú empiezas con el pie derecho.</p>

  <p style=""color:#6b7394;font-size:13px;margin-top:24px"">
     Si no esperabas este correo, puedes ignorarlo.</p>
</div>";
}
