import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { apiFetch, API } from './api';

/// Permisos de VISTA (deben coincidir EXACTAMENTE con Domain/Constants/Permissions.cs en backend).
/// Es la "fuente de verdad" del frontend para qué módulos existen.
export const PERMS = {
  // Vistas
  ViewDashboard:  'view:dashboard',
  ViewUsers:      'view:users',
  ViewDrivers:    'view:drivers',
  ViewPassengers: 'view:passengers',
  ViewTrips:      'view:trips',
  ViewPayments:   'view:payments',
  ViewLiveMap:    'view:live_map',
  ViewSosCenter:  'view:sos_center',
  ViewLanding:    'view:landing',
  ViewCommunity:  'view:community',
  ViewLegalDocs:  'view:legal_docs',
  ViewFaq:        'view:faq',
  ViewReports:    'view:reports',
  ViewSecurity:   'view:security',
  // Cada página con su propio permiso (antes compartían landing/payments/drivers)
  ViewVerification:        'view:verification',
  ViewDriverPayouts:       'view:driver_payouts',
  ViewCommissions:         'view:commissions',
  ViewRewards:             'view:rewards',
  ViewMessages:            'view:messages',
  ViewSettings:            'view:settings',
  ViewNotificationsConfig: 'view:notifications_config',
  ViewComplaints:          'view:complaints',
  ViewCompany:             'view:company',
  // Acciones (Fase 2 — declarados pero no usados aún)
  ActionApproveDriver:    'action:approve_driver',
  ActionApprovePassenger: 'action:approve_passenger',
  ActionSaveLanding:      'action:save_landing',
  ActionCreateCommunity:  'action:create_community',
  ActionEditCommunity:    'action:edit_community',
  ActionToggleCommunity:  'action:toggle_community',
  ActionSaveLegalDocs:    'action:save_legal_docs',
} as const;

type PermsContextType = {
  /// Lista de permisos efectivos del usuario actual.
  permissions: string[];
  /// Helper para chequear un permiso puntual.
  has: (p: string) => boolean;
  /// True si el usuario tiene TODOS los permisos (super_admin).
  isSuperAdmin: boolean;
  /// Si todavía no se cargaron (mostrar spinner si hace falta).
  loading: boolean;
  /// Recargar (después de que super_admin cambie permisos de su propio rol).
  reload: () => void;
};

const PermsContext = createContext<PermsContextType>({
  permissions: [],
  has: () => false,
  isSuperAdmin: false,
  loading: true,
  reload: () => {},
});

/// Provider que carga los permisos del backend una vez al montar.
/// Debe envolver al AdminShell (después del login).
export function PermissionsProvider({ children }: { children: ReactNode }) {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading]         = useState(true);
  const [nonce, setNonce]             = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ permissions: string[] }>(`${API.auth}/auth/me/permissions`)
      .then(data => {
        if (cancelled) return;
        setPermissions(data?.permissions ?? []);
      })
      .catch(() => {
        // Si falla, asumimos cero permisos (el usuario no verá nada del admin).
        // Eso prefiere "denegar por defecto" frente a "permitir por defecto".
        if (!cancelled) setPermissions([]);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [nonce]);

  const has = (p: string) => permissions.includes(p);

  // Heurística: si tiene TODOS los permisos de vista que conocemos, es super_admin.
  // (El backend devuelve el catálogo completo para super_admin.)
  const allViewPerms = [
    PERMS.ViewDashboard, PERMS.ViewUsers, PERMS.ViewDrivers, PERMS.ViewPassengers,
    PERMS.ViewTrips, PERMS.ViewPayments, PERMS.ViewLiveMap, PERMS.ViewSosCenter,
    PERMS.ViewLanding, PERMS.ViewCommunity, PERMS.ViewLegalDocs, PERMS.ViewFaq,
    PERMS.ViewReports, PERMS.ViewSecurity, PERMS.ViewSettings, PERMS.ViewNotificationsConfig,
  ];
  const isSuperAdmin = allViewPerms.every(p => permissions.includes(p));

  return (
    <PermsContext.Provider value={{
      permissions, has, isSuperAdmin, loading,
      reload: () => setNonce(n => n + 1),
    }}>
      {children}
    </PermsContext.Provider>
  );
}

/// Hook para usar permisos en cualquier componente.
export function usePermissions() {
  return useContext(PermsContext);
}
