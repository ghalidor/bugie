namespace Bugie.Drivers.Application.Services;

/// <summary>
/// Contrato del "data" de los push de cuenta al conductor (la app lo lee al
/// tocar la notificación): { type: "account", alert_type, route }.
/// </summary>
public static class DriverPush
{
    public const string Approved = "driver_approved";
    public const string Rejected = "driver_rejected";
    public const string Suspended = "driver_suspended";
    public const string Reactivated = "driver_reactivated";
    public const string ReviewKept = "review_kept";
    public const string DocumentRejected = "document_rejected";
    public const string DocumentExpiring = "document_expiring";

    public const string RouteHome = "/driver";
    public const string RouteDocuments = "/driver/documents";

    public static Dictionary<string, string> Data(string alertType, string route) => new()
    {
        ["type"] = "account",
        ["alert_type"] = alertType,
        ["route"] = route,
    };
}
