/**
 * Tienda de cosméticos. Cierra el ciclo de la economía: las monedas que se
 * ganan jugando se gastan en cosméticos (nada pay-to-win: sólo estética).
 *
 * La compra pasa por el ledger (débito auditable). Equipar es sólo un flag y no
 * cuesta nada.
 */

import { prisma } from '@trucazo/db';
import { aplicarMovimiento, ErrorEconomia } from './ledger.js';

export interface ResultadoCompra {
  ok: boolean;
  error?: string;
}

/** Compra un cosmético debitando su precio del ledger. Idempotente por dueño. */
export async function comprarCosmetico(
  userId: string,
  cosmeticId: string,
): Promise<ResultadoCompra> {
  const cosmetic = await prisma.cosmetic.findUnique({ where: { id: cosmeticId } });
  if (!cosmetic) return { ok: false, error: 'Ese cosmético no existe' };

  const yaLoTiene = await prisma.userCosmetic.findUnique({
    where: { userId_cosmeticId: { userId, cosmeticId } },
  });
  if (yaLoTiene) return { ok: false, error: 'Ya tenés este cosmético' };

  try {
    await prisma.$transaction(async (tx) => {
      if (cosmetic.priceCoins > 0) {
        await aplicarMovimiento(tx, {
          userId,
          type: 'ADMIN_ADJUSTMENT', // compra en tienda; el débito queda asentado
          amount: -BigInt(cosmetic.priceCoins),
          idempotencyKey: `shop:${userId}:${cosmeticId}`,
          reason: `Compra: ${cosmetic.name}`,
          metadata: { cosmeticId, kind: cosmetic.kind },
        });
      }
      await tx.userCosmetic.create({ data: { userId, cosmeticId } });
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof ErrorEconomia && e.codigo === 'SALDO_INSUFICIENTE') {
      return { ok: false, error: 'No te alcanzan las monedas' };
    }
    return { ok: false, error: 'No se pudo completar la compra' };
  }
}

/** Equipa un cosmético del usuario, desequipando el otro del mismo tipo. */
export async function equiparCosmetico(
  userId: string,
  cosmeticId: string,
): Promise<ResultadoCompra> {
  const propio = await prisma.userCosmetic.findUnique({
    where: { userId_cosmeticId: { userId, cosmeticId } },
    include: { cosmetic: true },
  });
  if (!propio) return { ok: false, error: 'No tenés ese cosmético' };

  await prisma.$transaction(async (tx) => {
    // Desequipa los del mismo tipo (sólo uno activo por categoría).
    const mismos = await tx.userCosmetic.findMany({
      where: { userId, cosmetic: { kind: propio.cosmetic.kind } },
    });
    for (const m of mismos) {
      await tx.userCosmetic.update({ where: { id: m.id }, data: { equipped: false } });
    }
    await tx.userCosmetic.update({ where: { id: propio.id }, data: { equipped: true } });
  });

  return { ok: true };
}

/** Catálogo completo con marca de "lo tengo" / "lo tengo equipado". */
export async function catalogoPara(userId: string) {
  const [cosmeticos, propios] = await Promise.all([
    prisma.cosmetic.findMany({ orderBy: [{ kind: 'asc' }, { priceCoins: 'asc' }] }),
    prisma.userCosmetic.findMany({ where: { userId } }),
  ]);
  const porId = new Map(propios.map((p) => [p.cosmeticId, p]));
  return cosmeticos.map((c) => ({
    ...c,
    tengo: porId.has(c.id),
    equipado: porId.get(c.id)?.equipped ?? false,
  }));
}
