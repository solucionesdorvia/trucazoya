'use client';

/**
 * Matchmaking automático desde el cliente. Se conecta al game-server, entra a
 * la cola y espera a que empareje. Cuando el server encuentra rival, redirige
 * a la sala (que ya está lista para arrancar).
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { io, type Socket } from 'socket.io-client';
import { Boton, Panel } from '@/components/ui';
import { limpiarMonto } from '@/lib/monto';

type Modo = 'CASUAL_1V1' | 'RANKED_1V1' | 'CASUAL_2V2' | 'RANKED_2V2';

const MODOS: Array<{ v: Modo; t: string; d: string; minimo: number }> = [
  { v: 'CASUAL_1V1', t: '1 vs 1', d: 'Mano a mano', minimo: 2500 },
  { v: 'CASUAL_2V2', t: '2 vs 2', d: 'Con un compañero al azar', minimo: 4000 },
];

/** Mínimo de fichas para entrar, según el formato. */
const MINIMO: Record<string, number> = { CASUAL_1V1: 2500, CASUAL_2V2: 4000 };

export function BuscarPartida({ saldo }: { saldo: number }) {
  const router = useRouter();
  const [conectado, setConectado] = useState(false);
  const [buscando, setBuscando] = useState<Modo | null>(null);
  const [segundos, setSegundos] = useState(0);
  /** Fichas que se ponen en la partida rápida. Antes SIEMPRE era 0: no había
   *  forma de jugar por fichas sin crear una sala a mano. */
  const [montoTexto, setMontoTexto] = useState('2500');
  const apuesta = Number(montoTexto) || 0;
  const [modoElegido, setModoElegido] = useState<Modo>('CASUAL_1V1');
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

  /** Por qué no se puede buscar con este monto, o null si está todo bien. */
  const problema = (modo: Modo): string | null => {
    const min = MINIMO[modo] ?? 0;
    if (apuesta < min) {
      const nombre = modo === 'CASUAL_2V2' ? '2 vs 2' : '1 vs 1';
      return `El mínimo para ${nombre} es ${min.toLocaleString('es-AR')} fichas.`;
    }
    if (apuesta > saldo) {
      return `No te alcanza: tenés ${saldo.toLocaleString('es-AR')} fichas.`;
    }
    return null;
  };

  const buscar = (modo: Modo) => {
    if (problema(modo)) return;
    socketRef.current?.emit('mm:buscar', { mode: modo, apuesta });
    setBuscando(modo);
  };

  /** No le alcanza ni para la partida rápida más barata. */
  const sinFichas = saldo < Math.min(...MODOS.map((m) => m.minimo));

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

          {sinFichas && (
            <Panel className="!border-oro-500/30 !bg-oro-500/[0.07]">
              <p className="font-medium text-tinta-50">
                Te faltan fichas para las partidas rápidas
              </p>
              <p className="mt-1 text-sm leading-relaxed text-tinta-400">
                Tenés <strong className="text-tinta-200">{saldo.toLocaleString('es-AR')}</strong> y
                la más barata arranca en{' '}
                <strong className="text-tinta-200">
                  {Math.min(...MODOS.map((m) => m.minimo)).toLocaleString('es-AR')}
                </strong>
                . Podés cargar con un cajero, o jugar gratis armando una sala sin fichas y pasando
                el código.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/salas/crear">
                  <Boton tamaño="sm">Jugar gratis con amigos</Boton>
                </Link>
                <Link href="/billetera">
                  <Boton variante="secundario" tamaño="sm">
                    Cargar fichas
                  </Boton>
                </Link>
              </div>
            </Panel>
          )}
          <div className="mb-4">
            <p className="font-medium text-tinta-50">Se juega por</p>
            <p className="mt-0.5 text-sm text-tinta-400">
              Poné el monto que quieras. Sólo te empareja con alguien que ponga lo mismo.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-lg font-semibold text-oro-400">$</span>
              <input
                type="text"
                inputMode="numeric"
                value={montoTexto}
                placeholder="2500"
                onChange={(e) => setMontoTexto(limpiarMonto(e.target.value))}
                className="h-12 w-40 rounded-xl border border-noche-600 bg-noche-850 px-3 text-lg font-semibold text-tinta-50"
                aria-label="Fichas que ponés"
              />
              <span className="text-sm text-tinta-400">fichas</span>
            </div>
            <p className="mt-1.5 text-sm text-tinta-500">
              Tenés <strong className="text-tinta-300">{saldo.toLocaleString('es-AR')}</strong>{' '}
              fichas
            </p>

            {/* Atajos, pero el monto es libre: 1200, 1138, lo que sea. */}
            <div className="mt-2 flex flex-wrap gap-2">
              {[2500, 4000, 5000, 10000].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setMontoTexto(String(v))}
                  className="min-h-[36px] rounded-lg border border-noche-600 px-3 text-sm text-tinta-300 hover:text-tinta-50"
                >
                  {v.toLocaleString('es-AR')}
                </button>
              ))}
            </div>

            {problema(modoElegido) ? (
              <p className="mt-2 rounded-lg bg-canto-500/15 px-3 py-2 text-sm text-canto-300">
                {problema(modoElegido)}
                {apuesta > saldo && (
                  <>
                    {' '}
                    <Link href="/billetera" className="underline">
                      Cargar fichas
                    </Link>{' '}
                    o{' '}
                    <Link href="/salas/crear" className="underline">
                      jugá gratis sin fichas
                    </Link>
                    .
                  </>
                )}
              </p>
            ) : (
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
              disabled={!conectado || problema(m.v) !== null}
              onMouseEnter={() => setModoElegido(m.v)}
              onFocus={() => setModoElegido(m.v)}
              onClick={() => buscar(m.v)}
              className="panel flex w-full items-center justify-between gap-3 p-4 text-left transition-transform enabled:hover:-translate-y-0.5 disabled:opacity-50"
            >
              <span>
                <span className="block font-semibold text-tinta-50">{m.t}</span>
                <span className="block text-sm text-tinta-400">
                  {m.d} · mínimo {m.minimo.toLocaleString('es-AR')} fichas
                </span>
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
