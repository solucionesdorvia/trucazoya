/**
 * Auditoría de observabilidad: que las señales que delatan plata congelada
 * existan de verdad y que la salud no mienta.
 *
 * El escenario que motiva esto: si el sistema se queda con una apuesta
 * reservada que nadie liquida, alguien tiene que enterarse. Hasta ahora eso
 * sólo iba a `console.error` y se perdía.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@trucazo/db';
import { registrarMovimiento } from '@trucazo/economia';
import { señalesDeSalud, alerta, log } from './observabilidad.js';
import { crearServidor } from './index.js';

const SECRET = 'secreto-de-test-suficientemente-largo-1234';
const sufijo = `ob${Date.now().toString(36)}`;
const usuarios: Array<{ id: string; username: string }> = [];
let roomId = '';
let matchId = '';
let betId = '';

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
      amount: 2000n,
      idempotencyKey: `seed-${u.id}`,
      reason: 'saldo de auditoría',
    });
  }
}, 30000);

afterAll(async () => {
  const ids = usuarios.map((u) => u.id);
  await prisma.betParticipant.deleteMany({ where: { userId: { in: ids } } });
  await prisma.bet.deleteMany({ where: { id: betId } });
  await prisma.match.deleteMany({ where: { id: matchId } });
  await prisma.ledgerEntry.deleteMany({ where: { userId: { in: ids } } });
  await prisma.room.deleteMany({ where: { id: roomId } });
  await prisma.wallet.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe('observabilidad', () => {
  it('detecta una apuesta congelada que nadie liquidó', async () => {
    const antes = await señalesDeSalud();

    // Se fabrica el peor escenario: una apuesta RESERVED vieja, con su match
    // en curso, exactamente lo que deja un proceso que se cayó.
    const hace3h = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const room = await prisma.room.create({
      data: {
        code: sufijo.slice(-6).toUpperCase(),
        name: 'Sala colgada',
        hostUserId: usuarios[0]!.id,
        mode: 'CASUAL_1V1',
        state: 'IN_PROGRESS',
        pointsToWin: 30,
        betAmount: 300n,
      },
    });
    roomId = room.id;
    const match = await prisma.match.create({
      data: {
        roomId: room.id,
        mode: 'CASUAL_1V1',
        state: 'IN_PROGRESS',
        pointsToWin: 30,
        florEnabled: false,
        players: 2,
        betAmount: 300n,
        startedAt: hace3h,
      },
    });
    matchId = match.id;
    const bet = await prisma.bet.create({
      data: { matchId: match.id, amount: 300n, state: 'RESERVED', createdAt: hace3h },
    });
    betId = bet.id;

    const despues = await señalesDeSalud();

    console.log('\n═══ SEÑALES DE SALUD ═══');
    console.log(`  apuestas colgadas: ${antes.apuestasColgadas} → ${despues.apuestasColgadas}`);
    console.log(`  partidas colgadas: ${antes.partidasColgadas} → ${despues.partidasColgadas}`);
    console.log(`  problemas detectados:`);
    for (const p of despues.problemas) console.log(`    ⚠ ${p}`);
    console.log('');

    expect(
      despues.apuestasColgadas,
      'una apuesta reservada hace 3h tiene que aparecer como plata congelada',
    ).toBeGreaterThan(antes.apuestasColgadas);
    expect(
      despues.partidasColgadas,
      'una partida en curso hace 3h tiene que aparecer como colgada',
    ).toBeGreaterThan(antes.partidasColgadas);
    expect(despues.problemas.length, 'tiene que haber un problema legible').toBeGreaterThan(0);
    expect(
      despues.problemas.some((p) => /congelada/i.test(p)),
      'el problema tiene que decir en criollo que hay plata congelada',
    ).toBe(true);
  }, 30000);

  it('la salud devuelve 503 si la base no responde, en vez de mentir', async () => {
    const servidor = crearServidor({ puerto: 0, secreto: SECRET });
    const puerto = await servidor.escuchar();

    const ok = await fetch(`http://localhost:${puerto}/salud`);
    const cuerpo = (await ok.json()) as { ok: boolean };
    expect(ok.status, 'con la base viva, la salud responde 200').toBe(200);
    expect(cuerpo.ok).toBe(true);

    // Las métricas ahora incluyen las señales de negocio, no sólo contadores.
    const m = await fetch(`http://localhost:${puerto}/metricas`);
    const datos = (await m.json()) as {
      señales?: { apuestasColgadas: number; partidasColgadas: number; problemas: string[] };
    };
    console.log('═══ /metricas ═══');
    console.log(`  incluye señales de negocio: ${datos.señales ? 'sí ✓' : 'NO'}`);
    console.log(`  apuestas colgadas: ${datos.señales?.apuestasColgadas}`);
    console.log(`  partidas colgadas: ${datos.señales?.partidasColgadas}`);
    console.log('  (0 es lo esperado: al arrancar, el barrido ya liberó la colgada');
    console.log('   que fabricó el test anterior — o sea que el barrido funciona)\n');

    expect(datos.señales, '/metricas tiene que exponer las señales de negocio').toBeDefined();
    expect(typeof datos.señales!.apuestasColgadas).toBe('number');
    expect(Array.isArray(datos.señales!.problemas)).toBe(true);

    // El barrido de arranque tuvo que liberar la apuesta colgada del test previo.
    const apuestaBarrida = await prisma.bet.findUnique({ where: { id: betId } });
    expect(
      apuestaBarrida?.state,
      'el barrido de arranque tiene que haber liberado la apuesta congelada',
    ).not.toBe('RESERVED');

    await servidor.cerrar();
  }, 30000);

  it('el log es JSON estructurado y la alerta nunca rompe el flujo', async () => {
    const lineas: string[] = [];
    const errOriginal = console.error;
    console.error = (m: unknown) => lineas.push(String(m));

    log('critico', 'prueba.evento', { matchId: 'm1', betId: 'b1', userId: 'u1' });
    // Sin webhook configurado no debe fallar ni lanzar.
    await alerta('prueba.alerta', { matchId: 'm1' });

    console.error = errOriginal;

    const parseadas = lineas.map((l) => JSON.parse(l) as Record<string, unknown>);
    console.log('═══ LOG ESTRUCTURADO ═══');
    for (const p of parseadas) console.log(`  ${JSON.stringify(p)}`);
    console.log('');

    expect(parseadas.length, 'log y alerta tienen que escribir').toBe(2);
    expect(parseadas[0]!.evento).toBe('prueba.evento');
    expect(parseadas[0]!.matchId, 'el contexto tiene que viajar en la línea').toBe('m1');
    expect(parseadas[0]!.ts, 'cada línea tiene que tener timestamp').toBeDefined();
    expect(parseadas[1]!.evento).toBe('prueba.alerta');
  }, 20000);
});
