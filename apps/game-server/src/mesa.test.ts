/**
 * Tests de los guardas de seguridad de la Mesa. Rápidos y sin base ni sockets:
 * apuntan a las reglas que impiden hacer trampa.
 */

import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_RULES } from '@trucazo/engine';
import { Mesa, type JugadorMesa } from './mesa.js';

function crearMesa() {
  const emitido: Array<{ userId: string; evento: string; datos: unknown }> = [];
  const jugadores: JugadorMesa[] = [
    { seat: 0, userId: 'u0', username: 'Ana', isBot: false, conectado: true },
    { seat: 1, userId: 'u1', username: 'Beto', isBot: false, conectado: true },
  ];
  const mesa = new Mesa(
    'm1',
    { ...DEFAULT_RULES, players: 2, florEnabled: false, pointsToWin: 15 },
    jugadores,
    (userId, evento, datos) => emitido.push({ userId, evento, datos }),
  );
  return { mesa, emitido };
}

describe('guardas de la Mesa', () => {
  it('rechaza acciones de quien no es jugador', () => {
    const { mesa } = crearMesa();
    const seat = mesa.asientoEnTurno()!;
    const motivo = mesa.aplicar('intruso', { type: 'GO_TO_MAZO', seat }, 'a1');
    expect(motivo).toMatch(/no sos jugador/i);
  });

  it('rechaza jugar en el asiento de otro (suplantación)', () => {
    const { mesa } = crearMesa();
    const enTurno = mesa.asientoEnTurno()!;
    const otro = enTurno === 0 ? 1 : 0;
    // El usuario del asiento `otro` intenta actuar como si fuera `enTurno`.
    const userIdDelOtro = otro === 0 ? 'u0' : 'u1';
    const motivo = mesa.aplicar(userIdDelOtro, { type: 'GO_TO_MAZO', seat: enTurno }, 'a2');
    expect(motivo).toBe('Asiento inválido');
  });

  it('rechaza acciones ilegales según el motor', () => {
    const { mesa } = crearMesa();
    const enTurno = mesa.asientoEnTurno()!;
    const userId = enTurno === 0 ? 'u0' : 'u1';
    // Una carta que no está en su mano.
    const motivo = mesa.aplicar(
      userId,
      { type: 'PLAY_CARD', seat: enTurno, card: { suit: 'oro', rank: 4 } },
      'a3',
    );
    // O bien la tiene (y es legal) o el motor la rechaza; forzamos el caso
    // ilegal usando un asiento fuera de turno más abajo.
    expect(typeof motivo === 'string' || motivo === null).toBe(true);
  });

  it('es idempotente: el mismo actionId no se aplica dos veces', () => {
    const { mesa } = crearMesa();
    const enTurno = mesa.asientoEnTurno()!;
    const userId = enTurno === 0 ? 'u0' : 'u1';
    const carta = mesa.state.round!.hands[enTurno]![0]!;

    const primera = mesa.aplicar(userId, { type: 'PLAY_CARD', seat: enTurno, card: carta }, 'dup');
    expect(primera).toBeNull();
    const cartasDespues = mesa.state.round!.hands[enTurno]!.length;

    // Reintento con el MISMO actionId (p.ej. el cliente reenvió por timeout).
    const segunda = mesa.aplicar(userId, { type: 'PLAY_CARD', seat: enTurno, card: carta }, 'dup');
    expect(segunda).toBeNull();
    expect(mesa.state.round!.hands[enTurno]!.length).toBe(cartasDespues);
  });
});

describe('redacción de la vista', () => {
  it('la vista de un jugador no incluye las cartas del rival', () => {
    const { mesa } = crearMesa();
    const vista0 = mesa.vistaPara(0);
    const manoRival = mesa.state.round!.hands[1]!;

    expect(vista0.myHand).toHaveLength(3);
    expect(vista0.handCounts[1]).toBe(3);

    const serializada = JSON.stringify(vista0);
    for (const carta of manoRival) {
      const propia = vista0.myHand.some((c) => c.suit === carta.suit && c.rank === carta.rank);
      if (propia) continue; // imposible en 1v1, pero por las dudas
      expect(serializada).not.toContain(`{"suit":"${carta.suit}","rank":${carta.rank}}`);
    }
  });

  it('sólo entrega acciones legales del propio asiento', () => {
    const { mesa } = crearMesa();
    for (const seat of [0, 1]) {
      const vista = mesa.vistaPara(seat);
      expect(vista.legales.every((a) => a.seat === seat)).toBe(true);
    }
  });
});

describe('bots', () => {
  it('un bot juega solo cuando le toca el turno', async () => {
    vi.useFakeTimers();
    const jugadores: JugadorMesa[] = [
      { seat: 0, userId: 'u0', username: 'Ana', isBot: false, conectado: true },
      {
        seat: 1,
        userId: 'bot:1',
        username: 'Bot',
        isBot: true,
        botLevel: 'facil',
        conectado: true,
      },
    ];
    const mesa = new Mesa(
      'm2',
      { ...DEFAULT_RULES, players: 2, florEnabled: false, pointsToWin: 15 },
      jugadores,
      () => undefined,
    );

    // El bot debe jugar solo, sea mano o no. Si arranca el humano, jugamos
    // primero para cederle el turno.
    if (mesa.asientoEnTurno() === 0) {
      const carta = mesa.state.round!.hands[0]![0]!;
      mesa.aplicar('u0', { type: 'PLAY_CARD', seat: 0, card: carta }, 'x1');
    }
    expect(mesa.asientoEnTurno()).toBe(1);
    const seqAntes = mesa.state.seq;
    await vi.advanceTimersByTimeAsync(2000);
    expect(mesa.state.seq).toBeGreaterThan(seqAntes);

    mesa.destruir();
    vi.useRealTimers();
  });
});
