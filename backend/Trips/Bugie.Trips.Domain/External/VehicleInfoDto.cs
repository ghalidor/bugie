using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Bugie.Trips.Domain.External
{
    /// <summary>
    /// Datos del vehículo activo de un conductor expuestos por Drivers.Api.
    /// </summary>
    public record VehicleInfoDto(
        Guid DriverUserId,
        string Plate,
        string Brand,
        string Model,
        string Color);

}
