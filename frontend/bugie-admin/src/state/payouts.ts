import { API, apiFetch } from './api';

// ─────────────────────────────────────────────────────────────
// Pagos a conductores (Bugie.Payments.Api /payments/admin/payouts)
// El admin registra lo que ya pago: bono canjeado, premio de sorteo
// o pago manual, con metodo, n. de operacion y fecha.
// ─────────────────────────────────────────────────────────────

export type PayoutMethod = 'yape' | 'plin' | 'transferencia' | 'efectivo';
export type PayoutSource = 'reward_redemption' | 'raffle_prize' | 'manual';

export interface Payout {
  id:              string;
  driverId:        string;
  driverName:      string | null;
  amount:          number;
  method:          PayoutMethod;
  accountRef:      string | null;
  operationNumber: string | null;
  paidAt:          string | null;
  paidByAdminName: string | null;
  note:            string | null;
  sourceType:      PayoutSource;
  sourceRef:       string | null;
  createdAt:       string;
}

export interface PayoutReport {
  items:       Payout[];
  total:       number;
  page:        number;
  pageSize:    number;
  totalAmount: number;
  byMethod:    { method: PayoutMethod; count: number; amount: number }[];
}

export interface PayoutInput {
  driverId:        string;
  driverName?:     string | null;
  amount:          number;
  method:          PayoutMethod;
  accountRef?:     string | null;
  operationNumber?: string | null;
  /** "YYYY-MM-DDTHH:mm" en hora de Peru (sin zona). */
  paidAt?:         string | null;
  note?:           string | null;
  sourceType:      PayoutSource;
  sourceRef?:      string | null;
}

export interface PayoutFilters {
  driverId?:   string | null;
  from?:       string | null;   // YYYY-MM-DD
  to?:         string | null;   // YYYY-MM-DD
  method?:     string | null;
  sourceType?: string | null;
  search?:     string | null;
}

export const PAYOUT_METHOD: Record<PayoutMethod, { label: string; icon: string }> = {
  yape:          { label: 'Yape',          icon: 'fa-mobile-screen' },
  plin:          { label: 'Plin',          icon: 'fa-mobile-screen' },
  transferencia: { label: 'Transferencia', icon: 'fa-building-columns' },
  efectivo:      { label: 'Efectivo',      icon: 'fa-money-bill-wave' },
};

export const PAYOUT_SOURCE: Record<PayoutSource, string> = {
  reward_redemption: 'Bono canjeado',
  raffle_prize:      'Premio de sorteo',
  manual:            'Pago manual',
};

const base = () => `${API.payments}/payments/admin/payouts`;

function qs(params: Record<string, string | number | null | undefined>) {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== '') p.set(k, String(v));
  });
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const payoutsApi = {
  register: (input: PayoutInput) =>
    apiFetch<Payout>(base(), { method: 'POST', body: JSON.stringify(input) }),

  list: (f: PayoutFilters, page = 1, pageSize = 25) =>
    apiFetch<PayoutReport>(`${base()}${qs({ ...f, page, pageSize })}`),
};

/** Fecha y hora actual "YYYY-MM-DDTHH:mm" para inputs datetime-local. */
export function nowLocalInput() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const fmtSoles = (n: number) =>
  `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Descarga un CSV (abre bien en Excel: separador ; y BOM UTF-8). */
export function downloadPayoutsCsv(items: Payout[], filename = 'pagos-conductores.csv') {
  const head = ['Fecha de pago', 'Conductor', 'Monto (S/)', 'Metodo', 'N. operacion', 'Origen', 'Referencia', 'Nota', 'Registrado por'];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = items.map(p => [
    p.paidAt ? new Date(p.paidAt).toLocaleString('es-PE') : '',
    p.driverName ?? p.driverId,
    p.amount.toFixed(2),
    PAYOUT_METHOD[p.method]?.label ?? p.method,
    p.operationNumber ?? '',
    PAYOUT_SOURCE[p.sourceType] ?? p.sourceType,
    p.sourceRef ?? '',
    p.note ?? '',
    p.paidByAdminName ?? '',
  ].map(esc).join(';'));
  const blob = new Blob(['﻿' + [head.map(esc).join(';'), ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
