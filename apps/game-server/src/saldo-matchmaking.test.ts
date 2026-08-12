/**
 * Reportado por el tester: "te deja buscar una partida casual por las monedas
 * que uno tiene en la cuenta" — es decir, se podía pedir jugar por más fichas
 * de las que había.
 *
 * Eso terminaba en emparejar, reservar la apuesta y fallar al repartir, con la
 * sala colgada. El piso mínimo ya se validaba; el saldo no.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as clienteIO, type Socket } from 'socket.io-client';
import { prisma } from '@trucazo/db';
import { emitirTokenPartida } from '@trucazo/shared';
import { registrarMovimiento } from '@trucazo/economia';
import { crearServidor } from './index.js';

const SECRET = 'secreto-de-test-suficientemente-largo-1234';
const sufijo = `sm${Date.now().toString(36)}`;
const SALDO = 3000n;

let puerto = 0;
let servidor: ReturnType<typeof crearServidor>;
let usuario: { id: string; username: string };

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
  const username = `${sufijo}_0`;
  const u = await prisma.user.create({
    data: { username, profile: { create: { displayName: username } }, wallet: { create: {} } },
  });
  usuario = { id: u.id, username };
  await registrarMovimiento({
    userId: u.id,
    type: 'ADMIN_ADJUSTMENT',
    amount: SALDO,
    idempotencyKey: `seed-${u.id}`,
    reason: 'saldo inicial de auditoría',
  });
}, 30000);

afterAll(async () => {
  await servidor?.cerrar();
  await prisma.ledgerEntry.deleteMany({ where: { userId: usuario.id } });
  await prisma.wallet.deleteMany({ where: { userId: usuario.id } });
  await prisma.user.deleteMany({ where: { id: usuario.id } });
  await prisma.$disconnect();
});

/** Pide entrar a la cola y devuelve qué contestó el servidor. */
async function pedirPartida(s: Socket, apuesta: number) {
  const errores: string[] = [];
  let entroEnCola = false;
  const onError = (d: { mensaje: string }) => errores.push(d.mensaje);
  const onEstado = (d: { buscando: boolean }) => {
    if (d.buscando) entroEnCola = true;
  };
  s.on('error:app', onError);
  s.on('mm:estado', onEstado);
  s.emit('mm:buscar', { mode: 'CASUAL_1V1', apuesta });
  await new Promise((r) => setTimeout(r, 700));
  s.off('error:app', onError);
  s.off('mm:estado', onEstado);
  s.emit('mm:cancelar');
  return { errores, entroEnCola };
}

describe('no se puede buscar partida por más fichas de las que hay', () => {
  it('rechaza el monto que supera el saldo y acepta el que entra', async () => {
    const s = await conectar(usuario.id, usuario.username);

    console.log('\n═══ SALDO vs. MATCHMAKING ═══');
    console.log(`  saldo del jugador: ${SALDO} fichas\n`);

    // 1) Más de lo que tiene: tiene que rebotar.
    const deMas = await pedirPartida(s, 10000);
    console.log(`  pide 10.000 → ${deMas.entroEnCola ? 'ENTRÓ EN COLA ✗' : 'rechazado ✓'}`);
    for (const e of deMas.errores) console.log(`    ✗ "${e}"`);
    expect(deMas.entroEnCola, 'no puede entrar en cola por más fichas de las que tiene').toBe(
      false,
    );
    expect(deMas.errores.join(' '), 'tiene que explicar que no le alcanza').toMatch(
      /no te alcanza/i,
    );

    // 2) Justo lo que tiene: tiene que entrar (el borde exacto).
    const justo = await pedirPartida(s, Number(SALDO));
    console.log(`  pide 3.000 (todo) → ${justo.entroEnCola ? 'en cola ✓' : 'RECHAZADO ✗'}`);
    expect(justo.entroEnCola, 'apostar todo lo que tiene sí está permitido').toBe(true);
    expect(justo.errores, 'no puede haber error con el monto justo').toEqual([]);

    // 3) Por debajo del mínimo: sigue rebotando por el piso, no por el saldo.
    const chico = await pedirPartida(s, 100);
    console.log(`  pide 100 (bajo el mínimo) → ${chico.entroEnCola ? 'EN COLA ✗' : 'rechazado ✓'}`);
    expect(chico.entroEnCola, 'el piso mínimo sigue valiendo').toBe(false);
    expect(chico.errores.join(' ')).toMatch(/mínimo/i);
    console.log('');

    s.disconnect();
  }, 60000);
});
