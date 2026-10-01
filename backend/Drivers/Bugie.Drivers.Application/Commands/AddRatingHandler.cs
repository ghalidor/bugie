using MediatR;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Application.Commands;

/// <summary>
/// Aplica una calificación al conductor: actualiza Driver.Rating (promedio
/// incremental) y Driver.TotalRatings. La lógica vive en Driver.AddRating()
/// (Domain), aquí solo coordinamos persistencia.
/// </summary>
public record AddRatingCommand(Guid DriverUserId, byte Stars) : IRequest<Unit>;

public class AddRatingHandler : IRequestHandler<AddRatingCommand, Unit>
{
    private readonly IDriverRepository _drivers;

    public AddRatingHandler(IDriverRepository drivers) => _drivers = drivers;

    public async Task<Unit> Handle(AddRatingCommand cmd, CancellationToken ct)
    {
        var d = await _drivers.GetByUserIdAsync(cmd.DriverUserId, ct)
            ?? throw new KeyNotFoundException("Conductor no encontrado.");

        d.AddRating(cmd.Stars);
        await _drivers.UpdateAsync(d, ct);
        return Unit.Value;
    }
}
