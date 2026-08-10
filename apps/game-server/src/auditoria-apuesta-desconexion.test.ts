/**
 * Auditoría del camino donde está la plata: dos jugadores apuestan, arranca la
 * partida (se RESERVA la apuesta) y uno se desconecta y no vuelve.
 *
 * Es el escenario más caro del sistema: entre la reserva y la liquidación el
 * pozo no vive en la cuenta de nadie —se debitó de los dos jugadores y todavía
 * no se acreditó— así que si la partida nunca cierra, esa plata queda
 * congelada para siempre.
 *
 * Se verifica que:
 *  - la reserva debita a ambos y deja la apuesta en RESERVED,
 *  - la desconexión abre una ventana de gracia con aviso a la mesa,
 *  - si el ausente NO vuelve, la partida cierra por abandono, gana el que se
 *    quedó y la apuesta se LIQUIDA (no queda colgada),
 *  - si el ausente SÍ vuelve a tiempo, no se cierra nada,
 *  - el ledger de cada jugador cierra contra su saldo (invariante contable).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as clienteIO, type Socket } from 'socket.io-client';
import { prisma } from '@trucazo/db';
import { emitirTokenPartida } from '@trucazo/shared';
import { auditarUsuario, registrarMovimiento } from '@trucazo/economia';
import { crearServidor } from './index.js';

const SECRET = 'secreto-de-test-suficientemente-largo-1234';
const sufijo = `ad${Date.now().toString(36)}`;
const APUESTA = 500;
const SALDO_INICIAL = 5000n;

let puerto = 0;
let servidor: ReturnType<typeof crearServidor>;
const salas: string[] = [];
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

async function crearSala(code: string) {
  const room = await prisma.room.create({
    data: {
      code,
      name: 'Auditoría apuesta',
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
  return room;
}

const saldoDe = async (userId: string) => {
  const w = await prisma.wallet.findUnique({ where: { userId } });
  return w?.balance ?? 0n;
};

beforeAll(async () => {
  // La espera de ausencia se acorta para poder testear el vencimiento.
  process.env.ESPERA_AUSENCIA_MS = '1500';
  servidor = crearServidor({ puerto: 0, secreto: SECRET });
  puerto = await servidor.escuchar();

  for (let i = 0; i < 2; i++) {
    const username = `${sufijo}_${i}`;
    const u = await prisma.user.create({
      data: {
        username,
        profile: { create: { displayName: username } },
        wallet: { create: {} },
      },
    });
    usuarios.push({ id: u.id, username });
    // El saldo inicial se acredita por el camino real (asiento de ledger),
    // para que la cadena contable cierre desde el arranque.
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

describe('apuesta + desconexión: la plata no puede quedar congelada', () => {
  it('si el rival no vuelve, la partida cierra por abandono y la apuesta se liquida', async () => {
    const code = `${sufijo.slice(-5).toUpperCase()}A`.slice(0, 6);
    const room = await crearSala(code);

    const saldo0Antes = await saldoDe(usuarios[0]!.id);
    const saldo1Antes = await saldoDe(usuarios[1]!.id);

    const s0 = await conectar(usuarios[0]!.id, usuarios[0]!.username);
    const s1 = await conectar(usuarios[1]!.id, usuarios[1]!.username);

    let arranco = false;
    const avisosAusencia: Array<{ userId: string; venceEn: number | null }> = [];
    let abandono: { userId: string; ganador: number } | null = null;

    for (const s of [s0, s1]) {
      s.on('partida:estado', () => (arranco = true));
      s.emit('sala:entrar', { code });
    }
    s0.on('partida:ausencia', (d: { userId: string; venceEn: number | null }) =>
      avisosAusencia.push(d),
    );
    s0.on('partida:abandono', (d: { userId: string; ganador: number }) => (abandono = d));

    await new Promise((r) => setTimeout(r, 400));
    s0.emit('sala:listo', { listo: true });
    s1.emit('sala:listo', { listo: true });
    await new Promise((r) => setTimeout(r, 900));
    expect(arranco, 'la partida con apuesta tiene que haber arrancado').toBe(true);

    // La reserva ya debitó a los dos: la plata salió de ambas billeteras.
    const saldo0Reservado = await saldoDe(usuarios[0]!.id);
    const saldo1Reservado = await saldoDe(usuarios[1]!.id);
    expect(saldo0Reservado, 'al reservar, se debita al jugador 0').toBe(
      saldo0Antes - BigInt(APUESTA),
    );
    expect(saldo1Reservado, 'al reservar, se debita al jugador 1').toBe(
      saldo1Antes - BigInt(APUESTA),
    );
    const apuesta = await prisma.bet.findFirst({ where: { match: { roomId: room.id } } });
    expect(apuesta?.state, 'la apuesta arranca reservada').toBe('RESERVED');

    // El jugador 1 se cae en plena partida y NO vuelve.
    s1.disconnect();
    await new Promise((r) => setTimeout(r, 400));
    expect(
      avisosAusencia.filter((a) => a.venceEn !== null).length,
      'el que se queda tiene que ver el aviso con el tiempo de espera',
    ).toBeGreaterThan(0);

    // Se deja vencer la ventana de gracia.
    await new Promise((r) => setTimeout(r, 2500));

    expect(abandono, 'la partida tiene que cerrarse por abandono').not.toBeNull();
    expect(abandono!.userId, 'el ausente es el que se desconectó').toBe(usuarios[1]!.id);

    const apuestaFinal = await prisma.bet.findFirst({ where: { match: { roomId: room.id } } });
    expect(
      apuestaFinal?.state,
      'LO MÁS IMPORTANTE: la apuesta no puede quedar RESERVED para siempre',
    ).not.toBe('RESERVED');

    const saldo0Final = await saldoDe(usuarios[0]!.id);
    const saldo1Final = await saldoDe(usuarios[1]!.id);
    console.log('\n═══ APUESTA + DESCONEXIÓN ═══');
    console.log(`  apuesta: ${APUESTA} por cabeza`);
    console.log(`  jugador 0 (se queda): ${saldo0Antes} → ${saldo0Final}`);
    console.log(`  jugador 1 (se va):    ${saldo1Antes} → ${saldo1Final}`);
    console.log(`  estado final de la apuesta: ${apuestaFinal?.state}`);
    console.log(`  ganador declarado: equipo ${abandono!.ganador}`);

    // El que se quedó no puede terminar con menos plata que antes de apostar.
    expect(saldo0Final >= saldo0Antes, 'el que se queda no puede perder por abandono ajeno').toBe(
      true,
    );

    // El ledger de cada uno tiene que cerrar contra su saldo.
    for (const u of usuarios) {
      const a = await auditarUsuario(u.id);
      console.log(`  ledger ${u.username}: ${a.ok ? 'cuadra' : 'NO CUADRA'}`);
      expect(a.ok, `el ledger de ${u.username} tiene que cuadrar`).toBe(true);
    }
    console.log('');

    s0.disconnect();
  }, 60000);

  it('si el rival vuelve a tiempo, no se cierra nada y la partida sigue', async () => {
    const code = `${sufijo.slice(-5).toUpperCase()}B`.slice(0, 6);
    await crearSala(code);

    const s0 = await conectar(usuarios[0]!.id, usuarios[0]!.username);
    let s1 = await conectar(usuarios[1]!.id, usuarios[1]!.username);

    let abandono = false;
    const avisos: Array<{ venceEn: number | null }> = [];
    for (const s of [s0, s1]) s.emit('sala:entrar', { code });
    s0.on('partida:abandono', () => (abandono = true));
    s0.on('partida:ausencia', (d: { venceEn: number | null }) => avisos.push(d));

    await new Promise((r) => setTimeout(r, 400));
    s0.emit('sala:listo', { listo: true });
    s1.emit('sala:listo', { listo: true });
    await new Promise((r) => setTimeout(r, 900));

    // Se cae y vuelve ANTES de que venza la espera.
    s1.disconnect();
    await new Promise((r) => setTimeout(r, 300));
    s1 = await conectar(usuarios[1]!.id, usuarios[1]!.username);
    s1.emit('sala:entrar', { code });
    await new Promise((r) => setTimeout(r, 2500));

    console.log('═══ RECONEXIÓN A TIEMPO ═══');
    console.log(
      `  avisos de ausencia: ${avisos.length} (con cancelación: ${avisos.filter((a) => a.venceEn === null).length})`,
    );
    console.log(`  ¿se cerró por abandono?: ${abandono ? 'SÍ (mal)' : 'no ✓'}\n`);

    expect(abandono, 'volver a tiempo no puede cerrar la partida').toBe(false);
    expect(
      avisos.filter((a) => a.venceEn === null).length,
      'al volver, el rival tiene que recibir el aviso de que ya no se lo espera',
    ).toBeGreaterThan(0);

    s0.disconnect();
    s1.disconnect();
  }, 60000);
});
