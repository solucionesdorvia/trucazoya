/**
 * El 2v2 nunca se jugó con fichas: `auditoria-2v2` verifica las reglas por
 * equipos pero con apuesta cero, así que el reparto del pozo entre CUATRO
 * jugadores y DOS ganadores no tenía cobertura.
 *
 * Ahí hay una división que en 1v1 nunca se ejercita: el premio se parte entre
 * los dos del equipo ganador. Y como ahora se puede apostar cualquier monto
 * (el jugador escribe 4005 si quiere), esa división puede no dar exacta.
 *
 * Se elige un monto a propósito "feo" para ejercitar ese borde, y se verifica
 * lo único que no se negocia: la plata que sale de los jugadores tiene que
 * llegar entera a alguien. Ni una ficha puede evaporarse.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as clienteIO, type Socket } from 'socket.io-client';
import { prisma } from '@trucazo/db';
import { emitirTokenPartida } from '@trucazo/shared';
import { auditarUsuario, registrarMovimiento } from '@trucazo/economia';
import type { Action } from '@trucazo/engine';
import { crearServidor } from './index.js';

const SECRET = 'secreto-de-test-suficientemente-largo-1234';
const sufijo = `c4${Date.now().toString(36)}`;
/** Monto libre y no redondo: el pozo de 4 no se parte exacto entre 2. */
const APUESTA = 4005;
const SALDO_INICIAL = 12000n;
const RAKE_BPS = 500;

let puerto = 0;
let servidor: ReturnType<typeof crearServidor>;
let roomId = '';
let code = '';
const usuarios: Array<{ id: string; username: string }> = [];

interface Vista {
  phase: string;
  seat: number;
  team: number;
  winner: number | null;
  scores: [number, number];
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

const saldoDe = async (userId: string) => {
  const w = await prisma.wallet.findUnique({ where: { userId } });
  return w?.balance ?? 0n;
};
const saldoPlataforma = async () => {
  const u = await prisma.user.findUnique({ where: { username: '_plataforma' } });
  return u ? saldoDe(u.id) : 0n;
};

beforeAll(async () => {
  process.env.PLATFORM_RAKE_BPS = String(RAKE_BPS);
  servidor = crearServidor({ puerto: 0, secreto: SECRET });
  puerto = await servidor.escuchar();
  for (let i = 0; i < 4; i++) {
    const username = `${sufijo}_${i}`;
    const u = await prisma.user.create({
      data: { username, profile: { create: { displayName: username } }, wallet: { create: {} } },
    });
    usuarios.push({ id: u.id, username });
    await registrarMovimiento({
      userId: u.id,
      type: 'ADMIN_ADJUSTMENT',
      amount: SALDO_INICIAL,
      idempotencyKey: `seed-${u.id}`,
      reason: 'saldo inicial de auditoría',
    });
  }
  code = sufijo.slice(-6).toUpperCase();
  const room = await prisma.room.create({
    data: {
      code,
      name: '2v2 por fichas',
      hostUserId: usuarios[0]!.id,
      mode: 'CASUAL_2V2',
      state: 'WAITING',
      pointsToWin: 15,
      florEnabled: false,
      allowBots: false,
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

describe('2v2 por fichas: el pozo de cuatro repartido entre dos', () => {
  it('no se evapora ni una ficha y los dos del equipo cobran igual', async () => {
    const sockets: Socket[] = [];
    for (const u of usuarios) sockets.push(await conectar(u.id, u.username));

    const antes: bigint[] = [];
    for (const u of usuarios) antes.push(await saldoDe(u.id));
    const plataformaAntes = await saldoPlataforma();

    const vistas = new Map<number, Vista>();
    let terminada = false;
    for (const [i, s] of sockets.entries()) {
      s.on('partida:estado', (d: { vista: Vista }) => vistas.set(i, d.vista));
      s.on('partida:terminada', () => (terminada = true));
      s.emit('sala:entrar', { code });
    }
    await new Promise((r) => setTimeout(r, 700));
    for (const s of sockets) s.emit('sala:listo', { listo: true });
    await new Promise((r) => setTimeout(r, 1400));
    expect(vistas.size, 'los cuatro tienen que estar en la partida').toBe(4);

    // Se cobró al repartir, a los cuatro.
    const reservados: bigint[] = [];
    for (const u of usuarios) reservados.push(await saldoDe(u.id));
    for (let i = 0; i < 4; i++) {
      expect(reservados[i], `al jugador ${i} se le tiene que descontar la apuesta`).toBe(
        antes[i]! - BigInt(APUESTA),
      );
    }

    let semilla = Number(process.env.SEMILLA_AUDITORIA ?? 777);
    const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;

    for (let paso = 0; paso < 8000 && !terminada; paso++) {
      let actuo = false;
      for (const [i, v] of vistas) {
        if (v.winner !== null) {
          terminada = true;
          break;
        }
        if (v.legales.length === 0) continue;
        const cartas = v.legales.filter((a) => a.type === 'PLAY_CARD');
        const pool = cartas.length > 0 ? cartas : v.legales;
        const a = pool[Math.floor(azar() * pool.length)]!;
        sockets[i]!.emit('partida:accion', { action: a, actionId: `d${paso}-${i}` });
        await new Promise((r) => setTimeout(r, 20));
        actuo = true;
        break;
      }
      if (!actuo) await new Promise((r) => setTimeout(r, 50));
    }
    await new Promise((r) => setTimeout(r, 1500));

    const pozo = BigInt(APUESTA) * 4n;
    const comisionEsperada = (pozo * BigInt(RAKE_BPS)) / 10000n;

    const despues: bigint[] = [];
    for (const u of usuarios) despues.push(await saldoDe(u.id));
    const plataformaDespues = await saldoPlataforma();
    const comisionCobrada = plataformaDespues - plataformaAntes;
    const bet = await prisma.bet.findFirst({ where: { match: { roomId } } });

    const ganadores = despues
      .map((s, i) => ({ i, cobro: s - reservados[i]! }))
      .filter((x) => x.cobro > 0n);
    const repartido = ganadores.reduce((t, g) => t + g.cobro, 0n) + comisionCobrada;

    console.log('\n═══ 2v2 POR FICHAS (monto no redondo) ═══');
    console.log(`  apuesta por jugador: ${APUESTA} · pozo de 4: ${pozo}`);
    console.log(`  estado de la apuesta: ${bet?.state}`);
    console.log(`  puntaje final: ${[...vistas.values()][0]?.scores.join(' - ')}`);
    console.log(`  ganadores: ${ganadores.map((g) => `jugador ${g.i} (+${g.cobro})`).join(', ')}`);
    console.log(`  comisión esperada: ${comisionEsperada} · cobrada: ${comisionCobrada}`);
    console.log(`  ── reparto ──`);
    console.log(`  salió de los jugadores: ${pozo}`);
    console.log(`  llegó a alguien:        ${repartido}`);
    console.log(`  diferencia:             ${pozo - repartido} (tiene que ser 0)\n`);

    expect(bet?.state, 'la apuesta tiene que quedar liquidada').toBe('SETTLED');

    // La comisión es el 5% MÁS el resto que la división entera no pudo repartir
    // (nunca más de un puñado de fichas: como mucho, ganadores - 1).
    expect(comisionCobrada >= comisionEsperada, 'la comisión no puede ser menor al 5%').toBe(true);
    expect(
      comisionCobrada - comisionEsperada < BigInt(ganadores.length),
      'lo único que puede sumarse al 5% es el resto de la división',
    ).toBe(true);
    expect(ganadores.length, 'en 2v2 tienen que cobrar los DOS del equipo').toBe(2);
    expect(ganadores[0]!.cobro, 'los dos compañeros tienen que cobrar exactamente lo mismo').toBe(
      ganadores[1]!.cobro,
    );

    // EL INVARIANTE: todo lo que salió de los jugadores llegó a alguien.
    expect(repartido, 'el pozo tiene que repartirse entero: si falta, se destruyeron fichas').toBe(
      pozo,
    );

    for (const u of usuarios) {
      const a = await auditarUsuario(u.id);
      expect(a.ok, `el ledger de ${u.username} tiene que cuadrar`).toBe(true);
    }

    for (const s of sockets) s.disconnect();
  }, 180000);
});
