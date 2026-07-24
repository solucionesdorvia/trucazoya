import { describe, expect, it } from 'vitest';
import { Matchmaker, ventanaRating } from './matchmaking.js';

const T0 = 1_000_000;

function jugador(userId: string, rating: number, desde = T0) {
  return { userId, username: userId, rating, desde };
}

describe('ventana de rating', () => {
  it('arranca angosta y se abre con la espera', () => {
    expect(ventanaRating(0)).toBe(120);
    expect(ventanaRating(10_000)).toBeGreaterThan(ventanaRating(0));
    expect(ventanaRating(9_999_999)).toBeLessThanOrEqual(2000);
  });
});

describe('matchmaking 1v1', () => {
  it('empareja a dos de rating parecido', () => {
    const mm = new Matchmaker();
    mm.entrar('CASUAL_1V1', jugador('a', 1500));
    mm.entrar('CASUAL_1V1', jugador('b', 1520));
    const res = mm.emparejar(T0 + 500);
    expect(res).toHaveLength(1);
    expect(res[0]!.jugadores.map((j) => j.userId).sort()).toEqual(['a', 'b']);
    // Al emparejarse salen de la cola.
    expect(mm.total).toBe(0);
  });

  it('NO empareja a dos muy dispares recién llegados', () => {
    const mm = new Matchmaker();
    mm.entrar('CASUAL_1V1', jugador('a', 1200, T0));
    mm.entrar('CASUAL_1V1', jugador('b', 1900, T0));
    // Recién entraron: la ventana (120) no cubre 700 de diferencia.
    expect(mm.emparejar(T0 + 100)).toHaveLength(0);
    expect(mm.total).toBe(2);
  });

  it('con el tiempo, la ventana se abre y termina emparejándolos', () => {
    const mm = new Matchmaker();
    mm.entrar('CASUAL_1V1', jugador('a', 1200, T0));
    mm.entrar('CASUAL_1V1', jugador('b', 1900, T0));
    // 20 s después la ventana ya cubre la diferencia.
    const res = mm.emparejar(T0 + 20_000);
    expect(res).toHaveLength(1);
  });

  it('prioriza al que más esperó', () => {
    const mm = new Matchmaker();
    mm.entrar('CASUAL_1V1', jugador('viejo', 1500, T0));
    mm.entrar('CASUAL_1V1', jugador('nuevo', 1510, T0 + 5000));
    mm.entrar('CASUAL_1V1', jugador('otro', 1505, T0 + 6000));
    const res = mm.emparejar(T0 + 7000);
    expect(res).toHaveLength(1);
    // El más viejo tiene que estar sí o sí en el emparejamiento.
    expect(res[0]!.jugadores.some((j) => j.userId === 'viejo')).toBe(true);
  });
});

describe('matchmaking 2v2', () => {
  it('necesita 4 jugadores', () => {
    const mm = new Matchmaker();
    for (const id of ['a', 'b', 'c']) mm.entrar('CASUAL_2V2', jugador(id, 1500));
    expect(mm.emparejar(T0 + 1000)).toHaveLength(0);
    mm.entrar('CASUAL_2V2', jugador('d', 1500));
    const res = mm.emparejar(T0 + 1000);
    expect(res).toHaveLength(1);
    expect(res[0]!.jugadores).toHaveLength(4);
  });
});

describe('gestión de cola', () => {
  it('no duplica al mismo usuario', () => {
    const mm = new Matchmaker();
    mm.entrar('CASUAL_1V1', jugador('a', 1500));
    mm.entrar('CASUAL_1V1', jugador('a', 1500));
    expect(mm.total).toBe(1);
  });

  it('salir lo saca de la cola', () => {
    const mm = new Matchmaker();
    mm.entrar('CASUAL_1V1', jugador('a', 1500));
    mm.salir('a');
    expect(mm.total).toBe(0);
    expect(mm.enCola('a')).toBeNull();
  });

  it('informa posición y espera', () => {
    const mm = new Matchmaker();
    mm.entrar('RANKED_1V1', jugador('a', 1500, T0));
    const info = mm.enCola('a');
    expect(info?.mode).toBe('RANKED_1V1');
    expect(info?.posicion).toBe(1);
  });
});
