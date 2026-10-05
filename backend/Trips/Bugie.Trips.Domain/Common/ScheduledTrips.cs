namespace Bugie.Trips.Domain.Common;

/// <summary>
/// Reglas de los viajes y envios programados (todas en minutos salvo MaxDaysAhead).
/// </summary>
public static class ScheduledTrips
{
    /// <summary>Minimo de anticipacion al programar (el cliente pide 30; se tolera un poco por el reloj).</summary>
    public const int MinLeadMinutes = 30;
    public const int MinLeadToleranceMinutes = 5;

    /// <summary>Maximo de dias hacia adelante para programar.</summary>
    public const int MaxDaysAhead = 7;

    /// <summary>Un programado aceptado pasa a "viaje activo" cuando faltan estos minutos.</summary>
    public const int ActivateBeforeMinutes = 30;

    /// <summary>El conductor puede avisar llegada / iniciar desde estos minutos antes.</summary>
    public const int EarliestStartMinutes = 60;

    /// <summary>Margen minimo entre dos programados del mismo conductor.</summary>
    public const int ConflictMarginMinutes = 60;

    /// <summary>Minutos despues de la hora programada sin "Ya llegue" para cancelar sin penalidad o republicar.</summary>
    public const int NoShowMinutes = 15;
}
