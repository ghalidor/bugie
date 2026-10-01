using Bugie.Auth.Domain.Interfaces;

namespace Bugie.Auth.Infrastructure.Security;

public class BcryptPasswordHasher : IPasswordHasher
{
    public string Hash(string password)     => BCrypt.Net.BCrypt.HashPassword(password, workFactor: 12);
    public bool   Verify(string password, string hash) => BCrypt.Net.BCrypt.Verify(password, hash);
}