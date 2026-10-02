namespace Bugie.Rewards.Domain.Interfaces;

/// <summary>Nombre y rol de usuarios (auth.users), para mostrarlos en el admin.</summary>
public class UserNameRow
{
    public Guid    Id       { get; set; }
    public string? FullName { get; set; }
    public string? Role     { get; set; }
    public string? Email    { get; set; }
}

public interface IUserDirectory
{
    Task<Dictionary<Guid, UserNameRow>> GetByIdsAsync(IEnumerable<Guid> ids, CancellationToken ct = default);
}
