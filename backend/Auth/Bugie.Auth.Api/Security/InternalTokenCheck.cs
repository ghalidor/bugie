using System.Security.Cryptography;
using System.Text;

namespace Bugie.Auth.Api.Security;

/// <summary>
/// Compara el header X-Internal-Token con appsettings (InternalToken) en
/// tiempo constante, para no filtrar el token por diferencias de tiempo.
/// </summary>
public static class InternalTokenCheck
{
    public static bool Matches(string? received, string? expected) =>
        !string.IsNullOrEmpty(received) && !string.IsNullOrEmpty(expected) &&
        CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(received), Encoding.UTF8.GetBytes(expected));
}
