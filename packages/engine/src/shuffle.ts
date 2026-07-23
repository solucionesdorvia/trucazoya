/**
 * Barajado uniforme (Fisher–Yates) con fuente de aleatoriedad inyectable.
 *
 * El motor NO baraja por sí mismo: recibe el mazo ya barajado como input, lo
 * que lo mantiene determinista y testeable. En producción se usa
 * `cryptoRandomInt` (CSPRNG). En tests se puede pasar un RNG con semilla para
 * reproducir repartos exactos.
 */

import { randomInt } from 'node:crypto';
import type { Card } from './cards.js';

/** Devuelve un entero uniforme en [0, maxExclusive). */
export type RandomInt = (maxExclusive: number) => number;

/** RNG criptográficamente seguro (producción). */
export const cryptoRandomInt: RandomInt = (maxExclusive) => randomInt(maxExclusive);

/**
 * PRNG determinista (mulberry32) para tests y simulaciones reproducibles.
 * NO usar para decisiones reales de juego.
 */
export function seededRandomInt(seed: number): RandomInt {
  let state = seed >>> 0;
  return (maxExclusive: number) => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return Math.floor(r * maxExclusive);
  };
}

/** Devuelve una copia barajada del mazo. No muta el input. */
export function shuffle<T>(deck: readonly T[], rand: RandomInt = cryptoRandomInt): T[] {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    const tmp = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = tmp;
  }
  return arr;
}

/** Reparte `count` cartas a cada uno de `players` desde el tope del mazo. */
export function deal(deck: readonly Card[], players: number, count: number): Card[][] {
  const hands: Card[][] = Array.from({ length: players }, () => []);
  let idx = 0;
  for (let c = 0; c < count; c++) {
    for (let p = 0; p < players; p++) {
      const card = deck[idx++];
      if (card) (hands[p] as Card[]).push(card);
    }
  }
  return hands;
}
