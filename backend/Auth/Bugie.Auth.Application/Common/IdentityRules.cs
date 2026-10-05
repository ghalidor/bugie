using System.Text.RegularExpressions;
using Bugie.Auth.Domain.Common;
using Bugie.Auth.Domain.Interfaces;

namespace Bugie.Auth.Application.Common;

/// <summary>
/// Reglas del documento de identidad, los nombres separados y la contraseña.
/// Las usan el registro, la creación de admins, el completado de perfil y las
/// correcciones del admin. Errores de formato = InvalidOperationException (400);
/// documento ya usado = ConflictException (409).
/// </summary>
public static class IdentityRules
{
    public static readonly string[] DocTypes = ["DNI", "CE", "PASAPORTE"];

    public const int FirstNamesMax = 60;
    public const int LastNameMax = 40;
    public const int PasswordMin = 8;
    public const int PasswordMax = 100;
    public const int ReasonMin = 10;
    public const int ReasonMax = 500;

    public const string DocumentInUseMessage =
        "Ya existe una cuenta con este documento. Si es tuya, inicia sesión o contacta a soporte.";

    private static readonly Regex Dni = new(@"^\d{8}$", RegexOptions.Compiled);
    private static readonly Regex Ce = new(@"^[A-Z0-9]{9,12}$", RegexOptions.Compiled);
    private static readonly Regex Passport = new(@"^[A-Z0-9]{6,12}$", RegexOptions.Compiled);
    // Letras (con tildes y ñ), espacios, apóstrofo, punto y guion.
    private static readonly Regex NamePattern = new(@"^\p{L}[\p{L}\p{M} '.\-]*$", RegexOptions.Compiled);

    /// <summary>Valida y normaliza (mayúsculas, sin espacios). Devuelve (tipo, número).</summary>
    public static (string DocType, string DocNumber) NormalizeDocument(string? docType, string? docNumber)
    {
        var type = (docType ?? string.Empty).Trim().ToUpperInvariant();
        if(!DocTypes.Contains(type))
            throw new InvalidOperationException("Tipo de documento inválido. Usa DNI, CE o PASAPORTE.");

        var number = Regex.Replace(docNumber ?? string.Empty, @"\s+", string.Empty).ToUpperInvariant();
        if(number.Length == 0)
            throw new InvalidOperationException("El número de documento es obligatorio.");

        var ok = type switch
        {
            "DNI" => Dni.IsMatch(number),
            "CE" => Ce.IsMatch(number),
            _ => Passport.IsMatch(number),
        };
        if(!ok)
            throw new InvalidOperationException(type switch
            {
                "DNI" => "El DNI debe tener 8 dígitos.",
                "CE" => "El carné de extranjería debe tener entre 9 y 12 caracteres (solo letras y números).",
                _ => "El pasaporte debe tener entre 6 y 12 caracteres (solo letras y números).",
            });

        return (type, number);
    }

    /// <summary>
    /// Valida y normaliza los nombres (trim, espacios simples).
    /// Nombres y apellido paterno obligatorios; materno opcional (extranjeros con un apellido).
    /// </summary>
    public static (string FirstNames, string LastNamePaternal, string? LastNameMaternal) NormalizeNames(
        string? firstNames, string? lastNamePaternal, string? lastNameMaternal)
    {
        var first = Clean(firstNames);
        var paternal = Clean(lastNamePaternal);
        var maternal = Clean(lastNameMaternal);

        if(first.Length == 0)
            throw new InvalidOperationException("Los nombres son obligatorios.");
        if(paternal.Length == 0)
            throw new InvalidOperationException("El apellido paterno es obligatorio.");

        CheckName(first, FirstNamesMax, "Los nombres");
        CheckName(paternal, LastNameMax, "El apellido paterno");
        if(maternal.Length > 0)
            CheckName(maternal, LastNameMax, "El apellido materno");

        return (first, paternal, maternal.Length == 0 ? null : maternal);
    }

    /// <summary>Misma regla de contraseña que el registro (mínimo 8, máximo 100).</summary>
    public static void ValidatePassword(string? password)
    {
        if(string.IsNullOrWhiteSpace(password) || password.Length < PasswordMin)
            throw new InvalidOperationException($"La contraseña debe tener al menos {PasswordMin} caracteres.");
        if(password.Length > PasswordMax)
            throw new InvalidOperationException($"La contraseña no puede superar {PasswordMax} caracteres.");
    }

    /// <summary>Motivo obligatorio del admin (10 a 500 caracteres).</summary>
    public static string ValidateReason(string? reason)
    {
        var r = reason?.Trim() ?? string.Empty;
        if(r.Length < ReasonMin)
            throw new InvalidOperationException($"El motivo es obligatorio (mínimo {ReasonMin} caracteres).");
        if(r.Length > ReasonMax)
            throw new InvalidOperationException($"El motivo no puede superar {ReasonMax} caracteres.");
        return r;
    }

    /// <summary>409 si otra cuenta NO eliminada ya usa el documento.</summary>
    public static async Task EnsureDocumentFreeAsync(IUserRepository users, string docType, string docNumber,
        Guid? excludeUserId, CancellationToken ct)
    {
        if(await users.GetActiveByDocumentAsync(docType, docNumber, excludeUserId, ct) is not null)
            throw new ConflictException(DocumentInUseMessage);
    }

    public static string DocumentText(string? docType, string? docNumber) =>
        string.IsNullOrWhiteSpace(docType) ? "(sin documento)" : $"{docType} {docNumber}";

    public static string NamesText(string? firstNames, string? paternal, string? maternal) =>
        $"Nombres: {firstNames ?? "-"} | Paterno: {paternal ?? "-"} | Materno: {maternal ?? "-"}";

    private static string Clean(string? value) =>
        Regex.Replace(value ?? string.Empty, @"\s+", " ").Trim();

    private static void CheckName(string value, int max, string field)
    {
        if(value.Length > max)
            throw new InvalidOperationException($"{field}: máximo {max} caracteres.");
        if(!NamePattern.IsMatch(value))
            throw new InvalidOperationException($"{field}: solo se permiten letras, espacios, apóstrofo, punto y guion.");
    }
}
