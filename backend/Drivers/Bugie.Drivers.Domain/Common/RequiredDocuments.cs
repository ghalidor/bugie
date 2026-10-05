using Bugie.Drivers.Domain.Entities;

namespace Bugie.Drivers.Domain.Common;

/// <summary>
/// Documentos obligatorios del conductor y la regla de "documentos completos":
/// todos los obligatorios subidos Y aprobados, más la foto de perfil
/// (clave "profile_photo": no es un documento, es Driver.ProfilePhotoUrl).
/// La revisión técnica solo es obligatoria si el vehículo activo tiene 5 años o más
/// (si no hay vehículo registrado, se exige por seguridad).
/// </summary>
public static class RequiredDocuments
{
    public const int RevisionTecnicaMinAge = 5;

    /// <summary>Plazo (días) para completar documentos tras una aprobación por excepción.</summary>
    public const int ExceptionDeadlineDays = 3;

    /// <summary>Requisito "Foto de perfil" (va en MissingDocuments junto a los documentos).</summary>
    public const string ProfilePhotoKey = "profile_photo";

    public static readonly IReadOnlyList<string> AllTypes = new[]
    {
        "dni_front", "dni_back", "license", "soat",
        "tarjeta_propiedad", "revision_tecnica", "certificado_unico_laboral",
    };

    public static readonly IReadOnlyDictionary<string, string> Labels = new Dictionary<string, string>
    {
        { "dni_front", "DNI - Frontal" },
        { "dni_back", "DNI - Reverso" },
        { "license", "Licencia de conducir" },
        { "soat", "SOAT" },
        { "tarjeta_propiedad", "Tarjeta de propiedad" },
        { "revision_tecnica", "Revisión técnica" },
        { "certificado_unico_laboral", "Certificado único laboral" },
        { ProfilePhotoKey, "Foto de perfil" },
    };

    public static string Label(string docType) => Labels.GetValueOrDefault(docType, docType);

    /// <summary>Tipos obligatorios según el vehículo activo.</summary>
    public static List<string> RequiredFor(Vehicle? activeVehicle)
    {
        var needsRevision = activeVehicle is null
            || BugieTime.Today.Year - activeVehicle.Year >= RevisionTecnicaMinAge;
        return AllTypes.Where(t => t != "revision_tecnica" || needsRevision).ToList();
    }

    /// <summary>
    /// Tipos obligatorios que faltan (no subidos o no aprobados) y, al final,
    /// "profile_photo" si el conductor no tiene foto de perfil.
    /// activeDocs = documentos activos del conductor (sin superseded).
    /// </summary>
    public static List<string> GetMissing(IEnumerable<DriverDocument> activeDocs, Vehicle? activeVehicle,
        string? profilePhotoUrl)
    {
        var approved = activeDocs
            .Where(d => d.Status == "approved")
            .Select(d => d.DocType)
            .ToHashSet();
        var missing = RequiredFor(activeVehicle).Where(t => !approved.Contains(t)).ToList();
        if(string.IsNullOrWhiteSpace(profilePhotoUrl))
            missing.Add(ProfilePhotoKey);
        return missing;
    }
}
