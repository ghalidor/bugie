using MediatR;
using Bugie.Landing.Application.DTOs;
using Bugie.Landing.Application.Email;
using Bugie.Landing.Domain.Interfaces;

namespace Bugie.Landing.Application.Commands;

/// <summary>
/// Guarda los datos legales de la empresa en landing.systemsettings.
/// LogoUrl null = no se toca el logo (se cambia con la subida de imagen);
/// "" = quitar el logo.
/// </summary>
public record UpdateCompanyCommand(
    string? LegalName, string? Ruc, string? Address, string? LogoUrl, Guid UpdatedBy)
    : IRequest<CompanyInfoDto>;

public class UpdateCompanyHandler : IRequestHandler<UpdateCompanyCommand, CompanyInfoDto>
{
    private readonly ISettingsRepository _settings;
    public UpdateCompanyHandler(ISettingsRepository settings) => _settings = settings;

    public async Task<CompanyInfoDto> Handle(UpdateCompanyCommand cmd, CancellationToken ct)
    {
        var name = (cmd.LegalName ?? "").Trim();
        var ruc = (cmd.Ruc ?? "").Trim();
        var address = (cmd.Address ?? "").Trim();

        if(name.Length == 0) throw new ArgumentException("La razón social es obligatoria.");
        if(name.Length > 200) throw new ArgumentException("La razón social admite como máximo 200 caracteres.");
        if(ruc.Length > 0 && !(ruc.Length == 11 && ruc.All(char.IsDigit)))
            throw new ArgumentException("El RUC debe tener 11 dígitos.");
        if(address.Length > 300) throw new ArgumentException("La dirección admite como máximo 300 caracteres.");

        await Set("company_legal_name", name, cmd.UpdatedBy, ct);
        await Set("company_ruc", ruc, cmd.UpdatedBy, ct);
        await Set("company_address", address, cmd.UpdatedBy, ct);
        if(cmd.LogoUrl is not null)
            await Set("company_logo_url", cmd.LogoUrl.Trim(), cmd.UpdatedBy, ct);

        return await CompanyInfo.LoadAsync(_settings, ct);
    }

    private async Task Set(string key, string value, Guid by, CancellationToken ct)
    {
        var s = await _settings.GetByKeyAsync(key, ct)
            ?? throw new InvalidOperationException(
                $"Falta la clave '{key}'. Ejecuta backend/scripts/2026-10-03_reclamaciones.sql.");
        if(s.Value == value) return;
        s.Update(value, by);
        await _settings.UpdateAsync(s, ct);
    }
}
