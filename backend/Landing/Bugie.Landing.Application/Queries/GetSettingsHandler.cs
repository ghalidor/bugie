using MediatR;
using Bugie.Landing.Domain.Entities;
using Bugie.Landing.Domain.Interfaces;

namespace Bugie.Landing.Application.Queries;

public class GetSettingsHandler : IRequestHandler<GetSettingsQuery, List<SystemSetting>>
{
    private readonly ISettingsRepository _settings;
    public GetSettingsHandler(ISettingsRepository s) => _settings = s;

    public Task<List<SystemSetting>> Handle(GetSettingsQuery q, CancellationToken ct) =>
        _settings.GetAllAsync(ct);
}
