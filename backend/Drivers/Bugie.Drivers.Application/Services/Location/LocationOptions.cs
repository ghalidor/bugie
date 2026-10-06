namespace Bugie.Drivers.Application.Services.Location;

/// <summary>
/// Ajustes del flujo de GPS de conductores (seccion "Location" de appsettings).
/// Todos tienen valor por defecto en codigo: si la seccion no existe, funciona igual.
/// </summary>
public class LocationOptions
{
    public const string Section = "Location";

    /// <summary>Un punto a menos de esta distancia Y menos de MinSeconds del ultimo aceptado se descarta.</summary>
    public double MinMeters { get; set; } = 15;
    public double MinSeconds { get; set; } = 3;

    /// <summary>Capacidad de la cola en memoria. Llena: se descarta el punto mas viejo.</summary>
    public int QueueCapacity { get; set; } = 50000;
    /// <summary>Tamano maximo del lote que se escribe en la base de una sola vez.</summary>
    public int BatchSize { get; set; } = 500;
    /// <summary>Cada cuantos ms se escribe aunque el lote no este lleno.</summary>
    public int FlushMilliseconds { get; set; } = 1000;

    /// <summary>Puntos maximos por peticion en PUT /location/batch.</summary>
    public int MaxBatchPoints { get; set; } = 50;
    /// <summary>Puntos con fecha mas de N minutos en el futuro se descartan.</summary>
    public int MaxFutureMinutes { get; set; } = 2;
    /// <summary>Puntos mas viejos que N minutos se descartan.</summary>
    public int MaxAgeMinutes { get; set; } = 60;

    /// <summary>Una posicion en memoria mas vieja que N minutos se ignora (se cae a la base).</summary>
    public int StaleMinutes { get; set; } = 10;

    /// <summary>Cada cuantos segundos se escriben las metricas en el log.</summary>
    public int MetricsIntervalSeconds { get; set; } = 60;
}
