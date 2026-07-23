/**
 * E2E: sala con bots. Un solo humano se marca listo, el servidor completa los
 * lugares con bots y la partida arranca y avanza sola.
 *
 * Cubre el deadlock que teníamos: si el bot era "mano", nadie le daba cuerda y
 * la partida quedaba congelada desde el arranque.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as clienteIO, type Socket } from 'socket.io-client';
import { prisma } from '@trucazo/db';
import { emitirTokenPartida } from '@trucazo/shared';
import { crearServidor } from './index.js';

const SECRET = 'secreto-de-test-suficientemente-largo-1234';
const sufijo = Date.now().toString(36);
let puerto = 0;
let servidor: ReturnType<typeof crearServidor>;
let roomId = '';
let code = '';
let userId = '';

beforeAll(async () => {
  servidor = crearServidor({ puerto: 0, secreto: SECRET });
  puerto = await servidor.escuchar();

  const u = await prisma.user.create({
    data: {
      username: `bot_${sufijo}`,
      profile: { create: { displayName: `Bot Test ${sufijo}` } },
      wallet: { create: {} },
    },
  });
  userId = u.id;

  code = `B${sufijo.slice(-5).toUpperCase()}`.slice(0, 6);
  const room = await prisma.room.create({
    data: {
      code,
      name: 'Sala vs Bot',
      hostUserId: userId,
      mode: 'CASUAL_1V1',
      state: 'WAITING',
      pointsToWin: 15,
      florEnabled: true,
      allowBots: true,
    },
  });
  roomId = room.id;
}, 30000);

afterAll(async () => {
  await servidor?.cerrar();
  await prisma.gameEvent.deleteMany({ where: { match: { roomId } } });
  await prisma.matchResult.deleteMany({ where: { match: { roomId } } });
  await prisma.matchPlayer.deleteMany({ where: { match: { roomId } } });
  await prisma.match.deleteMany({ where: { roomId } });
  await prisma.room.deleteMany({ where: { id: roomId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

describe('partida contra bot', () => {
  it('arranca sola y el bot juega (incluso si es mano)', async () => {
    const token = emitirTokenPartida({ userId, username: 'Humano' }, SECRET);
    const s: Socket = clienteIO(`http://localhost:${puerto}`, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
    });
    await new Promise((r) => s.on('connect', r));

    let vista: { phase: string; seat: number; turnSeat: number | null; legales: unknown[] } | null =
      null;
    let arranco = false;
    const seqs: number[] = [];
    s.on('sala:estado', (snap: { estado: string }) => {
      if (snap.estado === 'EN_PARTIDA') arranco = true;
    });
    s.on('partida:estado', (d: { seq: number; vista: typeof vista }) => {
      vista = d.vista;
      seqs.push(d.seq);
    });

    s.emit('sala:entrar', { code });
    await new Promise((r) => setTimeout(r, 300));
    s.emit('sala:listo', { listo: true });
    await new Promise((r) => setTimeout(r, 500));

    expect(arranco, 'la partida debería arrancar con bots completando').toBe(true);
    expect(vista).toBeTruthy();

    const seqInicial = seqs[seqs.length - 1]!;
    const eraTurnoDelBot = vista!.turnSeat !== vista!.seat;

    // Sin que el humano haga nada, el bot debe mover si le toca.
    await new Promise((r) => setTimeout(r, 3000));

    if (eraTurnoDelBot) {
      expect(seqs[seqs.length - 1]!, 'el bot tenía el turno y debió jugar solo').toBeGreaterThan(
        seqInicial,
      );
    }

    // Ahora jugamos nosotros y verificamos que la partida progresa.
    for (let i = 0; i < 6 && vista!.phase !== 'MATCH_FINISHED'; i++) {
      const legal = vista!.legales?.[0];
      if (legal) s.emit('partida:accion', { action: legal, actionId: `b${i}` });
      await new Promise((r) => setTimeout(r, 1200));
    }
    expect(seqs[seqs.length - 1]!).toBeGreaterThan(seqInicial);

    s.disconnect();
    await new Promise((r) => setTimeout(r, 200));
  }, 40000);
});
