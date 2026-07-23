/**
 * Baraja española de 40 cartas y jerarquía del Truco Argentino.
 *
 * Módulo PURO: sin IO, sin aleatoriedad, sin estado. Sólo definiciones y
 * funciones deterministas sobre cartas. Es la base auditable del motor.
 */

export const SUITS = ['espada', 'basto', 'oro', 'copa'] as const;
export type Suit = (typeof SUITS)[number];

/** Rangos de la baraja española: sin 8 ni 9. 10=sota, 11=caballo, 12=rey. */
export const RANKS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12] as const;
export type Rank = (typeof RANKS)[number];

export interface Card {
  readonly suit: Suit;
  readonly rank: Rank;
}

/** Identificador estable de una carta, p.ej. "espada-1". */
export type CardId = `${Suit}-${Rank}`;

export function cardId(card: Card): CardId {
  return `${card.suit}-${card.rank}`;
}

export function parseCardId(id: CardId): Card {
  const [suit, rank] = id.split('-') as [Suit, string];
  return { suit, rank: Number(rank) as Rank };
}

export function cardsEqual(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

/** Baraja completa ordenada de 40 cartas (determinista). */
export function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

// ─── Jerarquía para el Truco ──────────────────────────────────────────────
// Cuanto mayor el número, más fuerte la carta. Las cartas con igual poder
// empatan ("parda"). Las cuatro cartas "bravas" son únicas.

const SPECIAL_POWER: Record<string, number> = {
  'espada-1': 14, // ancho de espada (macho)
  'basto-1': 13, // ancho de basto (hembra)
  'espada-7': 12, // siete de espada
  'oro-7': 11, // siete de oro
};

const RANK_POWER: Record<number, number> = {
  3: 10,
  2: 9,
  1: 8, // 1 de oro / 1 de copa (los "falsos")
  12: 7, // reyes
  11: 6, // caballos
  10: 5, // sotas
  7: 4, // 7 de basto / 7 de copa
  6: 3,
  5: 2,
  4: 1,
};

/** Poder de una carta en el Truco (1..14). Igual poder ⇒ parda. */
export function trucoPower(card: Card): number {
  const special = SPECIAL_POWER[cardId(card)];
  if (special !== undefined) return special;
  const power = RANK_POWER[card.rank];
  // RANKS garantiza que rank ∈ claves de RANK_POWER.
  return power as number;
}

/**
 * Compara dos cartas por poder de Truco.
 * > 0 si `a` es más fuerte, < 0 si `b`, 0 si parda.
 */
export function compareTruco(a: Card, b: Card): number {
  return trucoPower(a) - trucoPower(b);
}

// ─── Valores para el Envido / Flor ────────────────────────────────────────
// Las figuras (10, 11, 12) valen 0. El resto vale su número.

export function envidoValue(card: Card): number {
  return card.rank >= 10 ? 0 : card.rank;
}
