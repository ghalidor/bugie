using Bugie.Trips.Domain.Enums;
using Bugie.Trips.Domain.External;
using Bugie.Trips.Domain.Interfaces;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Bugie.Trips.Infrastructure.BackgroundServices;

/// <summary>
/// Recordatorios de viajes y envios programados.
///
/// Cada minuto busca programados ACEPTADOS (con conductor) y manda push al
/// conductor y al pasajero:
///   * 30 min antes (si faltan entre 10 y 30 min),
///   * 10 min antes (si faltan 10 min o menos, hasta 5 min despues de la hora).
/// Las marcas Reminder30SentAt / Reminder10SentAt evitan duplicados aunque el
/// servicio se reinicie. Si el de 30 no alcanzo a salir (ej. se acepto con 15
/// min de anticipacion), sale el de 10 cuando toque.
///
/// Programados SIN conductor (pendientes / negociando):
///   * ~30 min antes avisa al pasajero que aun no hay conductor (usa la marca
///     Reminder30SentAt; si luego lo aceptan, igual sale el aviso de 10 min).
///   * Al llegar la hora, si sigue sin conductor, lo cancela (cancelledBy =
///     'system'), cierra sus propuestas y avisa al pasajero.
/// </summary>
public class ScheduledTripReminderService : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(60);

    /// <summary>Motivo que ve el pasajero cuando su programado vence sin conductor.</summary>
    public const string ExpiredReason = "Nadie acept\u00f3 tu solicitud programada a tiempo";

    /// <summary>No avisar "aun sin conductor" a programados recien creados (minutos).</summary>
    private const int NoDriverWarnMinAgeMinutes = 10;

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ITripNotificationService _notify;
    // Tiempo real a pasajero y conductor (hub /hubs/trips). Nunca lanza.
    private readonly ITripRealtimeNotifier _realtime;
    private readonly ILogger<ScheduledTripReminderService> _log;

    public ScheduledTripReminderService(
        IServiceScopeFactory scopeFactory,
        ITripNotificationService notify,
        ITripRealtimeNotifier realtime,
        ILogger<ScheduledTripReminderService> log)
    {
        _scopeFactory = scopeFactory;
        _notify = notify;
        _realtime = realtime;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _log.LogInformation("ScheduledTripReminderService iniciado (cada {Seconds}s).", Interval.TotalSeconds);

        try { await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken); }
        catch(OperationCanceledException) { return; }

        while(!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunPassAsync(stoppingToken);
            }
            catch(Exception ex)
            {
                _log.LogError(ex, "ScheduledTripReminderService: error en pasada (ignorado).");
            }

            try { await Task.Delay(Interval, stoppingToken); }
            catch(OperationCanceledException) { /* apagado */ }
        }
    }

    private async Task RunPassAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var trips = scope.ServiceProvider.GetRequiredService<ITripRepository>();

        var now = DateTime.UtcNow;
        var list = await trips.GetScheduledForRemindersAsync(now, ct);

        foreach(var trip in list)
        {
            if(trip.ScheduledAt is null || trip.DriverId is null) continue;

            var left = (trip.ScheduledAt.Value - now).TotalMinutes;
            int? reminder = null;
            if(left <= 10 && trip.Reminder10SentAt is null)
                reminder = 10;
            else if(left > 10 && left <= 30 && trip.Reminder30SentAt is null)
                reminder = 30;
            if(reminder is null) continue;

            // Primero la marca (evita duplicar si el push tarda o falla).
            await trips.MarkReminderSentAsync(trip.Id, reminder.Value, ct);

            var minutesLeft = Math.Max(0, (int)Math.Ceiling(left));
            _ = _notify.NotifyScheduledReminderAsync(
                trip.DriverId.Value, trip.Id, true, minutesLeft, trip.ScheduledAt.Value, trip.ServiceType);
            _ = _notify.NotifyScheduledReminderAsync(
                trip.PassengerId, trip.Id, false, minutesLeft, trip.ScheduledAt.Value, trip.ServiceType);
            _ = _realtime.TripChangedAsync(trip, RealtimeReasons.ScheduledReminder);

            _log.LogInformation("Recordatorio de {Min} min enviado para el programado {TripId}.", reminder, trip.Id);
        }

        await HandleUnassignedAsync(scope.ServiceProvider, trips, now, ct);
    }

    /// <summary>Programados sin conductor: aviso de 30 min y cancelacion al vencer.</summary>
    private async Task HandleUnassignedAsync(
        IServiceProvider sp, ITripRepository trips, DateTime now, CancellationToken ct)
    {
        var proposals = sp.GetRequiredService<ITripProposalRepository>();
        var list = await trips.GetUnassignedScheduledDueAsync(now, 30, ct);

        foreach(var trip in list)
        {
            if(trip.ScheduledAt is null) continue;
            var left = (trip.ScheduledAt.Value - now).TotalMinutes;

            // Llego la hora y nadie lo acepto: se cancela.
            if(left <= 0)
            {
                var cancelled = await trips.CancelExpiredScheduledAsync(trip.Id, ExpiredReason, ct);
                if(!cancelled) continue; // un conductor lo tomo justo ahora

                var proposalDrivers = await proposals.CancelOpenByTripAsync(trip.Id, "trip_cancelled", ct);
                foreach(var driverUserId in proposalDrivers)
                    _ = _notify.NotifyTripCancelledAsync(driverUserId, trip.Id, "system", ExpiredReason, trip.ServiceType);
                _ = _notify.NotifyScheduledExpiredAsync(trip.PassengerId, trip.Id, ExpiredReason, trip.ServiceType);
                // Tiempo real: pasajero y conductores que ofertaron; la solicitud sale de la lista.
                _ = _realtime.TripChangedAsync(trip.Id, (int)TripStatus.Cancelled, RealtimeReasons.Cancelled,
                    trip.PassengerId, null, proposalDrivers);
                _ = _realtime.RequestsChangedAsync(trip.Id, RealtimeReasons.Expired);

                _log.LogInformation("Programado {TripId} cancelado: vencio sin conductor.", trip.Id);
                continue;
            }

            // Faltan 30 min o menos y sigue sin conductor: avisar una sola vez.
            if(trip.Reminder30SentAt is null &&
               (now - trip.CreatedAt).TotalMinutes >= NoDriverWarnMinAgeMinutes)
            {
                await trips.MarkReminderSentAsync(trip.Id, 30, ct);
                var minutesLeft = Math.Max(1, (int)Math.Ceiling(left));
                _ = _notify.NotifyScheduledNoDriverYetAsync(
                    trip.PassengerId, trip.Id, minutesLeft, trip.ScheduledAt.Value, trip.ServiceType);
                _ = _realtime.TripChangedAsync(trip, RealtimeReasons.ScheduledNoDriver);
                _log.LogInformation("Aviso 'aun sin conductor' enviado para el programado {TripId}.", trip.Id);
            }
        }
    }
}
