/**
 * La sala SIN FICHAS es ahora el camino que la portada le ofrece a cualquiera
 * que se registra: la cuenta nueva arranca por debajo del mínimo de las
 * partidas rápidas, así que "armá una sala sin fichas y pasá el código" es la
 * única forma de jugar sin pasar antes por un cajero.
 *
 * Si eso está roto, el jugador nuevo no puede jugar nada. Se verifica que la
 * partida se juegue entera y que NO toque la plata: sin apuesta, sin comisión,
 * sin un solo asiento en el ledger.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as clienteIO, type Socket } from 'socket.io-client';
import { prisma } from '@trucazo/db';
import { emitirTokenPartida } from '@trucazo/shared';
import { auditarUsuario, registrarMovimiento } from '@trucazo/economia';
import type { Action } from '@trucazo/engine';
import { crearServidor } from './index.js';

const SECRET = 'secreto-de-test-suficientemente-largo-1234';
const sufijo = `sg${Date.now().toString(36)}`;
/** A propósito por debajo del mínimo de 2500: es el jugador recién registrado. */
const SALDO_INICIAL = 500n;

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
  scores: number[];
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
      reason: 'fichas de cuenta nueva',
    });
  }
  code = sufijo.slice(-6).toUpperCase();
  const room = await prisma.room.create({
    data: {
      code,
      name: 'Sala sin fichas',
      hostUserId: usuarios[0]!.id,
      mode: 'CASUAL_1V1',
      state: 'WAITING',
      pointsToWin: 15,
      florEnabled: false,
      allowBots: false,
      betAmount: 0n, // "Sin fichas": lo que ofrece la portada
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

describe('sala sin fichas (el camino gratis del jugador nuevo)', () => {
  it('se juega la partida entera y no se toca un solo peso', async () => {
    const s0 = await conectar(usuarios[0]!.id, usuarios[0]!.username);
    const s1 = await conectar(usuarios[1]!.id, usuarios[1]!.username);
    const sockets = [s0, s1];

    const antes = [await saldoDe(usuarios[0]!.id), await saldoDe(usuarios[1]!.id)];
    const asientosAntes = await prisma.ledgerEntry.count({
      where: { userId: { in: usuarios.map((u) => u.id) } },
    });

    const vistas = new Map<number, Vista>();
    const rechazos: string[] = [];
    const erroresApp: string[] = [];
    for (const [i, s] of sockets.entries()) {
      s.on('partida:estado', (d: { vista: Vista }) => vistas.set(i, d.vista));
      s.on('accion:rechazada', (d: { motivo: string }) => rechazos.push(d.motivo));
      s.on('error:app', (d: { mensaje: string }) => erroresApp.push(d.mensaje));
      s.emit('sala:entrar', { code });
    }
    await new Promise((r) => setTimeout(r, 500));
    s0.emit('sala:listo', { listo: true });
    s1.emit('sala:listo', { listo: true });
    await new Promise((r) => setTimeout(r, 1000));

    expect(
      erroresApp,
      'con 500 fichas (menos que el mínimo) la sala gratis igual tiene que arrancar',
    ).toEqual([]);
    expect(vistas.size, 'la partida sin fichas tiene que repartir').toBe(2);

    // Se juega hasta que haya ganador, con acciones legales al azar.
    let semilla = Number(process.env.SEMILLA_AUDITORIA ?? 20260813);
    const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;

    let jugadas = 0;
    for (let paso = 0; paso < 6000; paso++) {
      if ([...vistas.values()].some((v) => v.winner !== null)) break;
      let actuo = false;
      for (const [i, v] of vistas) {
        if (v.legales.length === 0) continue;
        const cartas = v.legales.filter((a) => a.type === 'PLAY_CARD');
        const pool = cartas.length > 0 ? cartas : v.legales;
        const a = pool[Math.floor(azar() * pool.length)]!;
        sockets[i]!.emit('partida:accion', { action: a, actionId: `g${paso}-${i}` });
        jugadas++;
        await new Promise((r) => setTimeout(r, 20));
        actuo = true;
        break;
      }
      if (!actuo) await new Promise((r) => setTimeout(r, 50));
    }
    await new Promise((r) => setTimeout(r, 1200));

    const final = [...vistas.values()].find((v) => v.winner !== null);
    const despues = [await saldoDe(usuarios[0]!.id), await saldoDe(usuarios[1]!.id)];
    const apuestas = await prisma.bet.count({ where: { match: { roomId } } });
    const asientosDespues = await prisma.ledgerEntry.count({
      where: { userId: { in: usuarios.map((u) => u.id) } },
    });
    const resultado = await prisma.matchResult.findFirst({ where: { match: { roomId } } });

    console.log('\n═══ SALA SIN FICHAS ═══');
    console.log(`  saldo de cada uno: ${SALDO_INICIAL} (por debajo del mínimo de 2500)`);
    console.log(`  acciones jugadas: ${jugadas}`);
    console.log(`  ganador: ${final ? `asiento ${final.winner}` : 'NINGUNO ✗'}`);
    console.log(`  puntaje final: ${final?.scores.join(' - ') ?? '—'}`);
    console.log(`  apuestas creadas: ${apuestas} (tiene que ser 0)`);
    console.log(`  saldos: ${antes.join(' / ')} → ${despues.join(' / ')}`);
    console.log(`  asientos en el ledger: ${asientosAntes} → ${asientosDespues}`);
    console.log(`  resultado guardado: ${resultado ? 'sí ✓' : 'no ✗'}`);
    console.log(`  acciones rechazadas: ${rechazos.length}\n`);

    // 1) La partida se juega de verdad y termina.
    expect(final, 'la partida gratis tiene que terminar con un ganador').toBeDefined();

    // 2) No se toca la plata: ni apuesta, ni comisión, ni asientos.
    expect(apuestas, 'una sala sin fichas no puede crear apuesta').toBe(0);
    expect(despues[0], 'el saldo del jugador 0 no se puede mover').toBe(antes[0]);
    expect(despues[1], 'el saldo del jugador 1 no se puede mover').toBe(antes[1]);
    expect(asientosDespues, 'jugar gratis no puede escribir en el ledger').toBe(asientosAntes);

    // 3) Pero sí cuenta como partida: queda registrada.
    expect(resultado, 'la partida gratis igual tiene que quedar en el historial').toBeTruthy();

    // 4) Y el ledger de cada uno sigue cuadrando.
    for (const u of usuarios) {
      const a = await auditarUsuario(u.id);
      expect(a.ok, `el ledger de ${u.username} tiene que cuadrar`).toBe(true);
    }

    s0.disconnect();
    s1.disconnect();
  }, 180000);
});
