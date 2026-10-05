using MediatR;
using Bugie.Rewards.Application.DTOs;

namespace Bugie.Rewards.Application.Queries;

/// <summary>Admin: todos los sorteos, con sus ganadores.</summary>
public record GetRafflesQuery : IRequest<List<RaffleDto>>;
