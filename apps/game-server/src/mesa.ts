/**
 * Mesa: orquesta UNA partida. Es el dueño del estado autoritativo.
 *
 * Reglas de oro:
 * - El estado vive acá; el cliente sólo recibe `redactStateFor(seat)`.
 * - Toda acción entrante se valida contra el motor antes de aplicarse.
 * - Cada acción aplicada se persiste como GameEvent secuenciado (replay/auditoría).
 */

import {
  applyAction,
  chooseAction,
  commitDeSemilla,
  createMatch,
  cryptoRandomInt,
  deal,
  fullDeck,
  legalActions,
  nuevaSemilla,
  randomIntDeSemilla,
  redactStateFor,
  shuffle,
  startRound,
  type Action,
  type BotLevel,
  type EngineEvent,
  type MatchState,
  type PlayerView,
  type RuleConfig,
} from '@trucazo/engine';

export interface JugadorMesa {
  seat: number;
  userId: string;
  username: string;
  isBot: boolean;
  botLevel?: BotLevel;
  conectado: boolean;
}

export interface EventoPersistible {
  seq: number;
  type: string;
  payload: unknown;
}

type Emisor = (userId: string, evento: string, datos: unknown) => void;

/** Registro de un reparto para auditoría (commit-reveal). */
export interface RepartoAuditable {
  roundNumber: number;
  commit: string;
  serverSeed: string;
  deckOrder: string[];
}

export class Mesa {
  state: MatchState;
  readonly jugadores: JugadorMesa[];
  /** Acciones ya aplicadas: dedup por actionId (idempotencia ante reintentos). */
  private readonly aplicadas = new Set<string>();
  private readonly pendientesPersistir: EventoPersistible[] = [];
  /** Compromisos de barajado (commit-reveal) pendientes de volcar a la base. */
  private readonly repartosPendientes: RepartoAuditable[] = [];
  private timerBot: NodeJS.Timeout | null = null;

  constructor(
    readonly id: string,
    config: RuleConfig,
    jugadores: JugadorMesa[],
    private readonly emitir: Emisor,
  ) {
    this.jugadores = jugadores;
    this.state = createMatch(config);
    this.repartirNuevaRonda();
    // Si el primero en jugar es un bot, hay que darle cuerda: `avanzar` sólo se
    // dispara después de una acción, así que sin esto la partida se colgaría
    // esperando a un bot que nunca arranca.
    this.avanzar();
  }

  // ─── Ciclo de ronda ─────────────────────────────────────────────────────

  /**
   * Baraja con una semilla auditable (commit-reveal) y arranca una ronda. Se
   * publica el `commit` (hash de la semilla) antes de jugar y se guarda la
   * semilla para revelarla después: cualquiera puede recomputar el mazo y
   * verificar que el reparto no se manipuló. El motor nunca baraja por sí mismo.
   */
  private repartirNuevaRonda(): void {
    const semilla = nuevaSemilla();
    const commit = commitDeSemilla(semilla);
    const mazo = shuffle(fullDeck(), randomIntDeSemilla(semilla));
    const manos = deal(mazo, this.state.config.players, 3);
    this.state = startRound(this.state, manos);

    const ronda = this.state.roundCount;
    this.repartosPendientes.push({
      roundNumber: ronda,
      commit,
      serverSeed: semilla,
      deckOrder: mazo.map((c) => `${c.rank}${c.suit[0]}`),
    });
    // El commit viaja en el evento (queda en el log público); la semilla NO se
    // emite hasta la revelación, que hace el panel de auditoría al cerrar la ronda.
    this.registrar({ type: 'ROUND_STARTED', payload: { round: ronda, commit } });
  }

  /** Retira los compromisos de barajado pendientes para persistirlos. */
  drenarRepartos(): RepartoAuditable[] {
    return this.repartosPendientes.splice(0, this.repartosPendientes.length);
  }

  // ─── Acciones ───────────────────────────────────────────────────────────

  /**
   * Aplica una acción de un jugador. Devuelve un motivo de rechazo, o null si
   * se aplicó bien. Idempotente: repetir el mismo actionId no hace nada.
   */
  aplicar(userId: string, action: Action, actionId: string): string | null {
    if (this.aplicadas.has(actionId)) return null; // reintento: ya aplicada

    const jugador = this.jugadores.find((j) => j.userId === userId);
    if (!jugador) return 'No sos jugador de esta partida';
    // El asiento lo decide el SERVIDOR, no el cliente.
    if (action.seat !== jugador.seat) return 'Asiento inválido';

    let resultado;
    try {
      resultado = applyAction(this.state, action);
    } catch (e) {
      return e instanceof Error ? e.message : 'Acción ilegal';
    }

    this.aplicadas.add(actionId);
    this.state = resultado.state;
    for (const ev of resultado.events) {
      this.registrar({ type: ev.type, payload: ev });
    }
    this.difundir(resultado.events);
    this.avanzar();
    return null;
  }

  /**
   * Avanza el estado automático: reparte la ronda siguiente y hace jugar a los
   * bots. Se llama después de cada acción.
   */
  private avanzar(): void {
    if (this.state.phase === 'MATCH_FINISHED') return;

    if (this.state.phase === 'ROUND_FINISHED') {
      // Pequeña pausa para que el cliente muestre el resultado de la ronda.
      this.programar(1200, () => {
        this.repartirNuevaRonda();
        this.difundir([]);
        this.avanzar();
      });
      return;
    }

    // ¿Le toca a un bot?
    const seatEnTurno = this.asientoEnTurno();
    if (seatEnTurno === null) return;
    const jugador = this.jugadores.find((j) => j.seat === seatEnTurno);
    if (!jugador?.isBot) return;

    this.programar(700 + cryptoRandomInt(600), () => {
      const accion = chooseAction(jugador.botLevel ?? 'intermedio', {
        state: this.state,
        seat: jugador.seat,
        rand: cryptoRandomInt,
      });
      this.aplicar(jugador.userId, accion, `bot:${this.state.seq}:${jugador.seat}`);
    });
  }

  /** Asiento que debe actuar ahora (según las acciones legales del motor). */
  asientoEnTurno(): number | null {
    const legales = legalActions(this.state);
    return legales[0]?.seat ?? null;
  }

  private programar(ms: number, fn: () => void): void {
    if (this.timerBot) clearTimeout(this.timerBot);
    this.timerBot = setTimeout(() => {
      this.timerBot = null;
      try {
        fn();
      } catch (e) {
        console.error(`[mesa ${this.id}] error en avance automático`, e);
      }
    }, ms);
  }

  // ─── Difusión ───────────────────────────────────────────────────────────

  /** Envía a CADA jugador su vista redactada. Nunca cartas ajenas. */
  difundir(eventos: EngineEvent[]): void {
    for (const j of this.jugadores) {
      if (j.isBot) continue;
      this.emitir(j.userId, 'partida:estado', {
        matchId: this.id,
        seq: this.state.seq,
        vista: this.vistaPara(j.seat),
        eventos,
      });
    }
  }

  vistaPara(seat: number): PlayerView & { legales: Action[] } {
    const vista = redactStateFor(this.state, seat);
    // Sólo mandamos las acciones legales del propio asiento: la UI no puede
    // inventar botones y el servidor igual revalida todo.
    const legales = legalActions(this.state).filter((a) => a.seat === seat);
    return { ...vista, legales };
  }

  marcarConexion(userId: string, conectado: boolean): void {
    const j = this.jugadores.find((x) => x.userId === userId);
    if (j) j.conectado = conectado;
  }

  get terminada(): boolean {
    return this.state.phase === 'MATCH_FINISHED';
  }

  /** Eventos aún no volcados a la base. */
  drenarEventos(): EventoPersistible[] {
    return this.pendientesPersistir.splice(0, this.pendientesPersistir.length);
  }

  private registrar(ev: { type: string; payload: unknown }): void {
    this.pendientesPersistir.push({ seq: this.state.seq, type: ev.type, payload: ev.payload });
  }

  destruir(): void {
    if (this.timerBot) clearTimeout(this.timerBot);
    this.timerBot = null;
  }
}
