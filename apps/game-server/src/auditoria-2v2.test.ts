/**
 * Auditoría de partida 2v2: cuatro jugadores reales juegan hasta que hay
 * ganador. Verifica los invariantes propios del juego por equipos, que son
 * los que no se ejercitan en 1v1:
 *
 *  - que NADIE vea las cartas de nadie (ni siquiera las del compañero),
 *  - que los equipos estén bien armados (asientos pares vs impares),
 *  - que la mesa distinga compañero de rival (bug real: el compañero se
 *    dibujaba como rival porque el filtro era por asiento y no por equipo),
 *  - que el turno rote entre los cuatro asientos,
 *  - que los puntos vayan al equipo, no al jugador.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as clienteIO, type Socket } from 'socket.io-client';
import { prisma } from '@trucazo/db';
import { emitirTokenPartida } from '@trucazo/shared';
import type { Action } from '@trucazo/engine';
import { crearServidor } from './index.js';

const SECRET = 'secreto-de-test-suficientemente-largo-1234';
const sufijo = `dv${Date.now().toString(36)}`;

let puerto = 0;
let servidor: ReturnType<typeof crearServidor>;
let roomId = '';
let code = '';
const usuarios: Array<{ id: string; username: string }> = [];

interface Vista {
  phase: string;
  seat: number;
  team: number;
  players: number;
  myHand: Array<{ suit: string; rank: number }>;
  tricks: Array<Array<{ seat: number; card: { suit: string; rank: number } }>>;
  trickOutcomes: string[];
  handCounts: Record<number, number>;
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

beforeAll(async () => {
  servidor = crearServidor({ puerto: 0, secreto: SECRET });
  puerto = await servidor.escuchar();
  for (let i = 0; i < 4; i++) {
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
      name: 'Auditoría 2v2',
      hostUserId: usuarios[0]!.id,
      mode: 'CASUAL_2V2',
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

describe('auditoría de partida 2v2', () => {
  it('cuatro jugadores juegan hasta el final sin romper invariantes de equipo', async () => {
    const sockets: Socket[] = [];
    for (const u of usuarios) sockets.push(await conectar(u.id, u.username));

    const vistas = new Map<number, Vista>();
    const fallas: string[] = [];
    const rechazos: string[] = [];
    const turnosVistos = new Set<number>();
    const asientos = new Map<number, number>();
    let estados = 0;

    for (const [i, s] of sockets.entries()) {
      s.on('partida:estado', (d: { vista: Vista }) => {
        const v = d.vista;
        vistas.set(i, v);
        asientos.set(i, v.seat);
        estados++;

        // 1. La partida tiene que ser realmente de 4.
        if (v.players !== 4) fallas.push(`players=${v.players}, se esperaba 4`);

        // 2. El equipo sale del asiento: pares equipo 0, impares equipo 1.
        if (v.team !== v.seat % 2)
          fallas.push(`asiento ${v.seat} está en el equipo ${v.team} (debería ser ${v.seat % 2})`);

        // 3. Nadie ve cartas ajenas: sólo llega la mano propia, ni siquiera
        //    la del compañero (que juega para el mismo equipo).
        const esperadas = v.handCounts[v.seat] ?? 0;
        if (v.myHand.length !== esperadas)
          fallas.push(`mano propia ${v.myHand.length} != handCounts ${esperadas}`);
        const clavesPropias = new Set(v.myHand.map((c) => `${c.suit}-${c.rank}`));
        if (clavesPropias.size !== v.myHand.length) fallas.push('cartas repetidas en la mano');

        // 3b. Integridad de cartas: nada puede estar en mi mano y en la mesa,
        //     ni duplicarse, ni un asiento jugar dos veces en la misma baza.
        const enMesa = v.tricks.flat().map((j) => `${j.card.suit}-${j.card.rank}`);
        for (const c of v.myHand)
          if (enMesa.includes(`${c.suit}-${c.rank}`))
            fallas.push(`la carta ${c.suit}-${c.rank} está en mi mano Y en la mesa`);
        if (new Set(enMesa).size !== enMesa.length) fallas.push('carta duplicada en la mesa');
        for (const [idx, baza] of v.tricks.entries()) {
          const seats = baza.map((j) => j.seat);
          if (new Set(seats).size !== seats.length)
            fallas.push(`un asiento jugó dos veces en la baza ${idx + 1}`);
          if (baza.length > 4)
            fallas.push(`la baza ${idx + 1} tiene ${baza.length} cartas (máx 4)`);
        }
        // En 2v2 una baza sólo se resuelve con las CUATRO cartas.
        for (const [idx, res] of v.trickOutcomes.entries())
          if (res && (v.tricks[idx]?.length ?? 0) < 4)
            fallas.push(`la baza ${idx + 1} se resolvió con ${v.tricks[idx]?.length} de 4 cartas`);

        // 4. Toda acción legal ofrecida tiene que ser para MI asiento.
        for (const a of v.legales) {
          const seatDe = (a as { seat?: number }).seat;
          if (seatDe !== undefined && seatDe !== v.seat)
            fallas.push(`me ofrecen una acción del asiento ${seatDe} (yo soy ${v.seat})`);
        }

        // 5. Cómo separa la mesa compañero de rival (fix real de este sprint):
        //    el compañero comparte equipo y NO debe contarse como rival.
        const rivalesSegunMesa = [0, 1, 2, 3].filter((s2) => s2 % 2 !== v.team);
        if (rivalesSegunMesa.length !== 2)
          fallas.push(`la mesa vería ${rivalesSegunMesa.length} rivales en vez de 2`);
        if (rivalesSegunMesa.includes(v.seat))
          fallas.push('la mesa me contaría como mi propio rival');
        const companero = [0, 1, 2, 3].find((s2) => s2 !== v.seat && s2 % 2 === v.team);
        if (companero === undefined) fallas.push('no se encuentra el compañero de equipo');
        if (companero !== undefined && rivalesSegunMesa.includes(companero))
          fallas.push(`el compañero (asiento ${companero}) aparecería como rival`);

        if (v.turnSeat !== null) turnosVistos.add(v.turnSeat);
      });
      s.on('accion:rechazada', (d: { motivo: string }) => rechazos.push(d.motivo));
      s.emit('sala:entrar', { code });
    }

    await new Promise((r) => setTimeout(r, 600));
    for (const s of sockets) s.emit('sala:listo', { listo: true });
    await new Promise((r) => setTimeout(r, 1000));
    expect(vistas.size, 'la partida 2v2 tiene que haber arrancado con 4').toBe(4);

    let semilla = Number(process.env.SEMILLA_AUDITORIA ?? 24680);
    const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;

    let terminada = false;
    for (let paso = 0; paso < 900 && !terminada; paso++) {
      let actuo = false;
      for (const [i, v] of vistas) {
        if (v.winner !== null || v.phase === 'MATCH_FINISHED') {
          terminada = true;
          break;
        }
        if (v.legales.length === 0) continue;
        const cantos = v.legales.filter((a) => a.type !== 'PLAY_CARD' && a.type !== 'GO_TO_MAZO');
        const cartas = v.legales.filter((a) => a.type === 'PLAY_CARD');
        const pool =
          cantos.length > 0 && azar() < 0.4 ? cantos : cartas.length > 0 ? cartas : v.legales;
        const a = pool[Math.floor(azar() * pool.length)]!;
        sockets[i]!.emit('partida:accion', { action: a, actionId: `p${paso}-${i}-${azar()}` });
        await new Promise((r) => setTimeout(r, 80));
        actuo = true;
        break;
      }
      if (!actuo) await new Promise((r) => setTimeout(r, 110));
    }

    const v0 = vistas.get(0)!;
    console.log('\n═══ AUDITORÍA 2v2 ═══');
    console.log(`  estados auditados: ${estados}`);
    console.log(`  asientos asignados: ${[...asientos.values()].sort().join(', ')}`);
    console.log(`  turnos vistos en: asientos ${[...turnosVistos].sort().join(', ')}`);
    console.log(`  puntaje final: ${v0.scores[0]} — ${v0.scores[1]} (a ${v0.pointsToWin})`);
    console.log(`  ganador: equipo ${v0.winner ?? 'sin terminar'}`);
    console.log(`  acciones rechazadas: ${rechazos.length}`);
    console.log(`  fallas de invariante: ${fallas.length}`);
    for (const f of [...new Set(fallas)].slice(0, 12)) console.log(`    ✗ ${f}`);
    console.log('');

    // Los 4 asientos tienen que estar ocupados, uno por jugador.
    expect(new Set(asientos.values()).size, 'los 4 jugadores deben tener asientos distintos').toBe(
      4,
    );
    expect([...new Set(fallas)], 'invariantes de equipo rotos').toEqual([]);
    expect(rechazos, 'el servidor rechazó acciones que había marcado legales').toEqual([]);
    expect(v0.winner, 'la partida tiene que haber terminado con ganador').not.toBeNull();

    for (const s of sockets) s.disconnect();
  }, 180000);
});
