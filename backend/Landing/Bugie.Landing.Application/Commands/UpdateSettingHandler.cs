using MediatR;
using Bugie.Landing.Domain.Interfaces;

namespace Bugie.Landing.Application.Commands;

public class UpdateSettingHandler : IRequestHandler<UpdateSettingCommand, bool>
{
    private readonly ISettingsRepository _settings;
    public UpdateSettingHandler(ISettingsRepository s) => _settings = s;

    public async Task<bool> Handle(UpdateSettingCommand cmd, CancellationToken ct)
    {
        var setting = await _settings.GetByKeyAsync(cmd.Key, ct)
            ?? throw new KeyNotFoundException($"Configuración '{cmd.Key}' no encontrada.");
        setting.Update(cmd.Value, cmd.UpdatedBy);
        await _settings.UpdateAsync(setting, ct);
        return true;
    }
}
