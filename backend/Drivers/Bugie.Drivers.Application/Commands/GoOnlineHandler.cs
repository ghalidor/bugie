using MediatR;
using Microsoft.Extensions.Logging;
using Bugie.Drivers.Application.DTOs;
using Bugie.Drivers.Domain.Entities;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Application.Commands;

public class GoOnlineHandler : IRequestHandler<GoOnlineCommand, DriverDto>
{
    private readonly IDriverRepository _drivers;
    private readonly ILocationHistoryRepository _history;
    private readonly IDriverPresenceCheckInRepository _checkIns;
    private readonly ILogger<GoOnlineHandler> _log;

    public GoOnlineHandler(
        IDriverRepository d,
        ILocationHistoryRepository h,
        IDriverPresenceCheckInRepository checkIns,
        ILogger<GoOnlineHandler> log)
        => (_drivers, _history, _checkIns, _log) = (d, h, checkIns, log);

    public async Task<DriverDto> Handle(GoOnlineCommand cmd, CancellationToken ct)
    {
        var d = await _drivers.GetByUserIdAsync(cmd.UserId, ct)
            ?? throw new KeyNotFoundException("Conductor no encontrado.");

        // Validación de presence check-in: para conectarse online, el conductor
        // debe haber pasado la verificación facial primero. Si no tiene un
        // check-in activo, bloqueamos. Esto previene que conductores logueados
        // en sesiones viejas (token vivo desde antes) salten la verificación.
        var activeCheckIn = await _checkIns.GetActiveAsync(cmd.UserId, ct);
        if(activeCheckIn is null)
        {
            _log.LogWarning(
                "GoOnline BLOQUEADO sin check-in: UserId={UserId}", cmd.UserId);
            throw new InvalidOperationException(
                "Debes tomar tu foto de verificación antes de conectarte.");
        }

        // LOG de diagnóstico: ver el estado ANTES de intentar conectar.
        _log.LogInformation(
            "GoOnline INTENTO: UserId={UserId}, Status={Status}, IsOnline(antes)={IsOnline}, lat={Lat}, lng={Lng}, checkInId={CheckInId}",
            cmd.UserId, d.Status, d.IsOnline, cmd.Lat, cmd.Lng, activeCheckIn.Id);

        // Esto valida Status == Approved (lanza InvalidOperationException si no).
        d.GoOnline(cmd.Lat, cmd.Lng);

        await _drivers.UpdateAsync(d, ct);
        await _history.AddAsync(LocationHistory.Create(d.Id, cmd.Lat, cmd.Lng), ct);

        // LOG de diagnóstico: confirmar que quedó online tras el UPDATE.
        _log.LogInformation(
            "GoOnline OK: UserId={UserId}, IsOnline(despues)={IsOnline}",
            cmd.UserId, d.IsOnline);

        return RegisterDriverHandler.ToDto(d);
    }
}
