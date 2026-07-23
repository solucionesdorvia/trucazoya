import { describe, expect, it } from 'vitest';
import type { Card } from './cards.js';
import { resolveRound, resolveTrick, teamOfSeat } from './tricks.js';
import type { TrickOutcome } from './types.js';

const c = (suit: Card['suit'], rank: Card['rank']): Card => ({ suit, rank });

describe('equipos por asiento', () => {
  it('asientos pares = equipo 0, impares = equipo 1', () => {
    expect(teamOfSeat(0)).toBe(0);
    expect(teamOfSeat(1)).toBe(1);
    expect(teamOfSeat(2)).toBe(0);
    expect(teamOfSeat(3)).toBe(1);
  });
});

describe('resolveTrick', () => {
  it('gana la carta más fuerte', () => {
    const r = resolveTrick([
      { seat: 0, card: c('oro', 4) },
      { seat: 1, card: c('espada', 1) },
    ]);
    expect(r.outcome).toBe('TEAM_1');
    expect(r.winnerSeat).toBe(1);
  });

  it('empate entre equipos distintos = parda', () => {
    const r = resolveTrick([
      { seat: 0, card: c('oro', 3) },
      { seat: 1, card: c('copa', 3) },
    ]);
    expect(r.outcome).toBe('PARDA');
    expect(r.winnerSeat).toBeNull();
  });

  it('en 2v2, empate al tope dentro del mismo equipo gana ese equipo', () => {
    // asientos 0 y 2 son equipo 0, ambos con 3 (empardan) contra cartas menores
    const r = resolveTrick([
      { seat: 0, card: c('oro', 3) },
      { seat: 1, card: c('basto', 2) },
      { seat: 2, card: c('copa', 3) },
      { seat: 3, card: c('espada', 5) },
    ]);
    expect(r.outcome).toBe('TEAM_0');
  });
});

describe('resolveRound (pardas)', () => {
  const R = (...o: TrickOutcome[]) => resolveRound(o, 0);

  it('gana 2 bazas → gana la ronda', () => {
    expect(R('TEAM_1', 'TEAM_1')).toBe(1);
    expect(R('TEAM_0', 'TEAM_1', 'TEAM_0')).toBe(0);
  });

  it('gana la primera y emparda la segunda → gana', () => {
    expect(R('TEAM_0', 'PARDA')).toBe(0);
    expect(R('TEAM_1', 'PARDA')).toBe(1);
  });

  it('primera parda → gana el primero que gane una baza', () => {
    expect(R('PARDA', 'TEAM_1')).toBe(1);
    expect(R('PARDA', 'PARDA', 'TEAM_0')).toBe(0);
  });

  it('todas parda → gana la mano', () => {
    expect(resolveRound(['PARDA', 'PARDA', 'PARDA'], 0)).toBe(0);
    expect(resolveRound(['PARDA', 'PARDA', 'PARDA'], 1)).toBe(1);
  });

  it('1-1 con tercera parda → gana quien ganó la primera', () => {
    expect(R('TEAM_1', 'TEAM_0', 'PARDA')).toBe(1);
    expect(R('TEAM_0', 'TEAM_1', 'PARDA')).toBe(0);
  });

  it('undecided devuelve null', () => {
    expect(R('TEAM_0')).toBeNull();
    expect(R('TEAM_0', 'TEAM_1')).toBeNull();
    expect(R('PARDA')).toBeNull();
  });
});
