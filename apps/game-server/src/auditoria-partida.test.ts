/**
 * Auditoría de partida completa: dos jugadores reales juegan hasta que hay
 * ganador, eligiendo acciones legales al azar (cantos, respuestas, mazo).
 *
 * En CADA estado recibido se verifican invariantes que, si se rompen, son
 * bugs que el jugador vería en la mesa:
 *  - que nunca lleguen cartas ajenas ni la tenencia de flor del rival,
 *  - que el canto que la UI anunciaría coincida con la fase real,
 *  - que los contadores de mano/bazas sean coherentes,
 *  - que el puntaje nunca baje ni pase del objetivo sin terminar.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as clienteIO, type Socket } from 'socket.io-client';
import { prisma } from '@trucazo/db';
import { emitirTokenPartida } from '@trucazo/shared';
import type { Action } from '@trucazo/engine';
import { crearServidor } from './index.js';

const SECRET = 'secreto-de-test-suficientemente-largo-1234';
const sufijo = `ap${Date.now().toString(36)}`;

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
  team: number;
  players: number;
  myHand: Array<{ suit: string; rank: number }>;
  handCounts: Record<number, number>;
  tricks: Array<Array<{ seat: number; card: { suit: string; rank: number } }>>;
  trickOutcomes: string[];
  currentTrick: number;
  scores: [number, number];
  pointsToWin: number;
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

/** Nombre del canto vigente, tal como lo calcula la mesa (por fase). */
function cantoVigente(v: Vista): string | null {
  if (v.phase === 'ENVIDO_PENDING')
    return ETIQUETA_CANTO[v.envido.pending[v.envido.pending.length - 1] ?? 'ENVIDO'] ?? 'Envido';
  if (v.phase === 'FLOR_PENDING') return ETIQUETA_CANTO[v.flor.contested ?? 'FLOR'] ?? 'Flor';
  if (v.phase === 'TRUCO_PENDING') return NIVEL_TRUCO[v.truco.level - 1] ?? 'Truco';
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
      name: 'Auditoría partida',
      hostUserId: usuarios[0]!.id,
      mode: 'CASUAL_1V1',
      state: 'WAITING',
      pointsToWin: 15,
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

describe('auditoría de partida completa', () => {
  it('juega hasta el final sin romper ningún invariante de la mesa', async () => {
    const s0 = await conectar(usuarios[0]!.id, usuarios[0]!.username);
    const s1 = await conectar(usuarios[1]!.id, usuarios[1]!.username);

    const vistas = new Map<number, Vista>();
    const fallas: string[] = [];
    const rechazos: string[] = [];
    const cantosVistos = new Set<string>();
    const ultimoPuntaje = new Map<number, [number, number]>();
    let estados = 0;
    const ofrecioFlor = new Set<number>();
    const tuvoFlor = new Set<number>();

    for (const [i, s] of [s0, s1].entries()) {
      s.on('partida:estado', (d: { vista: Vista }) => {
        const v = d.vista;
        vistas.set(i, v);
        estados++;

        // 1. Nunca deben llegar cartas ajenas.
        const mias = v.myHand.length;
        const esperadas = v.handCounts[v.seat] ?? 0;
        if (mias !== esperadas)
          fallas.push(`mano propia ${mias} != handCounts ${esperadas} (asiento ${v.seat})`);

        // 2. La flor del rival no puede deducirse: `iHaveFlor` es sólo la propia
        //    y `called` sólo puede ser true si de verdad se cantó.
        if (v.flor.called && !v.flor.contested)
          fallas.push('flor.called sin contested: se anunciaría un canto inexistente');

        // 3. El canto que anunciaría la UI tiene que existir de verdad.
        // ¿El motor llega a OFRECER la flor alguna vez?
        for (const a of v.legales) if (a.type === 'CALL_FLOR') ofrecioFlor.add(v.seat);
        if (v.flor.iHaveFlor) tuvoFlor.add(v.seat);

        const canto = cantoVigente(v);
        if (canto) cantosVistos.add(canto);
        const hayRespuesta = v.legales.some((a) => a.type === 'RESPOND');
        if (hayRespuesta && !canto && v.phase !== 'PLAYING')
          fallas.push(`hay que responder pero la UI no sabe a qué canto (fase ${v.phase})`);
        if (canto === 'Truco' && v.truco.level !== 1)
          fallas.push(`anuncia Truco con nivel ${v.truco.level}`);
        if (canto === 'Vale cuatro' && v.truco.level !== 3)
          fallas.push(`anuncia Vale cuatro con nivel ${v.truco.level}`);

        // 3b. Ninguna carta puede estar a la vez en mi mano y en la mesa.
        const enMesa = v.tricks.flat().map((j) => `${j.card.suit}-${j.card.rank}`);
        for (const c of v.myHand) {
          if (enMesa.includes(`${c.suit}-${c.rank}`))
            fallas.push(`la carta ${c.suit}-${c.rank} está en mi mano Y en la mesa`);
        }

        // 3c. Una carta jugada no puede aparecer dos veces en la mesa.
        if (new Set(enMesa).size !== enMesa.length)
          fallas.push(`carta duplicada en la mesa: ${enMesa.join(',')}`);

        // 3d. Nadie puede tirar dos cartas en la misma baza.
        for (const [idx, baza] of v.tricks.entries()) {
          const asientos = baza.map((j) => j.seat);
          if (new Set(asientos).size !== asientos.length)
            fallas.push(`un asiento jugó dos veces en la baza ${idx + 1}`);
          if (baza.length > v.players)
            fallas.push(
              `la baza ${idx + 1} tiene ${baza.length} cartas para ${v.players} jugadores`,
            );
        }

        // 3e. Sólo se puede haber resuelto una baza que esté completa.
        for (const [idx, res] of v.trickOutcomes.entries()) {
          if (res && (v.tricks[idx]?.length ?? 0) < v.players)
            fallas.push(`la baza ${idx + 1} se resolvió con ${v.tricks[idx]?.length} cartas`);
        }

        // 4. Coherencia de bazas.
        if (v.currentTrick > 2) fallas.push(`currentTrick fuera de rango: ${v.currentTrick}`);
        if (v.trickOutcomes.length > 3)
          fallas.push(`trickOutcomes de más: ${v.trickOutcomes.length}`);

        // 5. El puntaje nunca baja.
        const prev = ultimoPuntaje.get(i);
        if (prev && (v.scores[0] < prev[0] || v.scores[1] < prev[1]))
          fallas.push(`el puntaje bajó: ${prev} → ${v.scores}`);
        ultimoPuntaje.set(i, [v.scores[0], v.scores[1]]);

        // 6. Si alguien llegó al objetivo, la partida tiene que estar terminada.
        const llego = v.scores[0] >= v.pointsToWin || v.scores[1] >= v.pointsToWin;
        if (llego && v.winner === null && v.phase !== 'MATCH_FINISHED')
          fallas.push(`alguien llegó a ${v.pointsToWin} y la partida sigue (fase ${v.phase})`);
      });
      s.on('accion:rechazada', (d: { motivo: string }) => rechazos.push(d.motivo));
      s.emit('sala:entrar', { code });
    }

    await new Promise((r) => setTimeout(r, 400));
    s0.emit('sala:listo', { listo: true });
    s1.emit('sala:listo', { listo: true });
    await new Promise((r) => setTimeout(r, 800));
    expect(vistas.size, 'la partida tiene que haber arrancado').toBe(2);

    const socketDe = (i: number) => (i === 0 ? s0 : s1);
    // Determinista: mismo recorrido en cada corrida (sin Math.random).
    let semilla = Number(process.env.SEMILLA_AUDITORIA ?? 12345);
    const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;

    let terminada = false;
    for (let paso = 0; paso < 600 && !terminada; paso++) {
      let actuo = false;
      for (const [i, v] of vistas) {
        if (v.winner !== null || v.phase === 'MATCH_FINISHED') {
          terminada = true;
          break;
        }
        if (v.legales.length === 0) continue;
        // Se prefiere cantar de vez en cuando para cubrir todas las ramas,
        // pero sin irse al mazo tan seguido que la partida no avance.
        const cantos = v.legales.filter((a) => a.type !== 'PLAY_CARD' && a.type !== 'GO_TO_MAZO');
        const cartas = v.legales.filter((a) => a.type === 'PLAY_CARD');
        const pool =
          cantos.length > 0 && azar() < 0.45 ? cantos : cartas.length > 0 ? cartas : v.legales;
        const a = pool[Math.floor(azar() * pool.length)]!;
        socketDe(i).emit('partida:accion', { action: a, actionId: `p${paso}-${i}-${azar()}` });
        await new Promise((r) => setTimeout(r, 90));
        actuo = true;
        break;
      }
      if (!actuo) await new Promise((r) => setTimeout(r, 120));
    }

    const v0 = vistas.get(0)!;
    console.log('\n═══ AUDITORÍA DE PARTIDA COMPLETA ═══');
    console.log(`  estados auditados: ${estados}`);
    console.log(`  puntaje final: ${v0.scores[0]} — ${v0.scores[1]} (a ${v0.pointsToWin})`);
    console.log(`  ganador: ${v0.winner ?? 'sin terminar'}`);
    console.log(`  cantos ejercitados: ${[...cantosVistos].join(', ') || 'ninguno'}`);
    console.log(
      `  tuvo flor: ${[...tuvoFlor].join(',') || 'nadie'} · se ofreció cantarla: ${[...ofrecioFlor].join(',') || 'NUNCA'}`,
    );
    console.log(`  acciones rechazadas: ${rechazos.length}`);
    console.log(`  fallas de invariante: ${fallas.length}`);
    for (const f of [...new Set(fallas)].slice(0, 12)) console.log(`    ✗ ${f}`);
    console.log('');

    expect([...new Set(fallas)], 'invariantes rotos durante la partida').toEqual([]);
    // El servidor no debe rechazar acciones que él mismo declaró legales.
    expect(rechazos, 'el servidor rechazó acciones que había marcado legales').toEqual([]);
    expect(v0.winner, 'la partida tiene que haber terminado con ganador').not.toBeNull();

    s0.disconnect();
    s1.disconnect();
  }, 120000);
});
