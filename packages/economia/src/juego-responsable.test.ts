import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@trucazo/db';
import { acreditarPorCajero } from './cajeros.js';
import {
  autoexcluir,
  exclusionActiva,
  guardarLimites,
  puedeApostar,
  puedeDepositar,
} from './juego-responsable.js';

const sufijo = Math.random().toString(36).slice(2, 8);
const ids: string[] = [];

async function usuario(nombre: string, saldo = 0n): Promise<string> {
  const u = await prisma.user.create({
    data: {
      username: `rg_${nombre}_${sufijo}`,
      email: `rg_${nombre}_${sufijo}@t.local`,
      emailVerified: true,
      ageVerifiedAt: new Date(),
      profile: { create: { displayName: nombre } },
      wallet: { create: { balance: saldo } },
    },
  });
  ids.push(u.id);
  return u.id;
}

async function cajeroActivo(): Promise<string> {
  const u = await usuario('caj');
  await prisma.cashierProfile.create({
    data: { userId: u, whatsappE164: '+540000000000', displayName: 'Caj', perDayMax: 10_000_000n },
  });
  return u;
}

afterAll(async () => {
  await prisma.ledgerEntry.deleteMany({ where: { userId: { in: ids } } });
  await prisma.responsibleGamingLimits.deleteMany({ where: { userId: { in: ids } } });
  await prisma.selfExclusion.deleteMany({ where: { userId: { in: ids } } });
  await prisma.cashierProfile.deleteMany({ where: { userId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.wallet.deleteMany({ where: { userId: { in: ids } } });
  await prisma.profile.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe('límites de carga', () => {
  it('bloquea una carga que supera el tope diario', async () => {
    const jugador = await usuario('tope');
    await guardarLimites(jugador, { dailyDepositMax: 1000n });

    const chequeo = await puedeDepositar(jugador, 1500n);
    expect(chequeo.ok).toBe(false);

    const ok = await puedeDepositar(jugador, 800n);
    expect(ok.ok).toBe(true);
  });

  it('el flujo del cajero respeta el límite del jugador', async () => {
    const jugador = await usuario('limitado');
    const caj = await cajeroActivo();
    await guardarLimites(jugador, { dailyDepositMax: 500n });

    const r = await acreditarPorCajero({
      cajeroUserId: caj,
      targetUserId: jugador,
      monto: 900,
      idempotencyKey: `rg-lim-${sufijo}`,
    });
    expect(r.ok).toBe(false);
  });
});

describe('autoexclusión', () => {
  it('bloquea cargar y apostar mientras esté vigente', async () => {
    const jugador = await usuario('excluido');
    await autoexcluir({ userId: jugador, kind: 'TEMPORARY', dias: 30 });

    expect(await exclusionActiva(jugador)).not.toBeNull();
    expect((await puedeDepositar(jugador, 100n)).ok).toBe(false);
    expect((await puedeApostar(jugador)).ok).toBe(false);
  });

  it('una exclusión temporal vencida ya no bloquea', async () => {
    const jugador = await usuario('vencido');
    // Creamos una exclusión que venció ayer.
    await prisma.selfExclusion.create({
      data: {
        userId: jugador,
        kind: 'TEMPORARY',
        until: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });
    expect(await exclusionActiva(jugador)).toBeNull();
    expect((await puedeApostar(jugador)).ok).toBe(true);
  });
});

describe('límite de pérdida diaria', () => {
  it('corta las apuestas al alcanzar la pérdida máxima', async () => {
    const jugador = await usuario('perdedor', 0n);
    await guardarLimites(jugador, { dailyLossMax: 500n });

    // Simulamos una pérdida del día: una apuesta reservada de 600 no devuelta.
    await prisma.ledgerEntry.create({
      data: {
        userId: jugador,
        type: 'BET_RESERVED',
        amount: -600n,
        balanceBefore: 600n,
        balanceAfter: 0n,
        idempotencyKey: `rg-loss-${sufijo}`,
        reason: 'Apuesta perdida (test)',
      },
    });

    const chequeo = await puedeApostar(jugador);
    expect(chequeo.ok).toBe(false);
  });
});
