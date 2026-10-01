import { API, apiFetch } from './api';

// ─────────────────────────────────────────────────────────────
// Tipos: espejo exacto de los DTOs de Bugie.Rewards.Api
// ─────────────────────────────────────────────────────────────

export interface RewardSetting {
  settingKey:  string;
  value:       string;
  description: string | null;
  updatedAt:   string;
}

export interface RewardLevel {
  id:                   string;
  userType:             'passenger' | 'driver';
  name:                 string;
  displayName:          string;
  sortOrder:            number;
  minPoints:            number;
  maxPoints:            number | null;
  discountPercentage:   number;
  monthlyFreeTrips:     number;
  weeklyRaffleTickets:  number;
  monthlyRaffleTickets: number;
  isActive:             boolean;
}

export interface CatalogItem {
  id:           string;
  code:         string;
  userType:     'passenger' | 'driver';
  name:         string;
  description:  string | null;
  pointsCost:   number;
  rewardType:   string;
  amountSoles:  number | null;
  quantity:     number | null;
  percentage:   number | null;
  minLevel:     string | null;
  stock:        number | null;
  validityDays: number;
  sortOrder:    number;
  isActive:     boolean;
}

/** Lo que se manda al crear o editar un item. */
export type CatalogItemInput = Omit<CatalogItem, 'id'>;

export interface Redemption {
  id:          string;
  code:        string;
  itemName:    string;
  pointsSpent: number;
  rewardType:  string;
  amountSoles: number | null;
  quantity:    number | null;
  percentage:  number | null;
  status:      'active' | 'used' | 'expired' | 'cancelled';
  expiresAt:   string;
  usedAt:      string | null;
  usedNote:    string | null;
  createdAt:   string;
}

export interface Paged<T> {
  items:    T[];
  total:    number;
  page:     number;
  pageSize: number;
}

export interface Promotion {
  id:              string;
  name:            string;
  description:     string | null;
  promotionType:   'multiplier' | 'bonus_points' | 'discount' | 'free_trip';
  targetUserType:  'passenger' | 'driver' | 'both';
  multiplierValue: number | null;
  bonusPoints:     number | null;
  startDate:       string;
  endDate:         string | null;
  isActive:        boolean;
  daysOfWeek:      number[] | null;
  startHour:       number | null;
  endHour:         number | null;
  firstTripOfDay:  boolean;
  paymentMethods:  string[] | null;
  minAmount:       number | null;
  timesApplied:    number;
  pointsGiven:     number;
  /** Aviso de por qué la promoción podría no estar haciendo nada. */
  warning:         string | null;
}

/** Lo que se manda al crear o editar. */
export type PromotionInput = Omit<Promotion, 'id' | 'timesApplied' | 'pointsGiven' | 'warning'>;

export interface RaffleWinner {
  id:           string;
  userId:       string;
  ticketNumber: string;
  prizeRank:    number;
  prizeDetail:  string | null;
  status:       'pending' | 'delivered' | 'cancelled';
  deliveredAt:  string | null;
  note:         string | null;
}

export interface Raffle {
  id:               string;
  name:             string;
  raffleType:       'weekly' | 'monthly' | 'special';
  prizeDescription: string;
  prizeValue:       number | null;
  drawDate:         string;
  minLevelRequired: string | null;
  minMonthsActive:  number | null;
  targetUserType:   'passenger' | 'driver' | 'both';
  winnersCount:     number;
  status:           'open' | 'closed' | 'drawn' | 'cancelled';
  drawnAt:          string | null;
  ticketsAtDraw:    number | null;
  /** Semilla del sorteo: permite recalcular y comprobar el ganador. */
  drawSeed:         string | null;
  ticketsNow:       number;
  winners:          RaffleWinner[];
}

export type RaffleInput = Pick<Raffle,
  'name' | 'raffleType' | 'prizeDescription' | 'prizeValue' | 'drawDate' |
  'minLevelRequired' | 'minMonthsActive' | 'targetUserType' | 'winnersCount'
> & { open: boolean };

/** Resultado de recalcular el sorteo con la semilla guardada. */
export interface RaffleVerification {
  matches:             boolean;
  seed:                string | null;
  seedHash:            string | null;
  ticketCount:         number;
  recalculatedTickets: string[];
  storedTickets:       string[];
}

export interface RaffleMaintenanceResult {
  ticketsGranted: number;
  rafflesDrawn:   number;
  messages:       string[];
}

export interface ExpirationResult {
  warned:     number;
  expired:    number;
  pointsLost: number;
}

// ─────────────────────────────────────────────────────────────
// Llamadas al modulo Rewards (todas exigen rol admin)
// ─────────────────────────────────────────────────────────────

const base = () => `${API.rewards}/rewards/admin`;
const qs = (params: Record<string, string | number | null | undefined>) => {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
};

export const rewardsAdminApi = {
  // Configuracion
  settings: () =>
    apiFetch<RewardSetting[]>(`${base()}/settings`),

  saveSetting: (key: string, value: string) =>
    apiFetch<{ message: string }>(`${base()}/settings/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    }),

  // Niveles
  levels: (userType?: string) =>
    apiFetch<RewardLevel[]>(`${base()}/levels${qs({ userType })}`),

  saveLevel: (level: RewardLevel) =>
    apiFetch<RewardLevel>(`${base()}/levels/${level.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        displayName:          level.displayName,
        minPoints:            level.minPoints,
        maxPoints:            level.maxPoints,
        discountPercentage:   level.discountPercentage,
        monthlyFreeTrips:     level.monthlyFreeTrips,
        weeklyRaffleTickets:  level.weeklyRaffleTickets,
        monthlyRaffleTickets: level.monthlyRaffleTickets,
        isActive:             level.isActive,
      }),
    }),

  // Catalogo
  catalog: (userType?: string) =>
    apiFetch<CatalogItem[]>(`${base()}/catalog${qs({ userType })}`),

  createItem: (item: CatalogItemInput) =>
    apiFetch<CatalogItem>(`${base()}/catalog`, {
      method: 'POST',
      body: JSON.stringify(item),
    }),

  updateItem: (id: string, item: CatalogItemInput) =>
    apiFetch<CatalogItem>(`${base()}/catalog/${id}`, {
      method: 'PUT',
      body: JSON.stringify(item),
    }),

  // Canjes
  redemptions: (status: string | null, userType: string | null, page = 1, pageSize = 25) =>
    apiFetch<Paged<Redemption>>(`${base()}/redemptions${qs({ status, userType, page, pageSize })}`),

  markUsed: (code: string, note?: string) =>
    apiFetch<Redemption>(`${base()}/redemptions/${encodeURIComponent(code)}/use`, {
      method: 'PUT',
      body: JSON.stringify({ note: note || null }),
    }),

  cancel: (code: string, note?: string) =>
    apiFetch<Redemption>(`${base()}/redemptions/${encodeURIComponent(code)}/cancel`, {
      method: 'PUT',
      body: JSON.stringify({ note: note || null }),
    }),

  // Promociones
  promotions: () =>
    apiFetch<Promotion[]>(`${base()}/promotions`),

  createPromotion: (p: PromotionInput) =>
    apiFetch<Promotion>(`${base()}/promotions`, { method: 'POST', body: JSON.stringify(p) }),

  updatePromotion: (id: string, p: PromotionInput) =>
    apiFetch<Promotion>(`${base()}/promotions/${id}`, { method: 'PUT', body: JSON.stringify(p) }),

  setPromotionActive: (id: string, isActive: boolean) =>
    apiFetch<{ message: string }>(`${base()}/promotions/${id}/active`, {
      method: 'PUT', body: JSON.stringify({ isActive }),
    }),

  deletePromotion: (id: string) =>
    apiFetch<{ message: string }>(`${base()}/promotions/${id}`, { method: 'DELETE' }),

  // Sorteos
  raffles: () =>
    apiFetch<Raffle[]>(`${base()}/raffles`),

  createRaffle: (r: RaffleInput) =>
    apiFetch<Raffle>(`${base()}/raffles`, { method: 'POST', body: JSON.stringify(r) }),

  updateRaffle: (id: string, r: RaffleInput) =>
    apiFetch<Raffle>(`${base()}/raffles/${id}`, { method: 'PUT', body: JSON.stringify(r) }),

  deleteRaffle: (id: string) =>
    apiFetch<{ message: string }>(`${base()}/raffles/${id}`, { method: 'DELETE' }),

  drawRaffle: (id: string) =>
    apiFetch<Raffle>(`${base()}/raffles/${id}/draw`, { method: 'POST' }),

  verifyRaffle: (id: string) =>
    apiFetch<RaffleVerification>(`${base()}/raffles/${id}/verify`),

  deliverPrize: (winnerId: string, note?: string) =>
    apiFetch<{ message: string }>(`${base()}/raffles/winners/${winnerId}/deliver`, {
      method: 'PUT', body: JSON.stringify({ note: note || null }),
    }),

  raffleMaintenance: (draw: boolean) =>
    apiFetch<RaffleMaintenanceResult>(`${base()}/raffles/maintenance?draw=${draw}`, {
      method: 'POST',
    }),

  // Vencimiento
  runExpiration: () =>
    apiFetch<ExpirationResult>(`${base()}/expiration/run`, { method: 'POST' }),
};

// ─────────────────────────────────────────────────────────────
// Textos
// ─────────────────────────────────────────────────────────────

export const USER_TYPE_LABEL: Record<string, string> = {
  passenger: 'Pasajeros',
  driver:    'Conductores',
};

export const REWARD_TYPES: { value: string; label: string }[] = [
  { value: 'discount_amount', label: 'Descuento fijo (S/)' },
  { value: 'free_trip',       label: 'Viaje gratis hasta (S/)' },
  { value: 'discount_period', label: 'Porcentaje por N días' },
  { value: 'raffle_ticket',   label: 'Tickets de sorteo' },
  { value: 'wallet_bonus',    label: 'Bono a la cuenta (S/)' },
  { value: 'physical',        label: 'Producto físico' },
  { value: 'partner_benefit', label: 'Beneficio de socio' },
];

export const rewardTypeLabel = (v: string) =>
  REWARD_TYPES.find(t => t.value === v)?.label ?? v;

/** Que campos necesita cada tipo. El backend valida lo mismo. */
export const needsAmount     = (t: string) => ['discount_amount', 'free_trip', 'wallet_bonus'].includes(t);
export const needsPercentage = (t: string) => t === 'discount_period';
export const needsQuantity   = (t: string) => ['discount_period', 'raffle_ticket'].includes(t);

export const STATUS_LABEL: Record<string, string> = {
  active:    'Vigente',
  used:      'Entregado',
  expired:   'Vencido',
  cancelled: 'Anulado',
};

export const STATUS_COLOR: Record<string, string> = {
  active:    '#34d399',
  used:      '#94a3b8',
  expired:   '#f59e0b',
  cancelled: '#ef4444',
};

export const fmtPoints = (n: number) => n.toLocaleString('es-PE');

export const fmtDate = (iso: string | null, withTime = false) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-PE', withTime
    ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: 'short', year: 'numeric' });
};

export function describeReward(r: {
  rewardType: string; amountSoles: number | null; quantity: number | null; percentage: number | null;
}) {
  switch (r.rewardType) {
    case 'discount_amount': return `S/ ${r.amountSoles?.toFixed(2)} de descuento`;
    case 'free_trip':       return `Viaje gratis hasta S/ ${r.amountSoles?.toFixed(2)}`;
    case 'discount_period': return `${r.percentage}% por ${r.quantity} días`;
    case 'raffle_ticket':   return `${r.quantity} ticket(s) de sorteo`;
    case 'wallet_bonus':    return `Bono de S/ ${r.amountSoles?.toFixed(2)}`;
    case 'physical':        return 'Producto físico';
    case 'partner_benefit': return 'Beneficio de socio';
    default:                return r.rewardType;
  }
}

// ─────────────────────────────────────────────────────────────
// Promociones: textos y ayudas
// ─────────────────────────────────────────────────────────────

export const DIAS = [
  { n: 1, corto: 'Lun', largo: 'Lunes' },
  { n: 2, corto: 'Mar', largo: 'Martes' },
  { n: 3, corto: 'Mié', largo: 'Miércoles' },
  { n: 4, corto: 'Jue', largo: 'Jueves' },
  { n: 5, corto: 'Vie', largo: 'Viernes' },
  { n: 6, corto: 'Sáb', largo: 'Sábado' },
  { n: 7, corto: 'Dom', largo: 'Domingo' },
];

export const PROMO_TYPES = [
  { value: 'multiplier',   label: 'Multiplicar puntos' },
  { value: 'bonus_points', label: 'Puntos extra fijos' },
];

export const TARGETS = [
  { value: 'passenger', label: 'Pasajeros' },
  { value: 'driver',    label: 'Conductores' },
  { value: 'both',      label: 'Ambos' },
];

/** Resume en una frase qué hace y cuándo aplica una promoción. */
export function describePromotion(p: Promotion): string {
  const que = p.promotionType === 'multiplier'
    ? `${p.multiplierValue}x puntos`
    : `+${p.bonusPoints} puntos`;

  const cuando: string[] = [];

  if (p.daysOfWeek?.length) {
    const nombres = p.daysOfWeek.map(d => DIAS.find(x => x.n === d)?.corto ?? d).join(', ');
    cuando.push(nombres);
  }
  if (p.startHour !== null && p.endHour !== null) {
    cuando.push(`de ${p.startHour}:00 a ${p.endHour}:00`);
  }
  if (p.firstTripOfDay)        cuando.push('solo el primer viaje del día');
  if (p.paymentMethods?.length) cuando.push(`pagando con ${p.paymentMethods.join(' o ')}`);
  if (p.minAmount)              cuando.push(`desde S/ ${p.minAmount}`);

  return cuando.length ? `${que} · ${cuando.join(' · ')}` : `${que} · siempre`;
}

/**
 * Cómo se combina esta promoción con otras.
 * Día y franja compiten entre sí; primer viaje y método de pago suman.
 */
export function promotionGroup(p: Promotion): 'franja' | 'dia' | 'suma' | 'siempre' {
  if (p.firstTripOfDay || p.paymentMethods?.length) return 'suma';
  if (p.startHour !== null && p.endHour !== null)   return 'franja';
  if (p.daysOfWeek?.length)                          return 'dia';
  return 'siempre';
}

// ─────────────────────────────────────────────────────────────
// Sorteos: textos
// ─────────────────────────────────────────────────────────────

export const RAFFLE_TYPES = [
  { value: 'weekly',  label: 'Semanal' },
  { value: 'monthly', label: 'Mensual' },
  { value: 'special', label: 'Especial' },
];

export const RAFFLE_STATUS: Record<string, { label: string; color: string }> = {
  open:      { label: 'Abierto',   color: '#34d399' },
  closed:    { label: 'Cerrado',   color: '#f59e0b' },
  drawn:     { label: 'Sorteado',  color: '#818cf8' },
  cancelled: { label: 'Cancelado', color: '#94a3b8' },
};

export const raffleTypeLabel = (v: string) =>
  RAFFLE_TYPES.find(t => t.value === v)?.label ?? v;

/** Describe quién participa, en una frase. */
export function describeParticipants(r: Raffle, levelNames: Record<string, string>): string {
  const partes: string[] = [];
  partes.push(USER_TYPE_LABEL[r.targetUserType] ?? 'Todos');
  if (r.minLevelRequired) partes.push(`desde ${levelNames[r.minLevelRequired] ?? r.minLevelRequired}`);
  if (r.minMonthsActive)  partes.push(`con ${r.minMonthsActive}+ meses activos`);
  return partes.join(' · ');
}
