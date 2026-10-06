using Bugie.Drivers.Domain.Interfaces;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Bugie.Drivers.Application.Services;

/// <summary>Una particion exportada a Parquet y borrada de la base.</summary>
public record GpsArchivedPartition(string Partition, DateOnly Day, long Rows, string FilePath);

/// <summary>Resultado de una corrida del job de historial GPS.</summary>
public class GpsArchiveRunResult
{
    public DateTime     StartedAtUtc        { get; set; }
    public DateTime?    FinishedAtUtc       { get; set; }
    public string       TriggeredBy         { get; set; } = "job";
    public int          PartitionsCreated   { get; set; }
    public int          TripsConsolidated   { get; set; }
    public long         DefaultPartitionRows{ get; set; }
    public List<GpsArchivedPartition> Archived { get; } = new();
    public List<string> Warnings            { get; } = new();
    public List<string> Errors              { get; } = new();
    public bool         Ok => Errors.Count == 0;
}

/// <summary>Estado en memoria del job (ultima corrida). Singleton.</summary>
public class GpsArchiveState
{
    private readonly SemaphoreSlim _lock = new(1, 1);

    public GpsArchiveRunResult? LastRun   { get; private set; }
    public bool                 IsRunning { get; private set; }
    public DateTime?            NextRunUtc { get; set; }

    /// <summary>Intenta tomar el turno. false = ya hay una corrida en curso.</summary>
    public bool TryBegin()
    {
        if (!_lock.Wait(0)) return false;
        IsRunning = true;
        return true;
    }

    public void End(GpsArchiveRunResult result)
    {
        LastRun = result;
        IsRunning = false;
        _lock.Release();
    }
}

/// <summary>
/// Job del historial GPS (lo corre GpsArchiveJobService a la hora configurada
/// y el admin a mano con POST /api/drivers/admin/gps-archive/run):
///   1. crea las particiones de drivers.locationhistory de hoy + N dias,
///   2. consolida en drivers.trippaths los viajes terminados sin recorrido,
///   3. exporta a Parquet las particiones de hace KeepDays dias o mas
///      (un archivo por dia) y, SOLO si el archivo se escribio y tiene la misma
///      cantidad de filas, borra la particion. Nunca borra sin archivo.
/// </summary>
public class GpsArchiveService
{
    private readonly IGpsArchiveRepository _repo;
    private readonly ITripPathRepository   _paths;
    private readonly IGpsArchiveStore      _store;
    private readonly GpsArchiveOptions     _opt;
    private readonly ILogger<GpsArchiveService> _log;

    public GpsArchiveService(
        IGpsArchiveRepository repo,
        ITripPathRepository paths,
        IGpsArchiveStore store,
        IOptions<GpsArchiveOptions> opt,
        ILogger<GpsArchiveService> log)
    {
        _repo  = repo;
        _paths = paths;
        _store = store;
        _opt   = opt.Value;
        _log   = log;
    }

    public async Task<GpsArchiveRunResult> RunAsync(string triggeredBy, CancellationToken ct = default)
    {
        var result = new GpsArchiveRunResult { StartedAtUtc = DateTime.UtcNow, TriggeredBy = triggeredBy };
        _log.LogInformation("GpsArchive: inicio ({By}). Carpeta {Folder}, KeepDays {Keep}",
                            triggeredBy, _store.FolderPath, _opt.KeepDays);

        // 1. Particiones por adelantado.
        try
        {
            result.PartitionsCreated = await _repo.EnsurePartitionsAsync(_opt.PartitionDaysAhead, ct);
            _log.LogInformation("GpsArchive: particiones creadas: {N}", result.PartitionsCreated);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "GpsArchive: error creando particiones");
            result.Errors.Add("Particiones: " + ex.Message);
        }

        // 2. Consolidar viajes terminados sin recorrido.
        try
        {
            result.TripsConsolidated = await ConsolidatePendingAsync(ct);
            _log.LogInformation("GpsArchive: viajes consolidados: {N}", result.TripsConsolidated);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "GpsArchive: error consolidando viajes");
            result.Errors.Add("Consolidacion: " + ex.Message);
        }

        // Aviso si hay filas en la particion DEFAULT (falto crear alguna particion).
        try
        {
            result.DefaultPartitionRows = await _repo.CountDefaultRowsAsync(ct);
            if (result.DefaultPartitionRows > 0)
            {
                var msg = $"La particion DEFAULT tiene {result.DefaultPartitionRows} filas: se mueven al crear la particion de su dia (ensure_locationhistory_partition).";
                _log.LogWarning("GpsArchive: {Msg}", msg);
                result.Warnings.Add(msg);
            }
        }
        catch (Exception ex) { result.Warnings.Add("DEFAULT: " + ex.Message); }

        // 3. Exportar y borrar particiones viejas.
        var keepDays  = Math.Max(_opt.KeepDays, 1);
        var cutoffDay = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-keepDays);
        List<GpsPartitionInfo> partitions;
        try { partitions = await _repo.GetDayPartitionsAsync(ct); }
        catch (Exception ex)
        {
            _log.LogError(ex, "GpsArchive: error listando particiones");
            result.Errors.Add("Listar particiones: " + ex.Message);
            partitions = new();
        }

        foreach (var p in partitions.Where(p => p.Day <= cutoffDay).OrderBy(p => p.Day))
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                var archived = await ArchivePartitionAsync(p, result, ct);
                if (archived is not null) result.Archived.Add(archived);
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "GpsArchive: error archivando {Partition}", p.Name);
                result.Errors.Add($"{p.Name}: {ex.Message}");
            }
        }

        result.FinishedAtUtc = DateTime.UtcNow;
        _log.LogInformation("GpsArchive: fin. Archivadas {A}, errores {E}, duracion {D:F1}s",
                            result.Archived.Count, result.Errors.Count,
                            (result.FinishedAtUtc.Value - result.StartedAtUtc).TotalSeconds);
        return result;
    }

    /// <summary>Consolida los viajes sin GPS nuevo en las ultimas ConsolidateAfterHours horas.</summary>
    public async Task<int> ConsolidatePendingAsync(CancellationToken ct = default)
    {
        var cutoff  = DateTime.UtcNow.AddHours(-Math.Max(_opt.ConsolidateAfterHours, 0));
        var pending = await _paths.GetPendingConsolidationAsync(cutoff, ct);
        var done = 0;
        foreach (var tripId in pending)
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                if (await _paths.ConsolidateAsync(tripId, ct) > 0) done++;
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "GpsArchive: no se pudo consolidar el viaje {TripId}", tripId);
            }
        }
        return done;
    }

    private async Task<GpsArchivedPartition?> ArchivePartitionAsync(
        GpsPartitionInfo p, GpsArchiveRunResult result, CancellationToken ct)
    {
        // Antes de borrar el crudo, todo viaje de la particion debe tener recorrido.
        var sinRecorrido = await _repo.GetTripIdsWithoutPathAsync(p.Name, ct);
        foreach (var tripId in sinRecorrido)
            await _paths.ConsolidateAsync(tripId, ct);
        if (sinRecorrido.Count > 0)
            _log.LogInformation("GpsArchive: {Partition}: {N} viajes consolidados antes de archivar", p.Name, sinRecorrido.Count);

        var rowsBefore = await _repo.CountRowsAsync(p.Name, ct);
        var filePath   = _store.FilePathFor(p.Day);

        // Si el archivo ya existe con la misma cantidad de filas (corrida anterior
        // que no llego a borrar), no se reescribe.
        var reuse = File.Exists(filePath) && await SafeCountAsync(filePath, ct) == rowsBefore;
        if (!reuse)
        {
            _log.LogInformation("GpsArchive: exportando {Partition} ({Rows} filas) a {File}", p.Name, rowsBefore, filePath);
            await using var writer = await _store.CreateWriterAsync(p.Day, ct);
            long afterId = 0;
            while (true)
            {
                var chunk = await _repo.ReadRowsAsync(p.Name, afterId, Math.Max(_opt.ExportChunkSize, 1000), ct);
                if (chunk.Count == 0) break;
                await writer.WriteChunkAsync(chunk, ct);
                afterId = chunk[^1].Id;
                if (chunk.Count < _opt.ExportChunkSize) break;
            }
            filePath = await writer.CompleteAsync(ct);
        }

        // Verificacion: filas del archivo == filas de la particion (recontadas).
        var fileRows  = await _store.CountRowsAsync(filePath, ct);
        var rowsAfter = await _repo.CountRowsAsync(p.Name, ct);
        if (fileRows != rowsBefore || rowsAfter != rowsBefore)
        {
            var msg = $"{p.Name}: no se borra. Filas en archivo {fileRows}, en la base {rowsBefore} -> {rowsAfter}. Se reintenta en la proxima corrida.";
            _log.LogWarning("GpsArchive: {Msg}", msg);
            result.Warnings.Add(msg);
            return null;
        }

        await _repo.DropPartitionAsync(p.Name, ct);
        _log.LogInformation("GpsArchive: {Partition} archivada ({Rows} filas) y borrada de la base", p.Name, rowsBefore);
        return new GpsArchivedPartition(p.Name, p.Day, rowsBefore, filePath);
    }

    private async Task<long> SafeCountAsync(string filePath, CancellationToken ct)
    {
        try { return await _store.CountRowsAsync(filePath, ct); }
        catch { return -1; }
    }
}
