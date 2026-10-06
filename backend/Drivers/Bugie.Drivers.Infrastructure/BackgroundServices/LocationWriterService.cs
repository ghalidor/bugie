using Bugie.Drivers.Application.Services.Location;
using Bugie.Drivers.Domain.External;
using Bugie.Drivers.Domain.Interfaces;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Bugie.Drivers.Infrastructure.BackgroundServices;

/// <summary>
/// Drena la cola de GPS (LocationQueue) en lotes de hasta BatchSize puntos o
/// cada FlushMilliseconds, y por cada lote:
///   a) UPDATE de la ultima posicion en drivers.Drivers (solo el ultimo punto de
///      cada conductor del lote, una sola sentencia),
///   b) INSERT masivo en drivers.LocationHistory de los puntos con TripId
///      (una sola sentencia con unnest),
///   c) aviso a Trips.Api (SignalR al admin/pasajero y desvio de ruta) en
///      segundo plano, sin esperar la respuesta.
///
/// Si la base esta caida: la posicion en vivo sigue en memoria (nearby, mapa
/// del admin y pasajero la siguen viendo), el aviso a Trips sale igual, y lo
/// que no se pudo escribir se reintenta en el siguiente lote (la ultima
/// posicion por conductor siempre; el historial hasta QueueCapacity puntos,
/// despues se bota lo mas viejo). Cada MetricsIntervalSeconds escribe un
/// resumen en el log.
/// </summary>
public class LocationWriterService : BackgroundService
{
    private readonly LocationQueue _queue;
    private readonly DriverLiveLocations _live;
    private readonly IServiceScopeFactory _scopes;
    private readonly LocationOptions _opts;
    private readonly ILogger<LocationWriterService> _log;

    // Avisos a Trips en vuelo: si Trips esta lento no acumulamos tareas sin limite.
    private readonly SemaphoreSlim _notifySlots = new(4);

    // Pendientes por error de base (se reintentan en el siguiente lote).
    private readonly Dictionary<Guid, DriverLocationSample> _pendingPositions = new();
    private readonly List<DriverLocationSample> _pendingHistory = new();

    // Metricas del periodo.
    private long _writtenPositions, _writtenHistory, _dbErrors, _notifySkipped;
    private DateTime _lastDbErrorLog = DateTime.MinValue;

    public LocationWriterService(LocationQueue queue, DriverLiveLocations live,
                                 IServiceScopeFactory scopes, IOptions<LocationOptions> opts,
                                 ILogger<LocationWriterService> log)
    {
        _queue = queue;
        _live = live;
        _scopes = scopes;
        _opts = opts.Value;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var batchSize = Math.Max(1, _opts.BatchSize);
        var flushEvery = TimeSpan.FromMilliseconds(Math.Max(100, _opts.FlushMilliseconds));
        var metricsEvery = TimeSpan.FromSeconds(Math.Max(10, _opts.MetricsIntervalSeconds));
        var nextMetrics = DateTime.UtcNow + metricsEvery;
        var batch = new List<DriverLocationSample>(batchSize);

        _log.LogInformation("LocationWriterService iniciado: lote {Batch}, cada {Ms} ms, cola {Cap}.",
            batchSize, flushEvery.TotalMilliseconds, _opts.QueueCapacity);

        while(!stoppingToken.IsCancellationRequested)
        {
            batch.Clear();
            try
            {
                await ReadBatchAsync(batch, batchSize, flushEvery, stoppingToken);
            }
            catch(OperationCanceledException) when(stoppingToken.IsCancellationRequested)
            {
                break;
            }

            if(batch.Count > 0 || _pendingPositions.Count > 0 || _pendingHistory.Count > 0)
                await FlushAsync(batch, stoppingToken);

            if(DateTime.UtcNow >= nextMetrics)
            {
                LogMetrics();
                _live.RemoveStale(TimeSpan.FromHours(24));
                nextMetrics = DateTime.UtcNow + metricsEvery;
            }
        }

        // Apagado: ultimo intento con lo que quedo en la cola (sin bloquear mucho).
        try
        {
            batch.Clear();
            while(batch.Count < batchSize * 4 && _queue.Reader.TryRead(out var s)) batch.Add(s);
            if(batch.Count > 0 || _pendingPositions.Count > 0 || _pendingHistory.Count > 0)
                await FlushAsync(batch, CancellationToken.None, notify: false);
        }
        catch(Exception ex)
        {
            _log.LogWarning(ex, "No se pudo escribir el ultimo lote de GPS al apagar.");
        }
    }

    /// <summary>Junta hasta batchSize puntos, esperando como maximo flushEvery.</summary>
    private async Task ReadBatchAsync(List<DriverLocationSample> batch, int batchSize,
                                      TimeSpan flushEvery, CancellationToken ct)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(flushEvery);
        try
        {
            while(batch.Count < batchSize && await _queue.Reader.WaitToReadAsync(timeout.Token))
            {
                while(batch.Count < batchSize && _queue.Reader.TryRead(out var s)) batch.Add(s);
            }
        }
        catch(OperationCanceledException) when(!ct.IsCancellationRequested)
        {
            // Se cumplio el tiempo del lote: se escribe lo que haya.
        }
    }

    private async Task FlushAsync(List<DriverLocationSample> batch, CancellationToken ct, bool notify = true)
    {
        // (a) Ultimo punto por conductor (mas los pendientes de un lote anterior fallido).
        foreach(var s in batch)
        {
            if(!_pendingPositions.TryGetValue(s.DriverId, out var prev) || s.RecordedAtUtc >= prev.RecordedAtUtc)
                _pendingPositions[s.DriverId] = s;
        }
        // (b) Historial: solo puntos con viaje.
        foreach(var s in batch)
            if(s.TripId is not null) _pendingHistory.Add(s);
        TrimPendingHistory();

        using(var scope = _scopes.CreateScope())
        {
            var drivers = scope.ServiceProvider.GetRequiredService<IDriverRepository>();
            var history = scope.ServiceProvider.GetRequiredService<ILocationHistoryRepository>();

            if(_pendingPositions.Count > 0)
            {
                var updates = _pendingPositions.Values
                    .Select(s => new DriverLocationUpdate(s.DriverId, s.Lat, s.Lng, s.RecordedAtUtc))
                    .ToList();
                try
                {
                    await drivers.UpdateLocationsAsync(updates, ct);
                    Interlocked.Add(ref _writtenPositions, updates.Count);
                    _pendingPositions.Clear();
                }
                catch(Exception ex) when(ex is not OperationCanceledException)
                {
                    LogDbError(ex, "posiciones");
                }
            }

            if(_pendingHistory.Count > 0)
            {
                var points = _pendingHistory
                    .Select(s => Domain.Entities.LocationHistory.Create(
                        s.DriverId, s.Lat, s.Lng, s.TripId, s.SpeedKmh, s.Heading, s.RecordedAtUtc))
                    .ToList();
                try
                {
                    await history.AddRangeAsync(points, ct);
                    Interlocked.Add(ref _writtenHistory, points.Count);
                    _pendingHistory.Clear();
                }
                catch(Exception ex) when(ex is not OperationCanceledException)
                {
                    LogDbError(ex, "historial");
                }
            }
        }

        // (c) Aviso a Trips: fire-and-forget real, con su propio scope y sin esperar.
        if(notify && batch.Count > 0) NotifyTrips(batch);
    }

    private void NotifyTrips(List<DriverLocationSample> batch)
    {
        if(!_notifySlots.Wait(0))
        {
            Interlocked.Add(ref _notifySkipped, batch.Count);
            return;
        }

        var notices = batch
            .OrderBy(s => s.RecordedAtUtc)
            .Select(s => new DriverLocationNotice(s.UserId, s.Lat, s.Lng, s.TripId is not null,
                                                  s.SpeedKmh, s.Heading, s.RecordedAtUtc))
            .ToList();

        _ = Task.Run(async () =>
        {
            try
            {
                using var scope = _scopes.CreateScope();
                var client = scope.ServiceProvider.GetRequiredService<ITripsNotifyClient>();
                await client.NotifyDriverLocationsAsync(notices, CancellationToken.None);
            }
            catch(Exception ex)
            {
                _log.LogWarning(ex, "No se pudo avisar a Trips el lote de GPS (no critico).");
            }
            finally
            {
                _notifySlots.Release();
            }
        });
    }

    private void TrimPendingHistory()
    {
        var cap = Math.Max(1000, _opts.QueueCapacity);
        if(_pendingHistory.Count <= cap) return;
        // Se bota lo mas viejo (la cola ya hizo lo mismo por su lado).
        _pendingHistory.RemoveRange(0, _pendingHistory.Count - cap);
    }

    private void LogDbError(Exception ex, string what)
    {
        Interlocked.Increment(ref _dbErrors);
        // Un aviso por minuto como maximo para no inundar el log mientras la base este caida.
        if(DateTime.UtcNow - _lastDbErrorLog < TimeSpan.FromMinutes(1)) return;
        _lastDbErrorLog = DateTime.UtcNow;
        _log.LogWarning(ex, "No se pudo escribir {What} de GPS en la base; se reintenta en el siguiente lote " +
                            "(pendientes: {Pos} posiciones, {Hist} puntos de historial).",
            what, _pendingPositions.Count, _pendingHistory.Count);
    }

    private void LogMetrics()
    {
        var (received, accepted, discarded, dropped) = _queue.ResetCounters();
        var positions = Interlocked.Exchange(ref _writtenPositions, 0);
        var history = Interlocked.Exchange(ref _writtenHistory, 0);
        var errors = Interlocked.Exchange(ref _dbErrors, 0);
        var skipped = Interlocked.Exchange(ref _notifySkipped, 0);
        _log.LogInformation(
            "GPS ultimo periodo: recibidos {Received}, aceptados {Accepted}, descartados {Discarded}, " +
            "botados de la cola {Dropped}, escritos {Positions} posiciones y {History} puntos de historial, " +
            "errores de BD {Errors}, avisos a Trips omitidos {Skipped}. Cola: {Queue}. Conductores en memoria: {Live}. " +
            "Pendientes BD: {PendPos} posiciones, {PendHist} historial.",
            received, accepted, discarded, dropped, positions, history, errors, skipped,
            _queue.Count, _live.Count, _pendingPositions.Count, _pendingHistory.Count);
    }
}
