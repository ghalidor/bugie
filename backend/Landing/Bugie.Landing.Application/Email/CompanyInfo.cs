using Bugie.Landing.Application.DTOs;
using Bugie.Landing.Application.Services;
using Bugie.Landing.Domain.Interfaces;

namespace Bugie.Landing.Application.Email;

/// <summary>
/// Lee los datos de la empresa desde landing.systemsettings (unica fuente).
/// Si la razon social esta vacia se usa "InteliaDevs S.A.C." (texto historico).
/// Incluye el plazo vigente del Libro de Reclamaciones para el formulario publico.
/// </summary>
public static class CompanyInfo
{
    public const string DefaultLegalName = "InteliaDevs S.A.C.";

    public static readonly string[] Keys =
        ["company_legal_name", "company_ruc", "company_address", "company_logo_url"];

    public static async Task<CompanyInfoDto> LoadAsync(ISettingsRepository settings, CancellationToken ct)
    {
        var all = await settings.GetAllAsync(ct);
        string Get(string key) =>
            all.FirstOrDefault(s => string.Equals(s.SettingKey, key, StringComparison.OrdinalIgnoreCase))
               ?.Value?.Trim() ?? "";

        var name = Get("company_legal_name");
        var city = Get("default_city");
        if(city.Length > 0) city = char.ToUpper(city[0]) + city[1..].ToLower();

        return new CompanyInfoDto(
            LegalName: name.Length > 0 ? name : DefaultLegalName,
            Ruc: Get("company_ruc"),
            Address: Get("company_address"),
            LogoUrl: Get("company_logo_url"),
            SupportEmail: Get("support_email"),
            SupportPhone: Get("support_phone"),
            City: city,
            ComplaintResponseDays: ComplaintPolicy.ReadResponseDays(all));
    }
}

/// <summary>URL publica de la web (para los enlaces de los correos). App:WebBaseUrl.</summary>
public record LandingLinks(string WebBaseUrl)
{
    public string ComplaintUrl(string code, string token) =>
        $"{WebBaseUrl.TrimEnd('/')}/libro-reclamaciones/consulta/{Uri.EscapeDataString(code)}?t={Uri.EscapeDataString(token)}";
}
