/**
 * Reportado por el tester: "cuando ponés las fichas por las que querés jugar,
 * sí o sí arranca con un 0 y no te deja borrarlo".
 */

import { describe, expect, it } from 'vitest';
import { limpiarMonto } from './monto.js';

describe('campo de fichas', () => {
  it('se puede borrar del todo (era el bug: quedaba un 0 pegado)', () => {
    expect(limpiarMonto('')).toBe('');
  });

  it('no deja ceros a la izquierda al tipear después de borrar', () => {
    // Lo que pasaba antes: borrabas, quedaba "0", tipeabas 2500 → "02500".
    expect(limpiarMonto('02500')).toBe('2500');
    expect(limpiarMonto('0007')).toBe('7');
  });

  it('deja escribir cualquier monto libre', () => {
    for (const v of ['1200', '1138', '2500', '13750']) expect(limpiarMonto(v)).toBe(v);
  });

  it('ignora todo lo que no sea un dígito', () => {
    expect(limpiarMonto('2.500')).toBe('2500');
    expect(limpiarMonto('1e9')).toBe('19');
    expect(limpiarMonto('-300')).toBe('300'); // no se puede apostar en negativo
    expect(limpiarMonto('abc')).toBe('');
  });

  it('un 0 solo se puede escribir, y vale 0 (el mínimo lo frena después)', () => {
    expect(limpiarMonto('0')).toBe('0');
    expect(Number(limpiarMonto('')) || 0).toBe(0);
  });
});
