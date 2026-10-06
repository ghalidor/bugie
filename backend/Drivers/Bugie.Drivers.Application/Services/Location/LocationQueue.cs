using System.Threading.Channels;
using Microsoft.Extensions.Options;

namespace Bugie.Drivers.Application.Services.Location;

/// <summary>
/// Cola interna de puntos GPS (singleton). La peticion HTTP solo encola; el
/// LocationWriterService (Infrastructure) la drena en lotes y escribe en la base.
///
/// Cola acotada (LocationOptions.QueueCapacity): si se llena, se descarta el
/// punto MAS VIEJO (la posicion actual ya quedo en memoria, asi que lo que se
/// pierde es historial, no la ubicacion en vivo). Lleva contadores para las
/// metricas que el writer escribe en el log.
/// </summary>
public class LocationQueue
{
    private readonly Channel<DriverLocationSample> _channel;

    // Contadores (Interlocked). Los lee el writer para el log de metricas.
    private long _received, _accepted, _discarded, _dropped;

    public LocationQueue(IOptions<LocationOptions> opts)
    {
        var capacity = Math.Max(1000, opts.Value.QueueCapacity);
        _channel = Channel.CreateBounded<DriverLocationSample>(
            new BoundedChannelOptions(capacity)
            {
                FullMode = BoundedChannelFullMode.DropOldest,
                SingleReader = true,
                SingleWriter = false,
            },
            _ => Interlocked.Increment(ref _dropped));
    }

    public ChannelReader<DriverLocationSample> Reader => _channel.Reader;

    public int Count => _channel.Reader.Count;

    public void Enqueue(DriverLocationSample sample)
    {
        // Con DropOldest, TryWrite siempre acepta (bota el mas viejo si hace falta).
        _channel.Writer.TryWrite(sample);
    }

    public void CountReceived(int n) => Interlocked.Add(ref _received, n);
    public void CountAccepted(int n) => Interlocked.Add(ref _accepted, n);
    public void CountDiscarded(int n) => Interlocked.Add(ref _discarded, n);

    /// <summary>Lee y pone en cero los contadores de entrada (para el log periodico).</summary>
    public (long Received, long Accepted, long Discarded, long Dropped) ResetCounters() => (
        Interlocked.Exchange(ref _received, 0),
        Interlocked.Exchange(ref _accepted, 0),
        Interlocked.Exchange(ref _discarded, 0),
        Interlocked.Exchange(ref _dropped, 0));
}
