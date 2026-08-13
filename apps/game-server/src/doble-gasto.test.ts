/**
 * El escenario que más caro sale en una plataforma con plata: gastar el mismo
 * saldo dos veces.
 *
 * El chequeo de saldo al entrar a una sala LEE el saldo y después actúa, así
 * que entre esas dos cosas hay una ventana. Un jugador con 3000 fichas puede
 * entrar a dos mesas de 2500 a la vez (las dos lecturas ven 3000 y las dos
 * pasan) y que las dos arranquen al mismo tiempo.
 *
 * Lo que tiene que salvarlo es el ledger: bloquea la billetera con SELECT ...
 * FOR UPDATE y no deja que el saldo quede negativo. Acá se verifica que eso
 * aguanta de verdad, y que la sala que pierde la carrera no queda colgada.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as clienteIO, type Socket } from 'socket.io-client';
import { prisma } from '@trucazo/db';
import { emitirTokenPartida } from '@trucazo/shared';
import { auditarUsuario, registrarMovimiento } from '@trucazo/economia';
import { crearServidor } from './index.js';

const SECRET = 'secreto-de-test-suficientemente-largo-1234';
const sufijo = `dg${Date.now().toString(36)}`;
const APUESTA = 2500;
/** Le alcanza para UNA sola mesa, no para dos. */
const SALDO_A = 3000n;
const SALDO_RIVALES = 8000n;

let puerto = 0;
let servidor: ReturnType<typeof crearServidor>;
const roomIds: string[] = [];
const codes: string[] = [];
const usuarios: Array<{ id: string; username: string }> = [];

function conectar(userId: string, username: string): Promise<Socket> {
  const token = emitirTokenPartida({ userId, username }, SECRET);
  const s = clienteIO(`http://localhost:${puerto}`, {
    auth: { token },
    transports: ['websocket'],
    forceNew: true,
  });
  return new Promise((res, rej) => {
    s.on('connect', () => res(s));
    s.on('connect_error', rej);
  });
}

const saldoDe = async (userId: string) => {
  const w = await prisma.wallet.findUnique({ where: { userId } });
  return w?.balance ?? 0n;
};

beforeAll(async () => {
  servidor = crearServidor({ puerto: 0, secreto: SECRET });
  puerto = await servidor.escuchar();

  // 0 = el que va a intentar gastar dos veces; 1 y 2 = sus rivales.
  for (let i = 0; i < 3; i++) {
    const username = `${sufijo}_${i}`;
    const u = await prisma.user.create({
      data: { username, profile: { create: { displayName: username } }, wallet: { create: {} } },
    });
    usuarios.push({ id: u.id, username });
    await registrarMovimiento({
      userId: u.id,
      type: 'ADMIN_ADJUSTMENT',
      amount: i === 0 ? SALDO_A : SALDO_RIVALES,
      idempotencyKey: `seed-${u.id}`,
      reason: 'saldo inicial de auditoría',
    });
  }

  // Dos mesas idénticas, cada una de 2500.
  for (let i = 0; i < 2; i++) {
    const code = `${sufijo.slice(-5)}${i}`.toUpperCase();
    const room = await prisma.room.create({
      data: {
        code,
        name: `Mesa ${i}`,
        hostUserId: usuarios[i + 1]!.id,
        mode: 'CASUAL_1V1',
        state: 'WAITING',
        pointsToWin: 15,
        florEnabled: false,
        allowBots: false,
        betAmount: BigInt(APUESTA),
      },
    });
    roomIds.push(room.id);
    codes.push(code);
  }
}, 30000);

afterAll(async () => {
  await servidor?.cerrar();
  const ids = usuarios.map((u) => u.id);
  await prisma.gameEvent.deleteMany({ where: { match: { roomId: { in: roomIds } } } });
  await prisma.matchResult.deleteMany({ where: { match: { roomId: { in: roomIds } } } });
  await prisma.matchPlayer.deleteMany({ where: { match: { roomId: { in: roomIds } } } });
  await prisma.betParticipant.deleteMany({ where: { userId: { in: ids } } });
  await prisma.bet.deleteMany({ where: { match: { roomId: { in: roomIds } } } });
  await prisma.match.deleteMany({ where: { roomId: { in: roomIds } } });
  await prisma.ledgerEntry.deleteMany({ where: { userId: { in: ids } } });
  await prisma.room.deleteMany({ where: { id: { in: roomIds } } });
  await prisma.wallet.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe('el mismo saldo en dos mesas a la vez', () => {
  it('sólo se puede pagar una: la otra no arranca y no queda nada colgado', async () => {
    // El jugador A abre DOS pestañas (dos sockets), una por mesa.
    const a0 = await conectar(usuarios[0]!.id, usuarios[0]!.username);
    const a1 = await conectar(usuarios[0]!.id, usuarios[0]!.username);
    const r0 = await conectar(usuarios[1]!.id, usuarios[1]!.username);
    const r1 = await conectar(usuarios[2]!.id, usuarios[2]!.username);

    const errores: string[] = [];
    const repartio = new Set<string>();
    for (const [s, code] of [
      [a0, codes[0]!],
      [r0, codes[0]!],
      [a1, codes[1]!],
      [r1, codes[1]!],
    ] as const) {
      s.on('error:app', (d: { mensaje: string }) => errores.push(d.mensaje));
      // El servidor manda el estado a TODAS las pestañas del jugador, así que
      // hay que mirar de qué sala es el estado, no por qué socket llegó.
      s.on('partida:estado', (d: { code?: string }) => repartio.add(d.code ?? code));
      s.emit('sala:entrar', { code });
    }
    await new Promise((r) => setTimeout(r, 700));

    const totalAntes =
      (await saldoDe(usuarios[0]!.id)) +
      (await saldoDe(usuarios[1]!.id)) +
      (await saldoDe(usuarios[2]!.id));

    // Los cuatro tocan "estoy listo" a la vez: las dos mesas intentan
    // reservar la apuesta de A en el mismo instante.
    a0.emit('sala:listo', { listo: true });
    a1.emit('sala:listo', { listo: true });
    r0.emit('sala:listo', { listo: true });
    r1.emit('sala:listo', { listo: true });
    await new Promise((r) => setTimeout(r, 2500));

    const saldoA = await saldoDe(usuarios[0]!.id);
    const apuestas = await prisma.bet.findMany({
      where: { match: { roomId: { in: roomIds } } },
      select: { state: true, amount: true },
    });
    const reservadas = apuestas.filter((b) => b.state === 'RESERVED');
    const salas = await prisma.room.findMany({
      where: { id: { in: roomIds } },
      select: { code: true, state: true },
    });
    const retenido = reservadas.reduce((t, b) => t + Number(b.amount) * 2, 0);
    const totalDespues =
      saldoA +
      (await saldoDe(usuarios[1]!.id)) +
      (await saldoDe(usuarios[2]!.id)) +
      BigInt(retenido);

    console.log('\n═══ MISMO SALDO EN DOS MESAS A LA VEZ ═══');
    console.log(`  saldo de A: ${SALDO_A} · dos mesas de ${APUESTA} c/u`);
    console.log(`  mesas que repartieron: ${repartio.size} (sólo puede ser 1)`);
    console.log(`  apuestas reservadas: ${reservadas.length}`);
    console.log(`  saldo de A después: ${saldoA} (no puede ser negativo)`);
    console.log(`  estado de las salas: ${salas.map((s) => `${s.code}=${s.state}`).join(' · ')}`);
    console.log(`  avisos: ${errores.length}`);
    for (const e of new Set(errores)) console.log(`    → "${e}"`);
    console.log(`  retenido en la apuesta: ${retenido}`);
    console.log(`  total (billeteras + apuesta): ${totalAntes} → ${totalDespues}\n`);

    // LO INNEGOCIABLE: no se puede gastar dos veces la misma plata.
    expect(saldoA >= 0n, 'el saldo no puede quedar negativo').toBe(true);
    expect(reservadas.length, 'sólo una mesa puede haberle cobrado a A').toBeLessThanOrEqual(1);
    expect(repartio.size, 'sólo una mesa puede repartir cartas').toBeLessThanOrEqual(1);
    expect(saldoA, 'a A le tiene que quedar exactamente lo que no se apostó').toBe(
      SALDO_A - BigInt(reservadas.length * APUESTA),
    );

    // La mesa que perdió la carrera no puede quedar trabada.
    const trabadas = salas.filter((s) => s.state !== 'WAITING' && !repartio.has(s.code));
    expect(trabadas, 'la mesa que no arrancó tiene que volver a esperar').toEqual([]);

    // Y la contabilidad cierra.
    expect(
      totalDespues,
      'billeteras + lo retenido en la apuesta tiene que dar lo mismo que antes',
    ).toBe(totalAntes);
    for (const u of usuarios) {
      const audit = await auditarUsuario(u.id);
      expect(audit.ok, `el ledger de ${u.username} tiene que cuadrar`).toBe(true);
    }

    for (const s of [a0, a1, r0, r1]) s.disconnect();
  }, 90000);
});
