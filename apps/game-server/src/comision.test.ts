/**
 * Auditoría de la comisión (rake) en una PARTIDA RÁPIDA con fichas.
 *
 * Un tester reportó que las partidas casuales no cobraban fichas ni comisión.
 * La causa era que el matchmaking creaba todas las salas con apuesta 0; ahora
 * se puede elegir el monto, así que hay que verificar el circuito completo:
 * emparejar por fichas → reservar → jugar → liquidar → comisión a la
 * plataforma, con la contabilidad cerrando de punta a punta.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as clienteIO, type Socket } from 'socket.io-client';
import { prisma } from '@trucazo/db';
import { emitirTokenPartida } from '@trucazo/shared';
import { auditarUsuario, registrarMovimiento } from '@trucazo/economia';
import type { Action } from '@trucazo/engine';
import { crearServidor } from './index.js';

const SECRET = 'secreto-de-test-suficientemente-largo-1234';
const sufijo = `cm${Date.now().toString(36)}`;
const APUESTA = 1000;
const SALDO_INICIAL = 8000n;
const RAKE_BPS = 500; // 5%

let puerto = 0;
let servidor: ReturnType<typeof crearServidor>;
const usuarios: Array<{ id: string; username: string }> = [];
const codigos: string[] = [];

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
  if (!u) return 0n;
  return saldoDe(u.id);
};

beforeAll(async () => {
  process.env.PLATFORM_RAKE_BPS = String(RAKE_BPS);
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
}, 30000);

afterAll(async () => {
  await servidor?.cerrar();
  const ids = usuarios.map((u) => u.id);
  const rooms = await prisma.room.findMany({
    where: { code: { in: codigos } },
    select: { id: true },
  });
  const roomIds = rooms.map((r) => r.id);
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

describe('comisión en partida rápida con fichas', () => {
  it('cobra el 5% del pozo y la contabilidad cierra de punta a punta', async () => {
    const s0 = await conectar(usuarios[0]!.id, usuarios[0]!.username);
    const s1 = await conectar(usuarios[1]!.id, usuarios[1]!.username);

    const saldosAntes = [await saldoDe(usuarios[0]!.id), await saldoDe(usuarios[1]!.id)];
    const plataformaAntes = await saldoPlataforma();

    // ── Emparejamiento POR FICHAS (lo que antes siempre era 0) ────────────
    const encontrado = new Map<number, string>();
    s0.on('mm:encontrado', ({ code }: { code: string }) => encontrado.set(0, code));
    s1.on('mm:encontrado', ({ code }: { code: string }) => encontrado.set(1, code));
    s0.emit('mm:buscar', { mode: 'CASUAL_1V1', apuesta: APUESTA });
    s1.emit('mm:buscar', { mode: 'CASUAL_1V1', apuesta: APUESTA });

    const limite = Date.now() + 9000;
    while (encontrado.size < 2 && Date.now() < limite) await new Promise((r) => setTimeout(r, 200));
    expect(encontrado.size, 'los dos tienen que emparejar').toBe(2);
    const code = encontrado.get(0)!;
    codigos.push(code);

    // La sala rápida tiene que haberse creado CON la apuesta pedida.
    const room = await prisma.room.findUnique({ where: { code } });
    expect(Number(room!.betAmount), 'la partida rápida se crea con las fichas elegidas').toBe(
      APUESTA,
    );

    // ── Se juega hasta que haya ganador ───────────────────────────────────
    const vistas = new Map<number, { winner: number | null; legales: Action[]; seat: number }>();
    let terminada = false;
    for (const [i, s] of [s0, s1].entries()) {
      s.on(
        'partida:estado',
        (d: { vista: { winner: number | null; legales: Action[]; seat: number } }) =>
          vistas.set(i, d.vista),
      );
      s.on('partida:terminada', () => (terminada = true));
      s.emit('sala:entrar', { code });
    }
    await new Promise((r) => setTimeout(r, 1200));
    expect(vistas.size, 'la partida rápida arranca sola').toBe(2);

    const saldosReservados = [await saldoDe(usuarios[0]!.id), await saldoDe(usuarios[1]!.id)];
    expect(saldosReservados[0], 'se descuenta la apuesta al repartir').toBe(
      saldosAntes[0]! - BigInt(APUESTA),
    );

    let semilla = 4321;
    const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let paso = 0; paso < 4000 && !terminada; paso++) {
      let actuo = false;
      for (const [i, v] of vistas) {
        if (v.winner !== null) {
          terminada = true;
          break;
        }
        const cartas = v.legales.filter((a) => a.type === 'PLAY_CARD');
        const pool = cartas.length > 0 ? cartas : v.legales;
        if (pool.length === 0) continue;
        const a = pool[Math.floor(azar() * pool.length)]!;
        (i === 0 ? s0 : s1).emit('partida:accion', { action: a, actionId: `c${paso}-${i}` });
        await new Promise((r) => setTimeout(r, 25));
        actuo = true;
        break;
      }
      if (!actuo) await new Promise((r) => setTimeout(r, 60));
    }
    await new Promise((r) => setTimeout(r, 1200));

    // ── Verificación de la plata ──────────────────────────────────────────
    const pozo = BigInt(APUESTA) * 2n;
    const comisionEsperada = (pozo * BigInt(RAKE_BPS)) / 10000n;
    const premioEsperado = pozo - comisionEsperada;

    const bet = await prisma.bet.findFirst({ where: { match: { roomId: room!.id } } });
    const saldosFinales = [await saldoDe(usuarios[0]!.id), await saldoDe(usuarios[1]!.id)];
    const plataformaDespues = await saldoPlataforma();
    const comisionCobrada = plataformaDespues - plataformaAntes;

    console.log('\n═══ COMISIÓN EN PARTIDA RÁPIDA ═══');
    console.log(`  apuesta por jugador: ${APUESTA} · pozo: ${pozo}`);
    console.log(`  estado de la apuesta: ${bet?.state}`);
    console.log(`  saldos: ${saldosAntes.join(' / ')} → ${saldosFinales.join(' / ')}`);
    console.log(`  comisión esperada (${RAKE_BPS / 100}%): ${comisionEsperada}`);
    console.log(`  comisión cobrada por la plataforma: ${comisionCobrada}`);
    console.log(`  premio al ganador: ${premioEsperado}`);

    expect(bet?.state, 'la apuesta tiene que quedar liquidada').toBe('SETTLED');
    expect(comisionCobrada, 'la plataforma tiene que cobrar exactamente el 5% del pozo').toBe(
      comisionEsperada,
    );

    // Suma cero: lo que perdió uno + lo que ganó el otro + comisión = 0.
    const deltaJugadores =
      saldosFinales[0]! - saldosAntes[0]! + (saldosFinales[1]! - saldosAntes[1]!);
    console.log(`  delta jugadores: ${deltaJugadores} (tiene que ser -comisión)`);
    expect(deltaJugadores, 'lo que sale de los jugadores es exactamente la comisión').toBe(
      -comisionEsperada,
    );

    // El ganador cobró el pozo menos comisión.
    const ganador = saldosFinales.findIndex((s, i) => s > saldosAntes[i]!);
    expect(
      ganador,
      'tiene que haber un ganador con más plata que al empezar',
    ).toBeGreaterThanOrEqual(0);
    expect(
      saldosFinales[ganador]! - saldosReservados[ganador]!,
      'el ganador cobra el pozo menos la comisión',
    ).toBe(premioEsperado);

    for (const u of usuarios) {
      const a = await auditarUsuario(u.id);
      console.log(`  ledger ${u.username}: ${a.ok ? 'cuadra' : 'NO CUADRA'}`);
      expect(a.ok, `el ledger de ${u.username} tiene que cuadrar`).toBe(true);
    }
    console.log('');

    s0.disconnect();
    s1.disconnect();
  }, 120000);
});
