import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '../types.js';
import { runSimulation, simulateMatch } from './index.js';

describe('simulador de partidas', () => {
  it('una partida 1v1 termina con un ganador y puntaje >= objetivo', () => {
    const res = simulateMatch({ config: DEFAULT_RULES, seed: 12345 });
    expect([0, 1]).toContain(res.winnerTeam);
    expect(Math.max(res.scores[0], res.scores[1])).toBeGreaterThanOrEqual(
      DEFAULT_RULES.pointsToWin,
    );
    expect(res.rounds).toBeGreaterThan(0);
  });

  it('500 partidas 1v1 sin invariantes rotos', () => {
    const stats = runSimulation(500, { config: DEFAULT_RULES, level: 'intermedio' });
    expect(stats.matches).toBe(500);
    expect(stats.team0Wins + stats.team1Wins).toBe(500);
    // ambos equipos ganan alguna (no está sesgado por un bug de turnos)
    expect(stats.team0Wins).toBeGreaterThan(0);
    expect(stats.team1Wins).toBeGreaterThan(0);
  });

  it('500 partidas 2v2 sin invariantes rotos', () => {
    const stats = runSimulation(500, {
      config: { ...DEFAULT_RULES, players: 4 },
      level: 'intermedio',
    });
    expect(stats.team0Wins + stats.team1Wins).toBe(500);
  });

  it('partidas a 15 sin flor también terminan', () => {
    const stats = runSimulation(200, {
      config: { ...DEFAULT_RULES, pointsToWin: 15, florEnabled: false },
      level: 'experto',
    });
    expect(stats.team0Wins + stats.team1Wins).toBe(200);
  });
});
