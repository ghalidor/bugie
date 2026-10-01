namespace Bugie.Auth.Domain.Constants;

/// <summary>
/// Catálogo de permisos del sistema. Sirven como llave para AdminRoles → RolePermissions.
///
/// Permisos de VISTA (Fase 1): controlan qué módulos del admin se ven en el menú.
/// Permisos de ACCIÓN (Fase 2): aprobar, guardar, ocultar, etc.
///
/// El rol "super_admin" (IsSystem=TRUE) ignora esta lista: tiene TODO.
/// </summary>
public static class Permissions
{
    // ── VISTAS DEL MENÚ ─────────────────────────────────────────────────
    public const string ViewDashboard = "view:dashboard";
    public const string ViewUsers = "view:users";
    public const string ViewDrivers = "view:drivers";
    public const string ViewPassengers = "view:passengers";
    public const string ViewTrips = "view:trips";
    public const string ViewPayments = "view:payments";
    public const string ViewLiveMap = "view:live_map";
    public const string ViewSosCenter = "view:sos_center";
    public const string ViewLanding = "view:landing";
    public const string ViewCommunity = "view:community";
    public const string ViewLegalDocs = "view:legal_docs";
    public const string ViewFaq = "view:faq";
    public const string ViewReports = "view:reports";
    public const string ViewSecurity = "view:security"; // este módulo mismo

    // ── ACCIONES (Fase 2 — se reservan los nombres) ─────────────────────
    // Estos NO se validan todavía en endpoints, pero los dejamos definidos
    // para que el catálogo esté centralizado y los nombres no cambien después.
    public const string ActionApproveDriver = "action:approve_driver";
    public const string ActionApprovePassenger = "action:approve_passenger";
    public const string ActionSaveLanding = "action:save_landing";
    public const string ActionCreateCommunity = "action:create_community";
    public const string ActionEditCommunity = "action:edit_community";
    public const string ActionToggleCommunity = "action:toggle_community";
    public const string ActionSaveLegalDocs = "action:save_legal_docs";

    /// <summary>Todos los permisos de VISTA (Fase 1) — útil para validar entradas.</summary>
    public static readonly string[] AllViews = new[]
    {
        ViewDashboard, ViewUsers, ViewDrivers, ViewPassengers, ViewTrips,
        ViewPayments, ViewLiveMap, ViewSosCenter, ViewLanding, ViewCommunity,
        ViewLegalDocs, ViewFaq, ViewReports, ViewSecurity,
    };

    /// <summary>Todos los permisos de ACCIÓN (Fase 2) — útil para validar entradas.</summary>
    public static readonly string[] AllActions = new[]
    {
        ActionApproveDriver, ActionApprovePassenger, ActionSaveLanding,
        ActionCreateCommunity, ActionEditCommunity, ActionToggleCommunity,
        ActionSaveLegalDocs,
    };

    /// <summary>Todos los permisos juntos.</summary>
    public static readonly string[] All = AllViews.Concat(AllActions).ToArray();
}
