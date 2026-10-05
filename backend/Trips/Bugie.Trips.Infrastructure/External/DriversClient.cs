using System.Net.Http.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Bugie.Trips.Domain.External;

namespace Bugie.Trips.Infrastructure.External;

public class DriversClient : IDriversClient
{
    private readonly HttpClient _http;
    private readonly IHttpContextAccessor _httpContext;
    private readonly IConfiguration _cfg;

    public DriversClient(HttpClient http, IHttpContextAccessor httpContext, IConfiguration cfg)
    {
        _http = http;
        _httpContext = httpContext;
        _cfg = cfg;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Vehículos activos (por UserId del conductor)
    // ─────────────────────────────────────────────────────────────────────
    public async Task<Dictionary<Guid, VehicleInfoDto>> GetVehiclesByDriverUserIdsAsync(
        IEnumerable<Guid> driverUserIds, CancellationToken ct = default)
    {
        var idList = driverUserIds?.Distinct().ToList() ?? new List<Guid>();
        if(idList.Count == 0) return new Dictionary<Guid, VehicleInfoDto>();

        var query = string.Join("&", idList.Select(id => $"ids={id}"));
        using var req = new HttpRequestMessage(HttpMethod.Get, $"api/drivers/bulk-vehicles?{query}");
        ForwardAuth(req);

        try
        {
            using var res = await _http.SendAsync(req, ct);
            if(!res.IsSuccessStatusCode) return new Dictionary<Guid, VehicleInfoDto>();
            var list = await res.Content.ReadFromJsonAsync<List<VehicleInfoDto>>(cancellationToken: ct);
            return list?.ToDictionary(v => v.DriverUserId) ?? new Dictionary<Guid, VehicleInfoDto>();
        }
        catch(Exception e)
        {
            Console.WriteLine(e.Message);
            return new Dictionary<Guid, VehicleInfoDto>();
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Estado del conductor (validar que esté aprobado antes de aceptar viaje)
    // ─────────────────────────────────────────────────────────────────────
    public Task<DriverStatusDto?> GetDriverStatusAsync(Guid driverId, CancellationToken ct = default) =>
        FetchStatusAsync($"api/drivers/{driverId}/detail", isDetail: true, ct);

    public Task<DriverStatusDto?> GetDriverStatusByUserIdAsync(Guid userId, CancellationToken ct = default) =>
        FetchStatusAsync($"api/drivers/by-user/{userId}/status", isDetail: false, ct);

    private async Task<DriverStatusDto?> FetchStatusAsync(string url, bool isDetail, CancellationToken ct)
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, url);
        ForwardAuth(req);

        try
        {
            using var res = await _http.SendAsync(req, ct);
            if(!res.IsSuccessStatusCode) return null;

            if(isDetail)
            {
                var detail = await res.Content.ReadFromJsonAsync<DriverDetailResponse>(cancellationToken: ct);
                var d = detail?.Driver;
                return d is null ? null : new DriverStatusDto(d.Id, d.UserId, d.Status);
            }
            else
            {
                var s = await res.Content.ReadFromJsonAsync<DriverStatusPayload>(cancellationToken: ct);
                return s is null ? null : new DriverStatusDto(s.Id, s.UserId, s.Status);
            }
        }
        catch(Exception e)
        {
            Console.WriteLine($"Error consultando estado: {e.Message}");
            return null;
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Info enriquecida (foto, rating, vehículo con foto) — historial de viajes
    // Recibe UserIds (no DriverIds) porque Trip.DriverId guarda históricamente
    // el UserId del conductor, no el DriverId.
    // ─────────────────────────────────────────────────────────────────────
    public async Task<Dictionary<Guid, DriverTripInfoDto>> GetDriverTripInfoAsync(
        IEnumerable<Guid> userIds, CancellationToken ct = default)
    {
        var idList = userIds?.Distinct().ToList() ?? new List<Guid>();
        if(idList.Count == 0) return new Dictionary<Guid, DriverTripInfoDto>();

        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, "api/drivers/internal/trip-info");
            req.Headers.Add("X-Internal-Token", _cfg["InternalToken"] ?? "");
            req.Content = JsonContent.Create(new { UserIds = idList });

            using var res = await _http.SendAsync(req, ct);
            if(!res.IsSuccessStatusCode) return new Dictionary<Guid, DriverTripInfoDto>();

            var list = await res.Content.ReadFromJsonAsync<List<DriverTripInfoDto>>(cancellationToken: ct);
            // Indexamos por UserId (no DriverId) porque eso es lo que Trip.DriverId nos da
            return list?.ToDictionary(d => d.UserId) ?? new Dictionary<Guid, DriverTripInfoDto>();
        }
        catch(Exception e)
        {
            Console.WriteLine($"GetDriverTripInfoAsync error: {e.Message}");
            return new Dictionary<Guid, DriverTripInfoDto>();
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Última posición del conductor (usado por el pasajero durante el viaje)
    // ─────────────────────────────────────────────────────────────────────
    public async Task<DriverLocationDto?> GetDriverLocationByUserIdAsync(
        Guid userId, CancellationToken ct = default)
    {
        using var req = new HttpRequestMessage(
            HttpMethod.Get, $"api/drivers/by-user/{userId}/location");
        ForwardAuth(req);

        try
        {
            using var res = await _http.SendAsync(req, ct);
            if(!res.IsSuccessStatusCode) return null;

            var payload = await res.Content
                .ReadFromJsonAsync<DriverLocationDto>(cancellationToken: ct);
            // El backend devuelve null si no hay posición. Lo propagamos.
            return payload;
        }
        catch(Exception e)
        {
            // No bloquear el viaje si la API de Drivers está caída.
            // El pasajero simplemente no ve la posición del conductor por un poll.
            Console.WriteLine($"GetDriverLocationByUserIdAsync error: {e.Message}");
            return null;
        }
    }

    /// <summary>
    /// POST /api/internal/drivers/add-rating
    /// Endpoint interno protegido por X-Internal-Token. Drivers.Api actualizará
    /// Driver.Rating (promedio incremental) y Driver.TotalRatings.
    /// </summary>
    public async Task<bool> AddDriverRatingAsync(
        Guid driverUserId, byte stars, CancellationToken ct = default)
    {
        try
        {
            using var req = new HttpRequestMessage(
                HttpMethod.Post, "api/drivers/internal/add-rating");
            req.Headers.Add("X-Internal-Token", _cfg["InternalToken"] ?? "");
            req.Content = JsonContent.Create(new { driverUserId, stars });

            using var res = await _http.SendAsync(req, ct);
            return res.IsSuccessStatusCode;
        }
        catch(Exception e)
        {
            // No bloqueamos la calificación si Drivers está caído: el rating
            // queda en trips.TripRatings y el promedio podría recalcularse
            // después. Mejor que falle silenciosamente que romper el flujo.
            Console.WriteLine($"AddDriverRatingAsync error: {e.Message}");
            return false;
        }
    }

    /// <summary>
    /// GET /api/drivers/nearby?lat=...&lng=...&radiusKm=...&maxResults=...
    /// Endpoint público de Drivers.Api. Devuelve los conductores online
    /// dentro del radio especificado. Extraemos solo los UserId para
    /// pasarlos al FcmSender.
    /// </summary>
    public async Task<List<Guid>> GetNearbyDriverUserIdsAsync(
        double lat, double lng, double radiusKm, int maxResults = 20,
        CancellationToken ct = default)
    {
        try
        {
            // IMPORTANTE: usar InvariantCulture para serializar los doubles con
            // punto decimal (-18.012 y no -18,012). Si no, el server recibe
            // valores fuera de rango y falla geography::Point.
            var inv = System.Globalization.CultureInfo.InvariantCulture;
            var url = $"api/drivers/nearby?lat={lat.ToString(inv)}&lng={lng.ToString(inv)}" +
                      $"&radiusKm={radiusKm.ToString(inv)}&maxResults={maxResults}";
            using var req = new HttpRequestMessage(HttpMethod.Get, url);
            // nearby ya no es anonimo: Trips se identifica como modulo interno.
            req.Headers.Add("X-Internal-Token", _cfg["InternalToken"] ?? "");

            using var res = await _http.SendAsync(req, ct);
            if(!res.IsSuccessStatusCode) return new List<Guid>();

            // La respuesta es List<NearbyDriverResponse> con un campo UserId.
            // Solo deserializamos lo que necesitamos.
            var list = await res.Content
                .ReadFromJsonAsync<List<NearbyDriverMinimal>>(cancellationToken: ct);
            return list?
                .Where(d => d.UserId != Guid.Empty)
                .Select(d => d.UserId)
                .Distinct()
                .ToList()
                ?? new List<Guid>();
        }
        catch(Exception e)
        {
            Console.WriteLine($"GetNearbyDriverUserIdsAsync error: {e.Message}");
            return new List<Guid>();
        }
    }

    // DTO mínimo solo con el UserId — no nos importa el resto del payload
    // (rating, plate, etc) para FCM.
    private record NearbyDriverMinimal(Guid UserId);

    // ─────────────────────────────────────────────────────────────────────
    private void ForwardAuth(HttpRequestMessage req)
    {
        var token = _httpContext.HttpContext?.Request.Headers["Authorization"].ToString();
        if(!string.IsNullOrEmpty(token)) req.Headers.Add("Authorization", token);
        // Drivers restringe detalle y ubicacion al propio conductor/admin; Trips
        // ya autorizo al usuario, asi que se identifica como modulo interno.
        req.Headers.Add("X-Internal-Token", _cfg["InternalToken"] ?? "");
    }

    /// <summary>
    /// GET /api/drivers/internal/trips/{tripId}/path (X-Internal-Token).
    /// </summary>
    public async Task<List<TripPathPointDto>> GetTripPathAsync(Guid tripId, CancellationToken ct = default)
    {
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, $"api/drivers/internal/trips/{tripId}/path");
            req.Headers.Add("X-Internal-Token", _cfg["InternalToken"] ?? "");
            using var res = await _http.SendAsync(req, ct);
            if(!res.IsSuccessStatusCode) return new List<TripPathPointDto>();
            return await res.Content.ReadFromJsonAsync<List<TripPathPointDto>>(cancellationToken: ct)
                ?? new List<TripPathPointDto>();
        }
        catch(Exception e)
        {
            Console.WriteLine($"GetTripPathAsync error: {e.Message}");
            return new List<TripPathPointDto>();
        }
    }

    private record DriverDetailResponse(DriverPayload? Driver);
    private record DriverPayload(Guid Id, Guid UserId, int Status);
    private record DriverStatusPayload(Guid Id, Guid UserId, int Status);
}