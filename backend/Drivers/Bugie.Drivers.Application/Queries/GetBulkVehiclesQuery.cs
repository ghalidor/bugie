using Bugie.Drivers.Domain.Interfaces;
using MediatR;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Bugie.Drivers.Application.Queries
{
    public record GetBulkVehiclesQuery(IEnumerable<Guid> DriverUserIds)
    : IRequest<List<VehicleBulkDto>>;

    public class GetBulkVehiclesHandler
        : IRequestHandler<GetBulkVehiclesQuery, List<VehicleBulkDto>>
    {
        private readonly IDriverRepository _drivers;
        public GetBulkVehiclesHandler(IDriverRepository drivers) => _drivers = drivers;

        public Task<List<VehicleBulkDto>> Handle(GetBulkVehiclesQuery q, CancellationToken ct) =>
            _drivers.GetVehiclesByUserIdsAsync(q.DriverUserIds, ct);
    }
}
