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
    }

    /// <summary>
    /// Token FCM con info del usuario due�o y la plataforma del dispositivo.
    /// </summary>
    public record FcmTokenInfo(Guid UserId, string Token, string Platform);
}
