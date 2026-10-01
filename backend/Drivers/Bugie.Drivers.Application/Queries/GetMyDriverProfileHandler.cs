using MediatR;
using Bugie.Drivers.Application.Commands;
using Bugie.Drivers.Application.DTOs;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Application.Queries;

public class GetMyDriverProfileHandler : IRequestHandler<GetMyDriverProfileQuery, DriverDto?>
{
    private readonly IDriverRepository _drivers;
    public GetMyDriverProfileHandler(IDriverRepository d) => _drivers = d;

    public async Task<DriverDto?> Handle(GetMyDriverProfileQuery q, CancellationToken ct)
    {
        var d = await _drivers.GetByUserIdAsync(q.UserId, ct);
        return d is null ? null : RegisterDriverHandler.ToDto(d);
    }
}
