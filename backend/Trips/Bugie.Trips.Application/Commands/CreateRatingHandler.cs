using MediatR;
using Bugie.Trips.Application.DTOs;
using Bugie.Trips.Domain.Entities;
using Bugie.Trips.Domain.Enums;
using Bugie.Trips.Domain.External;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Application.Commands;

public record CreateRatingCommand(
    Guid TripId,
    Guid PassengerId,   // UserId del que califica (del JWT)
    byte Stars,
    string? Comment) : IRequest<TripRatingDto>;

/// <summary>
/// Procesa la calificación del pasajero al conductor.
///
/// Validaciones:
/// - El viaje debe existir y estar Completed (status 4).
/// - Solo el pasajero del viaje puede calificar.
/// - El viaje debe tener conductor asignado.
/// - Solo se puede calificar UNA vez (constraint UQ en BD).
///
/// Side effects:
/// - INSERT en trips.TripRatings (con UQ por TripId).
/// - HTTP a Drivers.Api para actualizar Driver.Rating y TotalRatings.
///   Si esa llamada falla, el rating queda igual en BD pero el promedio
///   del conductor no se actualiza. No bloqueamos por eso.
/// </summary>
public class CreateRatingHandler : IRequestHandler<CreateRatingCommand, TripRatingDto>
{
    private readonly ITripRepository _trips;
    private readonly ITripRatingRepository _ratings;
    private readonly IDriversClient _drivers;
    private readonly IAuthClient _auth;
    private readonly IOutboxRepository _outbox;

    public CreateRatingHandler(
        ITripRepository trips,
        ITripRatingRepository ratings,
        IDriversClient drivers,
        IAuthClient auth,
        IOutboxRepository outbox)
    {
        _trips = trips;
        _ratings = ratings;
        _drivers = drivers;
        _auth = auth;
        _outbox = outbox;
    }

    public async Task<TripRatingDto> Handle(CreateRatingCommand cmd, CancellationToken ct)
    {
        // 1. Validar viaje
        var trip = await _trips.GetByIdAsync(cmd.TripId, ct)
            ?? throw new KeyNotFoundException("Viaje no encontrado.");

        if(trip.PassengerId != cmd.PassengerId)
            throw new UnauthorizedAccessException(
                "Solo el pasajero del viaje puede calificarlo.");

        if(trip.Status != TripStatus.Completed)
            throw new InvalidOperationException(
                "Solo puedes calificar viajes completados.");

        if(trip.DriverId is null)
            throw new InvalidOperationException(
                "Este viaje no tiene conductor asignado.");

        // 2. Crear y persistir.
        // La entidad TripRating.Create valida rango 1..5 y trunca comment.
        var rating = TripRating.Create(
            tripId: cmd.TripId,
            passengerId: cmd.PassengerId,
            driverId: trip.DriverId.Value,
            stars: cmd.Stars,
            comment: cmd.Comment);

        var saved = await _ratings.AddAsync(rating, ct);
        if(saved is null)
            throw new InvalidOperationException(
                "Este viaje ya fue calificado.");

        // 3. Notificar a Drivers (cross-service) para actualizar promedio.
        // Si falla, no abortamos: el rating ya está en BD.
        await _drivers.AddDriverRatingAsync(trip.DriverId.Value, cmd.Stars, ct);

        // 4. Avisar a Rewards por la bandeja de salida.
        //    Va en try/catch: la calificacion ya quedo guardada y no se puede
        //    perder por culpa del programa de puntos.
        try
        {
            await _outbox.AddAsync(OutboxEvent.TripRated(
                tripId:      saved.TripId,
                passengerId: saved.PassengerId,
                driverId:    saved.DriverId,
                stars:       saved.Stars), ct);
        }
        catch
        {
            // Sin puntos por esta calificacion, pero la calificacion esta.
        }

        // 5. Resolver el nombre del pasajero (el conductor lo verá en su historial).
        var users = await _auth.GetUsersByIdsAsync(new[] { cmd.PassengerId }, ct);
        var passengerName = users.TryGetValue(cmd.PassengerId, out var u)
            ? u.FullName
            : "Pasajero";

        return new TripRatingDto(
            saved.Id, saved.TripId, saved.PassengerId, passengerName,
            saved.DriverId, saved.Stars, saved.Comment, saved.CreatedAt);
    }
}
