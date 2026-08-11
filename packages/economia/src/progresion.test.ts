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

  it('la progresión NUNCA emite fichas: ni por nivel ni por misión', async () => {
    const dia = new Date('2026-08-01');
    const nuevo = await prisma.user.create({
      data: {
        username: `prog2_${sufijo}`,
        profile: { create: { displayName: 'Prog2' } },
        wallet: { create: { balance: 0n } },
      },
    });

    // Se juegan varias partidas: se sube de nivel y se completa la misión.
    // Antes esto acreditaba fichas, y por eso el total del sistema crecía
    // solo (un tester lo vio jugando revanchas: 1000 → 1130). Las fichas se
    // cargan y retiran con plata real, así que regalarlas es emitir dinero.
    for (let i = 0; i < 6; i++) {
      await otorgarRecompensas({ userId: nuevo.id, gano: true, fecha: dia });
    }

    const saldo = (await saldoDe(nuevo.id)).balance;
    expect(saldo, 'jugar no puede aumentar el saldo: sólo lo hacen las apuestas').toBe(0n);

    // La progresión SÍ tiene que seguir funcionando, sin premio en fichas.
    const perfil = await prisma.profile.findUnique({ where: { userId: nuevo.id } });
    expect(perfil!.xp, 'la XP tiene que sumar igual').toBeGreaterThan(0);
    const mision = await prisma.mission.findFirst({ where: { code: 'daily_play_3' } });
    if (mision) {
      const um = await prisma.userMission.findFirst({
        where: { userId: nuevo.id, missionId: mision.id },
      });
      expect(um?.completed, 'la misión igual se marca cumplida').toBe(true);
    }

    await prisma.userMission.deleteMany({ where: { userId: nuevo.id } });
    await prisma.ledgerEntry.deleteMany({ where: { userId: nuevo.id } });
    await prisma.user.delete({ where: { id: nuevo.id } });
  });
});
