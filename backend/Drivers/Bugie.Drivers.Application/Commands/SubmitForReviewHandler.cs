using MediatR;
using Bugie.Drivers.Application.DTOs;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Application.Commands;

public class SubmitForReviewHandler : IRequestHandler<SubmitForReviewCommand, DriverDto>
{
    private readonly IDriverRepository _drivers;
    public SubmitForReviewHandler(IDriverRepository d) => _drivers = d;

    public async Task<DriverDto> Handle(SubmitForReviewCommand cmd, CancellationToken ct)
    {
        var d = await _drivers.GetByUserIdAsync(cmd.UserId, ct)
            ?? throw new KeyNotFoundException("Conductor no encontrado.");
        d.SubmitForReview();
        await _drivers.UpdateAsync(d, ct);
        return RegisterDriverHandler.ToDto(d);
    }
}
