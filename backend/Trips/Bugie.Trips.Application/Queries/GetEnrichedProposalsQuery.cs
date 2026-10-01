using Bugie.Trips.Application.DTOs;
using MediatR;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Bugie.Trips.Application.Queries
{
    /// <summary>
    /// Devuelve las propuestas pending de un viaje, enriquecidas con nombre del
    /// conductor, datos del vehículo y tendencia respecto a la propuesta anterior.
    /// </summary>
    public record GetEnrichedProposalsQuery(Guid TripId) : IRequest<List<ProposalDto>>;
}
