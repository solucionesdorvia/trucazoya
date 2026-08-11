'use client';

/**
 * Matchmaking automático desde el cliente. Se conecta al game-server, entra a
 * la cola y espera a que empareje. Cuando el server encuentra rival, redirige
 * a la sala (que ya está lista para arrancar).
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { io, type Socket } from 'socket.io-client';
import { Boton, Panel } from '@/components/ui';

type Modo = 'CASUAL_1V1' | 'RANKED_1V1' | 'CASUAL_2V2' | 'RANKED_2V2';

const MODOS: Array<{ v: Modo; t: string; d: string }> = [
  { v: 'CASUAL_1V1', t: '1 vs 1 casual', d: 'Sin presión, no mueve el ranking' },
  { v: 'RANKED_1V1', t: '1 vs 1 competitivo', d: 'Sube o baja tu clasificación' },
  { v: 'CASUAL_2V2', t: '2 vs 2 casual', d: 'Con un compañero al azar' },
  { v: 'RANKED_2V2', t: '2 vs 2 competitivo', d: 'Ranking por equipos' },
];

export function BuscarPartida() {
  const router = useRouter();
  const [conectado, setConectado] = useState(false);
  const [buscando, setBuscando] = useState<Modo | null>(null);
  const [segundos, setSegundos] = useState(0);
  /** Fichas que se ponen en la partida rápida. Antes SIEMPRE era 0: no había
   *  forma de jugar por fichas sin crear una sala a mano. */
  const [apuesta, setApuesta] = useState(0);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    let socket: Socket | null = null;
    (async () => {
      const res = await fetch('/api/token-partida', { method: 'POST' });
      if (!res.ok) return;
      const { token, servidor } = (await res.json()) as { token: string; servidor: string };
      socket = io(servidor, { auth: { token }, transports: ['websocket', 'polling'] });
      socketRef.current = socket;
      socket.on('connect', () => setConectado(true));
      socket.on('disconnect', () => setConectado(false));
      socket.on('mm:encontrado', ({ code }: { code: string }) => {
        router.push(`/sala/${code}`);
      });
    })();
    return () => {
      socket?.emit('mm:cancelar');
      socket?.disconnect();
    };
  }, [router]);

  // Cronómetro de espera.
  useEffect(() => {
    if (!buscando) return;
    setSegundos(0);
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [buscando]);

  const buscar = (modo: Modo) => {
    socketRef.current?.emit('mm:buscar', { mode: modo, apuesta });
    setBuscando(modo);
  };

  const cancelar = () => {
    socketRef.current?.emit('mm:cancelar');
    setBuscando(null);
  };

  return (
    <div>
      {buscando ? (
        <Panel className="flex flex-col items-center gap-4 py-10 text-center">
          <div className="relative">
            <div
              className="h-16 w-16 animate-spin rounded-full border-4 border-noche-700 border-t-oro-500"
              aria-hidden="true"
            />
          </div>
          <div>
            <p className="text-lg font-semibold">Buscando rival…</p>
            <p className="mt-1 font-mono text-2xl text-oro-400" aria-live="polite">
              {Math.floor(segundos / 60)}:{String(segundos % 60).padStart(2, '0')}
            </p>
            <p className="mt-2 text-sm text-tinta-400">
              {MODOS.find((m) => m.v === buscando)?.t}
              {segundos > 15 && ' · ampliando la búsqueda…'}
            </p>
          </div>
          <Boton variante="peligro" onClick={cancelar}>
            Cancelar
          </Boton>
        </Panel>
      ) : (
        <div className="mt-6 space-y-2.5">
          {!conectado && (
            <Panel className="text-center text-sm text-tinta-400">Conectando al servidor…</Panel>
          )}
          <div className="mb-4">
            <p className="font-medium text-tinta-50">Se juega por</p>
            <p className="mt-0.5 text-sm text-tinta-400">
              Sólo te empareja con alguien que ponga lo mismo.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[0, 100, 500, 1000, 5000].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setApuesta(v)}
                  aria-pressed={apuesta === v}
                  className={`min-h-[44px] rounded-xl border px-4 text-sm font-semibold transition-colors ${
                    apuesta === v
                      ? 'border-oro-500 bg-oro-500/20 text-oro-300'
                      : 'border-noche-600 text-tinta-300 hover:text-tinta-50'
                  }`}
                >
                  {v === 0 ? 'Sin fichas' : `${v.toLocaleString('es-AR')}`}
                </button>
              ))}
            </div>
            {apuesta > 0 && (
              <p className="mt-2 rounded-lg bg-oro-500/10 px-3 py-2 text-sm text-oro-200">
                Ponés <strong>{apuesta.toLocaleString('es-AR')}</strong> fichas. Si ganás te llevás{' '}
                <strong>{Math.round(apuesta * 2 * 0.95).toLocaleString('es-AR')}</strong> (5% de
                comisión).
              </p>
            )}
          </div>

          {MODOS.map((m) => (
            <button
              key={m.v}
              disabled={!conectado}
              onClick={() => buscar(m.v)}
              className="panel flex w-full items-center justify-between gap-3 p-4 text-left transition-transform enabled:hover:-translate-y-0.5 disabled:opacity-50"
            >
              <span>
                <span className="block font-semibold text-tinta-50">{m.t}</span>
                <span className="block text-sm text-tinta-400">{m.d}</span>
              </span>
              <span className="text-oro-400" aria-hidden="true">
                →
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
