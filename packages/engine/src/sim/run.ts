/**
 * CLI del simulador: `pnpm --filter @trucazo/engine sim`.
 * Corre miles de partidas 1v1 y 2v2 con distintas reglas.
 */

import { DEFAULT_RULES, type RuleConfig } from '../types.js';
import { runSimulation } from './index.js';

const COUNT = Number(process.argv[2] ?? 10_000);

const scenarios: Array<{ name: string; config: RuleConfig }> = [
  { name: '1v1 · 30pts · con flor', config: { ...DEFAULT_RULES } },
  {
    name: '1v1 · 15pts · sin flor',
    config: { ...DEFAULT_RULES, pointsToWin: 15, florEnabled: false },
  },
  { name: '2v2 · 30pts · con flor', config: { ...DEFAULT_RULES, players: 4 } },
];

console.log(`\n🎴 Trucazo — simulador de motor (${COUNT} partidas por escenario)\n`);
const start = Date.now();

for (const { name, config } of scenarios) {
  const t = Date.now();
  const stats = runSimulation(COUNT, { config, level: 'intermedio' });
  const ms = Date.now() - t;
  console.log(`▸ ${name}`);
  console.log(
    `  equipo0=${stats.team0Wins}  equipo1=${stats.team1Wins}  ` +
      `rondas≈${stats.avgRounds.toFixed(1)}  acciones≈${stats.avgActions.toFixed(0)}  ` +
      `maxScore=${stats.maxScore}  (${ms}ms)`,
  );
}

console.log(
  `\n✓ ${scenarios.length * COUNT} partidas sin invariantes rotos en ${Date.now() - start}ms\n`,
);
