using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace Bugie.Trips.Domain.External
{
    public interface IAuthClient
    {
        Task<Dictionary<Guid, UserInfoDto>> GetUsersByIdsAsync(
            IEnumerable<Guid> ids, CancellationToken ct = default);

        /// <summary>
        /// Devuelve los tokens FCM de los usuarios pasados. Endpoint INTERNO
        /// (requiere X-Internal-Token). Lo usa FcmSender para mandar push.
        /// </summary>
        Task<List<FcmTokenInfo>> GetFcmTokensAsync(
            IEnumerable<Guid> userIds, CancellationToken ct = default);

        /// <summary>
        /// Borra un token FCM espec�fico. Lo usa FcmSender cuando Firebase
        /// responde UNREGISTERED (token muerto, no seguir intentando).
        /// </summary>
        Task DeleteFcmTokenAsync(string token, CancellationToken ct = default);

        /// <summary>
        /// Envia un correo al usuario (Auth conoce su correo y tiene el SMTP).
        /// Endpoint INTERNO (requiere X-Internal-Token). Nunca lanza excepcion.
        /// </summary>
        Task SendEmailToUserAsync(
            Guid userId, string subject, string title, string message, CancellationToken ct = default);

        /// <summary>
        /// Contacto de emergencia del usuario, o null si no tiene (o si Auth
        /// no responde). Endpoint INTERNO (requiere X-Internal-Token).
        /// </summary>
        Task<EmergencyContactInfo?> GetEmergencyContactAsync(Guid userId, CancellationToken ct = default);

        /// <summary>
        /// Envia un correo a una direccion que no es usuario de Bugie (ej. el
        /// contacto de emergencia). linkUrl/linkText son opcionales (boton).
        /// Endpoint INTERNO (requiere X-Internal-Token). Nunca lanza excepcion.
        /// </summary>
        Task SendEmailToAddressAsync(
            string toEmail, string? toName, string subject, string title, string message,
            string? linkUrl = null, string? linkText = null, CancellationToken ct = default);
    }

    /// <summary>
    /// Contacto de emergencia de un usuario (viene de Auth). Email es opcional.
    /// </summary>
    public record EmergencyContactInfo(
        Guid UserId, string FullName, string Phone, string Relationship, string? Email);

    /// <summary>
    /// Token FCM con info del usuario due�o y la plataforma del dispositivo.
    /// </summary>
    public record FcmTokenInfo(Guid UserId, string Token, string Platform);
}
