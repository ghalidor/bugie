using MediatR;
using Bugie.Trips.Application.DTOs;
using Bugie.Trips.Domain.Entities;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Application.Commands;

public record CreateIncidentCommand(
    Guid TripId,
    Guid UserId,
    string Role,
    string Description) : IRequest<IncidentDto>;

public class CreateIncidentHandler : IRequestHandler<CreateIncidentCommand, IncidentDto>
{
    private readonly IIncidentRepository _incidents;
    private readonly ITripRepository _trips;

    public CreateIncidentHandler(IIncidentRepository incidents, ITripRepository trips)
    {
        _incidents = incidents;
        _trips = trips;
    }

    public async Task<IncidentDto> Handle(CreateIncidentCommand cmd, CancellationToken ct)
    {
        // Validaciones de descripción
        if(string.IsNullOrWhiteSpace(cmd.Description))
            throw new ArgumentException("Describe la incidencia.");
        var clean = cmd.Description.Trim();
        if(clean.Length > 1000)
            throw new ArgumentException("La descripción no puede exceder 1000 caracteres.");

        // Validar rol
        if(cmd.Role != "passenger" && cmd.Role != "driver")
            throw new ArgumentException("Solo pasajeros o conductores pueden reportar incidencias.");

        // Validar que el viaje exista
        var trip = await _trips.GetByIdAsync(cmd.TripId, ct)
            ?? throw new KeyNotFoundException("Viaje no encontrado.");

        // Validar que el usuario participó del viaje
        var isParticipant = cmd.Role == "passenger"
            ? trip.PassengerId == cmd.UserId
            : trip.DriverId.HasValue && trip.DriverId.Value == cmd.UserId;
        // Nota: para driver guardamos UserId, no DriverId. Si tu Trip.DriverId guarda
        // el DriverId (no UserId), esto puede no calzar. Lo dejamos así porque en el
        // resto del sistema Trip.DriverId apunta al UserId del conductor.
        if(!isParticipant)
            throw new UnauthorizedAccessException("Solo puedes reportar incidencias de tus propios viajes.");

        // Validar que no exista ya una incidencia del mismo rol en este viaje
        var existing = await _incidents.GetByTripAndRoleAsync(cmd.TripId, cmd.Role, ct);
        if(existing is not null)
            throw new InvalidOperationException("Ya reportaste una incidencia para este viaje.");

        var incident = Incident.Create(cmd.TripId, cmd.UserId, cmd.Role, clean);
        await _incidents.AddAsync(incident, ct);

        return new IncidentDto(
            incident.Id,
            incident.TripId,
            incident.ReportedByUserId,
            incident.ReportedByRole,
            incident.Description,
            incident.CreatedAt,
            ReportedByName: null);
    }
}