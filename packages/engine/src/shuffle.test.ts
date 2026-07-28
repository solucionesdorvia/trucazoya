import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fullDeck } from './cards.js';
import { commitDeSemilla, nuevaSemilla, randomIntDeSemilla, shuffle } from './shuffle.js';

describe('barajado auditable (commit-reveal)', () => {
  it('la misma semilla reproduce exactamente el mismo mazo', () => {
    const semilla = nuevaSemilla();
    const a = shuffle(fullDeck(), randomIntDeSemilla(semilla));
    const b = shuffle(fullDeck(), randomIntDeSemilla(semilla));
    expect(a).toEqual(b);
  });

  it('semillas distintas dan repartos distintos', () => {
    const a = shuffle(fullDeck(), randomIntDeSemilla(nuevaSemilla()));
    const b = shuffle(fullDeck(), randomIntDeSemilla(nuevaSemilla()));
    expect(a).not.toEqual(b);
  });

  it('el commit es SHA-256 de la semilla y permite verificar tras revelar', () => {
    const semilla = nuevaSemilla();
    const commit = commitDeSemilla(semilla);
    expect(commit).toBe(createHash('sha256').update(semilla).digest('hex'));

    // Un verificador externo, con la semilla revelada, recomputa el mazo.
    const mazoJugado = shuffle(fullDeck(), randomIntDeSemilla(semilla));
    const mazoRecomputado = shuffle(fullDeck(), randomIntDeSemilla(semilla));
    expect(mazoRecomputado).toEqual(mazoJugado);
    // Y el commit ata esa semilla: no se puede sustituir por otra.
    expect(commitDeSemilla(semilla)).toBe(commit);
  });

  it('reparte 40 cartas sin repetir ni perder ninguna', () => {
    const mazo = shuffle(fullDeck(), randomIntDeSemilla(nuevaSemilla()));
    expect(mazo).toHaveLength(40);
    const claves = new Set(mazo.map((c) => `${c.rank}-${c.suit}`));
    expect(claves.size).toBe(40);
  });
});
