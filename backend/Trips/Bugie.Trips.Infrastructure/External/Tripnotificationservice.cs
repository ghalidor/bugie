using Bugie.Trips.Domain.Enums;
using Bugie.Trips.Domain.External;

namespace Bugie.Trips.Infrastructure.External;

/// <summary>
/// Implementación de ITripNotificationService. Construye los mensajes FCM
/// según el evento y los manda al destinatario indicado.
///
/// Cada método:
///   1) Construye el FcmPushMessage con title/body/route/alert_type.
///   2) Llama a IFcmSender.SendToUserAsync.
///   3) Captura excepciones y las loguea (no propaga).
///
/// alert_type permite al Flutter clasificar el banner (color/icono):
///   trip / proposal / accepted / sos / arrived / delivery.
/// Además cada push lleva:
///   service = ride | delivery  → icono de viaje o de envío.
///   from    = passenger | driver | bugie → de quién viene el aviso.
/// </summary>
public class TripNotificationService : ITripNotificationService
{
    private readonly IFcmSender _fcm;
    private readonly IAuthClient _auth;

    public TripNotificationService(IFcmSender fcm, IAuthClient auth)
    {
        _fcm = fcm;
        _auth = auth;
    }

    private static bool IsDelivery(ServiceType s) => s == ServiceType.Delivery;
    // "viaje" o "envío" según el servicio, para armar los textos.
    private static string Noun(ServiceType s) => IsDelivery(s) ? "envío" : "viaje";

    private static Dictionary<string, string> Data(
        string alertType, Guid tripId, ServiceType service, string from, string? type = null)
    {
        var d = new Dictionary<string, string>
        {
            ["alert_type"] = alertType,
            ["trip_id"]    = tripId.ToString(),
            ["service"]    = IsDelivery(service) ? "delivery" : "ride",
            ["from"]       = from,
        };
        if(type is not null) d["type"] = type;
        return d;
    }

    // ── EVENTO: pasajero aceptó propuesta del conductor ──────────────────
    public Task NotifyDriverPassengerAcceptedAsync(
        Guid driverUserId, Guid tripId, decimal fare, ServiceType service = ServiceType.Ride,
        DateTime? confirmBeforeUtc = null)
    {
        var data = Data("accepted", tripId, service, "passenger", "proposal_accepted");
        var until = "";
        if(confirmBeforeUtc.HasValue)
        {
            until = $" Confirma antes de las {Peru(confirmBeforeUtc.Value, "HH:mm")}.";
            data["expires_at"] = Peru(confirmBeforeUtc.Value, "yyyy-MM-ddTHH:mm:ss");
        }
        return SafeSend(driverUserId, new FcmPushMessage(
            Title: IsDelivery(service) ? "¡El cliente aceptó tu oferta de envío!" : "¡El pasajero aceptó!",
            Body: $"Confirma el {Noun(service)} a S/ {fare:0.00} para empezar.{until}",
            Route: $"/driver/incoming/{tripId}",
            ExtraData: data));
    }

    // ── EVENTO: viaje asignado (el conductor confirmó o aceptó la contraoferta) ──
    // Inmediato: "Conductor en camino". Programado: "Conductor asignado para {fecha hora}".
    public Task NotifyPassengerDriverConfirmedAsync(
        Guid passengerUserId, Guid tripId, ServiceType service = ServiceType.Ride,
        DateTime? scheduledAtUtc = null)
    {
        if(scheduledAtUtc.HasValue)
        {
            var when = Peru(scheduledAtUtc.Value, "dd/MM HH:mm");
            return SafeSend(passengerUserId, new FcmPushMessage(
                Title: "Conductor asignado",
                Body: $"Conductor asignado para tu {Noun(service)} programado del {when}.",
                Route: "/passenger/tracking",
                ExtraData: Data("accepted", tripId, service, "driver", "driver_assigned")));
        }
        return SafeSend(passengerUserId, new FcmPushMessage(
            Title: "Conductor en camino",
            Body: IsDelivery(service)
                ? "Tu conductor confirmó el envío y va a recoger el paquete."
                : "Tu conductor confirmó el viaje y va hacia tu ubicación.",
            Route: "/passenger/tracking",
            ExtraData: Data("accepted", tripId, service, "driver", "driver_assigned")));
    }

    // ── EVENTO: el pasajero eligió a este conductor (confirmó su aceptación) ──
    public Task NotifyDriverChosenAsync(
        Guid driverUserId, Guid tripId, decimal fare, ServiceType service = ServiceType.Ride,
        DateTime? scheduledAtUtc = null)
    {
        var who = IsDelivery(service) ? "El cliente" : "El pasajero";
        string body;
        if(scheduledAtUtc.HasValue)
            body = $"Tienes un {Noun(service)} programado el {Peru(scheduledAtUtc.Value, "dd/MM HH:mm")} (S/ {fare:0.00}).";
        else
            body = IsDelivery(service)
                ? $"{who} te eligió. Ve a recoger el paquete (S/ {fare:0.00})."
                : $"{who} te eligió. Ve al punto de recojo (S/ {fare:0.00}).";
        return SafeSend(driverUserId, new FcmPushMessage(
            Title: "¡Te eligieron!",
            Body: body,
            Route: scheduledAtUtc.HasValue ? "/driver/scheduled" : "/driver/trip-in-progress",
            ExtraData: Data("accepted", tripId, service, "passenger", "driver_chosen")));
    }

    // ── EVENTO: el pasajero eligió otra oferta (la de este conductor estaba aceptada) ──
    public Task NotifyDriverNotChosenAsync(
        Guid driverUserId, Guid tripId, ServiceType service = ServiceType.Ride) =>
        SafeSend(driverUserId, new FcmPushMessage(
            Title: "El pasajero eligió otra oferta",
            Body: IsDelivery(service)
                ? "El cliente eligió a otro conductor para su envío."
                : "El pasajero eligió a otro conductor para su viaje.",
            Route: null,
            ExtraData: Data("proposal", tripId, service, "passenger", "offer_not_chosen")));

    // ── EVENTO: el pasajero deshizo su aceptación ─────────────────────────
    public Task NotifyDriverAcceptanceUndoneAsync(
        Guid driverUserId, Guid tripId, ServiceType service = ServiceType.Ride) =>
        SafeSend(driverUserId, new FcmPushMessage(
            Title: "El pasajero deshizo su aceptación",
            Body: $"El {(IsDelivery(service) ? "cliente" : "pasajero")} ya no espera tu confirmación. " +
                  "Tu oferta sigue vigente por si vuelve a elegirla.",
            Route: null,
            ExtraData: Data("proposal", tripId, service, "passenger", "acceptance_undone")));

    // ── EVENTO: el conductor no confirmó a tiempo (aviso al pasajero) ─────
    public Task NotifyPassengerDriverNoConfirmAsync(
        Guid passengerUserId, Guid tripId, ServiceType service = ServiceType.Ride) =>
        SafeSend(passengerUserId, new FcmPushMessage(
            Title: "El conductor no confirmó",
            Body: "El conductor no confirmó; elige otra oferta.",
            Route: "/passenger/tracking",
            ExtraData: Data("proposal", tripId, service, "bugie", "driver_no_confirm")));

    // ── EVENTO: el conductor no confirmó a tiempo (aviso al conductor) ────
    public Task NotifyDriverConfirmExpiredAsync(
        Guid driverUserId, Guid tripId, ServiceType service = ServiceType.Ride) =>
        SafeSend(driverUserId, new FcmPushMessage(
            Title: "Se venció tu confirmación",
            Body: $"No confirmaste a tiempo el {Noun(service)}. El {(IsDelivery(service) ? "cliente" : "pasajero")} puede elegir otra oferta.",
            Route: null,
            ExtraData: Data("proposal", tripId, service, "bugie", "confirm_expired")));

    // ── EVENTO: el conductor elegido tomó otro viaje (driver_busy) ────────
    public Task NotifyPassengerChosenDriverBusyAsync(
        Guid passengerUserId, Guid tripId, ServiceType service = ServiceType.Ride) =>
        SafeSend(passengerUserId, new FcmPushMessage(
            Title: "El conductor ya no está disponible",
            Body: "El conductor que elegiste tomó otro viaje. Elige otra oferta.",
            Route: "/passenger/tracking",
            ExtraData: Data("proposal", tripId, service, "bugie", "offer_driver_busy")));

    // ── EVENTO: el conductor retiró su oferta (declinó) ───────────────────
    public async Task NotifyPassengerOfferWithdrawnAsync(
        Guid passengerUserId, Guid tripId, Guid driverUserId, ServiceType service = ServiceType.Ride)
    {
        string name = "El conductor";
        try
        {
            var users = await _auth.GetUsersByIdsAsync(new[] { driverUserId }, CancellationToken.None);
            var full = users.GetValueOrDefault(driverUserId)?.FullName;
            if(!string.IsNullOrWhiteSpace(full)) name = $"El conductor {full}";
        }
        catch(Exception ex)
        {
            Console.WriteLine($"TripNotificationService name error: {ex.Message}");
        }
        await SafeSend(passengerUserId, new FcmPushMessage(
            Title: "Oferta retirada",
            Body: $"{name} retiró su oferta.",
            Route: "/passenger/tracking",
            ExtraData: new Dictionary<string, string>(
                Data("proposal", tripId, service, "driver", "offer_withdrawn"))
            {
                ["driver_id"] = driverUserId.ToString(),
            }));
    }

    // ── EVENTO: viaje inmediato que nadie tomó (cancelado por Bugie) ──────
    public Task NotifyPassengerNoDriverFoundAsync(
        Guid passengerUserId, Guid tripId, ServiceType service = ServiceType.Ride) =>
        SafeSend(passengerUserId, new FcmPushMessage(
            Title: IsDelivery(service) ? "Envío cancelado" : "Viaje cancelado",
            Body: "Nadie aceptó tu pedido. Puedes volver a pedirlo.",
            Route: null,
            ExtraData: new Dictionary<string, string>(Data("trip", tripId, service, "bugie", "trip_cancelled"))
            {
                ["cancelled_by"] = "system",
                ["reason_code"]  = "no_driver_timeout",
            }));

    // ── EVENTO: el conductor canceló el programado; se busca otro ─────────
    public Task NotifyPassengerDriverCancelledReopenedAsync(
        Guid passengerUserId, Guid tripId, DateTime? scheduledAtUtc, ServiceType service = ServiceType.Ride)
    {
        var when = scheduledAtUtc.HasValue ? $" del {Peru(scheduledAtUtc.Value, "dd/MM HH:mm")}" : "";
        return SafeSend(passengerUserId, new FcmPushMessage(
            Title: "Tu conductor canceló",
            Body: $"Tu conductor canceló; buscamos otro para tu {Noun(service)} programado{when}.",
            Route: "/passenger/tracking",
            ExtraData: Data("trip", tripId, service, "driver", "trip_reopened")));
    }

    private static string Peru(DateTime utc, string format) =>
        Bugie.Trips.Domain.Common.BugieTime.ToPeru(
            utc.Kind == DateTimeKind.Utc ? utc : DateTime.SpecifyKind(utc, DateTimeKind.Utc))
        .ToString(format, System.Globalization.CultureInfo.InvariantCulture);

    // ── EVENTO: pasajero envió contrapropuesta al conductor ──────────────
    public Task NotifyDriverPassengerCounterAsync(
        Guid driverUserId, Guid tripId, decimal fare, ServiceType service = ServiceType.Ride) =>
        SafeSend(driverUserId, new FcmPushMessage(
            Title: IsDelivery(service) ? "Contrapropuesta de envío" : "Contrapropuesta del pasajero",
            Body: $"El {(IsDelivery(service) ? "cliente" : "pasajero")} propuso S/ {fare:0.00}. Acepta o contrapropón.",
            Route: $"/driver/incoming/{tripId}",
            ExtraData: Data("proposal", tripId, service, "passenger")));

    // ── EVENTO: conductor envió propuesta al pasajero ────────────────────
    public Task NotifyPassengerDriverProposeAsync(
        Guid passengerUserId, Guid tripId, decimal fare, ServiceType service = ServiceType.Ride) =>
        SafeSend(passengerUserId, new FcmPushMessage(
            Title: IsDelivery(service) ? "Nueva oferta para tu envío" : "Nueva propuesta de conductor",
            Body: IsDelivery(service)
                ? $"Un conductor ofrece llevar tu paquete por S/ {fare:0.00}."
                : $"Un conductor ofrece llevarte por S/ {fare:0.00}.",
            Route: "/passenger/tracking",
            ExtraData: Data("proposal", tripId, service, "driver")));

    // ── EVENTO: viaje iniciado ───────────────────────────────────────────
    public Task NotifyPassengerTripStartedAsync(
        Guid passengerUserId, Guid tripId, ServiceType service = ServiceType.Ride) =>
        SafeSend(passengerUserId, new FcmPushMessage(
            Title: IsDelivery(service) ? "Envío en camino" : "Viaje iniciado",
            Body: IsDelivery(service)
                ? "Tu paquete va a bordo hacia el destino."
                : "Tu conductor inició el viaje. ¡Buen viaje!",
            Route: "/passenger/tracking",
            ExtraData: Data("accepted", tripId, service, "driver")));

    // ── EVENTO: el conductor llegó al punto de recojo ────────────────────
    // type=driver_arrived: la app abre el seguimiento y muestra un aviso.
    public Task NotifyPassengerDriverArrivedAsync(
        Guid passengerUserId, Guid tripId, ServiceType service = ServiceType.Ride) =>
        SafeSend(passengerUserId, new FcmPushMessage(
            Title: "Tu conductor llegó",
            Body: IsDelivery(service)
                ? "Tu conductor llegó a recoger el paquete. Entrégaselo para que lo verifique."
                : "Tu conductor ya está en el punto de recojo. Sal a su encuentro.",
            Route: "/passenger/tracking",
            ExtraData: Data("arrived", tripId, service, "driver", "driver_arrived")));

    // ── EVENTO: viaje cancelado ──────────────────────────────────────────
    public Task NotifyTripCancelledAsync(
        Guid recipientUserId, Guid tripId, string cancelledByRole, string? reason = null,
        ServiceType service = ServiceType.Ride)
    {
        var who = cancelledByRole switch
        {
            "passenger" => IsDelivery(service) ? "El cliente" : "El pasajero",
            "driver"    => "El conductor",
            _            => "Bugie",
        };
        var from = cancelledByRole is "passenger" or "driver" ? cancelledByRole : "bugie";
        var noun = Noun(service);
        return SafeSend(recipientUserId, new FcmPushMessage(
            Title: IsDelivery(service) ? "Envío cancelado" : "Viaje cancelado",
            Body: string.IsNullOrWhiteSpace(reason)
                ? $"{who} canceló el {noun}."
                : $"{who} canceló el {noun}. Motivo: {reason}",
            Route: null,
            ExtraData: new Dictionary<string, string>(Data("trip", tripId, service, from, "trip_cancelled"))
            {
                ["cancelled_by"] = cancelledByRole,
            }));
    }

    // ── EVENTO: pasajero rechazó la propuesta del conductor ──────────────
    public Task NotifyDriverProposalRejectedAsync(
        Guid driverUserId, Guid tripId, ServiceType service = ServiceType.Ride) =>
        SafeSend(driverUserId, new FcmPushMessage(
            Title: "Propuesta rechazada",
            Body: IsDelivery(service)
                ? "El cliente rechazó tu propuesta de envío."
                : "El pasajero rechazó tu propuesta.",
            Route: null,
            // Antes iba como "sos" (copiado por error): es un aviso de propuesta.
            ExtraData: Data("proposal", tripId, service, "passenger")));

    // ── EVENTO: envío, paquete recogido y verificado ─────────────────────
    public async Task NotifyPassengerPackagePickedUpAsync(
        Guid passengerUserId, Guid tripId, string? description)
    {
        var what = string.IsNullOrWhiteSpace(description) ? "Tu paquete" : $"Tu paquete ({description})";
        await SafeSend(passengerUserId, new FcmPushMessage(
            Title: "Paquete recogido",
            Body: $"{what} fue recogido y verificado por el conductor.",
            Route: "/passenger/tracking",
            ExtraData: Data("delivery", tripId, ServiceType.Delivery, "driver", "package_picked_up")));
        await SafeEmail(passengerUserId,
            subject: "Bugie: recogimos tu paquete",
            title:   "Paquete recogido",
            message: $"{what} fue recogido y verificado por el conductor. " +
                     "Puedes ver las fotos y seguir el envío desde la app o la web de Bugie.");
    }

    // ── EVENTO: envío entregado ──────────────────────────────────────────
    public async Task NotifyPassengerPackageDeliveredAsync(
        Guid passengerUserId, Guid tripId, string receivedBy)
    {
        await SafeSend(passengerUserId, new FcmPushMessage(
            Title: "Envío entregado",
            Body: $"Tu paquete fue entregado. Recibió: {receivedBy}.",
            Route: "/passenger/tracking",
            ExtraData: Data("delivery", tripId, ServiceType.Delivery, "driver", "package_delivered")));
        await SafeEmail(passengerUserId,
            subject: "Bugie: tu envío fue entregado",
            title:   "Envío entregado",
            message: $"Tu paquete fue entregado. Recibió: {receivedBy}. " +
                     "La foto de la entrega está en el detalle del envío, en la app o la web de Bugie.");
    }

    // ── EVENTO: el conductor se desvió de la ruta ────────────────────────
    public Task NotifyPassengerRouteDeviationAsync(
        Guid passengerUserId, Guid tripId, ServiceType service = ServiceType.Ride) =>
        SafeSend(passengerUserId, new FcmPushMessage(
            Title: "Cambio de ruta detectado",
            Body: IsDelivery(service)
                ? "Tu conductor se desvió de la ruta del envío; el equipo de Bugie está atento."
                : "Tu conductor se desvió de la ruta; el equipo de Bugie está atento.",
            Route: "/passenger/tracking",
            ExtraData: Data("trip", tripId, service, "bugie", "route_deviation")));

    // ── EVENTO: recordatorio de un programado (30 / 10 min antes) ────────
    public Task NotifyScheduledReminderAsync(
        Guid userId, Guid tripId, bool toDriver, int minutesLeft, DateTime scheduledAtUtc,
        ServiceType service = ServiceType.Ride)
    {
        var hora = Bugie.Trips.Domain.Common.BugieTime.ToPeru(scheduledAtUtc).ToString("HH:mm");
        var noun = Noun(service);
        string body;
        if(toDriver)
            body = IsDelivery(service)
                ? $"Tienes un envío programado a las {hora} (en {minutesLeft} min). Ve a recoger el paquete."
                : $"Tienes un viaje programado a las {hora} (en {minutesLeft} min). Ve al punto de recojo.";
        else
            body = IsDelivery(service)
                ? $"Tu envío programado es a las {hora} (en {minutesLeft} min). Ten listo el paquete."
                : $"Tu viaje programado es a las {hora} (en {minutesLeft} min). Prepárate para salir.";
        return SafeSend(userId, new FcmPushMessage(
            Title: $"Tu {noun} programado empieza en {minutesLeft} min",
            Body: body,
            Route: toDriver ? "/driver/scheduled" : "/passenger/tracking",
            ExtraData: new Dictionary<string, string>(
                Data("trip", tripId, service, "bugie", "scheduled_reminder"))
            {
                ["minutes_left"] = minutesLeft.ToString(),
            }));
    }

    // ── EVENTO: programado aún sin conductor (~30 min antes) ─────────────
    public Task NotifyScheduledNoDriverYetAsync(
        Guid passengerUserId, Guid tripId, int minutesLeft, DateTime scheduledAtUtc,
        ServiceType service = ServiceType.Ride)
    {
        var hora = Bugie.Trips.Domain.Common.BugieTime.ToPeru(scheduledAtUtc).ToString("HH:mm");
        var noun = Noun(service);
        return SafeSend(passengerUserId, new FcmPushMessage(
            Title: $"Tu {noun} programado aún no tiene conductor",
            Body: $"Tu {noun} de las {hora} (en {minutesLeft} min) sigue sin conductor. " +
                  "Revisa las ofertas o mejora tu tarifa. Si nadie lo acepta a la hora, se cancelará.",
            Route: "/passenger/tracking",
            ExtraData: new Dictionary<string, string>(
                Data("trip", tripId, service, "bugie", "scheduled_no_driver"))
            {
                ["minutes_left"] = minutesLeft.ToString(),
            }));
    }

    // ── EVENTO: programado vencido sin conductor (cancelado por Bugie) ───
    public Task NotifyScheduledExpiredAsync(
        Guid passengerUserId, Guid tripId, string reason, ServiceType service = ServiceType.Ride) =>
        SafeSend(passengerUserId, new FcmPushMessage(
            Title: IsDelivery(service) ? "Envío programado cancelado" : "Viaje programado cancelado",
            Body: reason,
            Route: null,
            ExtraData: new Dictionary<string, string>(Data("trip", tripId, service, "bugie", "trip_cancelled"))
            {
                ["cancelled_by"] = "system",
            }));

    // ── EVENTO: el pasajero republicó (el conductor no llegó) ────────────
    public Task NotifyDriverRemovedNoShowAsync(
        Guid driverUserId, Guid tripId, ServiceType service = ServiceType.Ride) =>
        SafeSend(driverUserId, new FcmPushMessage(
            Title: IsDelivery(service) ? "Te quitaron del envío programado" : "Te quitaron del viaje programado",
            Body: $"No marcaste tu llegada a tiempo y el {(IsDelivery(service) ? "cliente" : "pasajero")} " +
                  $"volvió a publicar el {Noun(service)} para otros conductores.",
            Route: null,
            ExtraData: Data("trip", tripId, service, "passenger", "trip_republished")));

    // ── HELPERS ──────────────────────────────────────────────────────────
    /// <summary>
    /// Manda el push de forma segura: usa CancellationToken.None (para no
    /// cancelarse cuando termina el HTTP request) y captura excepciones para
    /// no romper el flujo principal del controller que lo llama.
    /// </summary>
    private async Task SafeSend(Guid userId, FcmPushMessage msg)
    {
        try
        {
            await _fcm.SendToUserAsync(userId, msg, CancellationToken.None);
        }
        catch(Exception ex)
        {
            Console.WriteLine($"TripNotificationService error: {ex.Message}");
        }
    }

    /// Correo vía Auth (tiene el SMTP y el correo del usuario). No lanza excepción.
    private async Task SafeEmail(Guid userId, string subject, string title, string message)
    {
        try
        {
            await _auth.SendEmailToUserAsync(userId, subject, title, message, CancellationToken.None);
        }
        catch(Exception ex)
        {
            Console.WriteLine($"TripNotificationService email error: {ex.Message}");
        }
    }
}
