namespace Bugie.Drivers.Application.Services;

/// <summary>
/// Configuracion del historial GPS (seccion GpsArchive de appsettings).
/// </summary>
public class GpsArchiveOptions
{
    /// <summary>Carpeta donde se guardan los Parquet diarios (locationhistory_YYYY-MM-DD.parquet).</summary>
    public string Folder { get; set; } = "C:/bugie-uploads/gps-archive";

    /// <summary>
    /// Dias de GPS crudo que se quedan en la base (hoy y ayer con el valor 2).
    /// Las particiones de dias anteriores se exportan a Parquet y se borran.
    /// </summary>
    public int KeepDays { get; set; } = 2;

    /// <summary>Hora UTC a la que corre el job nocturno (8 = 3 am en Peru).</summary>
    public int RunAtHourUtc { get; set; } = 8;

    /// <summary>Particiones que se crean por adelantado (hoy + N dias).</summary>
    public int PartitionDaysAhead { get; set; } = 3;

    /// <summary>
    /// Un viaje sin GPS nuevo durante estas horas se considera terminado y el
    /// job lo consolida en drivers.trippaths aunque Trips no haya avisado.
    /// </summary>
    public int ConsolidateAfterHours { get; set; } = 6;

    /// <summary>
    /// Segundos que espera Drivers despues de que Trips avisa que el viaje
    /// termino, para que lleguen los ultimos puntos (cola de ingesta) antes de
    /// consolidar.
    /// </summary>
    public int ConsolidateDelaySeconds { get; set; } = 30;

    /// <summary>Filas por bloque al exportar una particion.</summary>
    public int ExportChunkSize { get; set; } = 50_000;
}
