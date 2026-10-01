using MediatR;
using Bugie.Rewards.Application.DTOs;

namespace Bugie.Rewards.Application.Queries;

public record GetSettingsQuery : IRequest<List<RewardSettingDto>>;
