using MediatR;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Application.Queries;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Application.Commands;

public class UpdateLevelHandler : IRequestHandler<UpdateLevelCommand, RewardLevelDto>
{
    private readonly IRewardLevelRepository _levels;
    public UpdateLevelHandler(IRewardLevelRepository levels) => _levels = levels;

    public async Task<RewardLevelDto> Handle(UpdateLevelCommand cmd, CancellationToken ct)
    {
        var level = await _levels.GetByIdAsync(cmd.Id, ct)
            ?? throw new KeyNotFoundException("Nivel no encontrado.");

        if (cmd.MinPoints < 0)
            throw new ArgumentException("MinPoints no puede ser negativo.");
        if (cmd.MaxPoints.HasValue && cmd.MaxPoints.Value < cmd.MinPoints)
            throw new ArgumentException("MaxPoints no puede ser menor que MinPoints.");
        if (cmd.DiscountPercentage < 0 || cmd.DiscountPercentage > 100)
            throw new ArgumentException("El descuento debe estar entre 0 y 100.");
        if (cmd.MonthlyFreeTrips < 0 || cmd.WeeklyRaffleTickets < 0 || cmd.MonthlyRaffleTickets < 0)
            throw new ArgumentException("Los beneficios no pueden ser negativos.");

        // Validar que no se solape con otro nivel del mismo tipo de usuario.
        var siblings = await _levels.GetByUserTypeAsync(level.UserType, ct);
        foreach (var other in siblings.Where(l => l.Id != level.Id && l.IsActive))
        {
            var otherMax = other.MaxPoints ?? int.MaxValue;
            var thisMax  = cmd.MaxPoints   ?? int.MaxValue;
            if (cmd.MinPoints <= otherMax && other.MinPoints <= thisMax)
                throw new ArgumentException(
                    $"El rango se solapa con el nivel '{other.DisplayName}' ({other.MinPoints} - {(other.MaxPoints?.ToString() ?? "sin techo")}).");
        }

        level.DisplayName          = string.IsNullOrWhiteSpace(cmd.DisplayName) ? level.DisplayName : cmd.DisplayName.Trim();
        level.MinPoints            = cmd.MinPoints;
        level.MaxPoints            = cmd.MaxPoints;
        level.DiscountPercentage   = cmd.DiscountPercentage;
        level.MonthlyFreeTrips     = cmd.MonthlyFreeTrips;
        level.WeeklyRaffleTickets  = cmd.WeeklyRaffleTickets;
        level.MonthlyRaffleTickets = cmd.MonthlyRaffleTickets;
        level.IsActive             = cmd.IsActive;
        level.UpdatedAt            = DateTime.UtcNow;

        await _levels.UpdateAsync(level, ct);
        return GetLevelsHandler.ToDto(level);
    }
}
