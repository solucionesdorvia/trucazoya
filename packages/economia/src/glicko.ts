/**
 * Glicko-2 — sistema de clasificación.
 *
 * Se eligió sobre Elo porque modela la INCERTIDUMBRE (rating deviation): a un
 * jugador nuevo o que volvió después de meses lo mueve mucho más rápido que a
 * uno con historial estable. En un juego con azar como el truco eso importa:
 * evita que una racha de malas manos hunda a alguien que en realidad juega bien.
 *
 * Implementación pura y determinista (sin IO), siguiendo el paper de Glickman.
 */

/** Escala de conversión entre el rating "visible" (1500) y la escala interna. */
const ESCALA = 173.7178;
const RATING_BASE = 1500;
/** Constante del sistema: cuánto puede variar la volatilidad. Más bajo = más estable. */
const TAU = 0.5;
const EPSILON = 0.000001;

export interface Clasificacion {
  rating: number;
  deviation: number;
  volatility: number;
}

export const CLASIFICACION_INICIAL: Clasificacion = {
  rating: RATING_BASE,
  deviation: 350,
  volatility: 0.06,
};

export interface Oponente {
  rating: number;
  deviation: number;
  /** 1 = ganó, 0 = perdió, 0.5 = empate. */
  resultado: number;
}

function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function E(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

/**
 * Calcula la nueva clasificación tras una tanda de partidas.
 * Si no hubo partidas, sólo aumenta la incertidumbre (el jugador estuvo inactivo).
 */
export function actualizarClasificacion(
  actual: Clasificacion,
  oponentes: Oponente[],
): Clasificacion {
  const mu = (actual.rating - RATING_BASE) / ESCALA;
  const phi = actual.deviation / ESCALA;
  const sigma = actual.volatility;

  if (oponentes.length === 0) {
    // Sin partidas: la incertidumbre crece.
    const phiNuevo = Math.sqrt(phi * phi + sigma * sigma);
    return {
      rating: actual.rating,
      deviation: Math.min(350, phiNuevo * ESCALA),
      volatility: sigma,
    };
  }

  const rivales = oponentes.map((o) => ({
    mu: (o.rating - RATING_BASE) / ESCALA,
    phi: o.deviation / ESCALA,
    s: o.resultado,
  }));

  // v: varianza estimada
  let vInv = 0;
  for (const r of rivales) {
    const e = E(mu, r.mu, r.phi);
    vInv += g(r.phi) ** 2 * e * (1 - e);
  }
  const v = 1 / vInv;

  // delta: mejora estimada
  let sumatoria = 0;
  for (const r of rivales) {
    sumatoria += g(r.phi) * (r.s - E(mu, r.mu, r.phi));
  }
  const delta = v * sumatoria;

  // Nueva volatilidad por el algoritmo iterativo de Illinois.
  const a = Math.log(sigma * sigma);
  const f = (x: number): number => {
    const ex = Math.exp(x);
    const num = ex * (delta * delta - phi * phi - v - ex);
    const den = 2 * (phi * phi + v + ex) ** 2;
    return num / den - (x - a) / (TAU * TAU);
  };

  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * TAU) < 0 && k < 100) k++;
    B = a - k * TAU;
  }

  let fA = f(A);
  let fB = f(B);
  let iteraciones = 0;
  while (Math.abs(B - A) > EPSILON && iteraciones++ < 100) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
  }

  const sigmaNuevo = Math.exp(A / 2);
  const phiEstrella = Math.sqrt(phi * phi + sigmaNuevo * sigmaNuevo);
  const phiNuevo = 1 / Math.sqrt(1 / (phiEstrella * phiEstrella) + 1 / v);
  const muNuevo = mu + phiNuevo * phiNuevo * sumatoria;

  return {
    rating: Math.round((muNuevo * ESCALA + RATING_BASE) * 100) / 100,
    deviation: Math.round(Math.min(350, phiNuevo * ESCALA) * 100) / 100,
    volatility: Math.round(sigmaNuevo * 1000000) / 1000000,
  };
}

// ─── Divisiones ────────────────────────────────────────────────────────────

export type Division =
  'BRONCE' | 'PLATA' | 'ORO' | 'PLATINO' | 'DIAMANTE' | 'MAESTRO' | 'GRAN_MAESTRO';

const UMBRALES: Array<[Division, number]> = [
  ['GRAN_MAESTRO', 2200],
  ['MAESTRO', 2000],
  ['DIAMANTE', 1850],
  ['PLATINO', 1700],
  ['ORO', 1550],
  ['PLATA', 1400],
  ['BRONCE', 0],
];

export function divisionPara(rating: number): Division {
  for (const [division, minimo] of UMBRALES) {
    if (rating >= minimo) return division;
  }
  return 'BRONCE';
}

/**
 * ¿La clasificación es provisoria? Con pocas partidas la incertidumbre es alta
 * y no conviene mostrarla como definitiva ni usarla para emparejar en serio.
 */
export function esProvisoria(deviation: number): boolean {
  return deviation > 110;
}
