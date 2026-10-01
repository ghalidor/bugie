using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using Bugie.Auth.Domain.Constants;
using Bugie.Auth.Domain.Entities;
using Bugie.Auth.Domain.Interfaces;

namespace Bugie.Auth.Api.Controllers;

/// <summary>
/// Endpoints de gestión de roles y permisos administrativos.
/// Solo accesible por super_admin (validación dentro de cada endpoint).
/// </summary>
[ApiController]
[Route("api/auth/admin/security")]
[Authorize(Roles = "admin")]
public class AdminSecurityController : ControllerBase
{
    private readonly IAdminRoleRepository _roles;
    private readonly IUserRepository _users;
    private readonly IPermissionService _perms;
    private readonly IPasswordHasher _hasher;

    public AdminSecurityController(
        IAdminRoleRepository roles, IUserRepository users,
        IPermissionService perms, IPasswordHasher hasher)
    {
        _roles = roles;
        _users = users;
        _perms = perms;
        _hasher = hasher;
    }

    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    /// <summary>
    /// Verificación interna: el usuario actual debe ser super_admin para
    /// crear/editar/borrar roles. Si no lo es, devuelve 403.
    /// </summary>
    private async Task<bool> IsSuperAdminAsync(CancellationToken ct)
    {
        var user = await _users.GetByIdAsync(CurrentUserId, ct);
        if(user?.AdminRoleId is null) return false;
        var role = await _roles.GetByIdAsync(user.AdminRoleId.Value, ct);
        return role?.IsSystem == true;
    }

    // ── Listar roles ────────────────────────────────────────────────────
    [HttpGet("roles")]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        var list = await _roles.GetAllAsync(ct);
        // Incluyo permisos y conteo de usuarios para que el admin vea todo de una.
        var result = new List<object>();
        foreach(var r in list)
        {
            var perms = r.IsSystem ? Permissions.All.ToList()
                                   : await _roles.GetPermissionsAsync(r.Id, ct);
            var userCount = await _roles.GetUserCountAsync(r.Id, ct);
            result.Add(new
            {
                r.Id,
                r.Name,
                r.Description,
                r.IsSystem,
                r.CreatedAt,
                Permissions = perms,
                UserCount = userCount,
            });
        }
        return Ok(result);
    }

    // ── Catálogo de permisos disponibles ───────────────────────────────
    /// <summary>
    /// Devuelve todos los permisos que existen en el sistema, separados por
    /// tipo (vista/acción). El frontend lo usa para construir el formulario
    /// de "asignar permisos a un rol".
    /// </summary>
    [HttpGet("permissions/catalog")]
    public IActionResult Catalog() =>
        Ok(new
        {
            views = Permissions.AllViews,
            actions = Permissions.AllActions,
        });

    // ── Crear rol ──────────────────────────────────────────────────────
    public record CreateRoleRequest(string Name, string? Description, List<string>? Permissions);

    [HttpPost("roles")]
    public async Task<IActionResult> Create([FromBody] CreateRoleRequest req, CancellationToken ct)
    {
        if(!await IsSuperAdminAsync(ct))
            return Forbid();

        if(string.IsNullOrWhiteSpace(req.Name))
            return BadRequest(new { error = "El nombre del rol es obligatorio." });

        // No permitir el nombre 'super_admin' (reservado).
        if(req.Name.Trim().Equals("super_admin", StringComparison.OrdinalIgnoreCase))
            return Conflict(new { error = "Ese nombre está reservado." });

        // Validar que no exista
        var existing = await _roles.GetByNameAsync(req.Name.Trim(), ct);
        if(existing is not null)
            return Conflict(new { error = "Ya existe un rol con ese nombre." });

        var role = new AdminRole
        {
            Id = Guid.NewGuid(),
            Name = req.Name.Trim(),
            Description = req.Description?.Trim(),
            IsSystem = false,
            CreatedAt = DateTime.UtcNow,
        };
        await _roles.AddAsync(role, ct);

        // Si vinieron permisos, los asignamos (filtramos a los del catálogo
        // válido para no aceptar strings arbitrarios).
        if(req.Permissions is not null && req.Permissions.Count > 0)
        {
            var validPerms = req.Permissions
                .Where(p => Permissions.All.Contains(p))
                .ToList();
            await _roles.SetPermissionsAsync(role.Id, validPerms, ct);
        }

        return Ok(role);
    }

    // ── Editar rol (nombre, descripción) ────────────────────────────────
    public record UpdateRoleRequest(string Name, string? Description);

    [HttpPut("roles/{id:guid}")]
    public async Task<IActionResult> Update(
        Guid id, [FromBody] UpdateRoleRequest req, CancellationToken ct)
    {
        if(!await IsSuperAdminAsync(ct)) return Forbid();

        var role = await _roles.GetByIdAsync(id, ct);
        if(role is null) return NotFound();
        if(role.IsSystem)
            return Conflict(new { error = "No se puede editar el rol del sistema." });

        if(string.IsNullOrWhiteSpace(req.Name))
            return BadRequest(new { error = "El nombre es obligatorio." });

        role.Name = req.Name.Trim();
        role.Description = req.Description?.Trim();
        await _roles.UpdateAsync(role, ct);

        return Ok(role);
    }

    // ── Setear permisos del rol ─────────────────────────────────────────
    public record SetPermissionsRequest(List<string> Permissions);

    [HttpPut("roles/{id:guid}/permissions")]
    public async Task<IActionResult> SetPermissions(
        Guid id, [FromBody] SetPermissionsRequest req, CancellationToken ct)
    {
        if(!await IsSuperAdminAsync(ct)) return Forbid();

        var role = await _roles.GetByIdAsync(id, ct);
        if(role is null) return NotFound();
        if(role.IsSystem)
            return Conflict(new { error = "Los permisos del super_admin no se pueden modificar." });

        // Filtrar contra el catálogo válido (defensa contra inyección de strings raros).
        var validPerms = (req.Permissions ?? new List<string>())
            .Where(p => Permissions.All.Contains(p))
            .Distinct()
            .ToList();

        await _roles.SetPermissionsAsync(id, validPerms, ct);

        return Ok(new { roleId = id, permissions = validPerms });
    }

    // ── Borrar rol ─────────────────────────────────────────────────────
    [HttpDelete("roles/{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        if(!await IsSuperAdminAsync(ct)) return Forbid();

        var role = await _roles.GetByIdAsync(id, ct);
        if(role is null) return NotFound();
        if(role.IsSystem)
            return Conflict(new { error = "No se puede borrar el rol del sistema." });

        // Si hay usuarios con este rol, avisamos. La FK SET NULL los deja sin rol,
        // pero es mejor advertir antes.
        var userCount = await _roles.GetUserCountAsync(id, ct);
        if(userCount > 0)
            return Conflict(new
            {
                error = $"Hay {userCount} usuario(s) con este rol. Reasígnalos antes de borrar.",
            });

        await _roles.DeleteAsync(id, ct);
        return Ok(new { deleted = true });
    }

    // ── Crear usuario admin con rol ─────────────────────────────────────
    public record CreateAdminRequest(
        string FullName,
        string Email,
        string Password,
        string Phone,
        Guid RoleId);

    /// <summary>
    /// Crea un usuario con role='admin' y le asigna el rol administrativo indicado.
    /// Solo super_admin puede crear admins. El usuario nace activo y verificado.
    /// POST /api/auth/admin/security/users
    /// </summary>
    [HttpPost("users")]
    public async Task<IActionResult> CreateAdmin(
        [FromBody] CreateAdminRequest req, CancellationToken ct)
    {
        if(!await IsSuperAdminAsync(ct)) return Forbid();

        // Validaciones básicas
        if(string.IsNullOrWhiteSpace(req.FullName))
            return BadRequest(new { error = "El nombre es obligatorio." });
        if(string.IsNullOrWhiteSpace(req.Email))
            return BadRequest(new { error = "El correo es obligatorio." });
        if(string.IsNullOrWhiteSpace(req.Password) || req.Password.Length < 6)
            return BadRequest(new { error = "La contraseña debe tener al menos 6 caracteres." });
        if(string.IsNullOrWhiteSpace(req.Phone))
            return BadRequest(new { error = "El teléfono es obligatorio." });

        // Validar que el rol exista
        var role = await _roles.GetByIdAsync(req.RoleId, ct);
        if(role is null)
            return NotFound(new { error = "Rol no encontrado." });

        // No se permite crear nuevos super_admin desde la UI. Solo por SQL,
        // como decisión consciente del operador de base de datos.
        if(role.IsSystem)
            return Conflict(new
            {
                error = "No se puede asignar el rol super_admin al crear. Hazlo por SQL si es necesario.",
            });

        // Validar que el email no esté usado
        if(await _users.EmailExistsAsync(req.Email, ct))
            return Conflict(new { error = "Ya existe un usuario con ese correo." });

        // Crear el usuario admin. User.Create() con role='admin' lo deja activo y verificado.
        // NOTA: usamos el nombre completo del namespace porque dentro de un Controller
        // hay una propiedad heredada `User` (ClaimsPrincipal) que oculta a nuestra entidad.
        var user = Bugie.Auth.Domain.Entities.User.Create(
            req.Email, _hasher.Hash(req.Password), "admin",
            req.FullName.Trim(), req.Phone.Trim());
        await _users.AddAsync(user, ct);

        // Asignar el rol administrativo
        await _users.UpdateAdminRoleAsync(user.Id, req.RoleId, ct);

        // Devolvemos los datos básicos (NUNCA la contraseña ni hash).
        return Ok(new
        {
            id = user.Id,
            fullName = user.FullName,
            email = user.Email,
            phone = user.Phone,
            role = user.Role,
            adminRoleId = req.RoleId,
            adminRoleName = role.Name,
        });
    }

    // ── Asignar rol a un usuario ────────────────────────────────────────
    public record AssignRoleRequest(Guid UserId, Guid? RoleId);

    [HttpPut("users/assign-role")]
    public async Task<IActionResult> AssignRole(
        [FromBody] AssignRoleRequest req, CancellationToken ct)
    {
        if(!await IsSuperAdminAsync(ct)) return Forbid();

        // Guardia 1: no permitir que un super_admin se edite a sí mismo.
        // Si lo hiciera y se "degradase" a otro rol, perdería acceso a este
        // mismo módulo y quedaría sin manera de volver atrás desde la UI.
        if(req.UserId == CurrentUserId)
            return Conflict(new
            {
                error = "No puedes cambiar tu propio rol. Pídele a otro super_admin que lo haga (o cámbialo por SQL).",
            });

        var user = await _users.GetByIdAsync(req.UserId, ct);
        if(user is null) return NotFound();
        if(user.Role != "admin")
            return Conflict(new { error = "Solo los usuarios con rol 'admin' pueden tener rol administrativo." });

        // Guardia 2: no permitir cambiar el rol de OTRO super_admin desde la UI.
        // Si el target ya tiene super_admin, no se le puede quitar/cambiar acá
        // (solo por SQL). Esto evita que un super_admin "destrone" a otro por error.
        if(user.AdminRoleId.HasValue)
        {
            var currentRole = await _roles.GetByIdAsync(user.AdminRoleId.Value, ct);
            if(currentRole?.IsSystem == true)
                return Conflict(new
                {
                    error = "Este usuario tiene rol super_admin. No se puede cambiar desde la UI (solo por SQL).",
                });
        }

        // Si pasó un RoleId, validar que exista Y que NO sea un rol del sistema.
        // No se puede asignar super_admin desde la UI: si querés crear otro
        // super_admin, hazlo por SQL (decisión consciente, no por click accidental).
        if(req.RoleId.HasValue)
        {
            var role = await _roles.GetByIdAsync(req.RoleId.Value, ct);
            if(role is null) return NotFound(new { error = "Rol no encontrado." });
            if(role.IsSystem)
                return Conflict(new
                {
                    error = "El rol super_admin no se puede asignar desde la UI.",
                });
        }

        await _users.UpdateAdminRoleAsync(req.UserId, req.RoleId, ct);
        return Ok(new { userId = req.UserId, roleId = req.RoleId });
    }
}
