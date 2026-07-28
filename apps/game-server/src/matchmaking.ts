/**
 * Matchmaking automático: empareja jugadores sin que tengan que coordinar un
 * código.
 *
 * Idea: una cola por modo. Cada tick intenta emparejar a los que más esperaron.
 * El criterio de rating se ENSANCHA con el tiempo de espera, para no dejar a
 * nadie colgado: al principio busca rival parecido; si pasa el tiempo, afloja.
 */

import type { GameMode } from '@trucazo/db';

export interface EnCola {
  userId: string;
  username: string;
  rating: number;
  desde: number; // epoch ms
}

export interface Emparejamiento {
  mode: GameMode;
  jugadores: EnCola[];
}

/** Cuántos jugadores necesita cada modo. */
function cupo(mode: GameMode): number {
  return mode.includes('2V2') ? 4 : 2;
}

/**
 * Ventana de rating aceptable según cuánto esperó el jugador.
 * Arranca en ±120 y se abre ~80 por segundo, hasta abrirse del todo al minuto.
 */
export function ventanaRating(esperaMs: number): number {
  const segundos = esperaMs / 1000;
  return Math.min(2000, 120 + segundos * 80);
}

export class Matchmaker {
  private readonly colas = new Map<GameMode, EnCola[]>();

  entrar(mode: GameMode, jugador: EnCola): void {
    const cola = this.colas.get(mode) ?? [];
    // Evita duplicados (misma persona en dos pestañas).
    if (cola.some((j) => j.userId === jugador.userId)) return;
    cola.push(jugador);
    this.colas.set(mode, cola);
  }

  salir(userId: string): void {
    for (const [mode, cola] of this.colas) {
      this.colas.set(
        mode,
        cola.filter((j) => j.userId !== userId),
      );
    }
  }

  /** Total de jugadores esperando emparejamiento (para métricas). */
  totalEnCola(): number {
    let total = 0;
    for (const cola of this.colas.values()) total += cola.length;
    return total;
  }

  enCola(userId: string): { mode: GameMode; posicion: number; espera: number } | null {
    for (const [mode, cola] of this.colas) {
      const idx = cola.findIndex((j) => j.userId === userId);
      if (idx >= 0) {
        const j = cola[idx] as EnCola;
        return { mode, posicion: idx + 1, espera: Date.now() - j.desde };
      }
    }
    return null;
  }

  get total(): number {
    let n = 0;
    for (const cola of this.colas.values()) n += cola.length;
    return n;
  }

  /**
   * Intenta armar emparejamientos. Devuelve los grupos listos y los saca de la
   * cola. `ahora` se inyecta para poder testear con tiempo determinista.
   */
  emparejar(ahora: number): Emparejamiento[] {
    const salida: Emparejamiento[] = [];

    for (const [mode, cola] of this.colas) {
      const necesarios = cupo(mode);
      if (cola.length < necesarios) continue;

      // Ordena por antigüedad: el que más esperó tiene prioridad.
      const ordenada = [...cola].sort((a, b) => a.desde - b.desde);
      const usados = new Set<string>();

      for (const semilla of ordenada) {
        if (usados.has(semilla.userId)) continue;
        const ventana = ventanaRating(ahora - semilla.desde);

        // Candidatos dentro de la ventana de rating de la semilla.
        const compatibles = ordenada.filter(
          (j) =>
            !usados.has(j.userId) &&
            j.userId !== semilla.userId &&
            Math.abs(j.rating - semilla.rating) <= ventana,
        );

        if (compatibles.length >= necesarios - 1) {
          const grupo = [semilla, ...compatibles.slice(0, necesarios - 1)];
          for (const j of grupo) usados.add(j.userId);
          salida.push({ mode, jugadores: grupo });
        }
      }

      if (usados.size > 0) {
        this.colas.set(
          mode,
          cola.filter((j) => !usados.has(j.userId)),
        );
      }
    }

    return salida;
  }
}
