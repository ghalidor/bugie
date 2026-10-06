using System.Data;
using System.Globalization;
using System.Text.RegularExpressions;
using Dapper;
using Bugie.Drivers.Domain.Entities;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Infrastructure.Repositories;

/// <summary>
/// Particiones diarias de drivers.locationhistory (ver scripts/2026-10-06_historial_gps.sql).
/// El nombre de la particion entra en el SQL como identificador, por eso se
/// valida contra el patron locationhistory_YYYYMMDD antes de usarlo.
/// </summary>
public class GpsArchiveRepository : IGpsArchiveRepository
{
    private static readonly Regex PartitionName = new(@"^locationhistory_(\d{8})$", RegexOptions.Compiled);

    private readonly IDbConnection _db;
    public GpsArchiveRepository(IDbConnection db) => _db = db;

    public Task<int> EnsurePartitionsAsync(int daysAhead, CancellationToken ct = default) =>
        _db.ExecuteScalarAsync<int>(new CommandDefinition(
            "SELECT drivers.ensure_locationhistory_partitions(@Days)",
            new { Days = daysAhead }, cancellationToken: ct));

    public async Task<List<GpsPartitionInfo>> GetDayPartitionsAsync(CancellationToken ct = default)
    {
        var names = await _db.QueryAsync<string>(new CommandDefinition(@"
            SELECT c.relname
              FROM pg_inherits i
              JOIN pg_class c ON c.oid = i.inhrelid
             WHERE i.inhparent = 'drivers.locationhistory'::regclass",
            cancellationToken: ct));

        var result = new List<GpsPartitionInfo>();
        foreach (var name in names)
        {
            var m = PartitionName.Match(name);
            if (!m.Success) continue;   // locationhistory_default u otra
            if (!DateOnly.TryParseExact(m.Groups[1].Value, "yyyyMMdd", CultureInfo.InvariantCulture,
                                        DateTimeStyles.None, out var day)) continue;
            result.Add(new GpsPartitionInfo(name, day));
        }
        return result.OrderBy(p => p.Day).ToList();
    }

    public Task<long> CountRowsAsync(string partitionName, CancellationToken ct = default) =>
        _db.ExecuteScalarAsync<long>(new CommandDefinition(
            $"SELECT count(*) FROM drivers.{Safe(partitionName)}", cancellationToken: ct));

    public async Task<List<GpsRawPoint>> ReadRowsAsync(string partitionName, long afterId, int limit, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<GpsRawPoint>(new CommandDefinition($@"
            SELECT id, driverid, tripid, lat, lng, speedkmh, heading, recordedat
              FROM drivers.{Safe(partitionName)}
             WHERE id > @AfterId
             ORDER BY id
             LIMIT @Limit",
            new { AfterId = afterId, Limit = limit }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<List<Guid>> GetTripIdsWithoutPathAsync(string partitionName, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<Guid>(new CommandDefinition($@"
            SELECT DISTINCT l.tripid
              FROM drivers.{Safe(partitionName)} l
             WHERE l.tripid IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM drivers.trippaths p WHERE p.tripid = l.tripid)",
            cancellationToken: ct));
        return rows.ToList();
    }

    public Task DropPartitionAsync(string partitionName, CancellationToken ct = default) =>
        _db.ExecuteAsync(new CommandDefinition(
            $"DROP TABLE IF EXISTS drivers.{Safe(partitionName)}", cancellationToken: ct));

    public Task<long> CountDefaultRowsAsync(CancellationToken ct = default) =>
        _db.ExecuteScalarAsync<long>(new CommandDefinition(
            "SELECT count(*) FROM drivers.locationhistory_default", cancellationToken: ct));

    private static string Safe(string partitionName) =>
        PartitionName.IsMatch(partitionName)
            ? partitionName
            : throw new ArgumentException($"Nombre de particion no valido: {partitionName}");
}
