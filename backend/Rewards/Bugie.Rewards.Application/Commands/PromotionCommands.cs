using System.Text.Json;
using MediatR;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Application.Queries;
using Bugie.Rewards.Domain.Constants;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Application.Commands;

/// <summary>Admin: crea o edita una promoción. Id null = crear.</summary>
public record UpsertPromotionCommand(Guid? Id, PromotionInput Input)
    : IRequest<PromotionDto>;

public class UpsertPromotionHandler : IRequestHandler<UpsertPromotionCommand, PromotionDto>
{
    private readonly IPromotionRepository _promotions;
    public UpsertPromotionHandler(IPromotionRepository promotions) => _promotions = promotions;

    /// <summary>Tipos que el motor sabe aplicar hoy.</summary>
    private static readonly string[] TiposValidos = { "multiplier", "bonus_points" };

    public async Task<PromotionDto> Handle(UpsertPromotionCommand cmd, CancellationToken ct)
    {
        var input = cmd.Input;
        Validate(input);

        Promotion promo;
        var now = DateTime.UtcNow;

        if (cmd.Id is null)
        {
            promo = new Promotion { Id = Guid.NewGuid(), CreatedAt = now };
        }
        else
        {
            promo = await _promotions.GetByIdAsync(cmd.Id.Value, ct)
                ?? throw new KeyNotFoundException("Promoción no encontrada.");
        }

        promo.Name            = input.Name.Trim();
        promo.Description     = string.IsNullOrWhiteSpace(input.Description) ? null : input.Description.Trim();
        promo.PromotionType   = input.PromotionType;
        promo.TargetUserType  = input.TargetUserType;
        promo.MultiplierValue = input.PromotionType == "multiplier"    ? input.MultiplierValue : null;
        promo.BonusPoints     = input.PromotionType == "bonus_points"  ? input.BonusPoints     : null;
        // Si no mandan fecha de inicio: al crear empieza ahora, al editar se
        // respeta la que ya tenía.
        promo.StartDate       = input.StartDate ?? (promo.StartDate == default ? now : promo.StartDate);
        promo.EndDate         = input.EndDate;
        promo.IsActive        = input.IsActive;
        promo.ConditionsJson  = BuildConditions(input);
        promo.UpdatedAt       = now;

        if (cmd.Id is null) await _promotions.AddAsync(promo, ct);
        else                await _promotions.UpdateAsync(promo, ct);

        return GetPromotionsHandler.ToDto(promo, 0, 0);
    }

    /// <summary>
    /// Arma el JSON de condiciones a partir de los campos sueltos. Solo se
    /// escriben las que el admin realmente usó: así el JSON queda limpio y
    /// el motor no evalúa condiciones vacías.
    /// </summary>
    private static string BuildConditions(PromotionInput i)
    {
        var dict = new Dictionary<string, object>();

        if (i.DaysOfWeek is { Length: > 0 })
            dict["daysOfWeek"] = i.DaysOfWeek.Distinct().OrderBy(d => d).ToArray();

        if (i.StartHour is not null && i.EndHour is not null)
        {
            dict["startHour"] = i.StartHour.Value;
            dict["endHour"]   = i.EndHour.Value;
        }

        if (i.FirstTripOfDay) dict["firstTripOfDay"] = true;

        if (i.PaymentMethods is { Length: > 0 })
            dict["paymentMethods"] = i.PaymentMethods
                .Select(m => m.Trim().ToLowerInvariant())
                .Where(m => m.Length > 0).Distinct().ToArray();

        if (i.MinAmount is > 0) dict["minAmount"] = i.MinAmount.Value;

        return JsonSerializer.Serialize(dict);
    }

    private static void Validate(PromotionInput i)
    {
        if (string.IsNullOrWhiteSpace(i.Name))
            throw new ArgumentException("El nombre es requerido.");

        if (!TiposValidos.Contains(i.PromotionType))
            throw new ArgumentException(
                "Por ahora solo se pueden crear promociones de puntos: multiplicador o puntos extra. " +
                "Las de descuento sobre la tarifa todavía no las aplica el motor.");

        if (!UserTypes.IsValid(i.TargetUserType) && i.TargetUserType != "both")
            throw new ArgumentException("El destinatario debe ser pasajeros, conductores o ambos.");

        if (i.PromotionType == "multiplier")
        {
            if (i.MultiplierValue is null or <= 1)
                throw new ArgumentException("El multiplicador debe ser mayor a 1. Con 2 se gana el doble.");
            if (i.MultiplierValue > 10)
                throw new ArgumentException("El multiplicador no puede pasar de 10.");
        }

        if (i.PromotionType == "bonus_points" && i.BonusPoints is null or <= 0)
            throw new ArgumentException("Indica cuántos puntos extra entrega.");

        if (i.DaysOfWeek is { Length: > 0 } && i.DaysOfWeek.Any(d => d < 1 || d > 7))
            throw new ArgumentException("Los días deben ir de 1 (lunes) a 7 (domingo).");

        var tieneInicio = i.StartHour is not null;
        var tieneFin    = i.EndHour is not null;
        if (tieneInicio != tieneFin)
            throw new ArgumentException("La franja horaria necesita hora de inicio y de fin.");

        if (tieneInicio)
        {
            if (i.StartHour is < 0 or > 23 || i.EndHour is < 0 or > 23)
                throw new ArgumentException("Las horas deben ir de 0 a 23.");
            if (i.StartHour == i.EndHour)
                throw new ArgumentException("La hora de inicio y la de fin no pueden ser la misma.");
        }

        if (i.MinAmount is < 0)
            throw new ArgumentException("El monto mínimo no puede ser negativo.");

        if (i.EndDate is not null && i.StartDate is not null && i.EndDate <= i.StartDate)
            throw new ArgumentException("La fecha de fin debe ser posterior a la de inicio.");
    }
}

/// <summary>Admin: prende o apaga una promoción, sin tocar lo demás.</summary>
public record SetPromotionActiveCommand(Guid Id, bool IsActive) : IRequest<Unit>;

public class SetPromotionActiveHandler : IRequestHandler<SetPromotionActiveCommand, Unit>
{
    private readonly IPromotionRepository _promotions;
    public SetPromotionActiveHandler(IPromotionRepository promotions) => _promotions = promotions;

    public async Task<Unit> Handle(SetPromotionActiveCommand cmd, CancellationToken ct)
    {
        var promo = await _promotions.GetByIdAsync(cmd.Id, ct)
            ?? throw new KeyNotFoundException("Promoción no encontrada.");

        promo.IsActive  = cmd.IsActive;
        promo.UpdatedAt = DateTime.UtcNow;
        await _promotions.UpdateAsync(promo, ct);
        return Unit.Value;
    }
}

/// <summary>Admin: borra una promoción.</summary>
public record DeletePromotionCommand(Guid Id) : IRequest<Unit>;

public class DeletePromotionHandler : IRequestHandler<DeletePromotionCommand, Unit>
{
    private readonly IPromotionRepository _promotions;
    public DeletePromotionHandler(IPromotionRepository promotions) => _promotions = promotions;

    public async Task<Unit> Handle(DeletePromotionCommand cmd, CancellationToken ct)
    {
        var promo = await _promotions.GetByIdAsync(cmd.Id, ct)
            ?? throw new KeyNotFoundException("Promoción no encontrada.");

        // Borrar arrastra su historial de aplicaciones por la clave foránea.
        // Si ya se usó, conviene apagarla en vez de borrarla, para no perder
        // el registro de cuánto costó.
        await _promotions.DeleteAsync(promo.Id, ct);
        return Unit.Value;
    }
}
