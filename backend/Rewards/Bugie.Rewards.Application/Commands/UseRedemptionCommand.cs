using MediatR;
using Bugie.Rewards.Application.DTOs;

namespace Bugie.Rewards.Application.Commands;

/// <summary>
/// Marca un cupon como usado.
/// Lo llama el admin al entregar un premio, o Trips al aplicar un descuento.
/// NotifyUser = true solo cuando el admin lo marca como entregado a mano
/// (push + bandeja). Trips y el pago con codigo no avisan desde aqui: el
/// pago con codigo ya avisa con NotifyPayoutCommand.
/// </summary>
public record UseRedemptionCommand(string Code, Guid? ReferenceId, string? Note, bool NotifyUser = false)
    : IRequest<RedemptionDto>;
