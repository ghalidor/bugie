using Bugie.Auth.Domain.Entities;

namespace Bugie.Auth.Application.Common;

/// <summary>Un requisito de la verificación del pasajero.</summary>
/// <param name="Key">dni_front | dni_back | profile_photo</param>
/// <param name="Status">missing | pending | approved | rejected (la foto de perfil: missing | uploaded)</param>
public record PassengerRequirementDto(string Key, string Label, string Status, string? RejectionReason, bool Done);

/// <param name="ReadyForReview">Subió todo (DNI frente/reverso no rechazados + foto de perfil).</param>
/// <param name="Missing">Claves de lo que le falta subir o volver a subir.</param>
public record PassengerRequirementsDto(
    bool IsVerified, bool ReadyForReview, List<string> Missing, List<PassengerRequirementDto> Requirements);

/// <summary>
/// Requisitos de verificación del pasajero: DNI (frente y reverso) y foto de perfil.
/// Los usan la app/web (qué me falta), el admin (detalle y verificar) y el aviso
/// "Pasajero por aprobar".
/// </summary>
public static class PassengerRequirements
{
    public const string ProfilePhotoKey = "profile_photo";
    public const string MissingPhotoMessage = "Falta la foto de perfil del pasajero.";

    private static readonly (string Key, string Label)[] DniTypes =
    [
        ("dni_front", "DNI - Frontal"),
        ("dni_back", "DNI - Reverso"),
    ];

    public static PassengerRequirementsDto Build(User user, IEnumerable<PassengerDocument> docs)
    {
        var list = new List<PassengerRequirementDto>();
        foreach(var (key, label) in DniTypes)
        {
            var d = docs.Where(x => x.DocType == key).OrderByDescending(x => x.CreatedAt).FirstOrDefault();
            var status = d?.Status ?? "missing";
            list.Add(new PassengerRequirementDto(key, label, status,
                status == "rejected" ? d!.RejectionReason : null, status is "pending" or "approved"));
        }

        var hasPhoto = !string.IsNullOrWhiteSpace(user.ProfilePhotoUrl);
        list.Add(new PassengerRequirementDto(ProfilePhotoKey, "Foto de perfil",
            hasPhoto ? "uploaded" : "missing", null, hasPhoto));

        var missing = list.Where(r => !r.Done).Select(r => r.Key).ToList();
        return new PassengerRequirementsDto(user.IsVerified, missing.Count == 0, missing, list);
    }
}
