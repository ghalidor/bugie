using Bugie.Auth.Domain.Interfaces;
using Bugie.Security;
using Microsoft.AspNetCore.Mvc;

namespace Bugie.Auth.Api.Security;

/// <summary>
/// Reglas para que un admin vea o modifique la cuenta de OTRO usuario
/// (desactivar, reactivar, cerrar sesiones, corregir documento/nombres, restaurar,
/// ver detalle/auditoria):
///   - Permiso segun el tipo de cuenta: view:users (cualquiera) o el de su
///     seccion (pasajero = view:passengers, conductor = view:drivers).
///     Una cuenta admin solo con view:users.
///   - Modificar a otro admin: solo super_admin.
///   - Desactivarse a si mismo: nunca (selfForbidden).
/// null = permitido; si no, la respuesta (404/403/409/503) a devolver.
/// </summary>
public static class AdminTargetGuard
{
    public static async Task<IActionResult?> CheckAsync(
        HttpContext http, IUserRepository users, Guid targetId, Guid currentUserId,
        bool write, bool selfForbidden, CancellationToken ct)
    {
        var target = await users.GetByIdAsync(targetId, ct);
        if (target is null) return new NotFoundObjectResult(new { error = "Usuario no encontrado." });

        AdminPermissionSet perms;
        try { perms = await http.GetAdminPermissionsAsync(); }
        catch (AdminPermissionsUnavailableException) { return AdminPermissions.Unavailable(); }

        var sectionPerm = target.Role switch
        {
            "passenger" => Perm.ViewPassengers,
            "driver" => Perm.ViewDrivers,
            _ => Perm.ViewUsers,
        };
        if (!perms.HasAny(Perm.ViewUsers, sectionPerm)) return AdminPermissions.Forbidden();

        if (!write) return null;

        if (selfForbidden && target.Id == currentUserId)
            return new ConflictObjectResult(new { error = "No puedes desactivar tu propia cuenta." });

        if (target.Role == "admin" && !perms.IsSuperAdmin)
            return AdminPermissions.Forbidden("Solo un super_admin puede modificar la cuenta de otro administrador.");

        return null;
    }
}
