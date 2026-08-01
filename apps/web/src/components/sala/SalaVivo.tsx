'use client';

/**
 * Cliente de sala en tiempo real. Mantiene la conexión al game-server y decide
 * si mostrar el lobby o la mesa.
 *
 * El cliente NO tiene lógica de juego: sólo renderiza la vista que manda el
 * servidor y envía intenciones. Los botones que muestra salen de `vista.legales`,
 * que calcula el motor en el servidor.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Action, PlayerView } from '@trucazo/engine';
import { Lobby } from './Lobby';
import { Mesa } from './Mesa';

export interface SnapshotSala {
  code: string;
  nombre: string;
  estado: 'ESPERANDO' | 'EN_PARTIDA' | 'TERMINADA';
  hostUserId: string;
  matchId: string | null;
  config: { players: number; pointsToWin: number; florEnabled: boolean; apuesta: number };
  participantes: Array<{
    userId: string;
    username: string;
    seat: number | null;
    equipo: number | null;
    listo: boolean;
    conectado: boolean;
    isBot: boolean;
  }>;
}

export type VistaJugador = PlayerView & { legales: Action[] };

export interface MensajeChat {
  de: string;
  texto: string;
  ts: number;
}

type Conexion = 'conectando' | 'conectado' | 'reconectando' | 'error';

export function SalaVivo({ code, userId }: { code: string; userId: string }) {
  const [conexion, setConexion] = useState<Conexion>('conectando');
  const [sala, setSala] = useState<SnapshotSala | null>(null);
  const [vista, setVista] = useState<VistaJugador | null>(null);
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  /** Jugador caído en plena partida: hasta cuándo se lo espera. */
  const [ausencia, setAusencia] = useState<{ userId: string; venceEn: number } | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    let activo = true;
    let socket: Socket | null = null;

    (async () => {
      // 1) Pedimos el token corto (la cookie de sesión no cruza de origen).
      const res = await fetch('/api/token-partida', { method: 'POST' });
      if (!res.ok) {
        if (activo) setConexion('error');
        return;
      }
      const { token, servidor } = (await res.json()) as { token: string; servidor: string };
      if (!activo) return;

      // 2) Conectamos con el token en el handshake.
      socket = io(servidor, { auth: { token }, transports: ['websocket', 'polling'] });
      socketRef.current = socket;

      socket.on('connect', () => {
        setConexion('conectado');
        socket?.emit('sala:entrar', { code });
      });
      socket.on('disconnect', () => setConexion('reconectando'));
      socket.on('connect_error', () => setConexion('error'));

      socket.on('sala:estado', (s: SnapshotSala) => setSala(s));

      socket.on('partida:estado', (d: { vista: VistaJugador }) => setVista(d.vista));

      socket.on('accion:rechazada', (d: { motivo: string }) => {
        setAviso(d.motivo);
        // El servidor rechazó: pedimos el estado real para no quedar desfasados.
        socket?.emit('partida:sync');
        setTimeout(() => setAviso(null), 3000);
      });

      socket.on('error:app', (d: { mensaje: string }) => setAviso(d.mensaje));
      socket.on('chat:mensaje', (m: MensajeChat) => setMensajes((prev) => [...prev.slice(-49), m]));

      socket.on('partida:ausencia', (d: { userId: string; venceEn: number | null }) => {
        setAusencia(d.venceEn ? { userId: d.userId, venceEn: d.venceEn } : null);
      });
      socket.on('partida:abandono', () => setAusencia(null));
      socket.on('partida:terminada', () => socket?.emit('partida:sync'));
    })();

    return () => {
      activo = false;
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [code]);

  const marcarListo = useCallback((listo: boolean) => {
    socketRef.current?.emit('sala:listo', { listo });
  }, []);

  const enviarAccion = useCallback((action: Action) => {
    // actionId único: el servidor deduplica reintentos (idempotencia).
    const actionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    socketRef.current?.emit('partida:accion', { action, actionId });
  }, []);

  const enviarChat = useCallback((texto: string) => {
    socketRef.current?.emit('chat:enviar', { texto });
  }, []);

  if (conexion === 'error') {
    return (
      <EstadoPantalla
        titulo="No pudimos conectar"
        detalle="El servidor de partidas no responde. Revisá tu conexión y recargá."
      />
    );
  }

  if (!sala) {
    return <EstadoPantalla titulo="Entrando a la sala…" detalle={`Código ${code}`} cargando />;
  }

  return (
    <>
      {conexion === 'reconectando' && (
        <div
          role="status"
          className="fixed inset-x-0 top-0 z-50 bg-canto-500 py-1.5 text-center text-sm font-medium text-white"
        >
          Reconectando…
        </div>
      )}
      {aviso && (
        <div
          role="alert"
          className="fixed inset-x-0 top-0 z-50 bg-canto-500 py-2 text-center text-sm font-medium text-white"
        >
          {aviso}
        </div>
      )}

      {sala.estado === 'ESPERANDO' || !vista ? (
        <Lobby
          sala={sala}
          userId={userId}
          onListo={marcarListo}
          mensajes={mensajes}
          onChat={enviarChat}
        />
      ) : (
        <Mesa
          sala={sala}
          vista={vista}
          onAccion={enviarAccion}
          mensajes={mensajes}
          onChat={enviarChat}
          ausencia={ausencia}
          onRevancha={() => socketRef.current?.emit('sala:revancha')}
        />
      )}
    </>
  );
}

function EstadoPantalla({
  titulo,
  detalle,
  cargando,
}: {
  titulo: string;
  detalle: string;
  cargando?: boolean;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-2 px-5 text-center">
      {cargando && (
        <div
          className="mb-2 h-8 w-8 animate-spin rounded-full border-2 border-noche-600 border-t-oro-500"
          aria-hidden="true"
        />
      )}
      <h1 className="text-xl font-semibold">{titulo}</h1>
      <p className="text-tinta-400">{detalle}</p>
    </div>
  );
}
