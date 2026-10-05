import type { Tone } from './ui';

/* ──────────────────────────────────────────────────────────────────────────
   Textos, tonos y formatos comunes de viajes y pagos para las pantallas de
   pasajero y conductor. Asi el mismo estado se ve igual en todas partes.
   ────────────────────────────────────────────────────────────────────────── */

export interface StatusInfo { label: string; tone: Tone; icon: string; }

/** Estado del viaje (status numerico del backend). */
export const TRIP_STATUS: Record<number, StatusInfo> = {
  1: { label: 'Pendiente',  tone: 'warn',    icon: 'fa-clock' },
  2: { label: 'Aceptado',   tone: 'info',    icon: 'fa-car' },
  3: { label: 'En curso',   tone: 'info',    icon: 'fa-location-dot' },
  4: { label: 'Completado', tone: 'ok',      icon: 'fa-circle-check' },
  5: { label: 'Cancelado',  tone: 'neutral', icon: 'fa-circle-xmark' },
  6: { label: 'SOS',        tone: 'bad',     icon: 'fa-triangle-exclamation' },
  7: { label: 'Negociando', tone: 'primary', icon: 'fa-arrow-right-arrow-left' },
};

export function tripStatus(status: number): StatusInfo {
  return TRIP_STATUS[status] ?? { label: 'Desconocido', tone: 'neutral', icon: 'fa-circle' };
}

/** Metodo de pago del viaje. */
export const PAY_METHOD: Record<string, { label: string; icon: string }> = {
  cash: { label: 'Efectivo', icon: 'fa-money-bill-wave' },
  yape: { label: 'Yape',     icon: 'fa-mobile-screen' },
  plin: { label: 'Plin',     icon: 'fa-mobile-screen' },
};

export function payMethod(m: string): { label: string; icon: string } {
  return PAY_METHOD[m] ?? { label: m, icon: 'fa-credit-card' };
}

/** S/ 12.50 */
export function money(v: number | null | undefined): string {
  return `S/ ${(v ?? 0).toFixed(2)}`;
}

/** 02 oct. 2026 */
export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** 14:30 */
export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

/** 02 oct. 2026 · 14:30 */
export function fmtDateTime(iso: string): string {
  return `${fmtDate(iso)} · ${fmtTime(iso)}`;
}
