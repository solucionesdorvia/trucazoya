/**
 * Reloj de turno, pedido por los jugadores tras probar la app:
 * "30/40 segundos, que la primera tire al azar, la segunda lo limpie de la
 * partida".
 *
 * Sin esto, un jugador que se queda mirando la pantalla congela la partida del
 * rival indefinidamente (y su apuesta con ella).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as clienteIO, type Socket } from 'socket.io-client';
import { prisma } from '@trucazo/db';
import { emitirTokenPartida } from '@trucazo/shared';
import { crearServidor } from './index.js';

const SECRET = 'secreto-de-test-suficientemente-largo-1234';
const sufijo = `rt${Date.now().toString(36)}`;

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

beforeAll(async () => {
  servidor = crearServidor({ puerto: 0, secreto: SECRET });
  puerto = await servidor.escuchar();
  for (let i = 0; i < 2; i++) {
    const username = `${sufijo}_${i}`;
    const u = await prisma.user.create({
      data: { username, profile: { create: { displayName: username } }, wallet: { create: {} } },
    });
    usuarios.push({ id: u.id, username });
  }
  code = sufijo.slice(-6).toUpperCase();
  const room = await prisma.room.create({
    data: {
      code,
      name: 'Reloj de turno',
      hostUserId: usuarios[0]!.id,
      mode: 'CASUAL_1V1',
      state: 'WAITING',
      pointsToWin: 30,
      florEnabled: false,
      allowBots: false,
      // Reloj cortísimo para no esperar 40s en el test.
      turnTimeoutSec: 1,
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
  await prisma.user.deleteMany({ where: { id: { in: usuarios.map((u) => u.id) } } });
  await prisma.$disconnect();
});

describe('reloj de turno', () => {
  it('si nadie juega: primero se juega por él, y a la segunda se lo saca', async () => {
    const s0 = await conectar(usuarios[0]!.id, usuarios[0]!.username);
    const s1 = await conectar(usuarios[1]!.id, usuarios[1]!.username);

    const avisos: Array<{ seat: number; veces: number; expulsado: boolean }> = [];
    let cartasEnMesa = 0;
    let abandono = false;

    for (const s of [s0, s1]) {
      s.on('partida:tiempo', (d: { seat: number; veces: number; expulsado: boolean }) =>
        avisos.push(d),
      );
      s.on(
        'partida:estado',
        (d: { vista: { tricks: Array<Array<unknown>> } }) =>
          (cartasEnMesa = d.vista.tricks.flat().length),
      );
      s.on('partida:abandono', () => (abandono = true));
      s.emit('sala:entrar', { code });
    }

    await new Promise((r) => setTimeout(r, 400));
    s0.emit('sala:listo', { listo: true });
    s1.emit('sala:listo', { listo: true });
    await new Promise((r) => setTimeout(r, 900));

    // NADIE juega: se deja correr el reloj para que venza dos veces.
    await new Promise((r) => setTimeout(r, 4000));

    console.log('\n═══ RELOJ DE TURNO ═══');
    console.log(`  vencimientos avisados: ${avisos.length}`);
    for (const a of avisos)
      console.log(
        `    asiento ${a.seat} · vez ${a.veces} · ${a.expulsado ? 'EXPULSADO' : 'se juega por él'}`,
      );
    console.log(`  cartas que llegaron a la mesa solas: ${cartasEnMesa}`);
    console.log(`  ¿se cerró la partida?: ${abandono ? 'sí ✓' : 'no'}\n`);

    expect(avisos.length, 'tiene que haber avisado al menos un vencimiento').toBeGreaterThan(0);
    // Primera vez: se juega por él, no se lo echa.
    expect(avisos[0]!.veces, 'el primer vencimiento es el número 1').toBe(1);
    expect(avisos[0]!.expulsado, 'a la primera NO se lo expulsa: se juega por él').toBe(false);
    expect(cartasEnMesa, 'el reloj tuvo que jugar una carta por el ausente').toBeGreaterThan(0);

    // Segunda vez: se lo saca de la partida.
    const expulsion = avisos.find((a) => a.expulsado);
    expect(expulsion, 'al segundo vencimiento tiene que expulsarlo').toBeDefined();
    expect(expulsion!.veces, 'la expulsión ocurre en el segundo vencimiento').toBeGreaterThanOrEqual(
      2,
    );
    expect(abandono, 'la partida tiene que cerrarse cuando se lo saca').toBe(true);

    s0.disconnect();
    s1.disconnect();
  }, 60000);
});
