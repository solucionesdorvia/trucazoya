/**
 * Datos de desarrollo. NO incluye credenciales reales.
 * Contraseña de todas las cuentas demo: "trucazo123".
 */

import { randomBytes, scryptSync } from 'node:crypto';
import { PrismaClient } from '../src/generated/client/index.js';

const prisma = new PrismaClient();

/** Hash scrypt con sal, formato "salt:hash" (mismo esquema que usa la app). */
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

async function main() {
  const password = hashPassword('trucazo123');

  // ── Usuarios base ──────────────────────────────────────────────────────
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@trucazo.local',
      passwordHash: password,
      role: 'ADMIN',
      emailVerified: true,
      profile: { create: { displayName: 'Administrador' } },
      wallet: { create: { balance: 0n } },
    },
  });

  const cajero = await prisma.user.upsert({
    where: { username: 'cajero1' },
    update: {},
    create: {
      username: 'cajero1',
      email: 'cajero1@trucazo.local',
      passwordHash: password,
      role: 'CASHIER',
      emailVerified: true,
      profile: { create: { displayName: 'Cajero Uno' } },
      wallet: { create: { balance: 0n } },
      cashierProfile: {
        create: { whatsappE164: '+5491100000000', displayName: 'Cajero Uno · 24hs' },
      },
    },
  });

  for (const name of ['pepe', 'juana', 'toto', 'mica']) {
    await prisma.user.upsert({
      where: { username: name },
      update: {},
      create: {
        username: name,
        email: `${name}@trucazo.local`,
        passwordHash: password,
        emailVerified: true,
        profile: { create: { displayName: name[0]!.toUpperCase() + name.slice(1) } },
        wallet: { create: { balance: 500n } }, // monedas de bienvenida
        ratings: {
          create: [
            { mode: 'RANKED_1V1', rating: 1500 },
            { mode: 'RANKED_2V2', rating: 1500 },
          ],
        },
      },
    });
  }

  // ── Feature flags ──────────────────────────────────────────────────────
  for (const [key, enabled] of [
    ['REAL_MONEY', false],
    ['TOURNAMENTS', true],
    ['CLUBS', true],
  ] as const) {
    await prisma.featureFlag.upsert({
      where: { key },
      update: { enabled },
      create: { key, enabled },
    });
  }

  // ── Configuración del sistema ──────────────────────────────────────────
  await prisma.systemSetting.upsert({
    where: { key: 'economy' },
    update: {},
    create: { key: 'economy', value: { rakeBps: 500, dailyBonus: 100, newUserCoins: 500 } },
  });

  // ── Temporada activa ────────────────────────────────────────────────────
  await prisma.season.create({
    data: {
      name: 'Temporada 1 — Apertura',
      startsAt: new Date('2026-07-01'),
      endsAt: new Date('2026-09-30'),
      active: true,
    },
  });

  // ── Cosméticos y logros de ejemplo ──────────────────────────────────────
  await prisma.cosmetic.createMany({
    data: [
      { code: 'back_clasico', kind: 'CARD_BACK', name: 'Reverso Clásico', priceCoins: 0 },
      { code: 'back_dorado', kind: 'CARD_BACK', name: 'Reverso Dorado', priceCoins: 1000 },
      { code: 'mat_verde', kind: 'MAT', name: 'Tapete Verde', priceCoins: 0 },
      { code: 'title_matador', kind: 'TITLE', name: 'Matador', priceCoins: 2500 },
    ],
    skipDuplicates: true,
  });

  await prisma.achievement.createMany({
    data: [
      { code: 'first_win', name: 'Primera Victoria', description: 'Ganá tu primera partida' },
      { code: 'flor_master', name: 'Rey de la Flor', description: 'Cantá 50 flores' },
      { code: 'comeback', name: 'Remontada', description: 'Ganá desde 0 a 20 en contra' },
    ],
    skipDuplicates: true,
  });

  console.log(
    `✓ Seed completo. admin=${admin.username} cajero=${cajero.username} (pass: trucazo123)`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
