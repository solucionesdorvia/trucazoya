/**
 * Barajado uniforme (Fisher–Yates) con fuente de aleatoriedad inyectable.
 *
 * El motor NO baraja por sí mismo: recibe el mazo ya barajado como input, lo
 * que lo mantiene determinista y testeable. En producción se usa
 * `cryptoRandomInt` (CSPRNG). En tests se puede pasar un RNG con semilla para
 * reproducir repartos exactos.
 */

import { createHash, createHmac, randomBytes, randomInt } from 'node:crypto';
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

// ─── Barajado auditable (commit-reveal) ──────────────────────────────────────
//
// Para poder CERTIFICAR que el reparto no está trucado usamos commit-reveal:
//   1. El servidor genera una semilla secreta y publica su hash (el "commit")
//      ANTES de que se juegue la mano. No puede cambiar la semilla después sin
//      romper el hash.
//   2. Al terminar la ronda revela la semilla. Cualquiera recomputa el mazo con
//      esta misma función y verifica que coincide con lo que se jugó.
// Así ni el operador puede amañar el reparto ni acusar de amaño sin prueba.

/** Semilla secreta del servidor para una ronda (hex, 256 bits). */
export function nuevaSemilla(): string {
  return randomBytes(32).toString('hex');
}

/** Compromiso público: SHA-256 de la semilla, en hex. */
export function commitDeSemilla(seedHex: string): string {
  return createHash('sha256').update(seedHex).digest('hex');
}

/**
 * RandomInt determinista y uniforme derivado de una semilla hex. Usa
 * HMAC-SHA256(seed, contador) como DRBG con muestreo por rechazo (sin sesgo de
 * módulo). Reproducible: la misma semilla siempre da la misma secuencia.
 */
export function randomIntDeSemilla(seedHex: string): RandomInt {
  let contador = 0;
  let buffer = Buffer.alloc(0);
  let pos = 0;
  const siguienteByte = (): number => {
    if (pos >= buffer.length) {
      buffer = createHmac('sha256', seedHex).update(String(contador++)).digest();
      pos = 0;
    }
    return buffer[pos++] as number;
  };
  return (maxExclusive: number): number => {
    if (maxExclusive <= 1) return 0;
    // Muestreo por rechazo sobre 32 bits para no introducir sesgo.
    const limite = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
    let x: number;
    do {
      x =
        ((siguienteByte() << 24) |
          (siguienteByte() << 16) |
          (siguienteByte() << 8) |
          siguienteByte()) >>>
        0;
    } while (x >= limite);
    return x % maxExclusive;
  };
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
