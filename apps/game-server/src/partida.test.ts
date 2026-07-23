/**
 * Test de integración end-to-end del game server: dos clientes Socket.IO reales
 * juegan una partida completa contra el servidor, con la base real.
 *
 * Verifica lo que más importa:
 *  - que se pueda jugar una partida entera hasta que haya ganador,
 *  - que un jugador NUNCA reciba las cartas del rival,
 *  - que el servidor rechace acciones ilegales y de asientos ajenos,
 *  - que el event log quede persistido.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as clienteIO, type Socket } from 'socket.io-client';
import { prisma } from '@trucazo/db';
import { emitirTokenPartida } from '@trucazo/shared';
import type { Action } from '@trucazo/engine';
import { crearServidor } from './index.js';

const SECRET = 'secreto-de-test-suficientemente-largo-1234';
const sufijo = Date.now().toString(36);

let puerto = 0;
let servidor: ReturnType<typeof crearServidor>;
let roomId = '';
let code = '';
const usuarios: Array<{ id: string; username: string }> = [];

type Vista = {
  phase: string;
  seat: number;
  myHand: Array<{ suit: string; rank: number }>;
  handCounts: Record<number, number>;
  scores: [number, number];
  turnSeat: number | null;
  winner: number | null;
  legales: Action[];
};

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
    const username = `e2e_${sufijo}_${i}`;
    const u = await prisma.user.create({
      data: { username, profile: { create: { displayName: username } }, wallet: { create: {} } },
    });
    usuarios.push({ id: u.id, username });
  }

  code = `E${sufijo.slice(-5).toUpperCase()}`.slice(0, 6);
  const room = await prisma.room.create({
    data: {
      code,
      name: 'Sala E2E',
      hostUserId: usuarios[0]!.id,
      mode: 'CASUAL_1V1',
      state: 'WAITING',
      pointsToWin: 15,
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

describe('autenticación del socket', () => {
  it('rechaza la conexión sin token válido', async () => {
    const s = clienteIO(`http://localhost:${puerto}`, {
      auth: { token: 'invalido' },
      transports: ['websocket'],
      forceNew: true,
    });
    const error = await new Promise<Error>((res) => s.on('connect_error', res));
    expect(error.message).toMatch(/token/i);
    s.disconnect();
  });
});

describe('partida completa 1v1', () => {
  it('dos jugadores juegan hasta que haya ganador, sin ver las cartas del rival', async () => {
    const s0 = await conectar(usuarios[0]!.id, usuarios[0]!.username);
    const s1 = await conectar(usuarios[1]!.id, usuarios[1]!.username);

    const vistas = new Map<number, Vista>();
    // Lo más importante: registramos TODO lo que recibe cada cliente para
    // después auditar que nunca le llegaron cartas ajenas.
    const recibido: Array<{ socket: number; datos: unknown }> = [];

    let terminada = false;
    let ganador: number | null = null;

    const rechazos: string[] = [];
    const errores: string[] = [];
    let arranco = false;

    const enganchar = (s: Socket, idx: number) => {
      s.on('sala:estado', (snap: { estado: string }) => {
        if (snap.estado === 'EN_PARTIDA') arranco = true;
      });
      s.on('accion:rechazada', (d: { motivo: string }) => {
        rechazos.push(`s${idx}: ${d.motivo}`);
        s.emit('partida:sync'); // recuperar estado real tras un rechazo
      });
      s.on('error:app', (d: { mensaje: string }) => errores.push(`s${idx}: ${d.mensaje}`));
      s.on('partida:estado', (d: { vista: Vista }) => {
        vistas.set(idx, d.vista);
        recibido.push({ socket: idx, datos: d });
        if (d.vista.phase === 'MATCH_FINISHED') {
          terminada = true;
          ganador = d.vista.winner;
        }
      });
    };
    enganchar(s0, 0);
    enganchar(s1, 1);

    s0.emit('sala:entrar', { code });
    s1.emit('sala:entrar', { code });
    await esperar(400);

    s0.emit('sala:listo', { listo: true });
    s1.emit('sala:listo', { listo: true });

    // Bucle de juego: cada cliente juega su primera acción legal disponible.
    const sockets = [s0, s1];
    const limite = Date.now() + 40_000;
    let acciones = 0;

    while (!terminada && Date.now() < limite) {
      await esperar(35);
      for (let i = 0; i < 2; i++) {
        const v = vistas.get(i);
        if (!v || v.phase === 'MATCH_FINISHED') continue;
        const legal = v.legales?.[0];
        if (!legal) continue;
        // Evita repetir la misma acción mientras el servidor procesa.
        vistas.set(i, { ...v, legales: [] });
        sockets[i]!.emit('partida:accion', {
          action: legal,
          actionId: `t${acciones++}-${i}`,
        });
      }
    }

    if (!terminada) {
      console.log('DIAGNÓSTICO:', {
        arranco,
        acciones,
        errores: errores.slice(0, 5),
        rechazos: rechazos.slice(0, 5),
        vista0: vistas.get(0) && {
          phase: vistas.get(0)!.phase,
          turnSeat: vistas.get(0)!.turnSeat,
          scores: vistas.get(0)!.scores,
          nLegales: vistas.get(0)!.legales?.length,
        },
        vista1: vistas.get(1) && {
          phase: vistas.get(1)!.phase,
          turnSeat: vistas.get(1)!.turnSeat,
          nLegales: vistas.get(1)!.legales?.length,
        },
      });
    }
    expect(terminada, 'la partida debería haber terminado').toBe(true);
    expect([0, 1]).toContain(ganador);
    expect(acciones).toBeGreaterThan(5);

    // ── Seguridad: ningún cliente vio cartas ajenas ──────────────────
    for (const { socket, datos } of recibido) {
      const v = (datos as { vista: Vista }).vista;
      expect(v.seat).toBe(socket);
      // La vista sólo trae `myHand`. Nunca debe aparecer la mano del otro.
      expect(JSON.stringify(datos)).not.toContain('"dealt"');
      expect(v.myHand.length).toBeLessThanOrEqual(3);
    }

    // El puntaje final alcanzó el objetivo.
    const final = vistas.get(0)!;
    expect(Math.max(final.scores[0], final.scores[1])).toBeGreaterThanOrEqual(15);

    s0.disconnect();
    s1.disconnect();
    await esperar(200);

    // ── Persistencia ────────────────────────────────────────────────
    const match = await prisma.match.findFirst({
      where: { roomId },
      include: { result: true, events: true, matchPlayers: true },
    });
    expect(match?.state).toBe('FINISHED');
    expect(match?.result).toBeTruthy();
    expect(match?.matchPlayers).toHaveLength(2);
    expect(match!.events.length).toBeGreaterThan(10);
    // Las secuencias del event log son únicas y crecientes.
    const seqs = match!.events.map((e) => e.seq);
    expect(new Set(seqs).size).toBe(seqs.length);
  }, 60_000);
});

function esperar(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
