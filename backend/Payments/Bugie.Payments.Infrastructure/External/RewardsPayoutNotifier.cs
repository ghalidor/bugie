using System.Net.Http.Json;
using Bugie.Payments.Domain.Entities;
using Bugie.Payments.Domain.External;

namespace Bugie.Payments.Infrastructure.External;

/// <summary>
/// POST {Services:RewardsApi}/api/rewards/internal/notify/payout
/// (BaseAddress y X-Internal-Token los configura Program.cs).
/// </summary>
public class RewardsPayoutNotifier : IPayoutNotifier
{
    private readonly HttpClient _http;
    public RewardsPayoutNotifier(HttpClient http) => _http = http;

    public async Task NotifyAsync(Withdrawal p)
    {
        try
        {
            using var res = await _http.PostAsJsonAsync("api/rewards/internal/notify/payout", new
            {
                userId          = p.DriverId,
                amount          = p.Amount,
                method          = p.Method,
                operationNumber = p.OperationNumber,
                sourceType      = p.SourceType,
                note            = p.Note,
            });
        }
        catch
        {
            // No es critico: el pago ya esta registrado y el conductor lo ve en Ganancias.
        }
    }
}
