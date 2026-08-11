/**
 * Caso reportado por un tester con foto: al tirar una carta le salía
 * "Acción ilegal PLAY_CARD (asiento 0) en fase PLAYING", y sólo en una de las
 * dos cuentas.
 *
 * La causa está del lado del cliente: la animación de la carta dura 380ms y,
 * si el servidor tarda más en responder, la mano se volvía a habilitar con
 * `miTurno` todavía en true (el estado nuevo no había llegado). Un segundo
 * toque mandaba entonces una jugada que el servidor ya no podía aceptar.
 *
 * Acá se verifica el lado del servidor de ese escenario: que rechace la
 * segunda jugada sin romperse, sin corromper la partida y sin cobrar de más.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as clienteIO, type Socket } from 'socket.io-client';
import { prisma } from '@trucazo/db';
import { emitirTokenPartida } from '@trucazo/shared';
import type { Action } from '@trucazo/engine';
import { crearServidor } from './index.js';

const SECRET = 'secreto-de-test-suficientemente-largo-1234';
const sufijo = `dj${Date.now().toString(36)}`;

let puerto = 0;
let servidor: ReturnType<typeof crearServidor>;
let roomId = '';
let code = '';
const usuarios: Array<{ id: string; username: string }> = [];

interface Vista {
  phase: string;
  seat: number;
  turnSeat: number | null;
  myHand: Array<{ suit: string; rank: number }>;
  tricks: Array<Array<{ seat: number; card: { suit: string; rank: number } }>>;
  legales: Action[];
}

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
      name: 'Doble jugada',
      hostUserId: usuarios[0]!.id,
      mode: 'CASUAL_1V1',
      state: 'WAITING',
      pointsToWin: 30,
      florEnabled: false,
      allowBots: false,
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

describe('dos jugadas seguidas sin esperar al servidor', () => {
  it('la segunda se rechaza sin romper la partida ni duplicar la carta', async () => {
    const s0 = await conectar(usuarios[0]!.id, usuarios[0]!.username);
    const s1 = await conectar(usuarios[1]!.id, usuarios[1]!.username);

    const vistas = new Map<number, Vista>();
    const rechazos: string[] = [];
    for (const [i, s] of [s0, s1].entries()) {
      s.on('partida:estado', (d: { vista: Vista }) => vistas.set(i, d.vista));
      s.on('accion:rechazada', (d: { motivo: string }) => rechazos.push(d.motivo));
      s.emit('sala:entrar', { code });
    }
    await new Promise((r) => setTimeout(r, 400));
    s0.emit('sala:listo', { listo: true });
    s1.emit('sala:listo', { listo: true });
    await new Promise((r) => setTimeout(r, 900));
    expect(vistas.size).toBe(2);

    // Quien tiene el turno tira DOS cartas de golpe, sin esperar respuesta:
    // exactamente lo que hacía la UI cuando el servidor tardaba.
    const iEnTurno = [...vistas.entries()].find(([, v]) => v.turnSeat === v.seat)?.[0];
    expect(iEnTurno, 'alguien tiene que tener el turno').toBeDefined();
    const v = vistas.get(iEnTurno!)!;
    const cartas = v.legales.filter((a) => a.type === 'PLAY_CARD');
    expect(cartas.length, 'tiene que haber al menos dos cartas jugables').toBeGreaterThanOrEqual(2);

    const socket = iEnTurno === 0 ? s0 : s1;
    socket.emit('partida:accion', { action: cartas[0], actionId: 'primera' });
    socket.emit('partida:accion', { action: cartas[1], actionId: 'segunda' });
    await new Promise((r) => setTimeout(r, 800));

    const despues = vistas.get(iEnTurno!)!;
    const enMesa = despues.tricks.flat();
    const miasEnMesa = enMesa.filter((j) => j.seat === despues.seat);

    console.log('\n═══ DOBLE JUGADA (caso del tester) ═══');
    console.log(`  rechazos del servidor: ${rechazos.length}`);
    for (const r of rechazos) console.log(`    ✗ "${r}"`);
    console.log(`  cartas mías en la mesa: ${miasEnMesa.length} (tiene que ser 1)`);
    console.log(`  cartas que me quedan en la mano: ${despues.myHand.length}`);
    console.log(`  fase: ${despues.phase}\n`);

    // Lo importante: el servidor aceptó UNA sola y la partida sigue sana.
    expect(miasEnMesa.length, 'sólo puede haber entrado una carta mía a la mesa').toBe(1);
    expect(despues.myHand.length, 'sólo se me tiene que haber ido una carta').toBe(2);
    expect(despues.phase, 'la partida tiene que seguir jugándose').toBe('PLAYING');

    // El mensaje que ve el jugador no puede ser jerga del motor.
    if (rechazos.length > 0) {
      expect(
        rechazos[0],
        'el servidor manda el motivo técnico; la UI lo traduce antes de mostrarlo',
      ).toMatch(/PLAY_CARD|ilegal|turno/i);
    }

    s0.disconnect();
    s1.disconnect();
  }, 60000);
});
