import { describe, expect, it } from 'vitest';
import {
  actualizarClasificacion,
  CLASIFICACION_INICIAL,
  divisionPara,
  esProvisoria,
  type Clasificacion,
} from './glicko.js';

describe('Glicko-2', () => {
  it('ganarle a alguien de tu nivel sube el rating', () => {
    const nuevo = actualizarClasificacion(CLASIFICACION_INICIAL, [
      { rating: 1500, deviation: 200, resultado: 1 },
    ]);
    expect(nuevo.rating).toBeGreaterThan(1500);
  });

  it('perder contra alguien de tu nivel baja el rating', () => {
    const nuevo = actualizarClasificacion(CLASIFICACION_INICIAL, [
      { rating: 1500, deviation: 200, resultado: 0 },
    ]);
    expect(nuevo.rating).toBeLessThan(1500);
  });

  it('ganarle a uno mucho mejor sube más que ganarle a uno peor', () => {
    const contraMejor = actualizarClasificacion(CLASIFICACION_INICIAL, [
      { rating: 2000, deviation: 60, resultado: 1 },
    ]);
    const contraPeor = actualizarClasificacion(CLASIFICACION_INICIAL, [
      { rating: 1100, deviation: 60, resultado: 1 },
    ]);
    expect(contraMejor.rating).toBeGreaterThan(contraPeor.rating);
  });

  it('perder contra uno mucho peor duele más', () => {
    const contraPeor = actualizarClasificacion(CLASIFICACION_INICIAL, [
      { rating: 1100, deviation: 60, resultado: 0 },
    ]);
    const contraMejor = actualizarClasificacion(CLASIFICACION_INICIAL, [
      { rating: 2000, deviation: 60, resultado: 0 },
    ]);
    expect(contraPeor.rating).toBeLessThan(contraMejor.rating);
  });

  it('jugar reduce la incertidumbre', () => {
    const nuevo = actualizarClasificacion(CLASIFICACION_INICIAL, [
      { rating: 1500, deviation: 200, resultado: 1 },
    ]);
    expect(nuevo.deviation).toBeLessThan(CLASIFICACION_INICIAL.deviation);
  });

  it('no jugar aumenta la incertidumbre sin mover el rating', () => {
    const estable: Clasificacion = { rating: 1700, deviation: 60, volatility: 0.06 };
    const nuevo = actualizarClasificacion(estable, []);
    expect(nuevo.rating).toBe(1700);
    expect(nuevo.deviation).toBeGreaterThan(60);
  });

  it('a un jugador nuevo lo mueve más que a uno consolidado', () => {
    const nuevoJugador = actualizarClasificacion(CLASIFICACION_INICIAL, [
      { rating: 1500, deviation: 100, resultado: 1 },
    ]);
    const veterano = actualizarClasificacion({ rating: 1500, deviation: 45, volatility: 0.06 }, [
      { rating: 1500, deviation: 100, resultado: 1 },
    ]);
    const saltoNuevo = nuevoJugador.rating - 1500;
    const saltoVeterano = veterano.rating - 1500;
    expect(saltoNuevo).toBeGreaterThan(saltoVeterano);
  });

  it('la incertidumbre nunca supera 350 ni el resultado es NaN', () => {
    let c = CLASIFICACION_INICIAL;
    for (let i = 0; i < 50; i++) {
      c = actualizarClasificacion(c, [{ rating: 1400 + i * 10, deviation: 80, resultado: i % 2 }]);
      expect(Number.isFinite(c.rating)).toBe(true);
      expect(Number.isFinite(c.deviation)).toBe(true);
      expect(c.deviation).toBeLessThanOrEqual(350);
      expect(c.volatility).toBeGreaterThan(0);
    }
  });

  it('ganar siempre a rivales fuertes lleva a divisiones altas', () => {
    let c = CLASIFICACION_INICIAL;
    for (let i = 0; i < 30; i++) {
      c = actualizarClasificacion(c, [{ rating: 2100, deviation: 50, resultado: 1 }]);
    }
    expect(c.rating).toBeGreaterThan(1900);
    expect(['MAESTRO', 'GRAN_MAESTRO', 'DIAMANTE']).toContain(divisionPara(c.rating));
  });
});

describe('divisiones', () => {
  it('mapea el rating a la división correcta', () => {
    expect(divisionPara(1000)).toBe('BRONCE');
    expect(divisionPara(1450)).toBe('PLATA');
    expect(divisionPara(1600)).toBe('ORO');
    expect(divisionPara(1750)).toBe('PLATINO');
    expect(divisionPara(1900)).toBe('DIAMANTE');
    expect(divisionPara(2100)).toBe('MAESTRO');
    expect(divisionPara(2500)).toBe('GRAN_MAESTRO');
  });
});

describe('clasificación provisoria', () => {
  it('un jugador nuevo es provisorio; uno con muchas partidas no', () => {
    expect(esProvisoria(350)).toBe(true);
    expect(esProvisoria(60)).toBe(false);
  });
});
