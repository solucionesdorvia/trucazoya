import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@trucazo/db';
import { avanzarPartido, generarLlaves, inscribir } from './torneos.js';
import { saldoDe } from './ledger.js';

const sufijo = Date.now().toString(36);
let torneoId = '';
const ids: string[] = [];

async function u(nombre: string, saldo: bigint) {
  const user = await prisma.user.create({
    data: {
      username: `${nombre}_${sufijo}`,
      profile: { create: { displayName: nombre } },
      wallet: { create: { balance: saldo } },
    },
  });
  ids.push(user.id);
  if (saldo > 0n)
    await prisma.ledgerEntry.create({
      data: {
        userId: user.id,
        type: 'ADMIN_ADJUSTMENT',
        amount: saldo,
        balanceBefore: 0n,
        balanceAfter: saldo,
        idempotencyKey: `seed:${user.id}`,
      },
    });
  return user.id;
}

beforeAll(async () => {
  const t = await prisma.tournament.create({
    data: {
      name: `Copa ${sufijo}`,
      mode: 'CASUAL_1V1',
      state: 'REGISTRATION',
      entryFee: 100n,
      maxPlayers: 4,
    },
  });
  torneoId = t.id;
}, 30000);

afterAll(async () => {
  await prisma.tournamentMatch.deleteMany({ where: { tournamentId: torneoId } });
  await prisma.tournamentParticipant.deleteMany({ where: { tournamentId: torneoId } });
  await prisma.tournament.deleteMany({ where: { id: torneoId } });
  await prisma.ledgerEntry.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe('torneos', () => {
  it('inscribe cobrando la entrada por el ledger', async () => {
    const j = await u('tj1', 500n);
    const antes = (await saldoDe(j)).balance;
    const r = await inscribir(torneoId, j);
    expect(r.ok).toBe(true);
    expect((await saldoDe(j)).balance).toBe(antes - 100n);
  });

  it('no se inscribe dos veces', async () => {
    const j = await u('tj2', 500n);
    await inscribir(torneoId, j);
    const otra = await inscribir(torneoId, j);
    expect(otra.ok).toBe(false);
  });

  it('rechaza si no le alcanza la entrada', async () => {
    const pobre = await u('tpobre', 10n);
    const r = await inscribir(torneoId, pobre);
    expect(r.ok).toBe(false);
  });

  it('corre un torneo de 4 hasta coronar campeón que cobra el pozo', async () => {
    // Torneo nuevo y limpio de 4 jugadores.
    const t = await prisma.tournament.create({
      data: {
        name: `Bracket ${sufijo}`,
        mode: 'CASUAL_1V1',
        state: 'REGISTRATION',
        entryFee: 100n,
        maxPlayers: 4,
      },
    });
    const jug = [];
    for (let i = 0; i < 4; i++) jug.push(await u(`br${i}`, 500n));
    for (const j of jug) await inscribir(t.id, j);
    await prisma.tournamentParticipant.updateMany({
      where: { tournamentId: t.id },
      data: { checkedIn: true },
    });

    // RNG determinista.
    let n = 0;
    const gen = await generarLlaves(t.id, () => n++ % 2);
    expect(gen.ok).toBe(true);
    expect(gen.partidos).toBe(2);

    // Resolvemos la ronda 1: gana el "a" de cada partido.
    const r1 = await prisma.tournamentMatch.findMany({
      where: { tournamentId: t.id, round: 1 },
      orderBy: { slot: 'asc' },
    });
    const parts = await prisma.tournamentParticipant.findMany({ where: { tournamentId: t.id } });
    // Elegimos ganadores arbitrarios (los primeros dos participantes que estén en cada slot).
    for (const m of r1) {
      // el ganador es cualquiera de los inscriptos; usamos el orden de participants
      await avanzarPartido(m.id, parts[r1.indexOf(m)]!.userId);
    }

    // Debe haberse creado la final.
    const r2 = await prisma.tournamentMatch.findMany({ where: { tournamentId: t.id, round: 2 } });
    expect(r2.length).toBe(1);

    const campeon = parts[0]!.userId;
    const antes = (await saldoDe(campeon)).balance;
    const res = await avanzarPartido(r2[0]!.id, campeon);
    expect(res.campeon).toBe(campeon);

    // Pozo = 4 × 100 = 400 al campeón.
    expect((await saldoDe(campeon)).balance).toBe(antes + 400n);
    const torneoFinal = await prisma.tournament.findUnique({ where: { id: t.id } });
    expect(torneoFinal?.state).toBe('FINISHED');

    // limpieza extra
    await prisma.tournamentMatch.deleteMany({ where: { tournamentId: t.id } });
    await prisma.tournamentParticipant.deleteMany({ where: { tournamentId: t.id } });
    await prisma.tournament.delete({ where: { id: t.id } });
  });
});
