/**
 * Registro de salas en memoria. La fila `Room` de la base es la que persiste
 * la configuración y el código; acá vive el estado vivo (quién está conectado,
 * quién está listo, la mesa en curso).
 */

import type { BotLevel, RuleConfig } from '@trucazo/engine';
import { Mesa, type JugadorMesa } from './mesa.js';

export interface Participante {
  userId: string;
  username: string;
  seat: number | null;
  listo: boolean;
  conectado: boolean;
  isBot: boolean;
  botLevel?: BotLevel;
}

export type EstadoSala = 'ESPERANDO' | 'EN_PARTIDA' | 'TERMINADA';

export interface ConfigSala extends RuleConfig {
  nombre: string;
  code: string;
  roomId: string;
  hostUserId: string;
  apuesta: number;
  permiteBots: boolean;
}

export class Sala {
  estado: EstadoSala = 'ESPERANDO';
  participantes: Participante[] = [];
  mesa: Mesa | null = null;
  /** Apuesta reservada para la partida en curso, si la sala tiene apuesta. */
  betId: string | null = null;

  constructor(readonly config: ConfigSala) {}

  get llena(): boolean {
    return this.participantes.filter((p) => p.seat !== null).length >= this.config.players;
  }

  entrar(userId: string, username: string): Participante {
    const existente = this.participantes.find((p) => p.userId === userId);
    if (existente) {
      existente.conectado = true;
      return existente;
    }

    // Asigna el primer asiento libre. Los asientos alternan equipos (par/impar).
    const ocupados = new Set(this.participantes.map((p) => p.seat));
    let seat: number | null = null;
    for (let s = 0; s < this.config.players; s++) {
      if (!ocupados.has(s)) {
        seat = s;
        break;
      }
    }

    const p: Participante = {
      userId,
      username,
      seat,
      listo: false,
      conectado: true,
      isBot: false,
    };
    this.participantes.push(p);
    return p;
  }

  salir(userId: string): void {
    if (this.estado === 'EN_PARTIDA') {
      // En partida no se libera el asiento: se marca desconectado para permitir
      // reconexión.
      const p = this.participantes.find((x) => x.userId === userId);
      if (p) p.conectado = false;
      return;
    }
    this.participantes = this.participantes.filter((p) => p.userId !== userId);
  }

  marcarListo(userId: string, listo: boolean): void {
    const p = this.participantes.find((x) => x.userId === userId);
    if (p) p.listo = listo;
  }

  /** Completa los asientos vacíos con bots (si la sala lo permite). */
  agregarBots(nivel: BotLevel = 'intermedio'): void {
    if (!this.config.permiteBots) return;
    const ocupados = new Set(this.participantes.map((p) => p.seat));
    for (let s = 0; s < this.config.players; s++) {
      if (ocupados.has(s)) continue;
      this.participantes.push({
        userId: `bot:${this.config.code}:${s}`,
        username: `Bot ${s + 1}`,
        seat: s,
        listo: true,
        conectado: true,
        isBot: true,
        botLevel: nivel,
      });
    }
  }

  /** ¿Se puede arrancar? Todos los asientos ocupados y todos listos. */
  puedeArrancar(): boolean {
    const sentados = this.participantes.filter((p) => p.seat !== null);
    return (
      this.estado === 'ESPERANDO' &&
      sentados.length === this.config.players &&
      sentados.every((p) => p.listo)
    );
  }

  arrancar(
    matchId: string,
    emitir: (userId: string, evento: string, datos: unknown) => void,
  ): Mesa {
    const jugadores: JugadorMesa[] = this.participantes
      .filter((p) => p.seat !== null)
      .map((p) => ({
        seat: p.seat as number,
        userId: p.userId,
        username: p.username,
        isBot: p.isBot,
        botLevel: p.botLevel,
        conectado: p.conectado,
      }))
      .sort((a, b) => a.seat - b.seat);

    this.mesa = new Mesa(matchId, this.config, jugadores, emitir);
    this.estado = 'EN_PARTIDA';
    return this.mesa;
  }

  /** Snapshot público de la sala (no contiene nada secreto). */
  snapshot() {
    return {
      code: this.config.code,
      nombre: this.config.nombre,
      estado: this.estado,
      hostUserId: this.config.hostUserId,
      matchId: this.mesa?.id ?? null,
      config: {
        players: this.config.players,
        pointsToWin: this.config.pointsToWin,
        florEnabled: this.config.florEnabled,
        apuesta: this.config.apuesta,
      },
      participantes: this.participantes.map((p) => ({
        userId: p.userId,
        username: p.username,
        seat: p.seat,
        equipo: p.seat === null ? null : p.seat % 2,
        listo: p.listo,
        conectado: p.conectado,
        isBot: p.isBot,
      })),
    };
  }
}

/** Registro global de salas vivas, indexado por código. */
export class RegistroSalas {
  private readonly salas = new Map<string, Sala>();

  obtener(code: string): Sala | undefined {
    return this.salas.get(code.toUpperCase());
  }

  /**
   * Crea la sala si no existe, o devuelve la existente.
   *
   * Semántica de upsert a propósito: dos `sala:entrar` concurrentes pueden
   * llegar acá a la vez (ambos leyeron la base y ninguno vio la sala todavía).
   * Si esto pisara la sala anterior, cada jugador quedaría en una instancia
   * distinta y la partida nunca arrancaría.
   */
  crear(config: ConfigSala): Sala {
    const code = config.code.toUpperCase();
    const existente = this.salas.get(code);
    if (existente) return existente;
    const sala = new Sala({ ...config, code });
    this.salas.set(code, sala);
    return sala;
  }

  eliminar(code: string): void {
    const sala = this.salas.get(code.toUpperCase());
    sala?.mesa?.destruir();
    this.salas.delete(code.toUpperCase());
  }

  get cantidad(): number {
    return this.salas.size;
  }
}
