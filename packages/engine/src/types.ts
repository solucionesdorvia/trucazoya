/**
 * Tipos del motor: configuración de reglas, estado de partida, acciones y
 * eventos. El estado es la ÚNICA fuente de verdad; los clientes reciben una
 * proyección redactada (ver redact.ts).
 */

import type { Card } from './cards.js';

// ─── Configuración de reglas (por modalidad) ──────────────────────────────

export interface RuleConfig {
  /** Puntos para ganar la partida (15 o 30 típicamente). */
  pointsToWin: 15 | 30;
  /** Cantidad de jugadores: 2 (1v1) o 4 (2v2). */
  players: 2 | 4;
  /** Habilita el juego de la flor. */
  florEnabled: boolean;
  /**
   * "Falta envido" y "contraflor al resto": si true, valen los puntos que le
   * faltan al equipo en cabeza para ganar la partida.
   */
  faltaEnvidoToGame: boolean;
}

export const DEFAULT_RULES: RuleConfig = {
  pointsToWin: 30,
  players: 2,
  florEnabled: true,
  faltaEnvidoToGame: true,
};

export type TeamIndex = 0 | 1;

// ─── Cantos ───────────────────────────────────────────────────────────────

export type EnvidoVariant = 'ENVIDO' | 'REAL_ENVIDO' | 'FALTA_ENVIDO';
export type FlorVariant = 'FLOR' | 'CONTRAFLOR' | 'CONTRAFLOR_AL_RESTO';
/** Nivel del truco: 1=truco, 2=retruco, 3=vale cuatro. */
export type TrucoLevel = 0 | 1 | 2 | 3;

// ─── Acciones (intenciones que envían los jugadores) ──────────────────────

export type Action =
  | { type: 'PLAY_CARD'; seat: number; card: Card }
  | { type: 'CALL_ENVIDO'; seat: number; variant: EnvidoVariant }
  | { type: 'CALL_TRUCO'; seat: number }
  | { type: 'CALL_FLOR'; seat: number; variant: FlorVariant }
  | { type: 'RESPOND'; seat: number; response: 'QUIERO' | 'NO_QUIERO' }
  | { type: 'GO_TO_MAZO'; seat: number };

export type ActionType = Action['type'];

// ─── Eventos (lo que produce el motor por cada acción aplicada) ────────────

export type EngineEvent =
  | { type: 'ROUND_STARTED'; round: number; manoSeat: number; dealerSeat: number }
  | { type: 'CARDS_DEALT' }
  | { type: 'CARD_PLAYED'; seat: number; card: Card }
  | { type: 'ENVIDO_CALLED'; seat: number; variant: EnvidoVariant }
  | { type: 'FLOR_CALLED'; seat: number; variant: FlorVariant }
  | { type: 'TRUCO_CALLED'; seat: number; level: TrucoLevel }
  | { type: 'CALL_RESPONDED'; seat: number; response: 'QUIERO' | 'NO_QUIERO' }
  | {
      type: 'ENVIDO_RESOLVED';
      winnerTeam: TeamIndex;
      points: number;
      declarations: EnvidoDeclaration[];
    }
  | { type: 'FLOR_RESOLVED'; winnerTeam: TeamIndex; points: number }
  | { type: 'TRICK_RESOLVED'; trick: number; outcome: TrickOutcome; winnerSeat: number | null }
  | { type: 'WENT_TO_MAZO'; seat: number }
  | { type: 'ROUND_FINISHED'; winnerTeam: TeamIndex; trucoPoints: number; scores: [number, number] }
  | { type: 'MATCH_FINISHED'; winnerTeam: TeamIndex; scores: [number, number] };

export interface EnvidoDeclaration {
  seat: number;
  points: number;
}

/** Resultado de una baza: gana equipo 0, equipo 1, o parda. */
export type TrickOutcome = 'TEAM_0' | 'TEAM_1' | 'PARDA';

// ─── Estado ─────────────────────────────────────────────────────────────

export type Phase =
  | 'DEALING'
  | 'PLAYING' // esperando que el jugador de turno juegue carta o cante
  | 'ENVIDO_PENDING' // canto de envido esperando respuesta
  | 'FLOR_PENDING' // canto de flor/contraflor esperando respuesta
  | 'TRUCO_PENDING' // canto de truco esperando respuesta
  | 'ROUND_FINISHED'
  | 'MATCH_FINISHED';

export interface PlayerRef {
  seat: number;
  team: TeamIndex;
}

export interface EnvidoState {
  /** Nivel acumulado de puntos si se acepta (0 = no cantado). */
  pending: EnvidoVariant[];
  accepted: boolean;
  resolved: boolean;
  /** Puntos en juego calculados al momento de resolver. */
  stake: number;
  /** Asiento que hizo el último canto (a quién le toca responder al otro equipo). */
  lastCallerSeat: number | null;
}

export interface TrucoState {
  level: TrucoLevel; // 0 = no cantado
  accepted: boolean; // ¿el canto vigente fue querido?
  /** Equipo que tiene la "pelota" (puede recantar / debe responder). */
  lastCallerTeam: TeamIndex | null;
}

export interface FlorState {
  /** Asientos con flor en la mano actual. */
  seatsWithFlor: number[];
  contested: FlorVariant | null; // canto de flor vigente
  resolved: boolean;
  lastCallerSeat: number | null;
}

/** Un canto vigente que espera respuesta del equipo contrario. */
export interface PendingCall {
  kind: 'ENVIDO' | 'FLOR' | 'TRUCO';
  callerSeat: number;
  /** Fase a la que se vuelve si se responde. */
  resumePhase: 'PLAYING';
}

export interface RoundState {
  index: number;
  dealerSeat: number;
  manoSeat: number;
  /** Cartas originales repartidas (para envido/flor). */
  dealt: Record<number, Card[]>;
  /** Cartas aún en mano. */
  hands: Record<number, Card[]>;
  /** Bazas jugadas: cada baza es la lista de jugadas en orden. */
  tricks: Array<Array<{ seat: number; card: Card }>>;
  trickOutcomes: TrickOutcome[];
  currentTrick: number;
  turnSeat: number;
  leadSeat: number;
  envido: EnvidoState;
  truco: TrucoState;
  flor: FlorState;
  pendingCall: PendingCall | null;
  /** Asiento que se fue al mazo, si alguno. */
  mazoSeat: number | null;
  finished: boolean;
}

export interface MatchState {
  config: RuleConfig;
  players: PlayerRef[];
  scores: [number, number];
  phase: Phase;
  round: RoundState | null;
  roundCount: number;
  winner: TeamIndex | null;
  /** Secuencia monótona de eventos aplicados (para replay/sync). */
  seq: number;
}

// ─── Resultado de aplicar una acción ──────────────────────────────────────

export interface ApplyResult {
  state: MatchState;
  events: EngineEvent[];
}

export class IllegalActionError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = 'IllegalActionError';
  }
}
