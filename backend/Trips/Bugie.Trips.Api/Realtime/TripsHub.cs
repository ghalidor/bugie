using System.Security.Claims;
using Bugie.Trips.Api.Security;
using Bugie.Trips.Domain.External;
using Bugie.Trips.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace Bugie.Trips.Api.Realtime;

/// <summary>
/// Hub SignalR para PASAJEROS y CONDUCTORES (el admin también puede entrar, para pruebas).
/// Endpoint: /hubs/trips. El JWT va como query string ?access_token=... (ver Program.cs).
///
/// Grupos (siempre por CONEXIÓN: un mismo usuario puede tener app + web + navegador
/// del celular conectados a la vez; si una conexión se cae, las otras siguen):
///   - user:{userId}      — automático al conectar. Recibe TripChanged, ProposalsChanged
///                          y UserNotification dirigidos al usuario.
///   - trip:{tripId}      — JoinTrip/LeaveTrip. Recibe TripChanged, ProposalsChanged y
///                          DriverLocation de ese viaje.
///   - drivers:requests   — JoinDriverRequests/LeaveDriverRequests (solo conductores
///                          aprobados). Recibe RequestsChanged.
///
/// Eventos que emite el servidor (ver <see cref="ITripRealtimeNotifier"/>):
///   "TripChanged"       { tripId, status, reason, at }
///   "ProposalsChanged"  { tripId, proposalId?, driverId?, status?, reason, at }
///   "DriverLocation"    { tripId, lat, lng, heading?, speedKmh?, at }
///   "RequestsChanged"   { tripId, reason, at }
///   "UserNotification"  { type?, title, body, data, at }
///
/// Un evento puede llegar dos veces a la misma conexión si está en el grupo del viaje
/// y en su grupo de usuario: el cliente debe tratar la recarga como idempotente.
/// </summary>
[Authorize(Roles = "passenger,driver,admin")]
public class TripsHub : Hub
{
    public const string DriverRequestsGroup = "drivers:requests";
    public static string TripGroup(Guid tripId) => $"trip:{tripId}";
    public static string UserGroup(Guid userId) => $"user:{userId}";

    private const string NoAccessMessage = "No tienes acceso a este viaje.";

    /// <summary>Estados de propuesta que siguen "abiertos" para el conductor que ofertó.</summary>
    private static readonly string[] OpenProposalStatuses =
        { "pending", "driver_accepted", "accepted_by_passenger", "accepted" };

    private readonly ITripRepository _trips;
    private readonly ITripProposalRepository _proposals;
    private readonly IDriversClient _drivers;
    private readonly ILogger<TripsHub> _log;

    public TripsHub(ITripRepository trips, ITripProposalRepository proposals,
                    IDriversClient drivers, ILogger<TripsHub> log)
    {
        _trips = trips;
        _proposals = proposals;
        _drivers = drivers;
        _log = log;
    }

    private Guid? CurrentUserId =>
        Guid.TryParse(Context.User?.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;

    private bool IsAdmin => Context.User?.IsInRole("admin") == true;

    /// <summary>Al conectar, la conexión entra a user:{userId}.</summary>
    public override async Task OnConnectedAsync()
    {
        var userId = CurrentUserId;
        if(userId is null)
        {
            // No debería pasar con [Authorize], pero no dejamos una conexión sin dueño.
            Context.Abort();
            return;
        }
        await Groups.AddToGroupAsync(Context.ConnectionId, UserGroup(userId.Value));
        _log.LogDebug("TripsHub: conectado {UserId} ({ConnId})", userId, Context.ConnectionId);
        await base.OnConnectedAsync();
    }

    /// <summary>
    /// Al desconectar no hay que quitar grupos a mano: SignalR descarta la conexión
    /// y sus membresías. Las otras conexiones del mismo usuario no se ven afectadas.
    /// </summary>
    public override Task OnDisconnectedAsync(Exception? exception)
    {
        _log.LogDebug("TripsHub: desconectado {UserId} ({ConnId})", CurrentUserId, Context.ConnectionId);
        return base.OnDisconnectedAsync(exception);
    }

    /// <summary>
    /// Entra al grupo del viaje. Solo el pasajero, el conductor asignado, un conductor
    /// con una propuesta abierta en ese viaje, o un admin. Si no, HubException
    /// "No tienes acceso a este viaje." (también si el viaje no existe).
    /// </summary>
    public async Task JoinTrip(string tripId)
    {
        var id = ParseTripId(tripId);
        if(!await CanAccessTripAsync(id))
            throw new HubException(NoAccessMessage);
        await Groups.AddToGroupAsync(Context.ConnectionId, TripGroup(id));
    }

    /// <summary>Sale del grupo del viaje (solo esta conexión).</summary>
    public Task LeaveTrip(string tripId) =>
        Groups.RemoveFromGroupAsync(Context.ConnectionId, TripGroup(ParseTripId(tripId)));

    /// <summary>
    /// Conductor aprobado: entra a drivers:requests para recibir RequestsChanged.
    /// HubException con el mismo texto que los endpoints (no es conductor, suspendido,
    /// rechazado, pendiente o Drivers no responde).
    /// </summary>
    public async Task JoinDriverRequests()
    {
        var userId = CurrentUserId ?? throw new HubException(DriverAccess.NotDriverMessage);
        var denied = await DriverAccess.ApprovedDriverMessageAsync(
            Context.User!, _drivers, userId, Context.ConnectionAborted);
        if(denied is not null) throw new HubException(denied);
        await Groups.AddToGroupAsync(Context.ConnectionId, DriverRequestsGroup);
    }

    /// <summary>Sale de drivers:requests (solo esta conexión).</summary>
    public Task LeaveDriverRequests() =>
        Groups.RemoveFromGroupAsync(Context.ConnectionId, DriverRequestsGroup);

    private static Guid ParseTripId(string tripId)
    {
        if(!Guid.TryParse(tripId, out var id) || id == Guid.Empty)
            throw new HubException("Viaje inválido.");
        return id;
    }

    private async Task<bool> CanAccessTripAsync(Guid tripId)
    {
        var userId = CurrentUserId;
        if(userId is null) return false;
        if(IsAdmin) return true;

        var trip = await _trips.GetByIdAsync(tripId, Context.ConnectionAborted);
        if(trip is null) return false;
        if(trip.PassengerId == userId || trip.DriverId == userId) return true;

        // Conductor que ofertó: mientras tenga una propuesta abierta sigue la negociación.
        if(Context.User?.IsInRole("driver") == true)
        {
            var history = await _proposals.GetHistoryByDriverAsync(tripId, userId.Value, Context.ConnectionAborted);
            return history.Any(p => OpenProposalStatuses.Contains(p.Status));
        }
        return false;
    }
}
