using MediatR;
using Bugie.Trips.Application.DTOs;
using Bugie.Trips.Domain.Entities;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Application.Commands;

public class CompleteTripHandler : IRequestHandler<CompleteTripCommand, TripDto>
{
    private readonly ITripRepository   _trips;
    private readonly IOutboxRepository _outbox;   // <-- NUEVO

    public CompleteTripHandler(ITripRepository trips, IOutboxRepository outbox)
    {
        _trips  = trips;
        _outbox = outbox;
    }

    public async Task<TripDto> Handle(CompleteTripCommand cmd, CancellationToken ct)
    {
        var trip = await _trips.GetByIdAsync(cmd.TripId, ct)
            ?? throw new KeyNotFoundException("Viaje no encontrado.");
        trip.Complete(cmd.FinalFare);
        await _trips.UpdateAsync(trip, ct);

        // ------------------------------------------------------------------
        // NUEVO: avisar al modulo de puntos.
        //
        // Solo escribimos una fila en la bandeja de salida. No llamamos a nadie
        // desde aqui, asi que completar el viaje sigue siendo igual de rapido y
        // no depende de que Rewards este vivo.
        //
        // El try/catch es a proposito: si por lo que sea falla el INSERT del
        // evento, el viaje YA se completo y esa es la operacion importante.
        // Preferimos perder los puntos (recuperables despues) antes que
        // devolverle un error al conductor por un viaje que si termino.
        // ------------------------------------------------------------------
        try
        {
            await _outbox.AddAsync(OutboxEvent.TripCompleted(
                tripId:        trip.Id,
                passengerId:   trip.PassengerId,
                driverId:      trip.DriverId,
                amount:        trip.FinalFare ?? 0m,
                paymentMethod: trip.PaymentMethod,
                completedAt:   trip.CompletedAt ?? DateTime.UtcNow), ct);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(
                $"[Outbox] No se pudo encolar trip.completed del viaje {trip.Id}: {ex.Message}");
        }

        var waypoints = await _trips.GetWaypointsAsync(trip.Id, ct);
        var wpDtos = waypoints.OrderBy(w => w.SortOrder)
            .Select(w => new WaypointDto(w.Id, w.Address, w.Lat, w.Lng, w.SortOrder)).ToList();
        return CreateTripHandler.ToDto(trip, wpDtos);
    }
}
