using MediatR;
using Bugie.Drivers.Application.DTOs;
using Bugie.Drivers.Domain.External;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Application.Commands;

/// <summary>
/// Procesa la solicitud "Desconectarme" del conductor.
///
/// Validación: si el conductor tiene un viaje activo (Accepted, InProgress,
/// SosActive, Negotiating), NO puede desconectarse. Debe terminar el viaje
/// primero. Esto evita que el pasajero quede sin ver dónde está su taxi
/// en medio del trayecto.
///
/// Si el conductor está en viaje, se lanza InvalidOperationException y el
/// controller la traduce a 409 Conflict.
/// </summary>
public class GoOfflineHandler : IRequestHandler<GoOfflineCommand, DriverDto>
{
    private readonly IDriverRepository _drivers;
    private readonly ITripsClient _trips;
    private readonly IDriverPresenceCheckInRepository _checkIns;

    public GoOfflineHandler(
        IDriverRepository d,
        ITripsClient trips,
        IDriverPresenceCheckInRepository checkIns)
        => (_drivers, _trips, _checkIns) = (d, trips, checkIns);

    public async Task<DriverDto> Handle(GoOfflineCommand cmd, CancellationToken ct)
    {
        var d = await _drivers.GetByUserIdAsync(cmd.UserId, ct)
            ?? throw new KeyNotFoundException("Conductor no encontrado.");

        // Validación: ¿tiene viaje activo? Si sí, bloquear desconexión.
        // Usamos el endpoint cross-service que ya existe (acepta lista).
        var withActive = await _trips.GetDriversWithActiveTripAsync(
            new[] { cmd.UserId }, ct);
        if(withActive.Contains(cmd.UserId))
        {
            throw new InvalidOperationException(
                "Termina tu viaje antes de desconectarte.");
        }

        d.GoOffline();
        await _drivers.UpdateAsync(d, ct);

        // Cerramos el check-in activo. Si el conductor se reconecta después,
        // tendrá que tomarse una foto nueva (es el comportamiento que pidió
        // producto: cada sesión online = una verificación facial).
        await _checkIns.CloseAllActiveAsync(cmd.UserId, ct);

        return RegisterDriverHandler.ToDto(d);
    }
}
