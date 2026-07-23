/**
 * Reducer del motor: `applyAction(state, action) -> { state, events }`.
 *
 * Invariantes:
 * - El servidor es la única fuente de verdad. Toda acción se valida acá.
 * - Determinista y puro: no hay IO ni aleatoriedad.
 * - Idempotencia/atomicidad: cada acción produce un nuevo estado consistente
 *   o lanza IllegalActionError sin efectos parciales.
 */

import { cardsEqual, type Card } from './cards.js';
import { envidoPoints, florPoints } from './envido.js';
import { cloneMatch } from './state.js';
import { resolveRound, resolveTrick, teamOfSeat } from './tricks.js';
import {
  type Action,
  type EngineEvent,
  type EnvidoDeclaration,
  type EnvidoVariant,
  type FlorVariant,
  IllegalActionError,
  type MatchState,
  type RoundState,
  type TeamIndex,
  type TrucoLevel,
} from './types.js';

// ─── Helpers de puntaje de cantos ─────────────────────────────────────────

const ENVIDO_VALUE: Record<EnvidoVariant, number> = {
  ENVIDO: 2,
  REAL_ENVIDO: 3,
  FALTA_ENVIDO: 0, // se calcula dinámicamente
};

function faltaValue(state: MatchState): number {
  const leading = Math.max(state.scores[0], state.scores[1]);
  return Math.max(1, state.config.pointsToWin - leading);
}

/** Puntos del envido si se acepta (quiero). */
function envidoStakeIfAccepted(state: MatchState, pending: EnvidoVariant[]): number {
  if (pending.includes('FALTA_ENVIDO')) return faltaValue(state);
  return pending.reduce((acc, v) => acc + ENVIDO_VALUE[v], 0);
}

/** Puntos si se rechaza (no quiero): el canto anterior, mínimo 1. */
function envidoStakeIfDeclined(state: MatchState, pending: EnvidoVariant[]): number {
  const previous = pending.slice(0, -1);
  if (previous.length === 0) return 1;
  if (previous.includes('FALTA_ENVIDO')) return faltaValue(state);
  return Math.max(
    1,
    previous.reduce((acc, v) => acc + ENVIDO_VALUE[v], 0),
  );
}

/** Valor del truco si se juega hasta el final (cartas o mazo). */
function trucoPlayValue(round: RoundState): number {
  if (round.truco.accepted) return round.truco.level + 1; // truco=2, retruco=3, vale4=4
  return round.truco.level > 0 ? round.truco.level : 1;
}

/** Valor que gana el que cantó si el rival dice "no quiero" al truco. */
function trucoDeclineValue(level: TrucoLevel): number {
  return Math.max(1, level); // no quiero truco→1, retruco→2, vale4→3
}

// ─── Utilidades de turnos/equipos ─────────────────────────────────────────

function seatsOfTeam(state: MatchState, team: TeamIndex): number[] {
  return state.players.filter((p) => p.team === team).map((p) => p.seat);
}

function nextSeat(state: MatchState, seat: number): number {
  return (seat + 1) % state.config.players;
}

/** Mejor envido de un equipo (máximo entre sus integrantes). */
function teamEnvido(round: RoundState, seats: number[]): number {
  let best = 0;
  for (const seat of seats) best = Math.max(best, envidoPoints(round.dealt[seat] ?? []));
  return best;
}

// ─── Validación de acciones legales ───────────────────────────────────────

function envidoAllowed(state: MatchState, round: RoundState): boolean {
  if (round.envido.resolved) return false;
  // Con flor no hay envido.
  if (state.config.florEnabled && round.flor.seatsWithFlor.length > 0) return false;
  // Sólo durante la primera baza, antes de completarse.
  if (round.currentTrick !== 0) return false;
  const firstTrick = round.tricks[0] ?? [];
  return firstTrick.length < state.config.players;
}

function nextEnvidoVariants(pending: EnvidoVariant[]): EnvidoVariant[] {
  if (pending.length === 0) return ['ENVIDO', 'REAL_ENVIDO', 'FALTA_ENVIDO'];
  if (pending.includes('FALTA_ENVIDO')) return [];
  if (pending.includes('REAL_ENVIDO')) return ['FALTA_ENVIDO'];
  // Ya hay al menos un ENVIDO: se puede subir con envido/real/falta.
  return ['ENVIDO', 'REAL_ENVIDO', 'FALTA_ENVIDO'];
}

function canCallTruco(round: RoundState, team: TeamIndex): boolean {
  if (round.truco.level >= 3) return false;
  if (round.truco.level === 0) return true;
  // Sólo puede recantar el equipo contrario al último que cantó y aceptó.
  if (!round.truco.accepted) return false;
  return round.truco.lastCallerTeam !== team;
}

/**
 * Devuelve todas las acciones legales para el estado actual.
 * Base para bots, validación y la UI (los botones aparecen sólo si es legal).
 */
export function legalActions(state: MatchState): Action[] {
  const round = state.round;
  if (!round || state.phase === 'MATCH_FINISHED' || state.phase === 'ROUND_FINISHED') return [];
  const actions: Action[] = [];

  if (state.phase === 'PLAYING') {
    const seat = round.turnSeat;
    const team = teamOfSeat(seat);
    // Jugar cartas.
    for (const card of round.hands[seat] ?? []) actions.push({ type: 'PLAY_CARD', seat, card });
    // Irse al mazo.
    actions.push({ type: 'GO_TO_MAZO', seat });
    // Cantar truco.
    if (canCallTruco(round, team)) actions.push({ type: 'CALL_TRUCO', seat });
    // Cantar envido.
    if (envidoAllowed(state, round)) {
      for (const variant of nextEnvidoVariants(round.envido.pending)) {
        actions.push({ type: 'CALL_ENVIDO', seat, variant });
      }
    }
    // Cantar flor.
    if (
      state.config.florEnabled &&
      !round.flor.resolved &&
      round.currentTrick === 0 &&
      round.flor.seatsWithFlor.includes(seat)
    ) {
      actions.push({ type: 'CALL_FLOR', seat, variant: 'FLOR' });
    }
    return actions;
  }

  if (state.phase === 'ENVIDO_PENDING') {
    const callerTeam = teamOfSeat(round.envido.lastCallerSeat ?? round.turnSeat);
    const responderTeam: TeamIndex = callerTeam === 0 ? 1 : 0;
    for (const seat of seatsOfTeam(state, responderTeam)) {
      actions.push({ type: 'RESPOND', seat, response: 'QUIERO' });
      actions.push({ type: 'RESPOND', seat, response: 'NO_QUIERO' });
      for (const variant of nextEnvidoVariants(round.envido.pending)) {
        actions.push({ type: 'CALL_ENVIDO', seat, variant });
      }
    }
    return actions;
  }

  if (state.phase === 'TRUCO_PENDING') {
    const callerTeam = round.truco.lastCallerTeam as TeamIndex;
    const responderTeam: TeamIndex = callerTeam === 0 ? 1 : 0;
    for (const seat of seatsOfTeam(state, responderTeam)) {
      actions.push({ type: 'RESPOND', seat, response: 'QUIERO' });
      actions.push({ type: 'RESPOND', seat, response: 'NO_QUIERO' });
      if (round.truco.level < 3) actions.push({ type: 'CALL_TRUCO', seat });
    }
    return actions;
  }

  if (state.phase === 'FLOR_PENDING') {
    const callerTeam = teamOfSeat(round.flor.lastCallerSeat ?? round.turnSeat);
    const responderTeam: TeamIndex = callerTeam === 0 ? 1 : 0;
    for (const seat of seatsOfTeam(state, responderTeam)) {
      if (!round.flor.seatsWithFlor.includes(seat)) continue;
      actions.push({ type: 'RESPOND', seat, response: 'QUIERO' });
      actions.push({ type: 'RESPOND', seat, response: 'NO_QUIERO' });
      actions.push({ type: 'CALL_FLOR', seat, variant: 'CONTRAFLOR' });
      actions.push({ type: 'CALL_FLOR', seat, variant: 'CONTRAFLOR_AL_RESTO' });
    }
    return actions;
  }

  return actions;
}

function assertLegal(state: MatchState, action: Action): void {
  const legal = legalActions(state);
  const ok = legal.some((a) => actionsMatch(a, action));
  if (!ok) {
    throw new IllegalActionError(
      `Acción ilegal ${action.type} (asiento ${action.seat}) en fase ${state.phase}`,
    );
  }
}

function actionsMatch(a: Action, b: Action): boolean {
  if (a.type !== b.type || a.seat !== b.seat) return false;
  if (a.type === 'PLAY_CARD' && b.type === 'PLAY_CARD') return cardsEqual(a.card, b.card);
  if (a.type === 'CALL_ENVIDO' && b.type === 'CALL_ENVIDO') return a.variant === b.variant;
  if (a.type === 'CALL_FLOR' && b.type === 'CALL_FLOR') return a.variant === b.variant;
  if (a.type === 'RESPOND' && b.type === 'RESPOND') return a.response === b.response;
  return true;
}

// ─── Aplicación de acciones ──────────────────────────────────────────────

export function applyAction(
  input: MatchState,
  action: Action,
): { state: MatchState; events: EngineEvent[] } {
  assertLegal(input, action);
  const state = cloneMatch(input);
  const round = state.round as RoundState;
  const events: EngineEvent[] = [];

  switch (action.type) {
    case 'PLAY_CARD':
      playCard(state, round, action.card, events);
      break;
    case 'GO_TO_MAZO':
      goToMazo(state, round, action.seat, events);
      break;
    case 'CALL_TRUCO':
      callTruco(state, round, action.seat, events);
      break;
    case 'CALL_ENVIDO':
      callEnvido(state, round, action.seat, action.variant, events);
      break;
    case 'CALL_FLOR':
      callFlor(state, round, action.seat, action.variant, events);
      break;
    case 'RESPOND':
      respond(state, round, action.seat, action.response, events);
      break;
  }

  state.seq += events.length;
  return { state, events };
}

// ─── Transiciones ─────────────────────────────────────────────────────────

function playCard(state: MatchState, round: RoundState, card: Card, events: EngineEvent[]): void {
  const seat = round.turnSeat;
  const hand = round.hands[seat] ?? [];
  const idx = hand.findIndex((c) => cardsEqual(c, card));
  hand.splice(idx, 1);
  const trick = round.tricks[round.currentTrick] as Array<{ seat: number; card: Card }>;
  trick.push({ seat, card });
  events.push({ type: 'CARD_PLAYED', seat, card });

  if (trick.length < state.config.players) {
    round.turnSeat = nextSeat(state, seat);
    return;
  }

  // Baza completa: resolver.
  const { outcome, winnerSeat } = resolveTrick(trick);
  round.trickOutcomes.push(outcome);
  events.push({ type: 'TRICK_RESOLVED', trick: round.currentTrick, outcome, winnerSeat });

  const manoTeam = teamOfSeat(round.manoSeat);
  const roundWinner = resolveRound(round.trickOutcomes, manoTeam);
  if (roundWinner !== null) {
    finishRound(state, round, roundWinner, trucoPlayValue(round), events);
    return;
  }

  // Siguiente baza.
  round.currentTrick += 1;
  round.tricks.push([]);
  round.leadSeat = winnerSeat ?? round.leadSeat; // parda: mantiene el que salió
  round.turnSeat = round.leadSeat;
}

function goToMazo(state: MatchState, round: RoundState, seat: number, events: EngineEvent[]): void {
  round.mazoSeat = seat;
  events.push({ type: 'WENT_TO_MAZO', seat });
  const winnerTeam: TeamIndex = teamOfSeat(seat) === 0 ? 1 : 0;
  finishRound(state, round, winnerTeam, trucoPlayValue(round), events);
}

function callTruco(
  state: MatchState,
  round: RoundState,
  seat: number,
  events: EngineEvent[],
): void {
  round.truco.level = (round.truco.level + 1) as TrucoLevel;
  round.truco.accepted = false;
  round.truco.lastCallerTeam = teamOfSeat(seat);
  events.push({ type: 'TRUCO_CALLED', seat, level: round.truco.level });
  state.phase = 'TRUCO_PENDING';
}

function callEnvido(
  state: MatchState,
  round: RoundState,
  seat: number,
  variant: EnvidoVariant,
  events: EngineEvent[],
): void {
  round.envido.pending.push(variant);
  round.envido.lastCallerSeat = seat;
  events.push({ type: 'ENVIDO_CALLED', seat, variant });
  state.phase = 'ENVIDO_PENDING';
}

function callFlor(
  state: MatchState,
  round: RoundState,
  seat: number,
  variant: FlorVariant,
  events: EngineEvent[],
): void {
  events.push({ type: 'FLOR_CALLED', seat, variant });
  const myTeam = teamOfSeat(seat);
  const opponentHasFlor = round.flor.seatsWithFlor.some((s) => teamOfSeat(s) !== myTeam);

  if (variant === 'FLOR') {
    if (!opponentHasFlor) {
      resolveFlor(state, round, myTeam, 3, events);
      return;
    }
    // El rival tiene flor: queda pendiente el "contra".
    round.flor.contested = 'FLOR';
    round.flor.lastCallerSeat = seat;
    state.phase = 'FLOR_PENDING';
    return;
  }

  // Contraflor / contraflor al resto (subida).
  round.flor.contested = variant;
  round.flor.lastCallerSeat = seat;
  state.phase = 'FLOR_PENDING';
}

function respond(
  state: MatchState,
  round: RoundState,
  seat: number,
  response: 'QUIERO' | 'NO_QUIERO',
  events: EngineEvent[],
): void {
  events.push({ type: 'CALL_RESPONDED', seat, response });
  if (state.phase === 'ENVIDO_PENDING') {
    respondEnvido(state, round, response, events);
  } else if (state.phase === 'TRUCO_PENDING') {
    respondTruco(state, round, seat, response, events);
  } else if (state.phase === 'FLOR_PENDING') {
    respondFlor(state, round, response, events);
  }
}

function respondEnvido(
  state: MatchState,
  round: RoundState,
  response: 'QUIERO' | 'NO_QUIERO',
  events: EngineEvent[],
): void {
  const callerTeam = teamOfSeat(round.envido.lastCallerSeat as number);
  if (response === 'NO_QUIERO') {
    const stake = envidoStakeIfDeclined(state, round.envido.pending);
    round.envido.resolved = true;
    events.push({
      type: 'ENVIDO_RESOLVED',
      winnerTeam: callerTeam,
      points: stake,
      declarations: [],
    });
    addScore(state, callerTeam, stake);
    state.phase = 'PLAYING';
    maybeEndMatch(state, events);
    return;
  }

  // Quiero: gana el mayor tanto; empate ⇒ equipo mano.
  const stake = envidoStakeIfAccepted(state, round.envido.pending);
  const declarations = declareEnvido(state, round);
  const winnerTeam = envidoWinner(state, round);
  round.envido.accepted = true;
  round.envido.resolved = true;
  round.envido.stake = stake;
  events.push({ type: 'ENVIDO_RESOLVED', winnerTeam, points: stake, declarations });
  addScore(state, winnerTeam, stake);
  state.phase = 'PLAYING';
  maybeEndMatch(state, events);
}

function declareEnvido(state: MatchState, round: RoundState): EnvidoDeclaration[] {
  const out: EnvidoDeclaration[] = [];
  // Se declaran desde la mano hacia adelante.
  for (let i = 0; i < state.config.players; i++) {
    const seat = (round.manoSeat + i) % state.config.players;
    out.push({ seat, points: envidoPoints(round.dealt[seat] ?? []) });
  }
  return out;
}

function envidoWinner(state: MatchState, round: RoundState): TeamIndex {
  const t0 = teamEnvido(round, seatsOfTeam(state, 0));
  const t1 = teamEnvido(round, seatsOfTeam(state, 1));
  if (t0 > t1) return 0;
  if (t1 > t0) return 1;
  // Empate: gana el equipo con el asiento más cercano a la mano.
  for (let i = 0; i < state.config.players; i++) {
    const seat = (round.manoSeat + i) % state.config.players;
    if (envidoPoints(round.dealt[seat] ?? []) === Math.max(t0, t1)) return teamOfSeat(seat);
  }
  return teamOfSeat(round.manoSeat);
}

function respondTruco(
  state: MatchState,
  round: RoundState,
  seat: number,
  response: 'QUIERO' | 'NO_QUIERO',
  events: EngineEvent[],
): void {
  if (response === 'NO_QUIERO') {
    const callerTeam = round.truco.lastCallerTeam as TeamIndex;
    const points = trucoDeclineValue(round.truco.level);
    finishRound(state, round, callerTeam, points, events);
    return;
  }
  round.truco.accepted = true;
  round.truco.lastCallerTeam = teamOfSeat(seat) === 0 ? 1 : 0; // el que aceptó pasa a ser el "dueño"
  state.phase = 'PLAYING';
}

function respondFlor(
  state: MatchState,
  round: RoundState,
  response: 'QUIERO' | 'NO_QUIERO',
  events: EngineEvent[],
): void {
  const contested = round.flor.contested;
  const callerTeam = teamOfSeat(round.flor.lastCallerSeat as number);
  if (contested === 'FLOR') {
    // Ambos tienen flor, "con flor son": gana la más alta, 3 tantos.
    const winner = florWinner(state, round);
    resolveFlor(state, round, winner, 3, events);
    return;
  }

  // Contraflor / al resto.
  if (response === 'NO_QUIERO') {
    // El que cantó el "contra" gana 3.
    resolveFlor(state, round, callerTeam, 3, events);
    return;
  }
  const winner = florWinner(state, round);
  const points =
    contested === 'CONTRAFLOR_AL_RESTO' && state.config.faltaEnvidoToGame ? faltaValue(state) : 6;
  resolveFlor(state, round, winner, points, events);
}

function florWinner(state: MatchState, round: RoundState): TeamIndex {
  let best = -1;
  let winner: TeamIndex = teamOfSeat(round.manoSeat);
  for (let i = 0; i < state.config.players; i++) {
    const seat = (round.manoSeat + i) % state.config.players;
    const fp = florPoints(round.dealt[seat] ?? []);
    if (fp > best) {
      best = fp;
      winner = teamOfSeat(seat);
    }
  }
  return winner;
}

function resolveFlor(
  state: MatchState,
  round: RoundState,
  winnerTeam: TeamIndex,
  points: number,
  events: EngineEvent[],
): void {
  round.flor.resolved = true;
  round.flor.contested = null;
  events.push({ type: 'FLOR_RESOLVED', winnerTeam, points });
  addScore(state, winnerTeam, points);
  state.phase = 'PLAYING';
  maybeEndMatch(state, events);
}

// ─── Fin de ronda / partida ────────────────────────────────────────────────

function finishRound(
  state: MatchState,
  round: RoundState,
  winnerTeam: TeamIndex,
  trucoPoints: number,
  events: EngineEvent[],
): void {
  round.finished = true;
  addScore(state, winnerTeam, trucoPoints);
  events.push({
    type: 'ROUND_FINISHED',
    winnerTeam,
    trucoPoints,
    scores: [state.scores[0], state.scores[1]],
  });
  if (!maybeEndMatch(state, events)) {
    state.phase = 'ROUND_FINISHED';
  }
}

function addScore(state: MatchState, team: TeamIndex, points: number): void {
  state.scores[team] += points;
}

/** Si algún equipo alcanzó el objetivo, termina la partida. Devuelve true si terminó. */
function maybeEndMatch(state: MatchState, events: EngineEvent[]): boolean {
  const target = state.config.pointsToWin;
  if (state.scores[0] >= target || state.scores[1] >= target) {
    const winner: TeamIndex = state.scores[0] >= state.scores[1] ? 0 : 1;
    state.winner = winner;
    state.phase = 'MATCH_FINISHED';
    events.push({
      type: 'MATCH_FINISHED',
      winnerTeam: winner,
      scores: [state.scores[0], state.scores[1]],
    });
    return true;
  }
  return false;
}
