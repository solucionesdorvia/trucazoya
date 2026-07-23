/**
 * Tests del ledger, apuestas y cajeros contra la base real.
 * Lo crítico acá es la CONCURRENCIA: doble clic, reintentos, dos liquidaciones
 * simultáneas. Un bug en esta capa es plata mal contada.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@trucazo/db';
import { liquidarApuesta, reembolsarApuesta, reservarApuesta } from './apuestas.js';
import { acreditarPorCajero, resolverRetiro, solicitarRetiro } from './cajeros.js';
import { auditarUsuario, ErrorEconomia, registrarMovimiento, saldoDe } from './ledger.js';

const sufijo = Date.now().toString(36);
const ids: string[] = [];
let jugadorA = '';
let jugadorB = '';
let cajero = '';
let roomId = '';

async function crearUsuario(nombre: string, saldo: bigint, verificado = true) {
  const u = await prisma.user.create({
    data: {
      username: `${nombre}_${sufijo}`,
      email: `${nombre}_${sufijo}@t.local`,
      emailVerified: verificado,
      profile: { create: { displayName: nombre } },
      wallet: { create: { balance: saldo } },
    },
  });
  ids.push(u.id);
  if (saldo > 0n) {
    await prisma.ledgerEntry.create({
      data: {
        userId: u.id,
        type: 'ADMIN_ADJUSTMENT',
        amount: saldo,
        balanceBefore: 0n,
        balanceAfter: saldo,
        idempotencyKey: `seed:${u.id}`,
        reason: 'Saldo inicial de test',
      },
    });
  }
  return u.id;
}

beforeAll(async () => {
  jugadorA = await crearUsuario('jugA', 1000n);
  jugadorB = await crearUsuario('jugB', 1000n);
  cajero = await crearUsuario('caj', 0n);
  await prisma.cashierProfile.create({
    data: {
      userId: cajero,
      whatsappE164: '+5491100000001',
      displayName: 'Cajero Test',
      perOpMax: 5000n,
      perDayMax: 20000n,
    },
  });
  const room = await prisma.room.create({
    data: {
      code: `X${sufijo.slice(-5).toUpperCase()}`.slice(0, 6),
      name: 'Sala apuesta',
      hostUserId: jugadorA,
      mode: 'CASUAL_1V1',
      pointsToWin: 30,
    },
  });
  roomId = room.id;
}, 30000);

afterAll(async () => {
  const rooms = [roomId, ...salasCreadas];
  await prisma.betParticipant.deleteMany({ where: { userId: { in: ids } } });
  await prisma.bet.deleteMany({ where: { match: { roomId: { in: rooms } } } });
  await prisma.matchPlayer.deleteMany({ where: { match: { roomId: { in: rooms } } } });
  await prisma.match.deleteMany({ where: { roomId: { in: rooms } } });
  await prisma.room.deleteMany({ where: { id: { in: rooms } } });
  await prisma.withdrawalRequest.deleteMany({ where: { userId: { in: ids } } });
  // AuditLog.actorId no tiene cascade: hay que borrarlo antes que los usuarios.
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

// Match.roomId es @unique (una sala tiene una sola partida), así que cada
// partida de prueba necesita su propia sala.
let nSalas = 0;
const salasCreadas: string[] = [];

async function crearPartida() {
  const room = await prisma.room.create({
    data: {
      code: `${sufijo.slice(-4).toUpperCase()}${(nSalas++).toString().padStart(2, '0')}`.slice(
        0,
        6,
      ),
      name: 'Sala apuesta',
      hostUserId: jugadorA,
      mode: 'CASUAL_1V1',
      pointsToWin: 30,
    },
  });
  salasCreadas.push(room.id);
  const m = await prisma.match.create({
    data: { roomId: room.id, mode: 'CASUAL_1V1', pointsToWin: 30, florEnabled: false, players: 2 },
  });
  return m.id;
}

// ───────────────────────────────────────────────────────────────────────────

describe('ledger', () => {
  it('acredita y mantiene la cadena de saldos', async () => {
    const antes = (await saldoDe(jugadorA)).balance;
    const r = await registrarMovimiento({
      userId: jugadorA,
      type: 'DAILY_BONUS',
      amount: 100n,
      idempotencyKey: `bonus:${sufijo}:1`,
      reason: 'Bonus diario',
    });
    expect(r.balanceBefore).toBe(antes);
    expect(r.balanceAfter).toBe(antes + 100n);
    expect(r.repetido).toBe(false);
  });

  it('es idempotente: la misma clave no acredita dos veces', async () => {
    const clave = `idem:${sufijo}`;
    const primera = await registrarMovimiento({
      userId: jugadorA,
      type: 'DAILY_BONUS',
      amount: 50n,
      idempotencyKey: clave,
    });
    const segunda = await registrarMovimiento({
      userId: jugadorA,
      type: 'DAILY_BONUS',
      amount: 50n,
      idempotencyKey: clave,
    });
    expect(segunda.repetido).toBe(true);
    expect(segunda.balanceAfter).toBe(primera.balanceAfter);
    const saldo = await saldoDe(jugadorA);
    expect(saldo.balance).toBe(primera.balanceAfter);
  });

  it('nunca deja el saldo negativo', async () => {
    await expect(
      registrarMovimiento({
        userId: jugadorB,
        type: 'PENALTY',
        amount: -999999n,
        idempotencyKey: `neg:${sufijo}`,
      }),
    ).rejects.toThrow(ErrorEconomia);
    const saldo = await saldoDe(jugadorB);
    expect(saldo.balance).toBeGreaterThanOrEqual(0n);
  });

  it('CONCURRENCIA: 10 débitos simultáneos no rompen la contabilidad', async () => {
    const usuario = await crearUsuario('conc', 1000n);
    // 10 débitos de 100 en paralelo: deben aplicarse todos y quedar en 0.
    const resultados = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        registrarMovimiento({
          userId: usuario,
          type: 'BET_RESERVED',
          amount: -100n,
          idempotencyKey: `conc:${sufijo}:${i}`,
        }),
      ),
    );
    const ok = resultados.filter((r) => r.status === 'fulfilled').length;
    expect(ok).toBe(10);

    const saldo = await saldoDe(usuario);
    expect(saldo.balance).toBe(0n);

    // La auditoría debe cerrar perfecto.
    const auditoria = await auditarUsuario(usuario);
    expect(auditoria.problemas).toEqual([]);
    expect(auditoria.ok).toBe(true);
  });

  it('CONCURRENCIA: el mismo movimiento repetido en paralelo se aplica una sola vez', async () => {
    const usuario = await crearUsuario('dup', 500n);
    const clave = `dobleclick:${sufijo}`;
    await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        registrarMovimiento({
          userId: usuario,
          type: 'BET_RESERVED',
          amount: -100n,
          idempotencyKey: clave,
        }),
      ),
    );
    const saldo = await saldoDe(usuario);
    expect(saldo.balance).toBe(400n); // se debitó 100 UNA vez, no 500
    const asientos = await prisma.ledgerEntry.count({
      where: { userId: usuario, idempotencyKey: clave },
    });
    expect(asientos).toBe(1);
  });
});

describe('apuestas', () => {
  it('reserva, liquida con comisión y acredita al ganador', async () => {
    const matchId = await crearPartida();
    const saldoAntesA = (await saldoDe(jugadorA)).balance;
    const saldoAntesB = (await saldoDe(jugadorB)).balance;

    const reserva = await reservarApuesta({
      matchId,
      monto: 200,
      jugadores: [
        { userId: jugadorA, seat: 0 },
        { userId: jugadorB, seat: 1 },
      ],
      rakeBps: 500, // 5%
    });
    expect(reserva.ok).toBe(true);
    expect((await saldoDe(jugadorA)).balance).toBe(saldoAntesA - 200n);
    expect((await saldoDe(jugadorB)).balance).toBe(saldoAntesB - 200n);

    const liq = await liquidarApuesta({ betId: reserva.betId!, ganadoresUserIds: [jugadorA] });
    expect(liq.ok).toBe(true);

    // Pozo 400, comisión 5% = 20, premio = 380.
    expect((await saldoDe(jugadorA)).balance).toBe(saldoAntesA - 200n + 380n);
    expect((await saldoDe(jugadorB)).balance).toBe(saldoAntesB - 200n);
  });

  it('no liquida dos veces (doble acreditación)', async () => {
    const matchId = await crearPartida();
    const reserva = await reservarApuesta({
      matchId,
      monto: 100,
      jugadores: [
        { userId: jugadorA, seat: 0 },
        { userId: jugadorB, seat: 1 },
      ],
    });
    await liquidarApuesta({ betId: reserva.betId!, ganadoresUserIds: [jugadorB] });
    const saldoTrasPrimera = (await saldoDe(jugadorB)).balance;

    // Reintento (p.ej. el game-server reenvía).
    const segunda = await liquidarApuesta({ betId: reserva.betId!, ganadoresUserIds: [jugadorB] });
    expect(segunda.ok).toBe(true);
    expect((await saldoDe(jugadorB)).balance).toBe(saldoTrasPrimera);
  });

  it('CONCURRENCIA: dos liquidaciones simultáneas acreditan una sola vez', async () => {
    const matchId = await crearPartida();
    const reserva = await reservarApuesta({
      matchId,
      monto: 100,
      jugadores: [
        { userId: jugadorA, seat: 0 },
        { userId: jugadorB, seat: 1 },
      ],
    });
    const antes = (await saldoDe(jugadorA)).balance;

    await Promise.allSettled([
      liquidarApuesta({ betId: reserva.betId!, ganadoresUserIds: [jugadorA] }),
      liquidarApuesta({ betId: reserva.betId!, ganadoresUserIds: [jugadorA] }),
    ]);

    const despues = (await saldoDe(jugadorA)).balance;
    // Pozo 200 − 5% = 190. Sólo una acreditación.
    expect(despues).toBe(antes + 190n);
  });

  it('rechaza la reserva si a alguien no le alcanza (y no debita a nadie)', async () => {
    const matchId = await crearPartida();
    const pobre = await crearUsuario('pobre', 10n);
    const antesA = (await saldoDe(jugadorA)).balance;

    const r = await reservarApuesta({
      matchId,
      monto: 500,
      jugadores: [
        { userId: jugadorA, seat: 0 },
        { userId: pobre, seat: 1 },
      ],
    });
    expect(r.ok).toBe(false);
    // Clave: al que SÍ tenía saldo no se le tocó nada.
    expect((await saldoDe(jugadorA)).balance).toBe(antesA);
    expect((await saldoDe(pobre)).balance).toBe(10n);
  });

  it('reembolsa a todos si se cancela la partida', async () => {
    const matchId = await crearPartida();
    const antesA = (await saldoDe(jugadorA)).balance;
    const antesB = (await saldoDe(jugadorB)).balance;
    const reserva = await reservarApuesta({
      matchId,
      monto: 150,
      jugadores: [
        { userId: jugadorA, seat: 0 },
        { userId: jugadorB, seat: 1 },
      ],
    });
    await reembolsarApuesta(reserva.betId!, 'Rival desconectado');
    expect((await saldoDe(jugadorA)).balance).toBe(antesA);
    expect((await saldoDe(jugadorB)).balance).toBe(antesB);
  });
});

describe('cajeros', () => {
  it('acredita monedas y deja auditoría', async () => {
    const antes = (await saldoDe(jugadorA)).balance;
    const r = await acreditarPorCajero({
      cajeroUserId: cajero,
      targetUserId: jugadorA,
      monto: 1000,
      idempotencyKey: `carga:${sufijo}:1`,
      referencia: 'transferencia-123',
    });
    expect(r.ok).toBe(true);
    expect((await saldoDe(jugadorA)).balance).toBe(antes + 1000n);

    const log = await prisma.auditLog.findFirst({
      where: { actorId: cajero, action: 'CASHIER_DEPOSIT', target: jugadorA },
      orderBy: { createdAt: 'desc' },
    });
    expect(log).toBeTruthy();
  });

  it('no acredita dos veces con la misma clave (doble clic del cajero)', async () => {
    const clave = `carga:${sufijo}:dup`;
    const primera = await acreditarPorCajero({
      cajeroUserId: cajero,
      targetUserId: jugadorB,
      monto: 500,
      idempotencyKey: clave,
    });
    const saldoTras = (await saldoDe(jugadorB)).balance;
    const segunda = await acreditarPorCajero({
      cajeroUserId: cajero,
      targetUserId: jugadorB,
      monto: 500,
      idempotencyKey: clave,
    });
    expect(primera.ok && segunda.ok).toBe(true);
    expect(segunda.repetido).toBe(true);
    expect((await saldoDe(jugadorB)).balance).toBe(saldoTras);
  });

  it('respeta el límite por operación', async () => {
    const r = await acreditarPorCajero({
      cajeroUserId: cajero,
      targetUserId: jugadorA,
      monto: 99999,
      idempotencyKey: `carga:${sufijo}:limite`,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('máximo por operación');
  });

  it('el cajero no puede acreditarse a sí mismo', async () => {
    const r = await acreditarPorCajero({
      cajeroUserId: cajero,
      targetUserId: cajero,
      monto: 100,
      idempotencyKey: `carga:${sufijo}:self`,
    });
    expect(r.ok).toBe(false);
  });

  it('retiro: bloquea el saldo, y al pagarlo lo debita del ledger', async () => {
    const antes = await saldoDe(jugadorA);
    const sol = await solicitarRetiro({ userId: jugadorA, cajeroUserId: cajero, monto: 300 });
    expect(sol.ok).toBe(true);

    // Bloqueado: sale de disponible, no se puede apostar.
    const bloqueado = await saldoDe(jugadorA);
    expect(bloqueado.balance).toBe(antes.balance - 300n);
    expect(bloqueado.locked).toBe(antes.locked + 300n);

    const res = await resolverRetiro({
      cajeroUserId: cajero,
      requestId: sol.requestId!,
      accion: 'PAID',
      idempotencyKey: `retiro:${sufijo}:1`,
    });
    expect(res.ok).toBe(true);

    const final = await saldoDe(jugadorA);
    expect(final.balance).toBe(antes.balance - 300n); // debitado de verdad
    expect(final.locked).toBe(antes.locked); // ya no hay nada bloqueado
  });

  it('retiro rechazado devuelve el saldo', async () => {
    const antes = await saldoDe(jugadorA);
    const sol = await solicitarRetiro({ userId: jugadorA, cajeroUserId: cajero, monto: 200 });
    await resolverRetiro({
      cajeroUserId: cajero,
      requestId: sol.requestId!,
      accion: 'REJECTED',
      idempotencyKey: `retiro:${sufijo}:2`,
    });
    const final = await saldoDe(jugadorA);
    expect(final.balance).toBe(antes.balance);
    expect(final.locked).toBe(antes.locked);
  });

  it('no se puede retirar sin email verificado', async () => {
    const sinVerificar = await crearUsuario('noverif', 500n, false);
    const r = await solicitarRetiro({ userId: sinVerificar, cajeroUserId: cajero, monto: 100 });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Verificá tu email');
  });

  it('no se puede retirar más de lo que hay', async () => {
    const r = await solicitarRetiro({ userId: jugadorB, cajeroUserId: cajero, monto: 9999999 });
    expect(r.ok).toBe(false);
  });

  it('un cajero no puede resolver la solicitud de otro', async () => {
    const otroCajero = await crearUsuario('caj2', 0n);
    await prisma.cashierProfile.create({
      data: { userId: otroCajero, whatsappE164: '+5491100000002', displayName: 'Otro' },
    });
    const sol = await solicitarRetiro({ userId: jugadorA, cajeroUserId: cajero, monto: 50 });
    const r = await resolverRetiro({
      cajeroUserId: otroCajero,
      requestId: sol.requestId!,
      accion: 'PAID',
      idempotencyKey: `retiro:${sufijo}:ajeno`,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('no es tuya');
  });
});

describe('auditoría', () => {
  it('la cadena del ledger cierra para todos los usuarios de la prueba', async () => {
    for (const id of [jugadorA, jugadorB]) {
      const a = await auditarUsuario(id);
      expect(a.problemas).toEqual([]);
      // El ledger cuadra con disponible + bloqueado (lo bloqueado sigue siendo
      // del usuario: un retiro pendiente no es una pérdida).
      expect(a.saldoCalculado).toBe(a.saldoBilletera);
    }
  });
});
