import { API, apiFetch } from './api';

// ─────────────────────────────────────────────────────────────
// Tipos: son un espejo exacto de los DTOs de Bugie.Rewards.Api
// ─────────────────────────────────────────────────────────────

export interface PointsProfile {
  userId:             string;
  userType:           'passenger' | 'driver';
  totalPoints:        number;
  availablePoints:    number;
  redeemedPoints:     number;
  currentLevel:       string;
  currentLevelName:   string;
  discountPercentage: number;
  nextLevel:          string | null;
  nextLevelName:      string | null;
  pointsToNextLevel:  number;
  progressPercentage: number;
  pointsExpiryDate:   string | null;
  lastActivityDate:   string | null;
}

export interface PointsTransaction {
  id:           string;
  type:         'earn' | 'redeem' | 'expire' | 'bonus';
  points:       number;
  sourceEvent:  string;
  referenceId:  string | null;
  balanceAfter: number;
  expiryDate:   string | null;
  notes:        string | null;
  createdAt:    string;
}

export interface RewardLevel {
  id:                   string;
  userType:             string;
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
  id:            string;
  code:          string;
  userType:      string;
  name:          string;
  description:   string | null;
  pointsCost:    number;
  rewardType:    string;
  amountSoles:   number | null;
  quantity:      number | null;
  percentage:    number | null;
  minLevel:      string | null;
  stock:         number | null;
  validityDays:  number;
  sortOrder:     number;
  isActive:      boolean;
  canAfford:     boolean;
  pointsMissing: number;
  blockedReason: string | null;
}

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

export interface RedeemResult {
  redemption:           Redemption;
  availablePointsAfter: number;
  currentLevel:         string;
}

export interface ActivePromotion {
  id:          string;
  name:        string;
  description: string | null;
  /** Qué ganas, en texto: «2x puntos» o «+50 puntos». */
  reward:      string;
  /** Cuándo aplica: «Lun a Vie, de 12:00 a 14:00». */
  when:        string;
  /** true si aplica justo ahora. */
  activeNow:   boolean;
  endDate:     string | null;
}

export interface UserRaffle {
  id:                string;
  name:              string;
  raffleType:        'weekly' | 'monthly' | 'special';
  prizeDescription:  string;
  prizeValue:        number | null;
  drawDate:          string;
  status:            'open' | 'closed' | 'drawn' | 'cancelled';
  myTickets:         number;
  eligible:          boolean;
  notEligibleReason: string | null;
  iWon:              boolean;
  myPrizeRank:       number | null;
  myTicketNumber:    string | null;
}

export interface ReferredPerson {
  userType:       string;
  status:         'pending' | 'qualified';
  tripsCompleted: number;
  pointsEarned:   number;
  joinedAt:       string;
}

export interface MyReferral {
  code:               string;
  enabled:            boolean;
  totalInvited:       number;
  qualified:          number;
  pointsEarned:       number;
  pointsPerPassenger: number;
  pointsPerDriver:    number;
  qualifyTrips:       number;
  qualifyPoints:      number;
  people:             ReferredPerson[];
}

export interface ProgressDay {
  date:    string;
  hasTrip: boolean;
  isToday: boolean;
}

export interface Progress {
  streakDays:     number;
  streakTarget:   number;
  streakPoints:   number;
  streakDaysToGo: number;
  traveledToday:  boolean;
  days:           ProgressDay[];

  weeklyTrips:    number;
  /** 0 = la meta semanal no aplica a este tipo de cuenta. */
  weeklyGoal:     number;
  weeklyPoints:   number;

  isAnniversaryMonth:    boolean;
  anniversaryMultiplier: number;
  memberSince:           string | null;
}

export interface RankingEntry {
  position:        number;
  userId:          string;
  fullName:        string | null;
  level:           string;
  pointsThisMonth: number;
  trips:           number;
  isMe:            boolean;
  relation:        string;
}

export interface FriendsRanking {
  myPosition:        number;
  myPointsThisMonth: number;
  monthLabel:        string;
  entries:           RankingEntry[];
}

export interface Paged<T> {
  items:    T[];
  total:    number;
  page:     number;
  pageSize: number;
}

// ─────────────────────────────────────────────────────────────
// Llamadas. El backend sabe si eres pasajero o conductor por el
// token, asi que las mismas funciones sirven para los dos.
// ─────────────────────────────────────────────────────────────

const base = () => `${API.rewards}/rewards`;

export const rewardsApi = {
  me: () =>
    apiFetch<PointsProfile>(`${base()}/me`),

  history: (page = 1, pageSize = 10) =>
    apiFetch<Paged<PointsTransaction>>(`${base()}/me/history?page=${page}&pageSize=${pageSize}`),

  levels: () =>
    apiFetch<RewardLevel[]>(`${base()}/levels`),

  catalog: () =>
    apiFetch<CatalogItem[]>(`${base()}/catalog`),

  redeem: (catalogItemId: string) =>
    apiFetch<RedeemResult>(`${base()}/redeem`, {
      method: 'POST',
      body: JSON.stringify({ catalogItemId }),
    }),

  /// POST /api/trips/{id}/coupon — vive en TRIPS, no en Rewards, porque el
  /// cupon se aplica sobre un viaje. Se expone aca para tenerlo todo junto.
  applyCouponToTrip: (tripId: string, code: string) =>
    apiFetch<{
      tripId: string; code: string; itemName: string;
      fareBeforeDiscount: number; discountAmount: number;
      amountToPay: number; warning: string | null;
    }>(`${API.trips}/trips/${tripId}/coupon`, {
      method: 'POST', body: JSON.stringify({ code }),
    }),

  removeCouponFromTrip: (tripId: string) =>
    apiFetch<{ message: string }>(`${API.trips}/trips/${tripId}/coupon`, {
      method: 'DELETE',
    }),

  progress: () =>
    apiFetch<Progress>(`${base()}/me/progress`),

  ranking: () =>
    apiFetch<FriendsRanking>(`${base()}/me/ranking`),

  myReferral: () =>
    apiFetch<MyReferral>(`${base()}/me/referral`),

  invite: (email: string) =>
    apiFetch<{ message: string }>(`${base()}/me/referral/invite`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  promotions: () =>
    apiFetch<ActivePromotion[]>(`${base()}/promotions`),

  raffles: () =>
    apiFetch<UserRaffle[]>(`${base()}/raffles`),

  myCoupons: (status: string | null, page = 1, pageSize = 20) => {
    const s = status ? `&status=${status}` : '';
    return apiFetch<Paged<Redemption>>(`${base()}/me/redemptions?page=${page}&pageSize=${pageSize}${s}`);
  },
};

// ─────────────────────────────────────────────────────────────
// Textos para mostrar. Un solo lugar, para que todas las
// pantallas digan lo mismo.
// ─────────────────────────────────────────────────────────────

export const TX_LABEL: Record<string, string> = {
  earn:   'Ganaste',
  redeem: 'Canjeaste',
  expire: 'Vencieron',
  bonus:  'Devolución',
};

export const SOURCE_LABEL: Record<string, string> = {
  trip_completed:     'Viaje completado',
  catalog_redemption: 'Canje de recompensa',
  redemption_refund:  'Canje anulado',
  points_expired:     'Puntos vencidos',
};

export const STATUS_LABEL: Record<string, string> = {
  active:    'Vigente',
  used:      'Usado',
  expired:   'Vencido',
  cancelled: 'Anulado',
};

export const STATUS_COLOR: Record<string, string> = {
  active:    '#34d399',
  used:      '#94a3b8',
  expired:   '#f59e0b',
  cancelled: '#ef4444',
};

export const REWARD_ICON: Record<string, string> = {
  discount_amount: 'fa-solid fa-tag',
  free_trip:       'fa-solid fa-car-side',
  discount_period: 'fa-solid fa-percent',
  raffle_ticket:   'fa-solid fa-ticket',
  wallet_bonus:    'fa-solid fa-wallet',
  physical:        'fa-solid fa-gift',
  partner_benefit: 'fa-solid fa-handshake',
};

/** Colores de cada nivel. Si el admin crea uno nuevo, cae al gris. */
export const LEVEL_COLOR: Record<string, string> = {
  bronze:   '#cd7f32',
  silver:   '#a8b3c1',
  gold:     '#f5b400',
  platinum: '#7dd3fc',
};

export const fmtPoints = (n: number) => n.toLocaleString('es-PE');

export const fmtDate = (iso: string | null, withTime = false) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-PE', withTime
    ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: 'short', year: 'numeric' });
};

/** Dias que faltan hasta una fecha. Negativo si ya paso. */
export const daysUntil = (iso: string | null) => {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
};

/** Descripcion corta y concreta de lo que entrega una recompensa. */
export function describeReward(r: {
  rewardType: string; amountSoles: number | null; quantity: number | null; percentage: number | null;
}) {
  switch (r.rewardType) {
    case 'discount_amount': return `S/ ${r.amountSoles?.toFixed(2)} de descuento`;
    case 'free_trip':       return `Viaje gratis hasta S/ ${r.amountSoles?.toFixed(2)}`;
    case 'discount_period': return `${r.percentage}% de descuento por ${r.quantity} días`;
    case 'raffle_ticket':   return `${r.quantity} ticket${r.quantity === 1 ? '' : 's'} de sorteo`;
    case 'wallet_bonus':    return `S/ ${r.amountSoles?.toFixed(2)} a tu cuenta`;
    case 'physical':        return 'Producto físico';
    case 'partner_benefit': return 'Beneficio de socio';
    default:                return r.rewardType;
  }
}

export const RAFFLE_TYPE_LABEL: Record<string, string> = {
  weekly:  'Semanal',
  monthly: 'Mensual',
  special: 'Especial',
};

/** Cuánto falta para el sorteo, en texto. */
export function daysToDraw(iso: string): string {
  const d = daysUntil(iso) ?? 0;
  if (d < 0)   return 'Ya se sorteó';
  if (d === 0) return 'Se sortea hoy';
  if (d === 1) return 'Se sortea mañana';
  return `Faltan ${d} días`;
}
