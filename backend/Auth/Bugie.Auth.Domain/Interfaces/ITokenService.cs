using Bugie.Auth.Domain.Entities;

namespace Bugie.Auth.Domain.Interfaces;

public interface ITokenService
{
    string GenerateToken(User user);
}
