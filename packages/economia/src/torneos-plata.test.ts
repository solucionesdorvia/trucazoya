/**
 * La plata de los torneos, que es lo que el test de torneos no mira: verifica
 * que se corone un campeón, pero no que el sistema conserve las fichas.
 *
 * Dos escenarios:
 *
 *  1. Torneo que termina: lo que pagaron todos tiene que llegar entero al
 *     campeón. Ni una ficha de más ni de menos.
 *
 *  2. Torneo que se CANCELA: el schema tiene el estado CANCELLED y la web
 *     muestra "Cancelado", pero la entrada de un torneo no tenía ninguna
 *     salida salvo ganarlo. Cancelar dejaba la plata de todos en la nada.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@trucazo/db';
import { auditarUsuario, saldoDe } from './ledger.js';
import { avanzarPartido, cancelarTorneo, generarLlaves, inscribir } from './torneos.js';

const sufijo = `tp${Date.now().toString(36)}`;
const ENTRADA = 1000n;
const SALDO = 5000n;
const torneos: string[] = [];
const ids: string[] = [];

async function crearJugador(nombre: string): Promise<string> {
  const user = await prisma.user.create({
    data: {
      username: `${nombre}_${sufijo}`,
      profile: { create: { displayName: nombre } },
      wallet: { create: { balance: SALDO } },
    },
  });
  ids.push(user.id);
  await prisma.ledgerEntry.create({
    data: {
      userId: user.id,
      type: 'ADMIN_ADJUSTMENT',
      amount: SALDO,
      balanceBefore: 0n,
      balanceAfter: SALDO,
      idempotencyKey: `seed:${user.id}`,
    },
  });
  return user.id;
}

async function crearTorneo(nombre: string, maxPlayers: number): Promise<string> {
  const t = await prisma.tournament.create({
    data: {
      name: `${nombre} ${sufijo}`,
      mode: 'CASUAL_1V1',
      state: 'REGISTRATION',
      entryFee: ENTRADA,
      maxPlayers,
    },
  });
  torneos.push(t.id);
  return t.id;
}

/** Suma todo lo que hay en las billeteras de los jugadores del test. */
async function totalEnElSistema(jugadores: string[]): Promise<bigint> {
  let t = 0n;
  for (const id of jugadores) t += (await saldoDe(id)).balance;
  return t;
}

afterAll(async () => {
  await prisma.tournamentMatch.deleteMany({ where: { tournamentId: { in: torneos } } });
  await prisma.tournamentParticipant.deleteMany({ where: { tournamentId: { in: torneos } } });
  await prisma.tournament.deleteMany({ where: { id: { in: torneos } } });
  await prisma.ledgerEntry.deleteMany({ where: { userId: { in: ids } } });
  await prisma.wallet.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe('la plata de los torneos', () => {
  it('torneo terminado: lo que pagaron todos llega entero al campeón', async () => {
    const torneoId = await crearTorneo('Copa entera', 4);
    const jugadores: string[] = [];
    for (let i = 0; i < 4; i++) jugadores.push(await crearJugador(`ent${i}`));

    const antes = await totalEnElSistema(jugadores);

    for (const id of jugadores) {
      const r = await inscribir(torneoId, id);
      expect(r.ok, 'los cuatro se tienen que poder inscribir').toBe(true);
    }

    // Cobró la entrada a los cuatro y la plata está retenida en el torneo.
    const enJuego = await totalEnElSistema(jugadores);
    expect(antes - enJuego, 'el pozo retenido es la entrada por cabeza').toBe(ENTRADA * 4n);

    // Las llaves exigen check-in previo.
    await prisma.tournamentParticipant.updateMany({
      where: { tournamentId: torneoId },
      data: { checkedIn: true },
    });

    let n = 0;
    const gen = await generarLlaves(torneoId, () => n++ % 2);
    expect(gen.ok, 'las llaves se tienen que poder generar').toBe(true);

    // OJO: TournamentMatch no guarda quiénes juegan (no hay playerA/playerB en
    // el schema), así que el cruce que arma generarLlaves se pierde y el
    // ganador se le pasa a mano. Se elige a los dos primeros inscriptos para
    // la ronda 1 y al primero como campeón.
    const inscriptos = await prisma.tournamentParticipant.findMany({
      where: { tournamentId: torneoId },
      orderBy: { id: 'asc' },
    });
    for (let ronda = 1; ronda <= 4; ronda++) {
      const partidos = await prisma.tournamentMatch.findMany({
        where: { tournamentId: torneoId, round: ronda },
        orderBy: { slot: 'asc' },
      });
      if (partidos.length === 0) break;
      for (const [i, p] of partidos.entries()) {
        if (p.winnerUserId) continue;
        await avanzarPartido(p.id, inscriptos[ronda === 1 ? i : 0]!.userId);
      }
    }

    const torneo = await prisma.tournament.findUnique({ where: { id: torneoId } });
    const campeon = await prisma.tournamentParticipant.findFirst({
      where: { tournamentId: torneoId, placement: 1 },
    });
    const despues = await totalEnElSistema(jugadores);
    const pozo = ENTRADA * 4n;

    console.log('\n═══ TORNEO QUE TERMINA ═══');
    console.log(`  4 jugadores · entrada ${ENTRADA} · pozo ${pozo}`);
    console.log(`  estado final: ${torneo?.state}`);
    console.log(`  campeón: ${campeon ? 'coronado ✓' : 'NINGUNO ✗'}`);
    console.log(`  total en billeteras: ${antes} → ${despues} (tiene que volver a ${antes})`);
    if (campeon) {
      const sc = (await saldoDe(campeon.userId)).balance;
      console.log(`  saldo del campeón: ${sc} (empezó con ${SALDO})`);
    }
    console.log('');

    expect(torneo?.state, 'el torneo tiene que quedar terminado').toBe('FINISHED');
    expect(campeon, 'tiene que haber campeón').toBeTruthy();

    // EL INVARIANTE: el torneo no crea ni destruye fichas, sólo las mueve.
    expect(despues, 'lo que salió de los jugadores tiene que volver entero al campeón').toBe(antes);

    // Y el campeón se llevó el pozo completo.
    expect(
      (await saldoDe(campeon!.userId)).balance,
      'el campeón cobra el pozo menos su propia entrada',
    ).toBe(SALDO - ENTRADA + pozo);
    expect(campeon!.userId, 'el campeón es el que ganó la final').toBe(inscriptos[0]!.userId);

    for (const id of jugadores) {
      const a = await auditarUsuario(id);
      expect(a.ok, 'el ledger de cada jugador tiene que cuadrar').toBe(true);
    }
  }, 60000);

  it('torneo cancelado: a todos les vuelve su entrada', async () => {
    const torneoId = await crearTorneo('Copa cancelada', 8);
    const jugadores: string[] = [];
    for (let i = 0; i < 3; i++) jugadores.push(await crearJugador(`can${i}`));

    const antes = await totalEnElSistema(jugadores);
    for (const id of jugadores) await inscribir(torneoId, id);
    const conEntradaPagada = await totalEnElSistema(jugadores);

    const r = await cancelarTorneo(torneoId, 'no se llenó');
    const despues = await totalEnElSistema(jugadores);
    const torneo = await prisma.tournament.findUnique({ where: { id: torneoId } });

    console.log('\n═══ TORNEO QUE SE CANCELA ═══');
    console.log(`  3 inscriptos · entrada ${ENTRADA}`);
    console.log(`  total: ${antes} → ${conEntradaPagada} (pagaron) → ${despues} (cancelado)`);
    console.log(`  estado: ${torneo?.state}`);
    console.log(`  devueltos: ${r.reembolsados ?? 0}\n`);

    expect(r.ok, 'se tiene que poder cancelar').toBe(true);
    expect(torneo?.state, 'el torneo queda cancelado').toBe('CANCELLED');
    expect(r.reembolsados, 'se le devuelve a los tres').toBe(3);

    // EL INVARIANTE: cancelar devuelve TODO. Nadie pierde su entrada.
    expect(despues, 'cancelar tiene que devolver hasta la última ficha').toBe(antes);

    for (const id of jugadores) {
      const a = await auditarUsuario(id);
      expect(a.ok, 'el ledger de cada jugador tiene que cuadrar').toBe(true);
    }
  }, 60000);

  it('cancelar dos veces no devuelve la plata dos veces', async () => {
    const torneoId = await crearTorneo('Copa doble cancel', 8);
    const jugadores = [await crearJugador('dob0'), await crearJugador('dob1')];

    const antes = await totalEnElSistema(jugadores);
    for (const id of jugadores) await inscribir(torneoId, id);

    await cancelarTorneo(torneoId, 'primera');
    const trasPrimera = await totalEnElSistema(jugadores);
    const segunda = await cancelarTorneo(torneoId, 'segunda');
    const trasSegunda = await totalEnElSistema(jugadores);

    console.log('\n═══ CANCELAR DOS VECES ═══');
    console.log(`  total: ${antes} → tras 1ra ${trasPrimera} → tras 2da ${trasSegunda}`);
    console.log(`  segunda cancelación: ${segunda.ok ? 'ok' : `rechazada (${segunda.error})`}\n`);

    expect(trasSegunda, 'la segunda cancelación no puede pagar de nuevo').toBe(trasPrimera);
    expect(trasSegunda, 'y el total sigue siendo el original').toBe(antes);
  }, 60000);
});
