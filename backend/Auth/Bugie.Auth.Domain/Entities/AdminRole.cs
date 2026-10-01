namespace Bugie.Auth.Domain.Entities;

/// <summary>
/// Rol administrativo definible desde BD.
/// - IsSystem = true → rol especial (super_admin). No se puede borrar ni editar permisos.
/// </summary>
public class AdminRole
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public bool IsSystem { get; set; }
    public DateTime CreatedAt { get; set; }
}
