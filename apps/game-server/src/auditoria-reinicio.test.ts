/**
 * Auditoría de reinicio del proceso con partidas en curso.
 *
 * El estado de cada partida vive en memoria del game-server. Si el proceso se
 * reinicia (deploy, OOM, crash) con partidas apostadas en juego, la plata ya
 * salió de las dos billeteras y todavía no se acreditó a nadie: si nadie la
 * libera, queda congelada para siempre y ningún jugador puede reclamarla.
 *
 * Se verifica que al arrancar, el servidor barra esas partidas huérfanas:
 * cancela el Match que quedó IN_PROGRESS y devuelve la apuesta a cada jugador.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as clienteIO, type Socket } from 'socket.io-client';
import { prisma } from '@trucazo/db';
import { emitirTokenPartida } from '@trucazo/shared';
import { auditarUsuario, registrarMovimiento } from '@trucazo/economia';
import { crearServidor } from './index.js';

const SECRET = 'secreto-de-test-suficientemente-largo-1234';
const sufijo = `re${Date.now().toString(36)}`;
const APUESTA = 400;
const SALDO_INICIAL = 3000n;

const salas: string[] = [];
const usuarios: Array<{ id: string; username: string }> = [];

function conectar(puerto: number, userId: string, username: string): Promise<Socket> {
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
  const ids = usuarios.map((u) => u.id);
  await prisma.gameEvent.deleteMany({ where: { match: { roomId: { in: salas } } } });
  await prisma.matchResult.deleteMany({ where: { match: { roomId: { in: salas } } } });
  await prisma.matchPlayer.deleteMany({ where: { match: { roomId: { in: salas } } } });
  await prisma.betParticipant.deleteMany({ where: { userId: { in: ids } } });
  await prisma.bet.deleteMany({ where: { match: { roomId: { in: salas } } } });
  await prisma.match.deleteMany({ where: { roomId: { in: salas } } });
  await prisma.ledgerEntry.deleteMany({ where: { userId: { in: ids } } });
  await prisma.room.deleteMany({ where: { id: { in: salas } } });
  await prisma.wallet.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe('reinicio del proceso con una partida apostada en curso', () => {
  it('al arrancar, la apuesta huérfana se devuelve y el match no queda colgado', async () => {
    const code = `${sufijo.slice(-5).toUpperCase()}R`.slice(0, 6);
    const room = await prisma.room.create({
      data: {
        code,
        name: 'Auditoría reinicio',
        hostUserId: usuarios[0]!.id,
        mode: 'CASUAL_1V1',
        state: 'WAITING',
        pointsToWin: 30,
        florEnabled: false,
        allowBots: false,
        betAmount: BigInt(APUESTA),
      },
    });
    salas.push(room.id);

    const saldosAntes = [await saldoDe(usuarios[0]!.id), await saldoDe(usuarios[1]!.id)];

    // ── Servidor "viejo": arranca la partida y se reserva la apuesta ──────
    const viejo = crearServidor({ puerto: 0, secreto: SECRET });
    const puerto1 = await viejo.escuchar();
    const s0 = await conectar(puerto1, usuarios[0]!.id, usuarios[0]!.username);
    const s1 = await conectar(puerto1, usuarios[1]!.id, usuarios[1]!.username);

    let arranco = false;
    for (const s of [s0, s1]) {
      s.on('partida:estado', () => (arranco = true));
      s.emit('sala:entrar', { code });
    }
    await new Promise((r) => setTimeout(r, 400));
    s0.emit('sala:listo', { listo: true });
    s1.emit('sala:listo', { listo: true });
    await new Promise((r) => setTimeout(r, 900));
    expect(arranco, 'la partida apostada tiene que haber arrancado').toBe(true);

    const apuesta = await prisma.bet.findFirst({ where: { match: { roomId: room.id } } });
    expect(apuesta?.state).toBe('RESERVED');
    const saldosReservados = [await saldoDe(usuarios[0]!.id), await saldoDe(usuarios[1]!.id)];
    expect(saldosReservados[0]).toBe(saldosAntes[0]! - BigInt(APUESTA));
    expect(saldosReservados[1]).toBe(saldosAntes[1]! - BigInt(APUESTA));

    // ── El proceso se cae en pleno juego (deploy, OOM, crash) ─────────────
    s0.disconnect();
    s1.disconnect();
    await viejo.cerrar();

    const colgadoAntes = await prisma.match.findFirst({
      where: { roomId: room.id, state: 'IN_PROGRESS' },
    });
    expect(colgadoAntes, 'tras la caída el match queda IN_PROGRESS').not.toBeNull();

    // ── Servidor "nuevo": debe barrer lo que quedó huérfano ───────────────
    const nuevo = crearServidor({ puerto: 0, secreto: SECRET });
    await nuevo.escuchar();
    await new Promise((r) => setTimeout(r, 1500));

    const apuestaTrasReinicio = await prisma.bet.findFirst({
      where: { match: { roomId: room.id } },
    });
    const matchTrasReinicio = await prisma.match.findFirst({ where: { roomId: room.id } });
    const saldosFinales = [await saldoDe(usuarios[0]!.id), await saldoDe(usuarios[1]!.id)];

    console.log('\n═══ REINICIO CON PARTIDA APOSTADA ═══');
    console.log(`  apuesta: ${APUESTA} por cabeza`);
    console.log(`  saldos antes:      ${saldosAntes.join(' / ')}`);
    console.log(`  tras reservar:     ${saldosReservados.join(' / ')}`);
    console.log(`  tras el reinicio:  ${saldosFinales.join(' / ')}`);
    console.log(`  estado de la apuesta: ${apuestaTrasReinicio?.state}`);
    console.log(`  estado del match:     ${matchTrasReinicio?.state}`);

    expect(
      apuestaTrasReinicio?.state,
      'la apuesta no puede quedar RESERVED tras el reinicio: esa plata no es de nadie',
    ).not.toBe('RESERVED');
    expect(matchTrasReinicio?.state, 'el match no puede quedar IN_PROGRESS para siempre').not.toBe(
      'IN_PROGRESS',
    );
    expect(saldosFinales[0], 'al no haberse jugado la partida, hay que devolver lo apostado').toBe(
      saldosAntes[0],
    );
    expect(saldosFinales[1], 'idem para el otro jugador').toBe(saldosAntes[1]);

    for (const u of usuarios) {
      const a = await auditarUsuario(u.id);
      console.log(`  ledger ${u.username}: ${a.ok ? 'cuadra' : 'NO CUADRA'}`);
      expect(a.ok, `el ledger de ${u.username} tiene que cuadrar`).toBe(true);
    }
    console.log('');

    await nuevo.cerrar();
  }, 60000);
});
