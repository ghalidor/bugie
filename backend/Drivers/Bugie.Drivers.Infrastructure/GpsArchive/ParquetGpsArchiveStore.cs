using System.Globalization;
using Bugie.Drivers.Application.Services;
using Bugie.Drivers.Domain.Entities;
using Bugie.Drivers.Domain.Interfaces;
using Microsoft.Extensions.Options;
using Parquet;
using Parquet.Data;
using Parquet.Schema;

namespace Bugie.Drivers.Infrastructure.GpsArchive;

/// <summary>
/// Historial frio del GPS crudo en Parquet (paquete Parquet.Net), un archivo
/// por dia UTC: {GpsArchive:Folder}/locationhistory_YYYY-MM-DD.parquet.
/// Columnas: Id, DriverId, TripId, Lat, Lng, SpeedKmh, Heading, RecordedAt (UTC, microsegundos).
/// Se escribe en un .tmp y recien al completar se renombra, asi nunca queda
/// un archivo a medias con el nombre definitivo.
/// </summary>
public class ParquetGpsArchiveStore : IGpsArchiveStore
{
    private const string Prefix = "locationhistory_";
    private const string Ext    = ".parquet";

    private static readonly DataField<long>    FId      = new("Id");
    private static readonly DataField<Guid>    FDriver  = new("DriverId");
    private static readonly DataField<Guid?>   FTrip    = new("TripId");
    private static readonly DataField<double>  FLat     = new("Lat");
    private static readonly DataField<double>  FLng     = new("Lng");
    private static readonly DataField<double?> FSpeed   = new("SpeedKmh");
    private static readonly DataField<double?> FHeading = new("Heading");
    private static readonly DateTimeDataField  FAt      =
        new("RecordedAt", DateTimeFormat.Timestamp, isAdjustedToUTC: true, unit: DateTimeTimeUnit.Micros);

    private static readonly ParquetSchema Schema = new(FId, FDriver, FTrip, FLat, FLng, FSpeed, FHeading, FAt);

    public string FolderPath { get; }

    public ParquetGpsArchiveStore(IOptions<GpsArchiveOptions> opt)
    {
        var folder = string.IsNullOrWhiteSpace(opt.Value.Folder) ? "gps-archive" : opt.Value.Folder;
        FolderPath = Path.IsPathRooted(folder) ? folder : Path.Combine(AppContext.BaseDirectory, folder);
    }

    public string FilePathFor(DateOnly day) =>
        Path.Combine(FolderPath, Prefix + day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) + Ext);

    public async Task<IGpsArchiveWriter> CreateWriterAsync(DateOnly day, CancellationToken ct = default)
    {
        Directory.CreateDirectory(FolderPath);
        var finalPath = FilePathFor(day);
        var tempPath  = finalPath + ".tmp";
        if (File.Exists(tempPath)) File.Delete(tempPath);

        var stream = new FileStream(tempPath, FileMode.CreateNew, FileAccess.ReadWrite, FileShare.None);
        var writer = await ParquetWriter.CreateAsync(Schema, stream, cancellationToken: ct);
        writer.CompressionMethod = CompressionMethod.Zstd;
        return new Writer(writer, stream, tempPath, finalPath);
    }

    public async Task<long> CountRowsAsync(string filePath, CancellationToken ct = default)
    {
        using var reader = await ParquetReader.CreateAsync(filePath, cancellationToken: ct);
        long total = 0;
        for (var i = 0; i < reader.RowGroupCount; i++)
        {
            using var rg = reader.OpenRowGroupReader(i);
            total += rg.RowCount;
        }
        return total;
    }

    public async Task<List<GpsRawPoint>> ReadTripAsync(DateOnly day, Guid tripId, CancellationToken ct = default)
    {
        var result = new List<GpsRawPoint>();
        var path = FilePathFor(day);
        if (!File.Exists(path)) return result;

        using var reader = await ParquetReader.CreateAsync(path, cancellationToken: ct);
        var fields = reader.Schema.GetDataFields();
        DataField F(string name) => fields.First(f => f.Name == name);

        for (var i = 0; i < reader.RowGroupCount; i++)
        {
            using var rg = reader.OpenRowGroupReader(i);
            var trips = (Guid?[])(await rg.ReadColumnAsync(F("TripId"), ct)).Data;

            // Solo se leen las demas columnas si el viaje aparece en este bloque.
            var hits = new List<int>();
            for (var r = 0; r < trips.Length; r++)
                if (trips[r] == tripId) hits.Add(r);
            if (hits.Count == 0) continue;

            var ids      = (long[])    (await rg.ReadColumnAsync(F("Id"),         ct)).Data;
            var drivers  = (Guid[])    (await rg.ReadColumnAsync(F("DriverId"),   ct)).Data;
            var lats     = (double[])  (await rg.ReadColumnAsync(F("Lat"),        ct)).Data;
            var lngs     = (double[])  (await rg.ReadColumnAsync(F("Lng"),        ct)).Data;
            var speeds   = (double?[]) (await rg.ReadColumnAsync(F("SpeedKmh"),   ct)).Data;
            var headings = (double?[]) (await rg.ReadColumnAsync(F("Heading"),    ct)).Data;
            var ats      = (DateTime[])(await rg.ReadColumnAsync(F("RecordedAt"), ct)).Data;

            foreach (var r in hits)
                result.Add(new GpsRawPoint(ids[r], drivers[r], trips[r], lats[r], lngs[r], speeds[r], headings[r],
                                           DateTime.SpecifyKind(ats[r], DateTimeKind.Utc)));
        }
        return result.OrderBy(p => p.RecordedAt).ThenBy(p => p.Id).ToList();
    }

    public List<GpsArchiveFileInfo> ListFiles()
    {
        if (!Directory.Exists(FolderPath)) return new();
        return new DirectoryInfo(FolderPath)
            .GetFiles(Prefix + "*" + Ext)
            .Select(f => new GpsArchiveFileInfo(f.Name, DayOf(f.Name), f.Length, f.LastWriteTimeUtc))
            .OrderBy(f => f.Day)
            .ToList();
    }

    private static DateOnly? DayOf(string fileName)
    {
        var core = fileName.Substring(Prefix.Length, Math.Max(0, fileName.Length - Prefix.Length - Ext.Length));
        return DateOnly.TryParseExact(core, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)
            ? d : null;
    }

    private sealed class Writer : IGpsArchiveWriter
    {
        private readonly ParquetWriter _writer;
        private readonly FileStream    _stream;
        private readonly string        _tempPath;
        private readonly string        _finalPath;
        private bool _completed;

        public Writer(ParquetWriter writer, FileStream stream, string tempPath, string finalPath)
        {
            _writer    = writer;
            _stream    = stream;
            _tempPath  = tempPath;
            _finalPath = finalPath;
        }

        public async Task WriteChunkAsync(IReadOnlyList<GpsRawPoint> rows, CancellationToken ct = default)
        {
            if (rows.Count == 0) return;
            using var rg = _writer.CreateRowGroup();
            await rg.WriteColumnAsync(new DataColumn(FId,      rows.Select(r => r.Id).ToArray()), ct);
            await rg.WriteColumnAsync(new DataColumn(FDriver,  rows.Select(r => r.DriverId).ToArray()), ct);
            await rg.WriteColumnAsync(new DataColumn(FTrip,    rows.Select(r => r.TripId).ToArray()), ct);
            await rg.WriteColumnAsync(new DataColumn(FLat,     rows.Select(r => r.Lat).ToArray()), ct);
            await rg.WriteColumnAsync(new DataColumn(FLng,     rows.Select(r => r.Lng).ToArray()), ct);
            await rg.WriteColumnAsync(new DataColumn(FSpeed,   rows.Select(r => r.SpeedKmh).ToArray()), ct);
            await rg.WriteColumnAsync(new DataColumn(FHeading, rows.Select(r => r.Heading).ToArray()), ct);
            await rg.WriteColumnAsync(new DataColumn(FAt,      rows.Select(r => DateTime.SpecifyKind(r.RecordedAt, DateTimeKind.Utc)).ToArray()), ct);
        }

        public async Task<string> CompleteAsync(CancellationToken ct = default)
        {
            await _writer.DisposeAsync();
            await _stream.FlushAsync(ct);
            await _stream.DisposeAsync();
            File.Move(_tempPath, _finalPath, overwrite: true);
            _completed = true;
            return _finalPath;
        }

        public async ValueTask DisposeAsync()
        {
            if (_completed) return;
            // No se completo: se descarta el temporal, el definitivo (si habia) queda intacto.
            try { await _writer.DisposeAsync(); } catch { }
            try { await _stream.DisposeAsync(); } catch { }
            try { if (File.Exists(_tempPath)) File.Delete(_tempPath); } catch { }
        }
    }
}
