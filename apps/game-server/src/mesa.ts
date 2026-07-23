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
  createMatch,
  cryptoRandomInt,
  deal,
  fullDeck,
  legalActions,
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

export class Mesa {
  state: MatchState;
  readonly jugadores: JugadorMesa[];
  /** Acciones ya aplicadas: dedup por actionId (idempotencia ante reintentos). */
  private readonly aplicadas = new Set<string>();
  private readonly pendientesPersistir: EventoPersistible[] = [];
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

  /** Baraja con CSPRNG y arranca una ronda. El motor nunca baraja por sí mismo. */
  private repartirNuevaRonda(): void {
    const manos = deal(shuffle(fullDeck(), cryptoRandomInt), this.state.config.players, 3);
    this.state = startRound(this.state, manos);
    this.registrar({ type: 'ROUND_STARTED', payload: { round: this.state.roundCount } });
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
