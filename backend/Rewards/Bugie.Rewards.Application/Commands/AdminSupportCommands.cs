using MediatR;
using Bugie.Rewards.Application.Config;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Domain.Constants;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.Interfaces;
using Bugie.Rewards.Domain.Services;

namespace Bugie.Rewards.Application.Commands;

/* ──────────────────────────────────────────────────────────────────────────
   Soporte: buscar un usuario, ver qué le pasó y corregirle los puntos.

   Sin esto, cada reclamo obliga a entrar a producción con psql y escribir un
   UPDATE a mano. Eso es lento, no deja rastro de quién lo hizo, y un WHERE mal
   puesto desordena los saldos de todos.
   ────────────────────────────────────────────────────────────────────────── */

/// <summary>Busca por correo, nombre o teléfono.</summary>
public record SearchUsersQuery(string Query) : IRequest<List<UserSearchDto>>;

public class SearchUsersHandler : IRequestHandler<SearchUsersQuery, List<UserSearchDto>>
{
    private readonly IAdminQueryRepository _admin;
    public SearchUsersHandler(IAdminQueryRepository admin) => _admin = admin;

    public async Task<List<UserSearchDto>> Handle(SearchUsersQuery q, CancellationToken ct)
    {
        var texto = (q.Query ?? string.Empty).Trim();

        // Dos letras no alcanzan: devolvería media base de datos.
        if (texto.Length < 3) return new List<UserSearchDto>();

        var rows = await _admin.SearchUsersAsync(texto, 25, ct);

        return rows.Select(r => new UserSearchDto(
            r.UserId, r.FullName, r.Email, r.Phone, r.Role,
            r.HasProfile, r.UserType, r.CurrentLevel,
            r.AvailablePoints, r.TotalPoints, r.LastActivityDate)).ToList();
    }
}

/// <summary>Todo lo que hace falta para atender un reclamo de una persona.</summary>
public record GetUserRewardsQuery(Guid UserId) : IRequest<UserRewardsDetailDto>;

public class GetUserRewardsHandler
    : IRequestHandler<GetUserRewardsQuery, UserRewardsDetailDto>
{
    private readonly IAdminQueryRepository        _admin;
    private readonly IPointsProfileRepository     _profiles;
    private readonly IPointsTransactionRepository _transactions;
    private readonly IRedemptionRepository        _redemptions;
    private readonly IReferralRepository          _referrals;
    private readonly IMilestoneRepository         _milestones;

    public GetUserRewardsHandler(
        IAdminQueryRepository admin,
        IPointsProfileRepository profiles,
        IPointsTransactionRepository transactions,
        IRedemptionRepository redemptions,
        IReferralRepository referrals,
        IMilestoneRepository milestones)
    {
        _admin        = admin;
        _profiles     = profiles;
        _transactions = transactions;
        _redemptions  = redemptions;
        _referrals    = referrals;
        _milestones   = milestones;
    }

    public async Task<UserRewardsDetailDto> Handle(
        GetUserRewardsQuery q, CancellationToken ct)
    {
        var user = await _admin.GetUserAsync(q.UserId, ct)
            ?? throw new KeyNotFoundException("Usuario no encontrado.");

        var profile = await _profiles.GetByUserIdAsync(q.UserId, ct);

        // Sin perfil no hay nada más que mostrar, y eso YA es la respuesta al
        // reclamo: nunca se le acreditó nada.
        if (profile is null)
        {
            return new UserRewardsDetailDto(
                new UserSearchDto(user.UserId, user.FullName, user.Email, user.Phone,
                    user.Role, false, null, null, 0, 0, null),
                null, new List<PointsTransactionDto>(), new List<RedemptionDto>(),
                0, 0, new List<string>());
        }

        var historial = await _transactions.GetByProfileAsync(profile.Id, 1, 50, ct);
        var canjes    = await _redemptions.GetByUserAsync(q.UserId, null, 1, 20, ct);
        var invitados = await _referrals.GetByReferrerAsync(q.UserId, ct);
        var logros    = await _milestones.GetRecentAsync(profile.Id, 10, ct);

        var notas = logros.Select(l =>
            $"{EtiquetaLogro(l.Type)}: {l.Points} puntos" +
            (l.Detail is not null ? $" ({l.Detail})" : "")).ToList();

        return new UserRewardsDetailDto(
            new UserSearchDto(user.UserId, user.FullName, user.Email, user.Phone,
                user.Role, true, profile.UserType, profile.CurrentLevel,
                profile.AvailablePoints, profile.TotalPoints, profile.LastActivityDate),
            new ProfileSummaryDto(
                profile.AvailablePoints, profile.TotalPoints, profile.RedeemedPoints,
                profile.CurrentLevel, profile.PointsExpiryDate, profile.CreatedAt),
            historial.Items.Select(ToDto).ToList(),
            canjes.Items.Select(ToDto).ToList(),
            invitados.Count,
            invitados.Count(r => r.Status == "qualified"),
            notas);
    }

    private static string EtiquetaLogro(string type) => type switch
    {
        "streak"      => "Racha",
        "weekly_goal" => "Meta semanal",
        "anniversary" => "Aniversario",
        _             => type,
    };

    private static RedemptionDto ToDto(Redemption r) => new(
        r.Id, r.Code, r.ItemName, r.PointsSpent, r.RewardType,
        r.AmountSoles, r.Quantity, r.Percentage, r.Status,
        r.ExpiresAt, r.UsedAt, r.UsedNote, r.CreatedAt);

    private static PointsTransactionDto ToDto(PointsTransaction t) => new(
        t.Id, t.Type, t.Points, t.SourceEvent, t.ReferenceId,
        t.BalanceAfter, t.ExpiryDate, t.Notes, t.CreatedAt);
}

/// <summary>
/// Corrige los puntos de un usuario. Positivo suma, negativo resta.
///
/// Nunca borra ni edita movimientos anteriores: agrega uno nuevo. El libro de
/// puntos es inmutable, igual que en contabilidad: un error se corrige con un
/// asiento, no con un borrón.
/// </summary>
public record AdjustUserPointsCommand(
    Guid    UserId,
    int     Points,
    string  Reason,
    Guid?   AdminId) : IRequest<AdjustmentResultDto>;

public class AdjustUserPointsHandler
    : IRequestHandler<AdjustUserPointsCommand, AdjustmentResultDto>
{
    private readonly IPointsProfileRepository  _profiles;
    private readonly IRewardLevelRepository    _levels;
    private readonly IRewardSettingsRepository _settings;
    private readonly IMediator                 _mediator;

    public AdjustUserPointsHandler(
        IPointsProfileRepository profiles,
        IRewardLevelRepository levels,
        IRewardSettingsRepository settings,
        IMediator mediator)
    {
        _profiles = profiles;
        _levels   = levels;
        _settings = settings;
        _mediator = mediator;
    }

    public async Task<AdjustmentResultDto> Handle(
        AdjustUserPointsCommand cmd, CancellationToken ct)
    {
        if (cmd.Points == 0)
            throw new ArgumentException("Indica cuántos puntos sumar o restar.");

        if (Math.Abs(cmd.Points) > 100_000)
            throw new ArgumentException("El ajuste no puede pasar de 100000 puntos.");

        var motivo = (cmd.Reason ?? string.Empty).Trim();
        if (motivo.Length < 5)
            throw new ArgumentException(
                "Escribe el motivo del ajuste. Dentro de seis meses nadie va a " +
                "recordar por qué este usuario recibió estos puntos.");

        var options = RewardsOptions.From(await _settings.GetMapAsync(ct));

        var profile = await _profiles.GetByUserIdAsync(cmd.UserId, ct);
        if (profile is null)
        {
            // Se crea para poder compensar a alguien que nunca viajó, que es
            // justo el caso de un error de configuración del sistema.
            profile = PointsProfile.Create(cmd.UserId, UserTypes.Passenger);
            await _profiles.AddAsync(profile, ct);
        }

        var balanceBefore = profile.AvailablePoints;
        int aplicados;

        if (cmd.Points > 0)
        {
            profile.AdjustUp(cmd.Points);
            aplicados = cmd.Points;
        }
        else
        {
            // Devuelve lo que de verdad se pudo restar: el saldo nunca baja
            // de cero, aunque el admin pida restar más de lo que hay.
            aplicados = profile.AdjustDown(-cmd.Points);

            if (aplicados == 0)
                throw new InvalidOperationException(
                    "El usuario no tiene puntos disponibles para restar.");
        }

        // El nivel se recalcula: un ajuste grande puede cambiarlo.
        var nivelAntes = profile.CurrentLevel;
        var levels = await _levels.GetByUserTypeAsync(profile.UserType, ct);
        var level  = PointsRules.ResolveLevel(levels, profile.PointsForLevel(options.LevelBasis));
        if (level is not null) profile.SetLevel(level.Name);

        // La entidad es inmutable: se arma con su metodo de fabrica, no con un
        // inicializador. El constructor y los setters son privados a proposito,
        // para que nadie pueda fabricar un movimiento con saldos incoherentes.
        var movement = PointsTransaction.Adjust(
            profileId:     profile.Id,
            points:        cmd.Points,
            balanceBefore: balanceBefore,
            expiryDate:    profile.PointsExpiryDate,
            reason:        motivo);

        var ok = await _profiles.ApplyAdjustmentAsync(
            profile, movement, balanceBefore, motivo, cmd.AdminId, ct);

        if (!ok)
            throw new InvalidOperationException(
                "El saldo cambió mientras hacías el ajuste. Vuelve a cargar y repítelo.");

        // Si subió de nivel, aviso de los cupones del nivel (solo pasajero).
        await LevelUpNotice.SendIfChangedAsync(_mediator, profile, nivelAntes, ct);

        var aviso = cmd.Points < 0 && aplicados < -cmd.Points
            ? $"Solo se pudieron restar {aplicados} puntos: era todo lo que tenía disponible."
            : null;

        return new AdjustmentResultDto(
            aplicados, balanceBefore, profile.AvailablePoints,
            profile.CurrentLevel, aviso);
    }
}
