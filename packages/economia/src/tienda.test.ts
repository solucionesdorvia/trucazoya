import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@trucazo/db';
import { catalogoPara, comprarCosmetico, equiparCosmetico } from './tienda.js';
import { saldoDe } from './ledger.js';

const sufijo = Date.now().toString(36);
let userId = '';
const cosmeticosCreados: string[] = [];

async function cosmetico(code: string, precio: number, kind: 'CARD_BACK' | 'MAT' = 'CARD_BACK') {
  const c = await prisma.cosmetic.create({
    data: { code: `${code}_${sufijo}`, kind, name: code, priceCoins: precio },
  });
  cosmeticosCreados.push(c.id);
  return c.id;
}

beforeAll(async () => {
  const u = await prisma.user.create({
    data: {
      username: `shop_${sufijo}`,
      profile: { create: { displayName: 'Shop' } },
      wallet: { create: { balance: 1000n } },
    },
  });
  userId = u.id;
  await prisma.ledgerEntry.create({
    data: {
      userId,
      type: 'ADMIN_ADJUSTMENT',
      amount: 1000n,
      balanceBefore: 0n,
      balanceAfter: 1000n,
      idempotencyKey: `seed:${userId}`,
    },
  });
});

afterAll(async () => {
  await prisma.userCosmetic.deleteMany({ where: { userId } });
  await prisma.cosmetic.deleteMany({ where: { id: { in: cosmeticosCreados } } });
  await prisma.ledgerEntry.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

describe('tienda', () => {
  it('comprar debita del ledger y da el cosmético', async () => {
    const id = await cosmetico('dorado', 300);
    const antes = (await saldoDe(userId)).balance;
    const r = await comprarCosmetico(userId, id);
    expect(r.ok).toBe(true);
    expect((await saldoDe(userId)).balance).toBe(antes - 300n);
  });

  it('no se compra dos veces', async () => {
    const id = await cosmetico('unico', 100);
    await comprarCosmetico(userId, id);
    const otra = await comprarCosmetico(userId, id);
    expect(otra.ok).toBe(false);
  });

  it('rechaza si no alcanza', async () => {
    const id = await cosmetico('carisimo', 999999);
    const r = await comprarCosmetico(userId, id);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('No te alcanzan');
  });

  it('equipar deja uno solo activo por tipo', async () => {
    const a = await cosmetico('reverso_a', 0);
    const b = await cosmetico('reverso_b', 0);
    await comprarCosmetico(userId, a);
    await comprarCosmetico(userId, b);
    await equiparCosmetico(userId, a);
    await equiparCosmetico(userId, b);
    const cat = await catalogoPara(userId);
    const equipadosCardBack = cat.filter((c) => c.kind === 'CARD_BACK' && c.equipado);
    expect(equipadosCardBack).toHaveLength(1);
    expect(equipadosCardBack[0]!.id).toBe(b);
  });
});
