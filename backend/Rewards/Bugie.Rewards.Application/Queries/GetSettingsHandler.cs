using MediatR;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Application.Queries;

public class GetSettingsHandler : IRequestHandler<GetSettingsQuery, List<RewardSettingDto>>
{
    private readonly IRewardSettingsRepository _settings;
    public GetSettingsHandler(IRewardSettingsRepository settings) => _settings = settings;

    public async Task<List<RewardSettingDto>> Handle(GetSettingsQuery q, CancellationToken ct)
    {
        var all = await _settings.GetAllAsync(ct);
        return all.Select(s => new RewardSettingDto(
            s.SettingKey, s.Value, s.Description, s.UpdatedAt)).ToList();
    }
}
