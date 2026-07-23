/**
 * Lógica de cuentas, independiente de Next (sin cookies ni redirects), para
 * poder testearla contra la base. Las Server Actions son una capa fina encima.
 */

import { prisma } from '@trucazo/db';
import { hashPassword, verifyPassword } from './password';

export type ResultadoCuenta =
  | { ok: true; userId: string }
  | { ok: false; error: string; campo?: 'username' | 'email' | 'password' };

const MONEDAS_BIENVENIDA = BigInt(process.env.NEW_USER_COINS ?? '500');

/**
 * Crea una cuenta con sus monedas de bienvenida. El alta del saldo se registra
 * como asiento del ledger en la MISMA transacción: nunca hay saldo sin
 * respaldo contable.
 */
export async function crearCuenta(input: {
  username: string;
  email: string;
  password: string;
}): Promise<ResultadoCuenta> {
  const existente = await prisma.user.findFirst({
    where: { OR: [{ username: input.username }, { email: input.email }] },
    select: { username: true },
  });
  if (existente) {
    return existente.username === input.username
      ? { ok: false, error: 'Ese nombre de usuario ya está tomado', campo: 'username' }
      : { ok: false, error: 'Ya hay una cuenta con ese email', campo: 'email' };
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.$transaction(async (tx) => {
    const creado = await tx.user.create({
      data: {
        username: input.username,
        email: input.email,
        passwordHash,
        profile: { create: { displayName: input.username } },
        wallet: { create: { balance: MONEDAS_BIENVENIDA } },
        ratings: {
          create: [
            { mode: 'RANKED_1V1', rating: 1500 },
            { mode: 'RANKED_2V2', rating: 1500 },
          ],
        },
      },
    });

    await tx.ledgerEntry.create({
      data: {
        userId: creado.id,
        type: 'LEVEL_REWARD',
        amount: MONEDAS_BIENVENIDA,
        balanceBefore: 0n,
        balanceAfter: MONEDAS_BIENVENIDA,
        idempotencyKey: `welcome:${creado.id}`,
        reason: 'Monedas de bienvenida',
      },
    });

    return creado;
  });

  return { ok: true, userId: user.id };
}

/**
 * Autentica por usuario o email. Siempre ejecuta la verificación de hash
 * (incluso si el usuario no existe) para no filtrar cuentas por timing, y
 * devuelve un mensaje genérico.
 */
export async function autenticar(
  emailOrUsername: string,
  password: string,
): Promise<ResultadoCuenta> {
  const user = await prisma.user.findFirst({
    where: { OR: [{ username: emailOrUsername }, { email: emailOrUsername }] },
  });

  const hash = user?.passwordHash ?? 'no:existe';
  const ok = await verifyPassword(password, hash);

  if (!user || !ok) return { ok: false, error: 'Usuario o contraseña incorrectos' };
  if (user.suspended) return { ok: false, error: 'Esta cuenta está suspendida' };

  return { ok: true, userId: user.id };
}

/** Crea una cuenta de invitado (juega sin apostar hasta que se registre). */
export async function crearInvitado(): Promise<{ userId: string; username: string }> {
  const sufijo = Math.random().toString(36).slice(2, 7);
  const username = `invitado_${sufijo}`;
  const user = await prisma.user.create({
    data: {
      username,
      isGuest: true,
      profile: { create: { displayName: `Invitado ${sufijo.toUpperCase()}` } },
      wallet: { create: { balance: 0n } },
    },
  });
  return { userId: user.id, username };
}
