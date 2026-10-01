using MediatR;
using Bugie.Rewards.Application.DTOs;

namespace Bugie.Rewards.Application.Commands;

/// <summary>
/// Marca un cupon como usado.
/// Lo llama el admin al entregar un premio, o Trips al aplicar un descuento.
/// </summary>
public record UseRedemptionCommand(string Code, Guid? ReferenceId, string? Note)
    : IRequest<RedemptionDto>;
