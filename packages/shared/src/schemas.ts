/**
 * Schemas Zod compartidos. El MISMO schema valida en el cliente (formularios)
 * y en el servidor (endpoints y eventos), evitando divergencias.
 */

import { z } from 'zod';

export const usernameSchema = z
  .string()
  .min(3, 'Mínimo 3 caracteres')
  .max(20, 'Máximo 20 caracteres')
  .regex(/^[a-zA-Z0-9_]+$/, 'Sólo letras, números y guión bajo');

export const passwordSchema = z.string().min(8, 'Mínimo 8 caracteres').max(128);

/** Edad cumplida (en años) a partir de una fecha de nacimiento. */
export function edadEnAnios(nacimiento: Date, ahora = new Date()): number {
  let edad = ahora.getFullYear() - nacimiento.getFullYear();
  const m = ahora.getMonth() - nacimiento.getMonth();
  if (m < 0 || (m === 0 && ahora.getDate() < nacimiento.getDate())) edad--;
  return edad;
}

export const EDAD_MINIMA = 18;

/** Fecha de nacimiento (YYYY-MM-DD) con barrera de mayoría de edad. */
export const birthdateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Fecha inválida')
  .refine(
    (s) => edadEnAnios(new Date(s)) >= EDAD_MINIMA,
    `Tenés que ser mayor de ${EDAD_MINIMA} años`,
  );

export const registerSchema = z.object({
  username: usernameSchema,
  email: z.string().email('Email inválido'),
  password: passwordSchema,
  birthdate: birthdateSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  emailOrUsername: z.string().min(3),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

// ─── Salas ────────────────────────────────────────────────────────────────

export const roomConfigSchema = z.object({
  name: z.string().min(1).max(40),
  mode: z.enum(['CASUAL_1V1', 'RANKED_1V1', 'CASUAL_2V2', 'RANKED_2V2']),
  pointsToWin: z.union([z.literal(15), z.literal(30)]),
  isPrivate: z.boolean().default(false),
  password: z.string().max(40).optional(),
  florEnabled: z.boolean().default(true),
  allowSpectators: z.boolean().default(true),
  maxSpectators: z.number().int().min(0).max(200).default(20),
  chatEnabled: z.boolean().default(true),
  turnTimeoutSec: z.number().int().min(10).max(120).default(30),
  betAmount: z.number().int().min(0).default(0),
  minLevel: z.number().int().min(0).default(0),
  allowBots: z.boolean().default(false),
});
export type RoomConfigInput = z.infer<typeof roomConfigSchema>;

export const joinRoomSchema = z.object({
  code: z.string().length(6),
  password: z.string().max(40).optional(),
});
export type JoinRoomInput = z.infer<typeof joinRoomSchema>;

// ─── Economía / cajeros ─────────────────────────────────────────────────

export const cashierDepositSchema = z.object({
  targetUserId: z.string().min(1),
  amount: z.number().int().positive('El monto debe ser positivo'),
  reference: z.string().max(100).optional(),
  note: z.string().max(280).optional(),
  /** Clave de idempotencia para evitar dobles acreditaciones. */
  idempotencyKey: z.string().uuid(),
});
export type CashierDepositInput = z.infer<typeof cashierDepositSchema>;

export const withdrawalRequestSchema = z.object({
  cashierId: z.string().min(1),
  amount: z.number().int().positive(),
});
export type WithdrawalRequestInput = z.infer<typeof withdrawalRequestSchema>;

export const withdrawalResolveSchema = z.object({
  requestId: z.string().min(1),
  action: z.enum(['PAID', 'REJECTED']),
  note: z.string().max(280).optional(),
  idempotencyKey: z.string().uuid(),
});
export type WithdrawalResolveInput = z.infer<typeof withdrawalResolveSchema>;

export const adminAdjustSchema = z.object({
  userId: z.string().min(1),
  amount: z.number().int(), // puede ser negativo
  reason: z.string().min(1).max(280),
  idempotencyKey: z.string().uuid(),
});
export type AdminAdjustInput = z.infer<typeof adminAdjustSchema>;
