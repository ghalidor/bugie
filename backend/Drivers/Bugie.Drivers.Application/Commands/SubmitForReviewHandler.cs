using MediatR;
using Bugie.Drivers.Application.DTOs;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Application.Commands;

public class SubmitForReviewHandler : IRequestHandler<SubmitForReviewCommand, DriverDto>
{
    private readonly IDriverRepository _drivers;
    private readonly IDriverFaceRepository _faces;
    public SubmitForReviewHandler(IDriverRepository d, IDriverFaceRepository faces)
    {
        _drivers = d;
        _faces = faces;
    }

    public async Task<DriverDto> Handle(SubmitForReviewCommand cmd, CancellationToken ct)
    {
        var d = await _drivers.GetByUserIdAsync(cmd.UserId, ct)
            ?? throw new KeyNotFoundException("Conductor no encontrado.");
        // Rechazado o suspendido: no puede volver solo a revisión; debe pedir
        // una revisión al admin (POST api/drivers/me/review-request).
        if(d.Status is Domain.Enums.DriverStatus.Rejected or Domain.Enums.DriverStatus.Suspended)
            throw new InvalidOperationException(
                "Tu cuenta está rechazada o suspendida. Usa «Solicitar revisión» para que el equipo de Bugie revise tu caso.");
        // La foto de perfil es requisito (junto a los documentos obligatorios).
        // Con la verificación facial encendida, la primera foto queda pendiente
        // de revisión: también vale para enviar la solicitud (el admin la revisa).
        if(string.IsNullOrWhiteSpace(d.ProfilePhotoUrl) && !await _faces.HasPendingAsync(d.Id, ct))
            throw new InvalidOperationException(
                "Sube tu foto de perfil antes de enviar tu solicitud a revisión.");
        d.SubmitForReview();
        await _drivers.UpdateAsync(d, ct);
        return RegisterDriverHandler.ToDto(d);
    }
}
