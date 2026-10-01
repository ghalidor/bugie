using MediatR;
using Bugie.Drivers.Application.DTOs;
using Bugie.Drivers.Domain.Entities;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Application.Commands;

public class RegisterDriverHandler : IRequestHandler<RegisterDriverCommand, DriverDto>
{
    private readonly IDriverRepository _drivers;
    public RegisterDriverHandler(IDriverRepository drivers) => _drivers = drivers;

    public async Task<DriverDto> Handle(RegisterDriverCommand cmd, CancellationToken ct)
    {
        var existing = await _drivers.GetByUserIdAsync(cmd.UserId, ct);
        if(existing is not null)
            throw new InvalidOperationException("El usuario ya tiene un perfil de conductor.");

        var driver = Driver.Create(cmd.UserId);
        await _drivers.AddAsync(driver, ct);
        return ToDto(driver);
    }

    // Mapeo entidad -> DTO. FullName y HasActiveTrip se setean a valores por
    // defecto aqui; las queries que necesiten esos campos hacen JOIN o cliente
    // HTTP y los completan al construir la respuesta final.
    public static DriverDto ToDto(Driver d) => new(
        d.Id, d.UserId,
        string.Empty,       // FullName: se carga en queries que hacen JOIN con Auth
        d.Status, d.IsOnline,
        d.CurrentLat, d.CurrentLng,
        d.Rating, d.TotalRatings,
        false,              // HasActiveTrip: se calcula en queries de monitoreo
        d.CreatedAt, d.ApprovedAt,
        d.ProfilePhotoUrl);
}
