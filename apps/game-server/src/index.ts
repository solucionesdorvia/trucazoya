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
import { prisma } from '@trucazo/db';
import { verificarTokenPartida } from '@trucazo/shared';
import { liquidarApuesta, reembolsarApuesta, reservarApuesta } from '@trucazo/economia';
import type { Action } from '@trucazo/engine';
import { RegistroSalas, type ConfigSala, type Sala } from './salas.js';

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

  app.get('/salud', async () => ({
    ok: true,
    salas: registro.cantidad,
    uptime: Math.round(process.uptime()),
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
    if (eventos.length === 0) return;
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

  // ─── Conexión ───────────────────────────────────────────────────────────────

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    const username = socket.data.username as string;

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
          return socket.emit('accion:rechazada', { actionId, motivo: rechazo });
        }

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
      const s = socketsPorUsuario.get(userId);
      s?.delete(socket.id);
      if (s && s.size === 0) socketsPorUsuario.delete(userId);

      if (!codeActual) return;
      const sala = registro.obtener(codeActual);
      if (!sala) return;
      // Sólo se marca desconectado si el usuario no tiene otra pestaña abierta.
      if (!socketsPorUsuario.has(userId)) {
        sala.salir(userId);
        sala.mesa?.marcarConexion(userId, false);
        io.to(`sala:${codeActual}`).emit('sala:estado', sala.snapshot());
      }
    });
  });

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
          mode: sala.config.players === 4 ? 'CASUAL_2V2' : 'CASUAL_1V1',
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

  return {
    async escuchar() {
      await app.listen({ port: PORT, host: '0.0.0.0' });
      const dir = app.server.address();
      const puerto = typeof dir === 'object' && dir ? dir.port : PORT;
      return puerto;
    },
    async cerrar() {
      io.close();
      await app.close();
    },
    registro,
  };
}
