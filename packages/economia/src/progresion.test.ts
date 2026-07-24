import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@trucazo/db';
import { nivelPorXp, otorgarRecompensas, xpParaNivel } from './progresion.js';
import { saldoDe } from './ledger.js';

const sufijo = Date.now().toString(36);
let userId = '';

beforeAll(async () => {
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
    },
  });
  await prisma.achievement.upsert({
    where: { code: 'first_win' },
    update: {},
    create: { code: 'first_win', name: 'Primera Victoria', description: 'Ganá una' },
  });

  const u = await prisma.user.create({
    data: {
      username: `prog_${sufijo}`,
      profile: { create: { displayName: 'Prog', xp: 0, level: 1 } },
      wallet: { create: { balance: 0n } },
    },
  });
  userId = u.id;
});

afterAll(async () => {
  await prisma.userMission.deleteMany({ where: { userId } });
  await prisma.userAchievement.deleteMany({ where: { userId } });
  await prisma.ledgerEntry.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

describe('curva de niveles', () => {
  it('la XP necesaria crece con el nivel', () => {
    expect(xpParaNivel(2)).toBeGreaterThan(xpParaNivel(1));
  });

  it('nivelPorXp acumula correctamente', () => {
    expect(nivelPorXp(0).nivel).toBe(1);
    expect(nivelPorXp(100).nivel).toBe(2); // 100 xp = subir de 1 a 2
    const alto = nivelPorXp(10000);
    expect(alto.nivel).toBeGreaterThan(5);
    expect(alto.xpEnNivel).toBeLessThan(alto.xpNecesaria);
  });
});

describe('recompensas de partida', () => {
  it('ganar da más XP que perder', async () => {
    const perder = await otorgarRecompensas({ userId, gano: false, fecha: new Date('2026-07-24') });
    const ganar = await otorgarRecompensas({ userId, gano: true, fecha: new Date('2026-07-24') });
    expect(ganar.xpGanada).toBeGreaterThan(perder.xpGanada);
  });

  it('la primera victoria desbloquea el logro (una sola vez)', async () => {
    const primera = await otorgarRecompensas({ userId, gano: true, fecha: new Date('2026-07-25') });
    // Ya lo tenía de un test anterior o lo desbloquea ahora; en cualquier caso,
    // repetir no lo vuelve a dar.
    const segunda = await otorgarRecompensas({ userId, gano: true, fecha: new Date('2026-07-25') });
    expect(segunda.logrosDesbloqueados).not.toContain('Primera Victoria');
    void primera;
    const logros = await prisma.userAchievement.count({ where: { userId } });
    expect(logros).toBe(1);
  });

  it('completar la misión diaria acredita monedas una vez', async () => {
    const dia = new Date('2026-08-01');
    const nuevo = await prisma.user.create({
      data: {
        username: `prog2_${sufijo}`,
        profile: { create: { displayName: 'Prog2' } },
        wallet: { create: { balance: 0n } },
      },
    });

    // 3 partidas: en la 3ª se completa la misión.
    for (let i = 0; i < 3; i++) {
      await otorgarRecompensas({ userId: nuevo.id, gano: false, fecha: dia });
    }
    const saldo1 = (await saldoDe(nuevo.id)).balance;
    expect(saldo1).toBeGreaterThanOrEqual(50n); // recompensa de la misión

    // Una 4ª partida no vuelve a pagar la misión de hoy.
    await otorgarRecompensas({ userId: nuevo.id, gano: false, fecha: dia });
    const saldo2 = (await saldoDe(nuevo.id)).balance;
    expect(saldo2).toBe(saldo1);

    await prisma.userMission.deleteMany({ where: { userId: nuevo.id } });
    await prisma.ledgerEntry.deleteMany({ where: { userId: nuevo.id } });
    await prisma.user.delete({ where: { id: nuevo.id } });
  });
});
