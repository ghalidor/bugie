using MediatR;
using Bugie.Trips.Domain.Entities;
using Bugie.Trips.Domain.Enums;
using Bugie.Trips.Domain.External;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Application.Commands;

public class ActivateSosHandler : IRequestHandler<ActivateSosCommand, Guid>
{
    private readonly ITripRepository _trips;
    private readonly ISosRepository _sos;
    /// <summary>
    /// Notifica al panel admin en tiempo real (SignalR). Si falla, no rompe
    /// la creación del SOS — el admin lo verá en el próximo poll.
    /// </summary>
    private readonly IAdminNotifier _notifier;
    /// <summary>
    /// Auth: contacto de emergencia del usuario y envio del correo de alerta.
    /// </summary>
    private readonly IAuthClient _auth;
    /// <summary>
    /// Tiempo real a pasajero y conductor del viaje (hub /hubs/trips). Nunca lanza.
    /// </summary>
    private readonly ITripRealtimeNotifier _realtime;

    public ActivateSosHandler(ITripRepository trips, ISosRepository sos, IAdminNotifier notifier, IAuthClient auth,
                              ITripRealtimeNotifier realtime)
        => (_trips, _sos, _notifier, _auth, _realtime) = (trips, sos, notifier, auth, realtime);

    public async Task<Guid> Handle(ActivateSosCommand cmd, CancellationToken ct)
    {
        var trip = await _trips.GetByIdAsync(cmd.TripId, ct)
            ?? throw new KeyNotFoundException("Viaje no encontrado.");

        // Solo el pasajero o el conductor de ESTE viaje (403 en el controller).
        if(trip.PassengerId != cmd.UserId && trip.DriverId != cmd.UserId)
            throw new UnauthorizedAccessException(
                "Solo el pasajero o el conductor de este viaje pueden activar el SOS.");

        // Solo con el viaje activo: aceptado, en curso o con SOS ya activo (409).
        if(trip.Status is not (TripStatus.Accepted or TripStatus.InProgress or TripStatus.SosActive))
            throw new InvalidOperationException(
                "Solo puedes activar el SOS durante un viaje activo (aceptado o en curso).");

        trip.ActivateSos();
        await _trips.UpdateAsync(trip, ct);

        var alert = SosAlert.Create(cmd.TripId, cmd.UserId, cmd.UserRole, cmd.Lat, cmd.Lng);
        await _sos.AddAsync(alert, ct);

        // Notificar al admin (no bloqueante en términos de error: si el hub
        // falla, igual devolvemos el alert.Id porque ya está persistido).
        // Tambien queda en el historial de avisos (campana del admin): el
        // notifier lo guarda con try/catch, un fallo no rompe el SOS.
        var userName = await GetUserNameAsync(cmd.UserId, ct);
        await _notifier.NotifySosAsync(cmd.TripId, cmd.UserId, cmd.UserRole, cmd.Lat, cmd.Lng,
            alert.Id, userName, trip.OriginAddress, trip.DestAddress, ct);

        // Pasajero y conductor del viaje: el viaje paso a SosActive (reason sos).
        _ = _realtime.TripChangedAsync(trip, RealtimeReasons.Sos);

        // Avisar por correo al contacto de emergencia (si tiene correo).
        await NotifyEmergencyContactAsync(cmd, userName, ct);

        return alert.Id;
    }

    /// <summary>
    /// Correo al contacto de emergencia del usuario que activo el SOS.
    /// Nunca rompe el SOS: si algo falla, solo se registra en consola.
    /// Las consultas a Auth se esperan (son rapidas y usan el JWT de la
    /// peticion); el envio del correo (SMTP, puede tardar) va en segundo plano.
    /// Nota: los textos usan escapes \u00xx porque este archivo no esta en UTF-8.
    /// </summary>
    private async Task NotifyEmergencyContactAsync(ActivateSosCommand cmd, string? userName, CancellationToken ct)
    {
        try
        {
            var contact = await _auth.GetEmergencyContactAsync(cmd.UserId, ct);
            if(contact is null || string.IsNullOrWhiteSpace(contact.Email)) return;

            var name = string.IsNullOrWhiteSpace(userName) ? "Tu contacto" : userName;
            var role = cmd.UserRole == "driver" ? "conductor" : "pasajero";

            var inv = System.Globalization.CultureInfo.InvariantCulture;
            var lat = cmd.Lat.ToString("0.######", inv);
            var lng = cmd.Lng.ToString("0.######", inv);
            var mapsUrl = $"https://www.google.com/maps?q={lat},{lng}";

            var subject = $"Alerta SOS: {name} activ\u00f3 el bot\u00f3n de emergencia";
            var title = $"Alerta SOS de {name}";
            var message =
                $"{name} activ\u00f3 el bot\u00f3n SOS de Bugie durante un viaje como {role}. " +
                $"Te registr\u00f3 como su contacto de emergencia ({contact.Relationship}).\n\n" +
                "El equipo de monitoreo de Bugie ya fue alertado y est\u00e1 atendiendo la emergencia.\n\n" +
                $"\u00daltima ubicaci\u00f3n registrada: {lat}, {lng}. Puedes verla en el mapa con el bot\u00f3n de abajo.\n\n" +
                "Si crees que corre peligro, llama tambi\u00e9n a la Polic\u00eda Nacional (105).";

            _ = _auth.SendEmailToAddressAsync(
                contact.Email!, contact.FullName, subject, title, message,
                mapsUrl, "Ver ubicaci\u00f3n en Google Maps", CancellationToken.None);
        }
        catch(Exception ex)
        {
            Console.WriteLine($"[SOS] No se pudo avisar al contacto de emergencia de {cmd.UserId}: {ex.Message}");
        }
    }

    /// <summary>
    /// Nombre de quien activo el SOS (Auth). Null si Auth no responde:
    /// nunca rompe el SOS.
    /// </summary>
    private async Task<string?> GetUserNameAsync(Guid userId, CancellationToken ct)
    {
        try
        {
            var users = await _auth.GetUsersByIdsAsync(new[] { userId }, ct);
            return users.TryGetValue(userId, out var u) && !string.IsNullOrWhiteSpace(u.FullName)
                ? u.FullName : null;
        }
        catch(Exception ex)
        {
            Console.WriteLine($"[SOS] No se pudo obtener el nombre de {userId}: {ex.Message}");
            return null;
        }
    }
}