using System.Net.Http.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Bugie.Auth.Domain.External;

namespace Bugie.Auth.Infrastructure.External;

public class RewardsClientOptions
{
    public string BaseUrl       { get; set; } = "http://127.0.0.1:5006/";
    public string InternalToken { get; set; } = string.Empty;
}

/// <summary>
/// Cliente hacia Rewards. Mismo patrón que DriversClient.
///
/// Diferencia importante con el de conductores: ahí, si falla, se revierte el
/// registro. Acá NO. Un referido que no se registró es una molestia; un
/// usuario que no pudo crear su cuenta es perder un cliente.
/// </summary>
public class RewardsClient : IRewardsClient
{
    private readonly HttpClient _http;
    private readonly RewardsClientOptions _opt;
    private readonly ILogger<RewardsClient> _log;

    public RewardsClient(
        HttpClient http, IOptions<RewardsClientOptions> opt, ILogger<RewardsClient> log)
    {
        _http = http;
        _opt  = opt.Value;
        _log  = log;

        if (!string.IsNullOrWhiteSpace(_opt.InternalToken))
            _http.DefaultRequestHeaders.TryAddWithoutValidation(
                "X-Internal-Token", _opt.InternalToken);
    }

    public async Task<bool> RegisterReferralAsync(
        Guid newUserId, string userType, string code, string email,
        CancellationToken ct = default)
    {
        try
        {
            var res = await _http.PostAsJsonAsync("api/rewards/internal/referral", new
            {
                newUserId,
                newUserType  = userType,
                code,
                newUserEmail = email,
            }, ct);

            if (res.IsSuccessStatusCode) return true;

            _log.LogWarning(
                "Rewards respondió {Status} al registrar el referido de {UserId}",
                (int)res.StatusCode, newUserId);
            return false;
        }
        catch (Exception ex)
        {
            // El usuario ya existe. Esto no puede tumbar el registro.
            _log.LogError(ex, "No se pudo avisar a Rewards del referido de {UserId}", newUserId);
            return false;
        }
    }
}
