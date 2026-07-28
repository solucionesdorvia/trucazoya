/**
 * Datos de desarrollo. NO incluye credenciales reales.
 * Contraseña de todas las cuentas demo: "trucazo123".
 */

import { randomBytes, scryptSync } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Hash scrypt con sal, formato "salt:hash" (mismo esquema que usa la app). */
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

async function main() {
  // Las contraseñas de admin y cajero salen de variables de entorno: en
  // producción NO puede haber credenciales por defecto. Si no están definidas y
  // el entorno es productivo, abortamos para no dejar cuentas adivinables.
  const esProd = process.env.NODE_ENV === 'production';
  const adminPass = process.env.SEED_ADMIN_PASSWORD;
  const cajeroPass = process.env.SEED_CASHIER_PASSWORD;
  if (esProd && (!adminPass || !cajeroPass)) {
    throw new Error(
      'En producción definí SEED_ADMIN_PASSWORD y SEED_CASHIER_PASSWORD antes de correr el seed.',
    );
  }
  const password = hashPassword('trucazo123'); // sólo cuentas demo (no prod)
  const adminHash = hashPassword(adminPass ?? 'trucazo123');
  const cajeroHash = hashPassword(cajeroPass ?? 'trucazo123');
  // Cuentas operativas: mayores de edad verificadas.
  const nacimientoAdulto = new Date('1990-01-01');
  const edadVerificada = new Date();

  // ── Usuarios base ──────────────────────────────────────────────────────
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: { passwordHash: adminHash },
    create: {
      username: 'admin',
      email: 'admin@trucazo.local',
      passwordHash: adminHash,
      role: 'ADMIN',
      emailVerified: true,
      birthdate: nacimientoAdulto,
      ageVerifiedAt: edadVerificada,
      acceptedTermsAt: edadVerificada,
      province: 'CABA',
      kycVerifiedAt: edadVerificada,
      profile: { create: { displayName: 'Administrador' } },
      wallet: { create: { balance: 0n } },
    },
  });

  const cajero = await prisma.user.upsert({
    where: { username: 'cajero1' },
    update: { passwordHash: cajeroHash },
    create: {
      username: 'cajero1',
      email: 'cajero1@trucazo.local',
      passwordHash: cajeroHash,
      role: 'CASHIER',
      emailVerified: true,
      birthdate: nacimientoAdulto,
      ageVerifiedAt: edadVerificada,
      acceptedTermsAt: edadVerificada,
      province: 'CABA',
      kycVerifiedAt: edadVerificada,
      profile: { create: { displayName: 'Cajero Uno' } },
      wallet: { create: { balance: 0n } },
      cashierProfile: {
        create: { whatsappE164: '+5491100000000', displayName: 'Cajero Uno · 24hs' },
      },
    },
  });

  // Cuentas demo: sólo se crean fuera de producción.
  if (!esProd) {
    for (const name of ['pepe', 'juana', 'toto', 'mica']) {
      await prisma.user.upsert({
        where: { username: name },
        update: {},
        create: {
          username: name,
          email: `${name}@trucazo.local`,
          passwordHash: password,
          emailVerified: true,
          birthdate: nacimientoAdulto,
          ageVerifiedAt: edadVerificada,
          acceptedTermsAt: edadVerificada,
          province: 'CABA',
          kycVerifiedAt: edadVerificada,
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
      { code: 'back_noche', kind: 'CARD_BACK', name: 'Reverso Nocturno', priceCoins: 750 },
      { code: 'mat_verde', kind: 'MAT', name: 'Tapete Verde', priceCoins: 0 },
      { code: 'mat_bordo', kind: 'MAT', name: 'Tapete Bordó', priceCoins: 600 },
      { code: 'frame_oro', kind: 'FRAME', name: 'Marco Dorado', priceCoins: 1500 },
      { code: 'title_matador', kind: 'TITLE', name: 'Matador', priceCoins: 2500 },
      { code: 'title_pieza', kind: 'TITLE', name: 'Pieza', priceCoins: 800 },
      { code: 'emoji_mate', kind: 'EMOJI', name: 'Mate', priceCoins: 300 },
    ],
    skipDuplicates: true,
  });

  await prisma.mission.upsert({
    where: { code: 'daily_play_3' },
    update: {},
    create: {
      code: 'daily_play_3',
      name: 'Tres al hilo',
      description: 'Jugá 3 partidas hoy',
      period: 'DAILY',
      target: 3,
      rewardCoins: 50,
      rewardXp: 30,
    },
  });

  await prisma.achievement.createMany({
    data: [
      { code: 'first_win', name: 'Primera Victoria', description: 'Ganá tu primera partida' },
      { code: 'flor_master', name: 'Rey de la Flor', description: 'Cantá 50 flores' },
      { code: 'comeback', name: 'Remontada', description: 'Ganá desde 0 a 20 en contra' },
    ],
    skipDuplicates: true,
  });

  const nota = esProd ? '(claves desde env)' : '(demo pass: trucazo123)';
  console.log(`✓ Seed completo. admin=${admin.username} cajero=${cajero.username} ${nota}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
