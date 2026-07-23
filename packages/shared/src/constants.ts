/** Constantes compartidas por web y game-server. */

export const ROLES = ['USER', 'CASHIER', 'MODERATOR', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const ROOM_STATES = [
  'CREATED',
  'WAITING',
  'FULL',
  'READY_CHECK',
  'STARTING',
  'IN_PROGRESS',
  'PAUSED',
  'FINISHED',
  'CANCELLED',
  'CLOSED',
] as const;
export type RoomState = (typeof ROOM_STATES)[number];

/** Tipos de asiento en el ledger. Determinan el signo y la semántica contable. */
export const LEDGER_TYPES = [
  'CASHIER_DEPOSIT', // carga de monedas por un cajero
  'CASHIER_WITHDRAWAL', // retiro pagado por un cajero
  'BET_RESERVED', // reserva de apuesta al iniciar partida
  'BET_WON', // premio de apuesta
  'BET_LOST', // pérdida de apuesta (contrapartida de la reserva)
  'BET_REFUND', // reembolso por cancelación/anulación
  'RAKE', // comisión de la plataforma
  'DAILY_BONUS',
  'LEVEL_REWARD',
  'TOURNAMENT_ENTRY',
  'TOURNAMENT_PRIZE',
  'ADMIN_ADJUSTMENT',
  'PENALTY',
] as const;
export type LedgerType = (typeof LEDGER_TYPES)[number];

export const WITHDRAWAL_STATES = [
  'PENDING',
  'RESERVED',
  'PAID',
  'REJECTED',
  'CANCELLED_BY_USER',
] as const;
export type WithdrawalState = (typeof WITHDRAWAL_STATES)[number];

/** Divisiones del ranking competitivo. */
export const DIVISIONS = [
  'BRONCE',
  'PLATA',
  'ORO',
  'PLATINO',
  'DIAMANTE',
  'MAESTRO',
  'GRAN_MAESTRO',
] as const;
export type Division = (typeof DIVISIONS)[number];

export const GAME_MODES = ['CASUAL_1V1', 'RANKED_1V1', 'CASUAL_2V2', 'RANKED_2V2'] as const;
export type GameMode = (typeof GAME_MODES)[number];

/** Genera un link wa.me con mensaje prellenado (contacto con cajero). */
export function whatsappLink(phoneE164: string, message: string): string {
  const digits = phoneE164.replace(/[^\d]/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
