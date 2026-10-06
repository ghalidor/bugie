using Bugie.Trips.Domain.External;
using Microsoft.AspNetCore.SignalR;

namespace Bugie.Trips.Api.Realtime;

/// <summary>
/// Implementación de <see cref="ITripRealtimeNotifier"/> sobre el hub <see cref="TripsHub"/>.
/// Singleton (lo usa FcmSender, que es singleton). Si no hay nadie conectado, SendAsync
/// no falla. Cualquier excepción se loguea y no se propaga: el polling de respaldo
/// del cliente cubre lo que se pierda.
/// </summary>
public class SignalRTripRealtimeNotifier : ITripRealtimeNotifier
{
    private readonly IHubContext<TripsHub> _hub;
    private readonly ILogger<SignalRTripRealtimeNotifier> _log;

    public SignalRTripRealtimeNotifier(IHubContext<TripsHub> hub, ILogger<SignalRTripRealtimeNotifier> log)
    {
        _hub = hub;
        _log = log;
    }

    public Task TripChangedAsync(Guid tripId, int status, string reason, Guid passengerId, Guid? driverId,
        IEnumerable<Guid>? alsoNotify = null, CancellationToken ct = default)
    {
        var groups = new List<string> { TripsHub.TripGroup(tripId), TripsHub.UserGroup(passengerId) };
        if(driverId.HasValue) groups.Add(TripsHub.UserGroup(driverId.Value));
        if(alsoNotify is not null)
            groups.AddRange(alsoNotify.Where(u => u != Guid.Empty).Select(TripsHub.UserGroup));

        return SendAsync(groups, "TripChanged", new
        {
            tripId,
            status,
            reason,
            at = DateTime.UtcNow,
        }, ct);
    }

    public Task ProposalsChangedAsync(Guid tripId, Guid passengerId, Guid? driverId, Guid? proposalId,
        string? status, string reason, CancellationToken ct = default)
    {
        var groups = new List<string> { TripsHub.TripGroup(tripId), TripsHub.UserGroup(passengerId) };
        if(driverId.HasValue) groups.Add(TripsHub.UserGroup(driverId.Value));

        return SendAsync(groups, "ProposalsChanged", new
        {
            tripId,
            proposalId,
            driverId,
            status,
            reason,
            at = DateTime.UtcNow,
        }, ct);
    }

    public Task DriverLocationAsync(Guid tripId, double lat, double lng, double? heading, double? speedKmh,
        CancellationToken ct = default) =>
        // Sin log de éxito: llega cada pocos segundos por conductor.
        SendAsync(new[] { TripsHub.TripGroup(tripId) }, "DriverLocation", new
        {
            tripId,
            lat,
            lng,
            heading,
            speedKmh,
            at = DateTime.UtcNow,
        }, ct, quiet: true);

    public Task RequestsChangedAsync(Guid tripId, string reason, CancellationToken ct = default) =>
        SendAsync(new[] { TripsHub.DriverRequestsGroup }, "RequestsChanged", new
        {
            tripId,
            reason,
            at = DateTime.UtcNow,
        }, ct);

    public Task UserNotificationAsync(Guid userId, string? type, string title, string body,
        IReadOnlyDictionary<string, string>? data, CancellationToken ct = default) =>
        SendAsync(new[] { TripsHub.UserGroup(userId) }, "UserNotification", new
        {
            type,
            title,
            body,
            data = data ?? new Dictionary<string, string>(),
            at = DateTime.UtcNow,
        }, ct);

    /// <summary>
    /// Envío a varios grupos. Una conexión que esté en más de uno recibe el evento
    /// repetido: el cliente recarga de forma idempotente. Nunca lanza.
    /// </summary>
    private async Task SendAsync(IReadOnlyList<string> groups, string eventName, object payload,
                                 CancellationToken ct, bool quiet = false)
    {
        try
        {
            var distinct = groups.Distinct().ToList();
            await _hub.Clients.Groups(distinct).SendAsync(eventName, payload, ct);
            if(!quiet)
                _log.LogDebug("TripsHub: '{Event}' -> {Groups}", eventName, string.Join(",", distinct));
        }
        catch(Exception ex)
        {
            _log.LogWarning(ex, "TripsHub: no se pudo emitir '{Event}' (no crítico).", eventName);
        }
    }
}
