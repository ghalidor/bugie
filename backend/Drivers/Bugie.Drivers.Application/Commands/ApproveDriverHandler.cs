using MediatR;
using Bugie.Drivers.Application.DTOs;
using Bugie.Drivers.Application.Email;
using Bugie.Drivers.Domain.External;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Application.Commands;

public class ApproveDriverHandler : IRequestHandler<ApproveDriverCommand, DriverDto>
{
    private readonly IDriverRepository _drivers;
    private readonly IAuthClient _authClient;
    private readonly IEmailService _email;
    private readonly ILandingSettingsClient _settings;

    public ApproveDriverHandler(
        IDriverRepository drivers,
        IAuthClient authClient,
        IEmailService email,
        ILandingSettingsClient settings)
    {
        _drivers = drivers;
        _authClient = authClient;
        _email = email;
        _settings = settings;
    }

    public async Task<DriverDto> Handle(ApproveDriverCommand cmd, CancellationToken ct)
    {
        var d = await _drivers.GetByIdAsync(cmd.DriverId, ct)
            ?? throw new KeyNotFoundException("Conductor no encontrado.");

        d.Approve();
        await _drivers.UpdateAsync(d, ct);

        // Obtener email del conductor desde Auth + ciudad desde Landing.
        // Si falla por algún motivo, el flujo NO se rompe — solo no llega el correo.
        try
        {
            var users = await _authClient.GetUsersByIdsAsync(new[] { d.UserId }, ct);
            if(users.TryGetValue(d.UserId, out var user))
            {
                var city = await _settings.GetDefaultCityAsync(ct);

                await _email.SendAsync(
                    toEmail: user.Email,
                    toName: user.FullName,
                    subject: "Tu cuenta de conductor de Bugie está activa",
                    htmlBody: DriverEmailTemplates.DriverApproved(user.FullName, city),
                    ct);
            }
        }
        catch
        {
            // Silencioso: no rompemos la aprobación si falla el correo
        }

        return RegisterDriverHandler.ToDto(d);
    }
}