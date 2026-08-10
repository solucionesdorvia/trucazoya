/**
 * Game server de Trucazo: Fastify (health) + Socket.IO (partidas en vivo).
 *
 * Seguridad:
 * - El handshake exige un token firmado por la web (HMAC). El servidor NUNCA
 *   confía en el userId que manda el cliente.
 * - El asiento lo asigna y valida el servidor.
 * - Cada cliente recibe sólo su vista redactada.
 */

import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { Server as SocketServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { prisma } from '@trucazo/db';
import { generarCodigoSala, verificarTokenPartida } from '@trucazo/shared';
import {
  aplicarRanking,
  liquidarApuesta,
  otorgarRecompensas,
  reembolsarApuesta,
  reservarApuesta,
} from '@trucazo/economia';
import { cryptoRandomInt, type Action } from '@trucazo/engine';
import { RegistroSalas, type ConfigSala, type Sala } from './salas.js';
import { Matchmaker } from './matchmaking.js';
import type { GameMode } from '@trucazo/db';

export interface OpcionesServidor {
  puerto?: number;
  secreto?: string;
  webUrl?: string;
}

/**
 * Construye el servidor. Se exporta para poder levantarlo en tests sobre un
 * puerto efímero sin tocar el proceso global.
 */
export function crearServidor(opciones: OpcionesServidor = {}) {
  const PORT = opciones.puerto ?? Number(process.env.GAME_SERVER_PORT ?? 4000);
  const WEB_URL = opciones.webUrl ?? process.env.WEB_URL ?? 'http://localhost:3000';
  const SECRET = opciones.secreto ?? process.env.GAME_TOKEN_SECRET ?? '';

  if (!SECRET) {
    throw new Error('Falta GAME_TOKEN_SECRET: el servidor no arranca sin secreto de firma.');
  }

  const app = Fastify({ logger: false });
  const registro = new RegistroSalas();
  const matchmaker = new Matchmaker();

  // Contadores acumulados desde el arranque (observabilidad / capacity).
  const metricas = {
    partidasArrancadas: 0,
    accionesAplicadas: 0,
    accionesRechazadas: 0,
    conexiones: 0,
    desconexiones: 0,
  };

  app.get('/salud', async () => ({
    ok: true,
    salas: registro.cantidad,
    uptime: Math.round(process.uptime()),
  }));

  // Métricas operativas en JSON (scrapeable por un dashboard o un cron).
  app.get('/metricas', async () => ({
    uptime: Math.round(process.uptime()),
    salasActivas: registro.cantidad,
    socketsConectados: io.engine.clientsCount,
    usuariosConectados: socketsPorUsuario.size,
    enColaMatchmaking: matchmaker.totalEnCola(),
    ...metricas,
    memoriaMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
  }));

  const server = app.server;
  const io = new SocketServer(server, {
    cors: { origin: [WEB_URL, /^http:\/\/localhost:\d+$/], credentials: true },
    // Reconexión: el cliente reintenta y recupera estado con `partida:sync`.
    pingTimeout: 20000,
    pingInterval: 10000,
  });

  // userId -> sockets (un usuario puede tener varias pestañas)
  const socketsPorUsuario = new Map<string, Set<string>>();

  function emitirAUsuario(userId: string, evento: string, datos: unknown): void {
    const ids = socketsPorUsuario.get(userId);
    if (!ids) return;
    for (const sid of ids) io.to(sid).emit(evento, datos);
  }

  function normalizarModo(mode: string): GameMode {
    const modos: GameMode[] = ['CASUAL_1V1', 'RANKED_1V1', 'CASUAL_2V2', 'RANKED_2V2'];
    return modos.includes(mode as GameMode) ? (mode as GameMode) : 'CASUAL_1V1';
  }

  // ─── Autenticación del handshake ────────────────────────────────────────────

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string') return next(new Error('Falta token'));
    const claims = verificarTokenPartida(token, SECRET);
    if (!claims) return next(new Error('Token inválido o vencido'));
    socket.data.userId = claims.userId;
    socket.data.username = claims.username;
    next();
  });

  // ─── Carga de sala desde la base ────────────────────────────────────────────

  // Cargas en vuelo: si dos jugadores entran a la vez, comparten la MISMA promesa
  // en lugar de consultar la base dos veces y competir por crear la sala.
  const cargasEnVuelo = new Map<string, Promise<Sala | undefined>>();

  function cargarSala(code: string): Promise<Sala | undefined> {
    const clave = code.toUpperCase();
    const enMemoria = registro.obtener(clave);
    if (enMemoria) return Promise.resolve(enMemoria);

    const enVuelo = cargasEnVuelo.get(clave);
    if (enVuelo) return enVuelo;

    const promesa = cargarSalaDesdeBase(clave).finally(() => cargasEnVuelo.delete(clave));
    cargasEnVuelo.set(clave, promesa);
    return promesa;
  }

  async function cargarSalaDesdeBase(code: string): Promise<Sala | undefined> {
    const room = await prisma.room.findUnique({ where: { code: code.toUpperCase() } });
    if (!room) return undefined;

    const config: ConfigSala = {
      nombre: room.name,
      code: room.code,
      roomId: room.id,
      hostUserId: room.hostUserId,
      apuesta: Number(room.betAmount),
      permiteBots: room.allowBots,
      modo: room.mode,
      players: room.mode.includes('2V2') ? 4 : 2,
      pointsToWin: room.pointsToWin === 15 ? 15 : 30,
      florEnabled: room.florEnabled,
      faltaEnvidoToGame: true,
    };
    return registro.crear(config);
  }

  // ─── Persistencia del event log ─────────────────────────────────────────────

  async function volcarEventos(matchId: string, sala: ReturnType<RegistroSalas['obtener']>) {
    const mesa = sala?.mesa;
    if (!mesa) return;
    const eventos = mesa.drenarEventos();
    if (eventos.length > 0) {
      try {
        await prisma.gameEvent.createMany({
          data: eventos.map((e) => ({
            matchId,
            seq: e.seq,
            type: e.type,
            payload: JSON.parse(JSON.stringify(e.payload)),
          })),
          skipDuplicates: true,
        });
      } catch (e) {
        console.error('[persistencia] no se pudieron guardar eventos', e);
      }
    }

    // Compromisos de barajado (commit-reveal): quedan como registro auditable
    // e inmutable de que el reparto no se manipuló.
    const repartos = mesa.drenarRepartos();
    if (repartos.length > 0) {
      try {
        await prisma.shuffleCommit.createMany({
          data: repartos.map((r) => ({
            matchId,
            roundNumber: r.roundNumber,
            commit: r.commit,
            serverSeed: r.serverSeed,
            deckOrder: r.deckOrder,
          })),
          skipDuplicates: true,
        });
      } catch (e) {
        console.error('[persistencia] no se pudieron guardar compromisos de barajado', e);
      }
    }
  }

  // ─── Conexión ───────────────────────────────────────────────────────────────

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    const username = socket.data.username as string;
    metricas.conexiones++;

    const set = socketsPorUsuario.get(userId) ?? new Set();
    set.add(socket.id);
    socketsPorUsuario.set(userId, set);

    let codeActual: string | null = null;

    // ── Entrar a una sala ────────────────────────────────────────────────
    socket.on('sala:entrar', async ({ code }: { code: string }) => {
      const sala = await cargarSala(code);
      if (!sala) return socket.emit('error:app', { mensaje: 'Esa sala no existe' });

      if (
        sala.estado === 'ESPERANDO' &&
        sala.llena &&
        !sala.participantes.some((p) => p.userId === userId)
      ) {
        return socket.emit('error:app', { mensaje: 'La sala está llena' });
      }

      sala.entrar(userId, username);
      sala.mesa?.marcarConexion(userId, true);
      codeActual = sala.config.code;
      // Al reconectar el socket es NUEVO, así que `codeActual` todavía no
      // estaba asignado: se cancelaba con '' y el rival seguía viendo el
      // contador de ausencia de alguien que ya había vuelto.
      cancelarEsperaAusencia(codeActual, userId);
      socket.join(`sala:${codeActual}`);

      io.to(`sala:${codeActual}`).emit('sala:estado', sala.snapshot());

      // Reconexión a una partida en curso: se le manda su vista al toque.
      const jugador = sala.mesa?.jugadores.find((j) => j.userId === userId);
      if (sala.mesa && jugador) {
        socket.emit('partida:estado', {
          matchId: sala.mesa.id,
          seq: sala.mesa.state.seq,
          vista: sala.mesa.vistaPara(jugador.seat),
          eventos: [],
        });
      }
    });

    // ── Marcar listo ─────────────────────────────────────────────────────
    socket.on('sala:listo', async ({ listo }: { listo: boolean }) => {
      if (!codeActual) return;
      const sala = registro.obtener(codeActual);
      if (!sala || sala.estado !== 'ESPERANDO') return;

      sala.marcarListo(userId, listo);

      // El anfitrión puede completar con bots si la sala lo permite.
      if (sala.config.permiteBots && listo && sala.config.hostUserId === userId) {
        sala.agregarBots();
      }

      io.to(`sala:${codeActual}`).emit('sala:estado', sala.snapshot());

      if (sala.puedeArrancar()) {
        await arrancarPartida(sala, codeActual);
      }
    });

    // ── Revancha ─────────────────────────────────────────────────────────
    // Al terminar una partida el jugador quedaba expulsado al inicio; acá la
    // sala se recicla con los mismos jugadores y config, y arranca cuando los
    // dos piden revancha (el mismo camino que el ready-check).
    socket.on('sala:revancha', async () => {
      if (!codeActual) return;
      const sala = registro.obtener(codeActual);
      // Al primer pedido la sala pasa a ESPERANDO, así que el segundo jugador
      // también tiene que poder pedirla: se aceptan ambos estados.
      if (!sala || (sala.estado !== 'TERMINADA' && sala.estado !== 'ESPERANDO')) return;

      if (sala.estado === 'TERMINADA') {
        sala.estado = 'ESPERANDO';
        sala.mesa = null;
        sala.betId = null;
        for (const p of sala.participantes) p.listo = false;
      }
      const yo = sala.participantes.find((p) => p.userId === userId);
      if (yo) yo.listo = true;

      io.to(`sala:${codeActual}`).emit('sala:revancha:pedida', { userId });
      io.to(`sala:${codeActual}`).emit('sala:estado', sala.snapshot());

      if (sala.puedeArrancar()) await arrancarPartida(sala, codeActual);
    });

    // ── Acción de juego ──────────────────────────────────────────────────
    socket.on(
      'partida:accion',
      async ({ action, actionId }: { action: Action; actionId: string }) => {
        if (!codeActual) return;
        const sala = registro.obtener(codeActual);
        const mesa = sala?.mesa;
        if (!mesa) return socket.emit('error:app', { mensaje: 'No hay partida en curso' });

        const rechazo = mesa.aplicar(userId, action, actionId);
        if (rechazo) {
          metricas.accionesRechazadas++;
          return socket.emit('accion:rechazada', { actionId, motivo: rechazo });
        }
        metricas.accionesAplicadas++;

        await volcarEventos(mesa.id, sala);
        if (mesa.terminada) await finalizarPartida(sala, codeActual);
      },
    );

    // ── Pedir estado (reconexión / hueco de secuencia) ───────────────────
    socket.on('partida:sync', () => {
      if (!codeActual) return;
      const mesa = registro.obtener(codeActual)?.mesa;
      const jugador = mesa?.jugadores.find((j) => j.userId === userId);
      if (!mesa || !jugador) return;
      socket.emit('partida:estado', {
        matchId: mesa.id,
        seq: mesa.state.seq,
        vista: mesa.vistaPara(jugador.seat),
        eventos: [],
      });
    });

    // ── Matchmaking: buscar rival sin código ─────────────────────────────
    socket.on('mm:buscar', async ({ mode }: { mode: string }) => {
      const modo = normalizarModo(mode);
      // Ranking real del jugador para emparejar por nivel.
      const rating = await prisma.rating.findUnique({
        where: { userId_mode: { userId, mode: modo } },
        select: { rating: true },
      });
      matchmaker.entrar(modo, {
        userId,
        username,
        rating: rating?.rating ?? 1500,
        desde: Date.now(),
      });
      const info = matchmaker.enCola(userId);
      socket.emit('mm:estado', { buscando: true, ...info });
    });

    socket.on('mm:cancelar', () => {
      matchmaker.salir(userId);
      socket.emit('mm:estado', { buscando: false });
    });

    // ── Chat ─────────────────────────────────────────────────────────────
    socket.on('chat:enviar', ({ texto }: { texto: string }) => {
      if (!codeActual || typeof texto !== 'string') return;
      const limpio = texto.trim().slice(0, 200);
      if (!limpio) return;
      io.to(`sala:${codeActual}`).emit('chat:mensaje', {
        de: username,
        texto: limpio,
        ts: Date.now(),
      });
    });

    // ── Desconexión ──────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      metricas.desconexiones++;
      const s = socketsPorUsuario.get(userId);
      s?.delete(socket.id);
      if (s && s.size === 0) socketsPorUsuario.delete(userId);

      if (!codeActual) return;
      const sala = registro.obtener(codeActual);
      if (!sala) return;
      // Sólo se marca desconectado si el usuario no tiene otra pestaña abierta.
      if (!socketsPorUsuario.has(userId)) {
        matchmaker.salir(userId); // que no lo emparejen si ya no está
        sala.salir(userId);
        sala.mesa?.marcarConexion(userId, false);
        io.to(`sala:${codeActual}`).emit('sala:estado', sala.snapshot());
        // Si se cayó en plena partida, se lo espera un rato y si no vuelve la
        // partida se cierra por abandono: si no, el rival queda colgado y —lo
        // peor— las fichas apostadas quedan reservadas para siempre.
        if (sala.estado === 'EN_PARTIDA') iniciarEsperaAusencia(codeActual, userId);
      }
    });
  });

  // Un error de DB en un handler async tumbaba el proceso entero, y con él
  // todas las partidas en memoria (dejando las apuestas reservadas colgadas).
  process.on('unhandledRejection', (motivo) => {
    console.error('[fatal] promesa sin catch:', motivo);
  });
  process.on('uncaughtException', (err) => {
    console.error('[fatal] excepción sin catch:', err);
  });

  // ─── Ausencia: esperar al que se cayó, o cerrar por abandono ───────────────

  /** Milisegundos que se espera a un jugador desconectado en plena partida. */
  const ESPERA_AUSENCIA_MS = Number(process.env.ESPERA_AUSENCIA_MS ?? 180_000);
  const ausencias = new Map<string, ReturnType<typeof setTimeout>>();
  const claveAusencia = (code: string, userId: string) => `${code}:${userId}`;

  function iniciarEsperaAusencia(code: string, userId: string) {
    const clave = claveAusencia(code, userId);
    if (ausencias.has(clave)) return;
    const vence = Date.now() + ESPERA_AUSENCIA_MS;
    io.to(`sala:${code}`).emit('partida:ausencia', { userId, venceEn: vence });
    ausencias.set(
      clave,
      setTimeout(() => {
        ausencias.delete(clave);
        void cerrarPorAbandono(code, userId);
      }, ESPERA_AUSENCIA_MS),
    );
  }

  function cancelarEsperaAusencia(code: string, userId: string) {
    const clave = claveAusencia(code, userId);
    const t = ausencias.get(clave);
    if (!t) return;
    clearTimeout(t);
    ausencias.delete(clave);
    io.to(`sala:${code}`).emit('partida:ausencia', { userId, venceEn: null });
  }

  /** Cierra la partida dando por ganador al equipo del que sí se quedó. */
  async function cerrarPorAbandono(code: string, userIdAusente: string) {
    const sala = registro.obtener(code);
    if (!sala || sala.estado !== 'EN_PARTIDA' || !sala.mesa) return;
    // Si volvió a conectarse mientras tanto, no se cierra nada.
    if (socketsPorUsuario.has(userIdAusente)) return;

    const ausente = sala.participantes.find((p) => p.userId === userIdAusente);
    if (ausente?.seat == null) return;
    const equipoAusente = ausente.seat % 2;
    const ganador = (equipoAusente === 0 ? 1 : 0) as 0 | 1;
    sala.mesa.state.winner = ganador;
    sala.mesa.state.phase = 'MATCH_FINISHED';
    io.to(`sala:${code}`).emit('partida:abandono', { userId: userIdAusente, ganador });
    await finalizarPartida(sala, code);
  }

  // ─── Tick de matchmaking ────────────────────────────────────────────────────

  // Barrido de salas terminadas: `eliminar()` existía pero no lo llamaba nadie,
  // así que el Map crecía sin techo hasta el OOM (y el OOM congela apuestas).
  const tickLimpieza = setInterval(() => {
    for (const code of registro.codigos()) {
      const sala = registro.obtener(code);
      if (!sala || sala.estado !== 'TERMINADA') continue;
      const sockets = io.sockets.adapter.rooms.get(`sala:${code}`);
      if (!sockets || sockets.size === 0) registro.eliminar(code);
    }
  }, 60_000);

  const tickMatchmaking = setInterval(() => {
    void procesarMatchmaking();
  }, 2000);

  async function procesarMatchmaking() {
    const grupos = matchmaker.emparejar(Date.now());
    for (const grupo of grupos) {
      try {
        const code = await generarCodigoUnico();
        const room = await prisma.room.create({
          data: {
            code,
            name: 'Partida rápida',
            hostUserId: grupo.jugadores[0]!.userId,
            mode: grupo.mode,
            state: 'WAITING',
            pointsToWin: 30,
            florEnabled: true,
            allowBots: false,
            participants: {
              create: grupo.jugadores.map((j, i) => ({ userId: j.userId, seat: i, team: i % 2 })),
            },
          },
        });
        // Todos los emparejados quedan "listos" de una: es partida rápida.
        const sala = registro.crear({
          nombre: room.name,
          code: room.code,
          roomId: room.id,
          hostUserId: room.hostUserId,
          apuesta: 0,
          permiteBots: false,
          modo: grupo.mode,
          players: grupo.mode.includes('2V2') ? 4 : 2,
          pointsToWin: 30,
          florEnabled: true,
          faltaEnvidoToGame: true,
        });
        for (const j of grupo.jugadores) {
          sala.entrar(j.userId, j.username);
          sala.marcarListo(j.userId, true);
          // Avisar a cada jugador a qué sala ir.
          emitirAUsuario(j.userId, 'mm:encontrado', { code: room.code });
        }
      } catch (e) {
        console.error('[matchmaking] no se pudo crear la partida', e);
      }
    }
  }

  async function generarCodigoUnico(): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const code = generarCodigoSala((max) => Math.floor(cryptoRandomInt(max)));
      const existe = await prisma.room.findUnique({ where: { code }, select: { id: true } });
      if (!existe) return code;
    }
    throw new Error('No se pudo generar código');
  }

  // ─── Arranque y cierre de partida ───────────────────────────────────────────

  async function arrancarPartida(
    sala: NonNullable<ReturnType<RegistroSalas['obtener']>>,
    code: string,
  ) {
    const matchId = randomUUID();
    const humanos = sala.participantes.filter((p) => !p.isBot && p.seat !== null);

    try {
      await prisma.match.create({
        data: {
          id: matchId,
          roomId: sala.config.roomId,
          mode: sala.config.modo,
          pointsToWin: sala.config.pointsToWin,
          florEnabled: sala.config.florEnabled,
          players: sala.config.players,
          betAmount: BigInt(sala.config.apuesta),
          matchPlayers: {
            create: humanos.map((p) => ({
              userId: p.userId,
              seat: p.seat as number,
              team: (p.seat as number) % 2,
            })),
          },
        },
      });
      await prisma.room.update({
        where: { id: sala.config.roomId },
        data: { state: 'IN_PROGRESS' },
      });
    } catch (e) {
      console.error('[partida] no se pudo crear en la base', e);
      return;
    }

    // Apuesta: se reserva ANTES de repartir. Si a alguien no le alcanza, no
    // arranca nadie y la sala vuelve a esperar.
    if (sala.config.apuesta > 0 && humanos.length > 0) {
      const reserva = await reservarApuesta({
        matchId,
        monto: sala.config.apuesta,
        jugadores: humanos.map((p) => ({ userId: p.userId, seat: p.seat as number })),
      });
      if (!reserva.ok) {
        await prisma.match.delete({ where: { id: matchId } }).catch(() => undefined);
        await prisma.room
          .update({ where: { id: sala.config.roomId }, data: { state: 'WAITING' } })
          .catch(() => undefined);
        for (const p of sala.participantes) p.listo = false;
        io.to(`sala:${code}`).emit('error:app', {
          mensaje: reserva.error ?? 'No se pudo reservar la apuesta',
        });
        io.to(`sala:${code}`).emit('sala:estado', sala.snapshot());
        return;
      }
      sala.betId = reserva.betId ?? null;
    }

    const mesa = sala.arrancar(matchId, emitirAUsuario);
    metricas.partidasArrancadas++;
    io.to(`sala:${code}`).emit('sala:estado', sala.snapshot());
    io.to(`sala:${code}`).emit('partida:arrancada', { matchId });
    mesa.difundir([]);
    await volcarEventos(matchId, sala);
    console.log(
      `▸ partida ${matchId} arrancada en sala ${code} (${sala.config.players} jugadores)`,
    );
  }

  async function finalizarPartida(
    sala: NonNullable<ReturnType<RegistroSalas['obtener']>>,
    code: string,
  ) {
    const mesa = sala.mesa;
    if (!mesa) return;
    sala.estado = 'TERMINADA';

    const ganador = mesa.state.winner ?? 0;
    try {
      await prisma.$transaction([
        prisma.match.update({
          where: { id: mesa.id },
          data: { state: 'FINISHED', winnerTeam: ganador, finishedAt: new Date() },
        }),
        prisma.matchResult.create({
          data: {
            matchId: mesa.id,
            winnerTeam: ganador,
            scoreTeam0: mesa.state.scores[0],
            scoreTeam1: mesa.state.scores[1],
            rounds: mesa.state.roundCount,
          },
        }),
        prisma.room.update({ where: { id: sala.config.roomId }, data: { state: 'FINISHED' } }),
      ]);
    } catch (e) {
      console.error('[partida] no se pudo cerrar en la base', e);
    }

    // Ranking: sólo mueve en modos competitivos y sólo cuenta a los humanos.
    const humanosPartida = mesa.jugadores.filter((j) => !j.isBot);
    if (humanosPartida.length >= 2) {
      await aplicarRanking({
        matchId: mesa.id,
        mode: sala.config.modo,
        jugadores: humanosPartida.map((j) => ({ userId: j.userId, equipo: j.seat % 2 })),
        equipoGanador: ganador,
      }).catch((e) => console.error('[ranking] falló', e));
    }

    // Progresión: XP, nivel, misiones y logros para cada humano.
    for (const j of humanosPartida) {
      await otorgarRecompensas({
        userId: j.userId,
        gano: j.seat % 2 === ganador,
        fecha: new Date(),
      }).catch((e) => console.error('[progresion] falló', e));
    }

    // Liquidación de la apuesta: el ganador lo decide el SERVIDOR a partir del
    // estado del motor, nunca el cliente.
    if (sala.betId) {
      const ganadores = mesa.jugadores
        .filter((j) => !j.isBot && j.seat % 2 === ganador)
        .map((j) => j.userId);
      const resultado = ganadores.length
        ? await liquidarApuesta({ betId: sala.betId, ganadoresUserIds: ganadores })
        : await reembolsarApuesta(sala.betId, 'Sin ganadores humanos');
      if (!resultado.ok) console.error('[apuesta] liquidación falló', resultado.error);
      sala.betId = null;
    }

    io.to(`sala:${code}`).emit('partida:terminada', {
      matchId: mesa.id,
      ganadorEquipo: ganador,
      scores: mesa.state.scores,
    });
    console.log(`▸ partida ${mesa.id} terminada — ganó equipo ${ganador} ${mesa.state.scores}`);
  }

  // Adapter de Redis para escalar Socket.IO a varios nodos: sincroniza las
  // salas (broadcasts) entre procesos vía pub/sub. Sólo se activa si hay
  // REDIS_URL. LIMITACIÓN CONOCIDA: el estado de cada partida vive en memoria
  // del nodo que la arrancó, así que para multi-nodo real hay que rutear a los
  // jugadores de una sala al mismo nodo (sticky por sala) o mover el estado a
  // Redis; el adapter resuelve el fan-out de eventos, no la afinidad de partida.
  /**
   * Barrido de arranque: el estado de las partidas vive en memoria, así que
   * todo Match que quedó IN_PROGRESS es de un proceso anterior que se cayó.
   * Su apuesta quedó RESERVED —debitada de los dos jugadores y acreditada a
   * nadie—, o sea plata congelada que nadie puede reclamar. Se cancela la
   * partida y se devuelve lo apostado.
   */
  async function barrerPartidasHuerfanas() {
    try {
      const colgadas = await prisma.match.findMany({
        where: { state: 'IN_PROGRESS' },
        select: { id: true, bet: { select: { id: true, state: true } } },
      });
      if (colgadas.length === 0) return;
      console.log(`▸ barriendo ${colgadas.length} partida(s) huérfana(s) de un proceso anterior`);
      for (const m of colgadas) {
        if (m.bet && m.bet.state === 'RESERVED') {
          const r = await reembolsarApuesta(m.bet.id, 'Reinicio del servidor');
          if (!r.ok) console.error(`[barrido] no se pudo reembolsar ${m.bet.id}:`, r.error);
        }
        await prisma.match.update({
          where: { id: m.id },
          data: { state: 'CANCELLED', finishedAt: new Date() },
        });
      }
    } catch (e) {
      console.error('[barrido] falló el barrido de partidas huérfanas', e);
    }
  }

  const REDIS_URL = process.env.REDIS_URL;
  let redisPub: ReturnType<typeof createClient> | null = null;
  let redisSub: ReturnType<typeof createClient> | null = null;

  return {
    async escuchar() {
      if (REDIS_URL) {
        try {
          redisPub = createClient({ url: REDIS_URL });
          redisSub = redisPub.duplicate();
          await Promise.all([redisPub.connect(), redisSub.connect()]);
          io.adapter(createAdapter(redisPub, redisSub));
          console.log('▸ Socket.IO usando adapter de Redis (multi-nodo)');
        } catch (e) {
          console.error('[redis] no se pudo conectar; sigo en modo single-node', e);
        }
      }
      // Antes de aceptar tráfico: liberar la plata que dejó colgada un
      // proceso anterior.
      await barrerPartidasHuerfanas();
      await app.listen({ port: PORT, host: '0.0.0.0' });
      const dir = app.server.address();
      const puerto = typeof dir === 'object' && dir ? dir.port : PORT;
      return puerto;
    },
    async cerrar() {
      clearInterval(tickMatchmaking);
      clearInterval(tickLimpieza);
      io.close();
      await app.close();
      await Promise.all([redisPub?.quit(), redisSub?.quit()].filter(Boolean));
    },
    registro,
  };
}
