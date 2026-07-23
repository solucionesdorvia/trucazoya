import { describe, expect, it } from 'vitest';
import type { Card } from './cards.js';
import { envidoPoints, florPoints, hasFlor } from './envido.js';

const c = (suit: Card['suit'], rank: Card['rank']): Card => ({ suit, rank });

describe('envido', () => {
  it('dos del mismo palo: 20 + los dos más altos', () => {
    // 7 y 6 de oro + 4 de basto → 20 + 7 + 6 = 33
    expect(envidoPoints([c('oro', 7), c('oro', 6), c('basto', 4)])).toBe(33);
  });

  it('tres del mismo palo: toma los dos valores más altos', () => {
    // 7, 6, 5 de oro → 20 + 7 + 6 = 33
    expect(envidoPoints([c('oro', 7), c('oro', 6), c('oro', 5)])).toBe(33);
  });

  it('figuras del mismo palo suman 20 (valen 0)', () => {
    // 10 y 12 de copa → 20 + 0 + 0 = 20
    expect(envidoPoints([c('copa', 10), c('copa', 12), c('oro', 4)])).toBe(20);
  });

  it('sin par del mismo palo: mayor carta individual', () => {
    expect(envidoPoints([c('oro', 7), c('copa', 5), c('basto', 3)])).toBe(7);
  });

  it('sin par y con figuras altas: la mejor no-figura', () => {
    expect(envidoPoints([c('oro', 12), c('copa', 11), c('basto', 5)])).toBe(5);
  });

  it('33 es el envido máximo posible', () => {
    expect(envidoPoints([c('espada', 7), c('espada', 6), c('oro', 3)])).toBe(33);
  });
});

describe('flor', () => {
  it('detecta tres del mismo palo', () => {
    expect(hasFlor([c('oro', 1), c('oro', 5), c('oro', 12)])).toBe(true);
    expect(hasFlor([c('oro', 1), c('copa', 5), c('oro', 12)])).toBe(false);
  });

  it('flor = 20 + suma de las tres', () => {
    // 1 + 5 + 0(figura) = 6 → 26
    expect(florPoints([c('oro', 1), c('oro', 5), c('oro', 12)])).toBe(26);
  });

  it('sin flor devuelve 0', () => {
    expect(florPoints([c('oro', 1), c('copa', 5), c('oro', 12)])).toBe(0);
  });
});
