/**
 * Reportado por un tester: arrancaron los dos con 500 fichas, jugaron varias
 * revanchas seguidas, y terminaron con 1070 y 60 — total 1130 en vez de 1000.
 * Se CREARON fichas de la nada, que es lo más grave que puede pasar en un
 * sistema con plata.
 *
 * Este test juega varias revanchas encadenadas y verifica el invariante que
 * nunca se puede romper: la suma de todo lo que hay (jugadores + comisión de
 * la plataforma) tiene que ser EXACTAMENTE la misma antes y después.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as clienteIO, type Socket } from 'socket.io-client';
import { prisma } from '@trucazo/db';
import { emitirTokenPartida } from '@trucazo/shared';
import { auditarUsuario, registrarMovimiento } from '@trucazo/economia';
import type { Action } from '@trucazo/engine';
import { crearServidor } from './index.js';

const SECRET = 'secreto-de-test-suficientemente-largo-1234';
const sufijo = `rv${Date.now().toString(36)}`;
const APUESTA = 100;
const SALDO_INICIAL = 500n;
const REVANCHAS = 3;

let puerto = 0;
let servidor: ReturnType<typeof crearServidor>;
let roomId = '';
let code = '';
const usuarios: Array<{ id: string; username: string }> = [];

interface Vista {
  phase: string;
  seat: number;
  turnSeat: number | null;
  winner: number | null;
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
      amount: SALDO_INICIAL,
      idempotencyKey: `seed-${u.id}`,
      reason: 'saldo inicial de auditoría',
    });
  }
  code = sufijo.slice(-6).toUpperCase();
  const room = await prisma.room.create({
    data: {
      code,
      name: 'Revanchas',
      hostUserId: usuarios[0]!.id,
      mode: 'CASUAL_1V1',
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

describe('revanchas encadenadas: las fichas no se pueden multiplicar', () => {
  it('el total en el sistema es el mismo antes y después de varias revanchas', async () => {
    const s0 = await conectar(usuarios[0]!.id, usuarios[0]!.username);
    const s1 = await conectar(usuarios[1]!.id, usuarios[1]!.username);
    const sockets = [s0, s1];

    const vistas = new Map<number, Vista>();
    for (const [i, s] of sockets.entries()) {
      s.on('partida:estado', (d: { vista: Vista }) => vistas.set(i, d.vista));
      s.emit('sala:entrar', { code });
    }

    const totalInicial =
      (await saldoDe(usuarios[0]!.id)) +
      (await saldoDe(usuarios[1]!.id)) +
      (await saldoPlataforma());

    await new Promise((r) => setTimeout(r, 400));
    s0.emit('sala:listo', { listo: true });
    s1.emit('sala:listo', { listo: true });
    await new Promise((r) => setTimeout(r, 900));

    let semilla = 987;
    const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;

    /** Juega hasta que termine la partida en curso. */
    async function jugarHastaElFinal() {
      for (let paso = 0; paso < 4000; paso++) {
        const alguna = [...vistas.values()].find((v) => v.winner !== null);
        if (alguna) return true;
        let actuo = false;
        for (const [i, v] of vistas) {
          if (v.legales.length === 0) continue;
          const cartas = v.legales.filter((a) => a.type === 'PLAY_CARD');
          const pool = cartas.length > 0 ? cartas : v.legales;
          const a = pool[Math.floor(azar() * pool.length)]!;
          sockets[i]!.emit('partida:accion', { action: a, actionId: `r${paso}-${i}-${azar()}` });
          await new Promise((r) => setTimeout(r, 22));
          actuo = true;
          break;
        }
        if (!actuo) await new Promise((r) => setTimeout(r, 50));
      }
      return false;
    }

    const historia: string[] = [];
    for (let ronda = 0; ronda <= REVANCHAS; ronda++) {
      const termino = await jugarHastaElFinal();
      await new Promise((r) => setTimeout(r, 900));

      const s = [await saldoDe(usuarios[0]!.id), await saldoDe(usuarios[1]!.id)];
      const plat = await saldoPlataforma();
      historia.push(
        `  partida ${ronda + 1}: ${s[0]} / ${s[1]} · plataforma ${plat} · total ${s[0]! + s[1]! + plat}`,
      );
      if (!termino) break;

      // Si a alguno no le alcanza para otra, no se puede seguir.
      if (s[0]! < BigInt(APUESTA) || s[1]! < BigInt(APUESTA)) break;
      if (ronda === REVANCHAS) break;

      // REVANCHA: los dos la piden, como hacía el tester.
      vistas.clear();
      s0.emit('sala:revancha');
      s1.emit('sala:revancha');
      await new Promise((r) => setTimeout(r, 1500));
      if (vistas.size < 2) break; // no arrancó: se corta la cadena
    }

    const finales = [await saldoDe(usuarios[0]!.id), await saldoDe(usuarios[1]!.id)];
    const platFinal = await saldoPlataforma();
    const totalFinal = finales[0]! + finales[1]! + platFinal;

    console.log('\n═══ REVANCHAS ENCADENADAS ═══');
    console.log(`  saldo inicial de cada uno: ${SALDO_INICIAL} · apuesta: ${APUESTA}`);
    for (const h of historia) console.log(h);
    console.log(`  ─────────────────────────────`);
    console.log(`  TOTAL inicial: ${totalInicial}`);
    console.log(`  TOTAL final:   ${totalFinal}`);
    console.log(`  diferencia:    ${totalFinal - totalInicial} (tiene que ser 0)\n`);

    for (const u of usuarios) {
      const a = await auditarUsuario(u.id);
      console.log(`  ledger ${u.username}: ${a.ok ? 'cuadra' : 'NO CUADRA'}`);
      expect(a.ok, `el ledger de ${u.username} tiene que cuadrar`).toBe(true);
    }
    console.log('');

    // EL INVARIANTE: jugar no puede crear ni destruir fichas.
    expect(
      totalFinal,
      'la suma de jugadores + plataforma tiene que conservarse: si crece, se están creando fichas',
    ).toBe(totalInicial);

    s0.disconnect();
    s1.disconnect();
  }, 180000);
});
