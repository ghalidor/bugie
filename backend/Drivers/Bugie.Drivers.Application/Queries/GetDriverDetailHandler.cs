using MediatR;
using Bugie.Drivers.Application.Commands;
using Bugie.Drivers.Application.DTOs;
using Bugie.Drivers.Domain.External;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Application.Queries;

/// <summary>
/// Devuelve el detalle completo del conductor: sus datos del módulo
/// Drivers (vehículos, documentos) + info del usuario (nombre, email,
/// teléfono) obtenida vía HTTP contra el módulo Auth.
/// </summary>
public class GetDriverDetailHandler : IRequestHandler<GetDriverDetailQuery, DriverDetailDto?>
{
    private readonly IDriverRepository _drivers;
    private readonly IVehicleRepository _vehicles;
    private readonly IDocumentRepository _docs;
    private readonly IAuthClient _auth;

    public GetDriverDetailHandler(
        IDriverRepository d,
        IVehicleRepository v,
        IDocumentRepository docs,
        IAuthClient auth)
        => (_drivers, _vehicles, _docs, _auth) = (d, v, docs, auth);

    public async Task<DriverDetailDto?> Handle(GetDriverDetailQuery q, CancellationToken ct)
    {
        var driver = await _drivers.GetByIdAsync(q.DriverId, ct);
        if(driver is null) return null;

        var vehicles = await _vehicles.GetByDriverAsync(q.DriverId, ct);
        var docs = await _docs.GetByDriverAsync(q.DriverId, ct);

        // Traemos la info del USUARIO desde Auth (nombre, email, teléfono).
        // Antes este detail devolvía FullName vacío y el frontend no podía
        // mostrar info real del conductor.
        //
        // OJO: este endpoint también lo consume Trips.Api (DriversClient.
        // GetDriverStatusAsync) antes de aceptar un viaje. Si la llamada
        // a Auth falla por cualquier motivo (red, timeout, Auth caído),
        // NO podemos romper el detail con 500 — sino el conductor no
        // puede aceptar viajes. Por eso encerramos en try/catch y, si
        // falla, simplemente seguimos sin la info del usuario.
        Bugie.Drivers.Domain.External.UserInfoDto? userInfo = null;
        try
        {
            var users = await _auth.GetUsersByIdsAsync(new[] { driver.UserId }, ct);
            userInfo = users.GetValueOrDefault(driver.UserId);
        }
        catch(Exception ex)
        {
            // Log y seguir: el detail no debe morir solo por no poder
            // enriquecer con datos de Auth.
            Console.WriteLine($"GetDriverDetailHandler: Auth lookup falló: {ex.Message}");
        }

        // Enriquecemos el DriverDto con el FullName del usuario (antes
        // venía vacío de ToDto). Si no encontramos el usuario, fallback.
        var driverDto = RegisterDriverHandler.ToDto(driver) with
        {
            FullName = userInfo?.FullName ?? "Conductor"
        };

        return new DriverDetailDto(
            driverDto,
            vehicles.Select(v => new VehicleDto(
                v.Id, v.DriverId, v.Plate, v.Brand, v.Model, v.Year, v.Color, v.IsActive,
                v.PhotoUrl)).ToList(),
            docs.Select(d => new DocumentDto(
                d.Id, d.DriverId, d.DocType, d.FileUrl, d.Status, d.ExpiresAt,
                d.OriginalFileName, d.MimeType, d.RejectionReason)).ToList(),
            userInfo);
    }
}