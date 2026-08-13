/**
 * Mismo agujero que tenía el matchmaking, pero por el otro camino: las salas
 * abiertas del navegador de salas.
 *
 * Nada impide entrar a una sala de 5000 fichas teniendo 500. Los dos tocan
 * "estoy listo", y recién al repartir se descubre que a uno no le alcanza.
 * Este test documenta qué pasa exactamente en ese caso: interesa que la sala
 * no quede colgada, que no se cobre nada, y que el aviso diga algo útil.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as clienteIO, type Socket } from 'socket.io-client';
import { prisma } from '@trucazo/db';
import { emitirTokenPartida } from '@trucazo/shared';
import { registrarMovimiento } from '@trucazo/economia';
import { crearServidor } from './index.js';

const SECRET = 'secreto-de-test-suficientemente-largo-1234';
const sufijo = `ss${Date.now().toString(36)}`;
const APUESTA = 5000;
/** El primero puede pagar; el segundo no. */
const SALDOS = [8000n, 500n];

let puerto = 0;
let servidor: ReturnType<typeof crearServidor>;
let roomId = '';
let code = '';
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
  for (let i = 0; i < 2; i++) {
    const username = `${sufijo}_${i}`;
    const u = await prisma.user.create({
      data: { username, profile: { create: { displayName: username } }, wallet: { create: {} } },
    });
    usuarios.push({ id: u.id, username });
    await registrarMovimiento({
      userId: u.id,
      type: 'ADMIN_ADJUSTMENT',
      amount: SALDOS[i]!,
      idempotencyKey: `seed-${u.id}`,
      reason: 'saldo inicial de auditoría',
    });
  }
  code = sufijo.slice(-6).toUpperCase();
  const room = await prisma.room.create({
    data: {
      code,
      name: 'Sala cara',
      hostUserId: usuarios[0]!.id,
      mode: 'CASUAL_1V1',
      state: 'WAITING',
      pointsToWin: 15,
      florEnabled: false,
      allowBots: false,
      isPrivate: false,
      betAmount: BigInt(APUESTA),
    },
  });
  roomId = room.id;
}, 30000);

afterAll(async () => {
  await servidor?.cerrar();
  const ids = usuarios.map((u) => u.id);
  await prisma.gameEvent.deleteMany({ where: { match: { roomId } } });
  await prisma.matchResult.deleteMany({ where: { match: { roomId } } });
  await prisma.matchPlayer.deleteMany({ where: { match: { roomId } } });
  await prisma.betParticipant.deleteMany({ where: { userId: { in: ids } } });
  await prisma.bet.deleteMany({ where: { match: { roomId } } });
  await prisma.match.deleteMany({ where: { roomId } });
  await prisma.ledgerEntry.deleteMany({ where: { userId: { in: ids } } });
  await prisma.room.deleteMany({ where: { id: roomId } });
  await prisma.wallet.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe('sala por fichas a la que un jugador no puede pagar', () => {
  it('no cobra, no cuelga la sala, y avisa', async () => {
    const s0 = await conectar(usuarios[0]!.id, usuarios[0]!.username);
    const s1 = await conectar(usuarios[1]!.id, usuarios[1]!.username);

    const errores: string[] = [];
    let repartio = false;
    for (const s of [s0, s1]) {
      s.on('error:app', (d: { mensaje: string }) => errores.push(d.mensaje));
      s.on('partida:estado', () => (repartio = true));
      s.emit('sala:entrar', { code });
    }
    await new Promise((r) => setTimeout(r, 600));

    // Al que no le alcanza NO se le impide entrar: entra igual.
    const entroSinPlata = await prisma.roomParticipant.findFirst({
      where: { roomId, userId: usuarios[1]!.id },
    });

    s0.emit('sala:listo', { listo: true });
    s1.emit('sala:listo', { listo: true });
    await new Promise((r) => setTimeout(r, 1500));

    const saldos = [await saldoDe(usuarios[0]!.id), await saldoDe(usuarios[1]!.id)];
    const sala = await prisma.room.findUnique({ where: { id: roomId } });
    const partidas = await prisma.match.count({ where: { roomId } });
    const apuestas = await prisma.bet.count({ where: { match: { roomId } } });

    console.log('\n═══ SALA QUE UN JUGADOR NO PUEDE PAGAR ═══');
    console.log(`  apuesta de la sala: ${APUESTA} · saldos: ${SALDOS.join(' / ')}`);
    console.log(`  ¿lo dejó entrar sin tener la plata?: ${entroSinPlata ? 'SÍ' : 'no'}`);
    console.log(`  ¿repartió cartas?: ${repartio ? 'SÍ ✗' : 'no ✓'}`);
    console.log(`  avisos recibidos: ${errores.length}`);
    for (const e of errores) console.log(`    → "${e}"`);
    console.log(`  estado de la sala: ${sala?.state} (tiene que volver a WAITING)`);
    console.log(`  partidas colgadas: ${partidas} · apuestas: ${apuestas}`);
    console.log(`  saldos después: ${saldos.join(' / ')} (no se puede haber movido nada)\n`);

    // Lo que no se negocia: no se cobra y no queda basura.
    expect(saldos[0], 'no se le puede tocar el saldo al que sí podía pagar').toBe(SALDOS[0]);
    expect(saldos[1], 'no se le puede tocar el saldo al que no podía').toBe(SALDOS[1]);
    expect(apuestas, 'no puede quedar una apuesta reservada').toBe(0);
    expect(partidas, 'no puede quedar una partida colgada en la base').toBe(0);
    expect(sala?.state, 'la sala tiene que volver a esperar, no quedar trabada').toBe('WAITING');
    expect(repartio, 'no se puede repartir si no se pudo cobrar').toBe(false);

    // Y el jugador tiene que enterarse de algo.
    expect(errores.length, 'alguien tiene que avisar por qué no arrancó').toBeGreaterThan(0);

    s0.disconnect();
    s1.disconnect();
  }, 90000);
});
