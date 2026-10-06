using Bugie.Trips.Domain.Common;
using Bugie.Trips.Domain.Enums;
using Bugie.Trips.Domain.External;
using Bugie.Trips.Domain.Interfaces;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Bugie.Trips.Infrastructure.BackgroundServices;

/// <summary>
/// Configuración del servicio de vencimientos de la negociación.
/// Los plazos los configura el admin (Admin › Configuración, ver NegotiationRules).
/// </summary>
public class ProposalExpirationOptions
{
    /// <summary>Cada cuántos segundos correr la pasada (default 30 s: el plazo del conductor es de minutos).</summary>
    public int CheckIntervalSeconds { get; set; } = 30;
}

/// <summary>
/// Vencimientos de la negociación pasajero-conductor. En cada pasada:
///
/// 1) Confirmación del conductor: la oferta que el pasajero aceptó
///    ('accepted_by_passenger') vence si el conductor no la confirma a tiempo
///    (inmediato: driver_confirm_immediate_min desde la aceptación; programado:
///    driver_confirm_scheduled_before_min antes de la hora). Pasa a rejected
///    ('driver_no_confirm') y se avisa al pasajero y al conductor.
///
/// 2) Viaje inmediato que nadie toma: si sigue Pending/Negotiating sin
///    conductor trip_no_driver_cancel_min después de publicarse (y sin una
///    aceptación esperando confirmación), Bugie lo cancela, cierra sus
///    propuestas y avisa al pasajero y a los conductores que ofertaron.
///
/// Todo con UPDATE condicionado al estado: si un conductor confirma o el
/// pasajero cancela justo en ese momento, gana quien llegue primero.
/// </summary>
public class ProposalExpirationService : BackgroundService
{
    /// <summary>Motivo que queda en el viaje cancelado por falta de conductor.</summary>
    public const string NoDriverReason = "Nadie aceptó tu pedido a tiempo";

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ITripNotificationService _notify;
    // Tiempo real a pasajero y conductores (hub /hubs/trips). Nunca lanza.
    private readonly ITripRealtimeNotifier _realtime;
    private readonly ILogger<ProposalExpirationService> _log;
    private readonly ProposalExpirationOptions _opts;

    public ProposalExpirationService(
        IServiceScopeFactory scopeFactory,
        ITripNotificationService notify,
        ITripRealtimeNotifier realtime,
        ILogger<ProposalExpirationService> log,
        IOptions<ProposalExpirationOptions> opts)
    {
        _scopeFactory = scopeFactory;
        _notify = notify;
        _realtime = realtime;
        _log = log;
        _opts = opts.Value;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = Math.Max(5, _opts.CheckIntervalSeconds);
        _log.LogInformation("ProposalExpirationService iniciado. Intervalo: {Interval}s", interval);

        try { await Task.Delay(TimeSpan.FromSeconds(20), stoppingToken); }
        catch(OperationCanceledException) { return; }

        while(!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunPassAsync(stoppingToken);
            }
            catch(Exception ex)
            {
                _log.LogError(ex, "ProposalExpirationService: error en pasada (ignorado).");
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(interval), stoppingToken);
            }
            catch(OperationCanceledException) { /* shutdown */ }
        }
    }

    private async Task RunPassAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var sp = scope.ServiceProvider;
        var proposals = sp.GetRequiredService<ITripProposalRepository>();
        var trips = sp.GetRequiredService<ITripRepository>();
        var settings = await NegotiationRules.LoadAsync(sp.GetRequiredService<ILandingClient>(), ct);
        var now = DateTime.UtcNow;

        // 1) Ofertas aceptadas por el pasajero que el conductor no confirmó a tiempo.
        var expired = await proposals.ExpireUnconfirmedAsync(
            now, settings.ConfirmImmediateMinutes, settings.ConfirmScheduledBeforeMinutes, ct);
        foreach(var p in expired)
        {
            _ = _notify.NotifyPassengerDriverNoConfirmAsync(p.PassengerId, p.TripId, p.ServiceType);
            _ = _notify.NotifyDriverConfirmExpiredAsync(p.DriverId, p.TripId, p.ServiceType);
            _ = _realtime.ProposalsChangedAsync(p.TripId, p.PassengerId, p.DriverId, p.ProposalId, "rejected", "driver_no_confirm");
        }
        if(expired.Count > 0)
            _log.LogInformation("ProposalExpiration: {Count} confirmación(es) vencidas (driver_no_confirm).", expired.Count);

        // 2) Viajes inmediatos que nadie tomó.
        var cancelled = await trips.CancelUnassignedImmediateAsync(
            now, settings.NoDriverCancelMinutes, NoDriverReason, ct);
        foreach(var trip in cancelled)
        {
            var drivers = await proposals.CancelOpenByTripAsync(trip.Id, "trip_cancelled", ct);
            foreach(var driverUserId in drivers)
                _ = _notify.NotifyTripCancelledAsync(driverUserId, trip.Id, "system", NoDriverReason, trip.ServiceType);
            _ = _notify.NotifyPassengerNoDriverFoundAsync(trip.PassengerId, trip.Id, trip.ServiceType);
            // Tiempo real: pasajero y conductores que ofertaron; la solicitud sale de la lista.
            _ = _realtime.TripChangedAsync(trip.Id, (int)TripStatus.Cancelled, RealtimeReasons.Cancelled,
                trip.PassengerId, null, drivers);
            _ = _realtime.RequestsChangedAsync(trip.Id, RealtimeReasons.Expired);
            _log.LogInformation("Viaje {TripId} cancelado: nadie lo aceptó en {Min} min.", trip.Id, settings.NoDriverCancelMinutes);
        }
    }
}
