using Bugie.Drivers.Application.DTOs;
using MediatR;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Bugie.Drivers.Application.Queries
{
    public record GetAllDriversQuery() : IRequest<List<DriverDto>>;
}
