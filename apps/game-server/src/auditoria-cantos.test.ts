/**
 * Auditoría de cantos: dos jugadores reales juegan forzando TODOS los cantos
 * (envido encadenado, flor, truco → retruco → vale cuatro) y se registra cada
 * `partida:estado` que recibe cada cliente.
 *
 * Sobre esa secuencia real se ejecuta la MISMA lógica que usa la mesa para
 * decidir qué estampa mostrar (`useEstampaCanto` en Mesa.tsx). Así se detecta
 * si la UI anuncia un canto distinto del que realmente ocurrió — por ejemplo
 * mostrar "¡ENVIDO!" cuando se cantó vale cuatro.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as clienteIO, type Socket } from 'socket.io-client';
import { prisma } from '@trucazo/db';
import { emitirTokenPartida } from '@trucazo/shared';
import type { Action } from '@trucazo/engine';
import { crearServidor } from './index.js';

const SECRET = 'secreto-de-test-suficientemente-largo-1234';
const sufijo = `ac${Date.now().toString(36)}`;

let puerto = 0;
let servidor: ReturnType<typeof crearServidor>;
let roomId = '';
let code = '';
const usuarios: Array<{ id: string; username: string }> = [];

const ETIQUETA_CANTO: Record<string, string> = {
  ENVIDO: 'Envido',
  REAL_ENVIDO: 'Real envido',
  FALTA_ENVIDO: 'Falta envido',
  FLOR: 'Flor',
  CONTRAFLOR: 'Contraflor',
  CONTRAFLOR_AL_RESTO: 'Contraflor al resto',
};
const NIVEL_TRUCO = ['Truco', 'Retruco', 'Vale cuatro'];

interface Vista {
  phase: string;
  seat: number;
  turnSeat: number | null;
  winner: number | null;
  legales: Action[];
  truco: { level: number; accepted: boolean };
  envido: { pending: string[]; resolved: boolean; accepted: boolean };
  flor: { called: boolean; contested: string | null; resolved: boolean; iHaveFlor: boolean };
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

/** Réplica del banner "El rival cantó X" del dock (Mesa.tsx). */
function bannerQueMostraria(v: Vista): string {
  if (v.phase === 'ENVIDO_PENDING') {
    const ult = v.envido.pending[v.envido.pending.length - 1] ?? 'ENVIDO';
    return ETIQUETA_CANTO[ult] ?? 'Envido';
  }
  if (v.phase === 'FLOR_PENDING') return ETIQUETA_CANTO[v.flor.contested ?? 'FLOR'] ?? 'Flor';
  if (v.phase === 'TRUCO_PENDING') return NIVEL_TRUCO[v.truco.level - 1] ?? 'Truco';
  return 'un canto';
}

/** Réplica exacta de la lógica de `useEstampaCanto` (Mesa.tsx). */
function estampaQueMostraria(prev: Vista, ahora: Vista): string | null {
  if (ahora.truco.level > prev.truco.level)
    return `¡${(NIVEL_TRUCO[ahora.truco.level - 1] ?? 'Truco').toUpperCase()}!`;
  if (ahora.envido.pending.length > prev.envido.pending.length) {
    const ult = ahora.envido.pending[ahora.envido.pending.length - 1] ?? 'ENVIDO';
    return `¡${(ETIQUETA_CANTO[ult] ?? 'Envido').toUpperCase()}!`;
  }
  if (ahora.flor.contested && ahora.flor.contested !== prev.flor.contested)
    return `¡${(ETIQUETA_CANTO[ahora.flor.contested] ?? 'Flor').toUpperCase()}!`;
  return null;
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
      name: 'Auditoría cantos',
      hostUserId: usuarios[0]!.id,
      mode: 'CASUAL_1V1',
      state: 'WAITING',
      pointsToWin: 30,
      florEnabled: true,
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

describe('auditoría de cantos: lo que se canta es lo que se muestra', () => {
  it('la estampa nunca anuncia un canto distinto del que ocurrió', async () => {
    const s0 = await conectar(usuarios[0]!.id, usuarios[0]!.username);
    const s1 = await conectar(usuarios[1]!.id, usuarios[1]!.username);

    const vistas = new Map<number, Vista>();
    const previas = new Map<number, Vista>();
    /** Cada estampa que la mesa habría mostrado, con el canto real que la causó. */
    const estampas: Array<{ socket: number; mostro: string; cantoReal: string }> = [];
    const rechazos: string[] = [];
    const banners: Array<{ trucoPendiente: string; banner: string }> = [];

    /** Último canto realmente ejecutado (fuente de verdad de la auditoría). */
    let ultimoCantoReal = '';

    for (const [i, s] of [s0, s1].entries()) {
      s.on('partida:estado', (d: { vista: Vista }) => {
        const prev = vistas.get(i);
        vistas.set(i, d.vista);
        if (prev) {
          previas.set(i, prev);
          const e = estampaQueMostraria(prev, d.vista);
          if (e) estampas.push({ socket: i, mostro: e, cantoReal: ultimoCantoReal });
        }
        // Banner del dock, capturado EN EL MOMENTO en que hay algo que responder.
        if (d.vista.legales.some((x) => x.type === 'RESPOND') && d.vista.truco.level > 0) {
          banners.push({
            trucoPendiente: NIVEL_TRUCO[d.vista.truco.level - 1] ?? 'Truco',
            banner: bannerQueMostraria(d.vista),
          });
        }
      });
      s.on('accion:rechazada', (d: { motivo: string }) => rechazos.push(d.motivo));
      s.emit('sala:entrar', { code });
    }

    await new Promise((r) => setTimeout(r, 400));
    s0.emit('sala:listo', { listo: true });
    s1.emit('sala:listo', { listo: true });
    await new Promise((r) => setTimeout(r, 800));

    expect(vistas.size, 'la partida tiene que haber arrancado').toBe(2);

    const socketDe = (seat: number) => (seat === 0 ? s0 : s1);
    const esperar = (ms = 260) => new Promise((r) => setTimeout(r, ms));

    /**
     * Ejecuta una acción legal del tipo pedido. No filtra por turno: al
     * recantar (truco → retruco → vale cuatro) el que canta es justamente el
     * que NO tiene el turno, porque está respondiendo.
     */
    async function intentar(tipo: string, etiqueta: string): Promise<boolean> {
      for (const [i, v] of vistas) {
        const a = v.legales.find((x) => x.type === tipo);
        if (!a) continue;
        ultimoCantoReal = etiqueta;
        socketDe(i).emit('partida:accion', { action: a, actionId: `${tipo}-${Date.now()}` });
        await esperar();
        return true;
      }
      return false;
    }

    /** Responde QUIERO a lo que esté pendiente, para poder escalar el truco. */
    async function quiero(): Promise<boolean> {
      for (const [i, v] of vistas) {
        const a = v.legales.find((x) => x.type === 'RESPOND' && x.response === 'QUIERO');
        if (!a) continue;
        ultimoCantoReal = 'Quiero';
        socketDe(i).emit('partida:accion', { action: a, actionId: `q-${Date.now()}` });
        await esperar();
        return true;
      }
      return false;
    }

    // Secuencia que ejercita la escalera completa del truco, que es donde el
    // usuario reportó ver el canto equivocado.
    await intentar('CALL_ENVIDO', 'Envido');
    await quiero();
    await intentar('CALL_TRUCO', 'Truco');
    await intentar('CALL_TRUCO', 'Retruco'); // recantar = subir de nivel
    await quiero();
    await intentar('CALL_TRUCO', 'Vale cuatro');
    await quiero();

    // Se juega hasta terminar la mano para cubrir el ciclo completo.
    for (let paso = 0; paso < 40; paso++) {
      let jugo = false;
      for (const [i, v] of vistas) {
        if (v.turnSeat !== v.seat) continue;
        const carta = v.legales.find((x) => x.type === 'PLAY_CARD');
        const resp = v.legales.find((x) => x.type === 'RESPOND');
        const a = carta ?? resp;
        if (!a) continue;
        socketDe(i).emit('partida:accion', { action: a, actionId: `p${paso}-${i}` });
        await esperar(160);
        jugo = true;
        break;
      }
      if (!jugo) break;
    }

    console.log('\n═══ ESTAMPAS QUE MOSTRÓ LA MESA ═══');
    for (const e of estampas) {
      const ok = e.cantoReal && e.mostro.toLowerCase().includes(e.cantoReal.toLowerCase());
      console.log(`  ${ok ? '✓' : '✗'} mostró ${e.mostro.padEnd(18)} canto real: ${e.cantoReal}`);
    }
    console.log(`  rechazos: ${rechazos.length ? rechazos.join(', ') : 'ninguno'}\n`);

    // El banner del dock: cuando hay un truco pendiente de responder, tiene
    // que nombrar ESE canto y no uno viejo ya resuelto.
    console.log('═══ BANNER "EL RIVAL CANTÓ" ═══');
    for (const b of banners) {
      const ok = b.banner === b.trucoPendiente;
      console.log(
        `  ${ok ? '✓' : '✗'} pendiente: ${b.trucoPendiente.padEnd(12)} → dice: "${b.banner}"`,
      );
    }
    const bannersMal = banners.filter((b) => b.banner !== b.trucoPendiente);
    console.log('');

    // Un canto de truco JAMÁS puede anunciarse como envido o flor.
    const desalineadas = estampas.filter(
      (e) =>
        ['Truco', 'Retruco', 'Vale cuatro'].includes(e.cantoReal) &&
        !e.mostro.toLowerCase().includes(e.cantoReal.toLowerCase()),
    );
    expect(
      desalineadas,
      `la mesa anunció un canto distinto del real: ${JSON.stringify(desalineadas)}`,
    ).toEqual([]);

    expect(
      bannersMal,
      `el banner nombró un canto viejo en vez del truco pendiente: ${JSON.stringify(bannersMal)}`,
    ).toEqual([]);

    s0.disconnect();
    s1.disconnect();
  }, 60000);
});
