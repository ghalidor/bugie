namespace Bugie.Trips.Application.DTOs;

public record CreateIncidentRequest(string Description);

public record IncidentDto(
    Guid Id,
    Guid TripId,
    Guid ReportedByUserId,
    string ReportedByRole,
    string Description,
    DateTime CreatedAt,
    string? ReportedByName);   // opcional: nombre del autor (enriquecido para admin)