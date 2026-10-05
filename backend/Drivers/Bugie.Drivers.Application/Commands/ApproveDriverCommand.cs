using MediatR;
using Bugie.Drivers.Application.DTOs;

namespace Bugie.Drivers.Application.Commands;

/// <summary>
/// Aprobar conductor. Reason es obligatorio solo si los documentos NO están
/// completos (aprobación por excepción). AdminUserId/AdminName salen del token.
/// </summary>
public record ApproveDriverCommand(
    Guid DriverId,
    string? Reason = null,
    Guid? AdminUserId = null,
    string? AdminName = null) : IRequest<DriverDto>;
