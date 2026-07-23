/**
 * Contratos tipados de eventos de tiempo real (Socket.IO). Cada evento tiene un
 * payload tipado y un número de secuencia por partida para detección de huecos,
 * deduplicación y reconexión. Nunca se envían datos privados a canales públicos.
 */

import type { Action, EngineEvent, PlayerView } from '@trucazo/engine';

/** Sobre común: todo evento de partida lleva secuencia y timestamp. */
export interface Envelope<T> {
  seq: number;
  ts: number;
  matchId: string;
  payload: T;
}

// ─── Cliente → Servidor ───────────────────────────────────────────────────

export interface ClientToServer {
  'room.join': (data: { roomId: string; password?: string }) => void;
  'room.leave': (data: { roomId: string }) => void;
  'player.ready': (data: { roomId: string; ready: boolean }) => void;
  /** Intención de acción de juego. El servidor valida y responde con estado. */
  'action.request': (data: { matchId: string; action: Action; actionId: string }) => void;
  /** Pide un snapshot completo (reconexión / hueco de secuencia). */
  'match.sync': (data: { matchId: string; fromSeq: number }) => void;
  'chat.send': (data: { roomId: string; text: string }) => void;
}

// ─── Servidor → Cliente ───────────────────────────────────────────────────

export interface ServerToClient {
  'room.updated': (data: RoomSnapshot) => void;
  'match.started': (data: { matchId: string; seat: number }) => void;
  /** Vista redactada del jugador (nunca contiene cartas ajenas). */
  'match.state': (data: Envelope<PlayerView>) => void;
  /** Eventos de juego para animaciones/feedback (ya redactados). */
  'match.event': (data: Envelope<EngineEvent>) => void;
  'action.rejected': (data: { actionId: string; reason: string }) => void;
  'player.disconnected': (data: { matchId: string; seat: number }) => void;
  'player.reconnected': (data: { matchId: string; seat: number }) => void;
  'chat.message': (data: { roomId: string; from: string; text: string; ts: number }) => void;
  error: (data: { code: string; message: string }) => void;
}

export interface RoomSnapshot {
  id: string;
  code: string;
  state: string;
  name: string;
  participants: Array<{
    userId: string;
    username: string;
    seat: number | null;
    team: 0 | 1 | null;
    ready: boolean;
    connected: boolean;
    isBot: boolean;
  }>;
  config: {
    mode: string;
    pointsToWin: number;
    florEnabled: boolean;
    betAmount: number;
    allowSpectators: boolean;
  };
  hostUserId: string;
}

/** Datos que el handshake del socket lleva en el JWT corto de partida. */
export interface GameTokenClaims {
  userId: string;
  username: string;
  matchId: string;
  seat: number;
  exp: number;
}
