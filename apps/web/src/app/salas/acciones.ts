'use server';

/** Server Actions de salas: crear y validar el ingreso por código. */

import { randomInt } from 'node:crypto';
import { redirect } from 'next/navigation';
import { prisma } from '@trucazo/db';
import { generarCodigoSala, roomConfigSchema } from '@trucazo/shared';
import { requireUser } from '@/lib/session';

export interface EstadoSala {
  error?: string;
}

/** Genera un código único (reintenta ante la colisión, que es rarísima). */
async function codigoLibre(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = generarCodigoSala((max) => randomInt(max));
    const existe = await prisma.room.findUnique({ where: { code }, select: { id: true } });
    if (!existe) return code;
  }
  throw new Error('No se pudo generar un código de sala');
}

export async function crearSala(_prev: EstadoSala, formData: FormData): Promise<EstadoSala> {
  const user = await requireUser();

  const parsed = roomConfigSchema.safeParse({
    name: String(formData.get('name') || `Mesa de ${user.displayName}`),
    mode: String(formData.get('mode') ?? 'CASUAL_1V1'),
    pointsToWin: Number(formData.get('pointsToWin') ?? 30),
    isPrivate: formData.get('isPrivate') === 'on',
    florEnabled: formData.get('florEnabled') === 'on',
    // Sin bots: todos contra todos, se juega contra personas.
    allowBots: false,
    betAmount: Number(formData.get('betAmount') ?? 0),
    chatEnabled: true,
    allowSpectators: true,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Configuración inválida' };
  }
  const cfg = parsed.data;

  // Validación de saldo en el SERVIDOR: el cliente no decide si puede apostar.
  if (cfg.betAmount > 0) {
    const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
    if (!wallet || Number(wallet.balance) < cfg.betAmount) {
      return { error: 'No te alcanzan las monedas para esa apuesta' };
    }
  }

  const code = await codigoLibre();
  await prisma.room.create({
    data: {
      code,
      name: cfg.name,
      hostUserId: user.id,
      mode: cfg.mode,
      state: 'WAITING',
      pointsToWin: cfg.pointsToWin,
      isPrivate: cfg.isPrivate,
      florEnabled: cfg.florEnabled,
      allowBots: cfg.allowBots,
      betAmount: BigInt(cfg.betAmount),
      participants: { create: { userId: user.id, seat: 0, team: 0 } },
    },
  });

  redirect(`/sala/${code}`);
}

/** Valida un código y redirige a la sala. */
export async function unirsePorCodigo(_prev: EstadoSala, formData: FormData): Promise<EstadoSala> {
  await requireUser();
  const code = String(formData.get('code') ?? '')
    .trim()
    .toUpperCase();
  if (code.length !== 6) return { error: 'El código tiene 6 caracteres' };

  const room = await prisma.room.findUnique({ where: { code } });
  if (!room) return { error: 'No existe una sala con ese código' };
  if (room.state === 'FINISHED' || room.state === 'CLOSED') {
    return { error: 'Esa sala ya terminó' };
  }

  redirect(`/sala/${code}`);
}
