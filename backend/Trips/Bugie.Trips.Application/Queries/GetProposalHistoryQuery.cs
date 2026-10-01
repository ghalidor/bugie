using Bugie.Trips.Application.DTOs;
using Bugie.Trips.Domain.Interfaces;
using MediatR;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Bugie.Trips.Application.Queries
{
    public record GetProposalHistoryQuery(Guid TripId, Guid DriverId)
        : IRequest<List<ProposalHistoryDto>>;

    public class GetProposalHistoryHandler
        : IRequestHandler<GetProposalHistoryQuery, List<ProposalHistoryDto>>
    {
        private readonly ITripProposalRepository _proposals;
        public GetProposalHistoryHandler(ITripProposalRepository proposals) => _proposals = proposals;

        public async Task<List<ProposalHistoryDto>> Handle(
            GetProposalHistoryQuery q, CancellationToken ct)
        {
            var rows = await _proposals.GetHistoryByDriverAsync(q.TripId, q.DriverId, ct);
            return rows.Select(p => new ProposalHistoryDto(
                p.Id, p.Fare, p.Status, p.CreatedAt,
                p.ProposedByRole, p.RejectedBy)).ToList();
        }
    }
}