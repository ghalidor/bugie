import { useEffect, useState } from 'react';
import { API } from '../state/api';

/* Datos legales de la empresa (razón social, RUC, dirección fiscal y logo).
   Una sola fuente: landing.systemsettings, que el admin edita en
   "Datos de la empresa". Teléfono y correo son los de soporte.
   Una sola petición compartida; si falla se usa el texto de siempre. */

export interface CompanyInfo {
  legalName: string;
  ruc: string;
  address: string;
  /** Relativa (/uploads/...) servida por la API de Landing, o vacía. */
  logoUrl: string;
  supportEmail: string;
  supportPhone: string;
  city: string;
  /** Plazo vigente del Libro de Reclamaciones (días hábiles) para las hojas nuevas. */
  complaintResponseDays?: number;
}

/** Razón social histórica: se muestra si la configuración no responde. */
export const DEFAULT_LEGAL_NAME = 'InteliaDevs S.A.C.';

let _promise: Promise<CompanyInfo | null> | null = null;

export function loadCompany(): Promise<CompanyInfo | null> {
  if (!_promise) {
    _promise = fetch(`${API.landing}/landing/company`)
      .then(r => (r.ok ? r.json() as Promise<CompanyInfo> : null))
      .catch(() => null);
  }
  return _promise;
}

/** URL absoluta del logo (lo sirve la API de Landing en /uploads). */
export function companyLogoUrl(url?: string | null): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  try {
    return new URL(url, new URL(API.landing).origin).toString();
  } catch {
    return url;
  }
}

/** null mientras carga o si no respondió. */
export function useCompany(): CompanyInfo | null {
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  useEffect(() => {
    let alive = true;
    loadCompany().then(c => { if (alive) setCompany(c); });
    return () => { alive = false; };
  }, []);
  return company;
}
