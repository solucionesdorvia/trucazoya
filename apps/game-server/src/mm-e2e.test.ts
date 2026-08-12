/**
 * E2E del matchmaking: dos clientes buscan partida y el servidor los empareja,
 * crea la sala y los manda a jugar. Verifica el camino completo sin código.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as clienteIO, type Socket } from 'socket.io-client';
import { prisma } from '@trucazo/db';
import { registrarMovimiento } from '@trucazo/economia';
import { emitirTokenPartida } from '@trucazo/shared';
import { crearServidor } from './index.js';

const SECRET = 'secreto-de-test-suficientemente-largo-1234';
const sufijo = Date.now().toString(36);
let puerto = 0;
let servidor: ReturnType<typeof crearServidor>;
const ids: string[] = [];
const codigosCreados: string[] = [];

function conectar(userId: string, username: string): Promise<Socket> {
  const token = emitirTokenPartida({ userId, username }, SECRET);
  const s = clienteIO(`http://localhost:${puerto}`, {
    auth: { token },
    transports: ['websocket'],
    forceNew: true,
  });
  return new Promise((res) => s.on('connect', () => res(s)));
}

beforeAll(async () => {
  servidor = crearServidor({ puerto: 0, secreto: SECRET });
  puerto = await servidor.escuchar();
  for (let i = 0; i < 2; i++) {
    const u = await prisma.user.create({
      data: {
        username: `mm_${sufijo}_${i}`,
        profile: { create: { displayName: `MM ${i}` } },
        wallet: { create: {} },
        ratings: { create: [{ mode: 'CASUAL_1V1', rating: 1500 }] },
      },
    });
    ids.push(u.id);
    // Las partidas rápidas van por fichas: sin saldo no se puede ni buscar.
    await registrarMovimiento({
      userId: u.id,
      type: 'ADMIN_ADJUSTMENT',
      amount: 5000n,
      idempotencyKey: `seed-${u.id}`,
      reason: 'saldo para emparejar',
    });
  }
}, 30000);

afterAll(async () => {
  await servidor?.cerrar();
  const rooms = await prisma.room.findMany({
    where: { code: { in: codigosCreados } },
    select: { id: true },
  });
  const roomIds = rooms.map((r) => r.id);
  await prisma.matchPlayer.deleteMany({ where: { match: { roomId: { in: roomIds } } } });
  await prisma.match.deleteMany({ where: { roomId: { in: roomIds } } });
  await prisma.room.deleteMany({ where: { id: { in: roomIds } } });
  await prisma.ratingHistory.deleteMany({ where: { rating: { userId: { in: ids } } } });
  await prisma.rating.deleteMany({ where: { userId: { in: ids } } });
  await prisma.betParticipant.deleteMany({ where: { userId: { in: ids } } });
  await prisma.bet.deleteMany({ where: { match: { roomId: { in: roomIds } } } });
  await prisma.ledgerEntry.deleteMany({ where: { userId: { in: ids } } });
  await prisma.wallet.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe('matchmaking end-to-end', () => {
  it('empareja a dos jugadores y les da la misma sala', async () => {
    const s0 = await conectar(ids[0]!, 'MM 0');
    const s1 = await conectar(ids[1]!, 'MM 1');

    const encontrados = new Map<number, string>();
    s0.on('mm:encontrado', ({ code }: { code: string }) => encontrados.set(0, code));
    s1.on('mm:encontrado', ({ code }: { code: string }) => encontrados.set(1, code));

    s0.emit('mm:buscar', { mode: 'CASUAL_1V1', apuesta: 2500 });
    s1.emit('mm:buscar', { mode: 'CASUAL_1V1', apuesta: 2500 });

    // El tick corre cada 2s; esperamos un par de ciclos.
    const limite = Date.now() + 8000;
    while (encontrados.size < 2 && Date.now() < limite) {
      await new Promise((r) => setTimeout(r, 200));
    }

    expect(encontrados.size).toBe(2);
    // Los dos van a la MISMA sala.
    expect(encontrados.get(0)).toBe(encontrados.get(1));
    const code = encontrados.get(0)!;
    codigosCreados.push(code);

    // La sala existe en la base con los dos participantes.
    const room = await prisma.room.findUnique({
      where: { code },
      include: { participants: true },
    });
    expect(room).toBeTruthy();
    expect(room!.participants).toHaveLength(2);

    // Reportado por un tester: "me encontró partida pero no arranca". El
    // matchmaking dejaba a todos listos, pero la partida sólo arrancaba al
    // tocar "Estoy listo" — el ready-check que la partida rápida ya evitó.
    const arrancoPara = new Set<number>();
    s0.on('partida:estado', () => arrancoPara.add(0));
    s1.on('partida:estado', () => arrancoPara.add(1));
    s0.emit('sala:entrar', { code });
    s1.emit('sala:entrar', { code });

    const limite2 = Date.now() + 6000;
    while (arrancoPara.size < 2 && Date.now() < limite2) {
      await new Promise((r) => setTimeout(r, 150));
    }
    expect(
      arrancoPara.size,
      'la partida rápida tiene que arrancar sola al conectarse, sin ready-check',
    ).toBe(2);

    s0.disconnect();
    s1.disconnect();
    await new Promise((r) => setTimeout(r, 200));
  }, 20000);
});
