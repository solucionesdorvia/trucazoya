'use client';

import { useState } from 'react';
import { Boton, Panel, Pildora } from '@/components/ui';
import { Chat } from './Chat';
import type { MensajeChat, SnapshotSala } from './SalaVivo';

export function Lobby({
  sala,
  userId,
  onListo,
  mensajes,
  onChat,
}: {
  sala: SnapshotSala;
  userId: string;
  onListo: (listo: boolean) => void;
  mensajes: MensajeChat[];
  onChat: (t: string) => void;
}) {
  const yo = sala.participantes.find((p) => p.userId === userId);
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(sala.code);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  };

  const sentados = sala.participantes.filter((p) => p.seat !== null);
  const faltan = sala.config.players - sentados.length;

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="text-2xl font-bold tracking-tight">{sala.nombre}</h1>
      <div className="mt-2 flex flex-wrap gap-2">
        <Pildora tono="oro">{sala.config.players === 4 ? '2 vs 2' : '1 vs 1'}</Pildora>
        <Pildora>{sala.config.pointsToWin} puntos</Pildora>
        {sala.config.florEnabled && <Pildora>Con flor</Pildora>}
        {sala.config.apuesta > 0 && <Pildora tono="oro">🪙 {sala.config.apuesta}</Pildora>}
      </div>

      {/* ─── Código para invitar ─────────────────────────────────────── */}
      <Panel className="mt-6 text-center">
        <p className="text-sm text-tinta-400">Pasale este código a tus amigos</p>
        <div className="mt-2 font-mono text-5xl font-bold tracking-[0.2em] text-oro-400">
          {sala.code}
        </div>
        <Boton variante="secundario" tamaño="sm" onClick={copiar} className="mt-4">
          {copiado ? '✓ Copiado' : 'Copiar código'}
        </Boton>
      </Panel>

      {/* ─── Jugadores ───────────────────────────────────────────────── */}
      <h2 className="mt-7 text-sm font-medium text-tinta-400">
        Jugadores ({sentados.length}/{sala.config.players})
      </h2>
      <ul className="mt-2 space-y-2">
        {Array.from({ length: sala.config.players }, (_, seat) => {
          const p = sala.participantes.find((x) => x.seat === seat);
          return (
            <li key={seat}>
              <Panel className="flex items-center gap-3 !p-3.5">
                <span
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold ${
                    seat % 2 === 0
                      ? 'bg-pano-700 text-emerald-200'
                      : 'bg-canto-600/40 text-canto-400'
                  }`}
                  aria-hidden="true"
                >
                  {seat % 2 === 0 ? 'A' : 'B'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-tinta-50">
                    {p ? p.username : <span className="text-tinta-600">Lugar libre</span>}
                  </span>
                  <span className="block text-xs text-tinta-400">
                    Equipo {seat % 2 === 0 ? 'A' : 'B'}
                    {p?.userId === userId && ' · vos'}
                  </span>
                </span>
                {p?.isBot && <Pildora>Bot</Pildora>}
                {p && !p.conectado && <Pildora tono="rojo">Desconectado</Pildora>}
                {p?.listo && <Pildora tono="verde">Listo</Pildora>}
              </Panel>
            </li>
          );
        })}
      </ul>

      {/* ─── Acción ──────────────────────────────────────────────────── */}
      <div className="mt-6">
        {yo ? (
          <Boton
            tamaño="lg"
            className="w-full"
            variante={yo.listo ? 'secundario' : 'primario'}
            onClick={() => onListo(!yo.listo)}
          >
            {yo.listo ? 'Cancelar' : faltan > 0 ? 'Estoy listo' : 'Estoy listo · arrancar'}
          </Boton>
        ) : (
          <Panel className="text-center text-tinta-400">Estás mirando esta sala</Panel>
        )}
        {faltan > 0 && (
          <p className="mt-2 text-center text-sm text-tinta-400">
            {`Esperando ${faltan} jugador${faltan === 1 ? '' : 'es'} más…`}
            {sala.hostUserId === userId && ' Compartí el código para que entren.'}
          </p>
        )}
      </div>

      <div className="mt-7">
        <Chat mensajes={mensajes} onEnviar={onChat} />
      </div>
    </div>
  );
}
