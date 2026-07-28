'use client';

/**
 * Mesa de juego. NO tiene lógica de truco: los botones que ve el jugador salen
 * de `vista.legales`, que calcula el motor en el servidor. Si acá apareciera un
 * botón de más, el servidor igual rechazaría la acción.
 */

import { useState } from 'react';
import type { Action, Card } from '@trucazo/engine';
import { CartaEspanola, ReversoCarta, nombreCarta } from '@/components/CartaEspanola';
import { Boton, Pildora } from '@/components/ui';
import { Chat } from './Chat';
import type { MensajeChat, SnapshotSala, VistaJugador } from './SalaVivo';

/** Nombre visible de cada canto. */
const ETIQUETA_CANTO: Record<string, string> = {
  ENVIDO: 'Envido',
  REAL_ENVIDO: 'Real envido',
  FALTA_ENVIDO: 'Falta envido',
  FLOR: 'Flor',
  CONTRAFLOR: 'Contraflor',
  CONTRAFLOR_AL_RESTO: 'Contraflor al resto',
};

const NIVEL_TRUCO = ['Truco', 'Retruco', 'Vale cuatro'];

export function Mesa({
  sala,
  vista,
  onAccion,
  mensajes,
  onChat,
}: {
  sala: SnapshotSala;
  vista: VistaJugador;
  onAccion: (a: Action) => void;
  mensajes: MensajeChat[];
  onChat: (t: string) => void;
}) {
  const [confirmando, setConfirmando] = useState<Action | null>(null);
  const miTurno = vista.turnSeat === vista.seat && vista.legales.length > 0;
  const terminada = vista.phase === 'MATCH_FINISHED';

  const rivales = sala.participantes.filter((p) => p.seat !== null && p.seat !== vista.seat);
  const cartasJugables = new Set(
    vista.legales.filter((a) => a.type === 'PLAY_CARD').map((a) => claveCarta(a.card)),
  );

  // Cantos disponibles, separados por tipo para agruparlos en la UI.
  const respuestas = vista.legales.filter((a) => a.type === 'RESPOND');
  const cantosEnvido = vista.legales.filter((a) => a.type === 'CALL_ENVIDO');
  const cantosFlor = vista.legales.filter((a) => a.type === 'CALL_FLOR');
  const cantoTruco = vista.legales.find((a) => a.type === 'CALL_TRUCO');
  const mazo = vista.legales.find((a) => a.type === 'GO_TO_MAZO');

  const miEquipo = vista.team;
  const puntosMios = vista.scores[miEquipo];
  const puntosRival = vista.scores[miEquipo === 0 ? 1 : 0];

  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-pano-900 via-noche-900 to-noche-950">
      {/* ─── Marcador ─────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between gap-3 border-b border-pano-800/60 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Marcador etiqueta="Nosotros" valor={puntosMios} destacado />
          <Marcador etiqueta="Ellos" valor={puntosRival} />
          <span className="text-xs text-tinta-600">a {vista.pointsToWin}</span>
        </div>
        <div className="flex items-center gap-2">
          {vista.truco.level > 0 && (
            <Pildora tono="rojo">
              {NIVEL_TRUCO[vista.truco.level - 1]}
              {vista.truco.accepted ? ' querido' : ''}
            </Pildora>
          )}
          {vista.flor.iHaveFlor && <Pildora tono="oro">Tenés flor</Pildora>}
        </div>
      </header>

      {/* ─── Rivales ──────────────────────────────────────────────────── */}
      <section className="flex justify-center gap-6 px-4 pt-5" aria-label="Rivales">
        {rivales.map((r) => (
          <div key={r.userId} className="flex flex-col items-center gap-1.5">
            <div
              className="flex"
              aria-label={`${r.username} tiene ${vista.handCounts[r.seat as number] ?? 0} cartas`}
            >
              {Array.from({ length: vista.handCounts[r.seat as number] ?? 0 }, (_, i) => (
                <div key={i} className="-ml-5 first:ml-0">
                  <ReversoCarta size="xs" />
                </div>
              ))}
            </div>
            <span className="flex items-center gap-1.5 text-xs text-tinta-300">
              {r.username}
              {vista.manoSeat === r.seat && <span title="Es mano">👑</span>}
              {!r.conectado && <span className="text-canto-400">⚠</span>}
            </span>
          </div>
        ))}
      </section>

      {/* ─── Paño: cartas jugadas ─────────────────────────────────────── */}
      <section
        className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-6"
        aria-label="Cartas jugadas"
      >
        {terminada ? (
          <Resultado vista={vista} miEquipo={miEquipo} matchId={sala.matchId} />
        ) : (
          <div className="flex flex-col items-center gap-3">
            {vista.tricks.map((baza, i) =>
              baza.length === 0 ? null : (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-14 text-right text-[11px] uppercase tracking-wide text-tinta-600">
                    {['Primera', 'Segunda', 'Tercera'][i]}
                  </span>
                  {baza.map((j, k) => (
                    <div
                      key={k}
                      className="animar-reparto"
                      style={{ animationDelay: `${k * 60}ms` }}
                    >
                      <CartaEspanola card={j.card} size={i === vista.currentTrick ? 'md' : 'xs'} />
                    </div>
                  ))}
                  {vista.trickOutcomes[i] && (
                    <span className="ml-1 text-xs text-tinta-400">
                      {vista.trickOutcomes[i] === 'PARDA'
                        ? 'parda'
                        : vista.trickOutcomes[i] === `TEAM_${miEquipo}`
                          ? '✓'
                          : '✗'}
                    </span>
                  )}
                </div>
              ),
            )}
            {vista.tricks.every((t) => t.length === 0) && (
              <p className="text-sm text-tinta-600">Repartiendo…</p>
            )}
          </div>
        )}
      </section>

      {/* ─── Mis cartas ───────────────────────────────────────────────── */}
      <section className="px-4" aria-label="Tus cartas">
        <div className="flex justify-center gap-2">
          {vista.myHand.map((c) => {
            const jugable = miTurno && cartasJugables.has(claveCarta(c));
            return (
              <button
                key={claveCarta(c)}
                disabled={!jugable}
                onClick={() => onAccion({ type: 'PLAY_CARD', seat: vista.seat, card: c })}
                className="rounded-lg transition-transform enabled:hover:-translate-y-2 disabled:cursor-not-allowed"
                aria-label={`Jugar ${nombreCarta(c)}`}
              >
                <CartaEspanola card={c} size="lg" destacada={jugable} atenuada={!jugable} />
              </button>
            );
          })}
          {vista.myHand.length === 0 && !terminada && (
            <p className="py-6 text-sm text-tinta-600">Sin cartas en la mano</p>
          )}
        </div>
      </section>

      {/* ─── Acciones ─────────────────────────────────────────────────── */}
      <section className="sticky bottom-0 border-t border-pano-800/60 bg-noche-950/90 px-4 py-3 backdrop-blur">
        {terminada ? (
          <a href="/inicio" className="block">
            <Boton tamaño="lg" className="w-full">
              Volver al inicio
            </Boton>
          </a>
        ) : vista.legales.length === 0 ? (
          <p className="py-2 text-center text-sm text-tinta-400">Esperando al rival…</p>
        ) : (
          <div className="flex flex-wrap justify-center gap-2">
            {respuestas.map((a) => (
              <Boton
                key={a.type + (a.type === 'RESPOND' ? a.response : '')}
                variante={
                  a.type === 'RESPOND' && a.response === 'QUIERO' ? 'primario' : 'secundario'
                }
                onClick={() => onAccion(a)}
              >
                {a.type === 'RESPOND' && a.response === 'QUIERO' ? '¡Quiero!' : 'No quiero'}
              </Boton>
            ))}

            {cantosFlor.map((a) => (
              <Boton
                key={`flor-${a.type === 'CALL_FLOR' ? a.variant : ''}`}
                variante="primario"
                onClick={() => onAccion(a)}
              >
                {a.type === 'CALL_FLOR' ? ETIQUETA_CANTO[a.variant] : 'Flor'}
              </Boton>
            ))}

            {cantosEnvido.map((a) => (
              <Boton
                key={`env-${a.type === 'CALL_ENVIDO' ? a.variant : ''}`}
                variante="secundario"
                onClick={() => onAccion(a)}
              >
                {a.type === 'CALL_ENVIDO' ? ETIQUETA_CANTO[a.variant] : 'Envido'}
              </Boton>
            ))}

            {cantoTruco && (
              <Boton variante="peligro" onClick={() => onAccion(cantoTruco)}>
                ¡{NIVEL_TRUCO[vista.truco.level] ?? 'Truco'}!
              </Boton>
            )}

            {mazo && (
              <Boton variante="fantasma" onClick={() => setConfirmando(mazo)}>
                Me voy al mazo
              </Boton>
            )}
          </div>
        )}
      </section>

      {/* Confirmación para acciones irreversibles */}
      {confirmando && (
        <Confirmacion
          titulo="¿Te vas al mazo?"
          detalle="Le entregás la mano al rival con los puntos que valga el truco."
          onCancelar={() => setConfirmando(null)}
          onConfirmar={() => {
            onAccion(confirmando);
            setConfirmando(null);
          }}
        />
      )}

      <div className="px-4 pb-4">
        <Chat mensajes={mensajes} onEnviar={onChat} compacto />
      </div>
    </div>
  );
}

function claveCarta(c: Card): string {
  return `${c.suit}-${c.rank}`;
}

function Marcador({
  etiqueta,
  valor,
  destacado,
}: {
  etiqueta: string;
  valor: number;
  destacado?: boolean;
}) {
  return (
    <div className="text-center">
      <div className="text-[10px] uppercase tracking-wide text-tinta-500">{etiqueta}</div>
      <div
        className={`font-mono text-2xl font-bold ${destacado ? 'text-oro-400' : 'text-tinta-200'}`}
      >
        {valor}
      </div>
    </div>
  );
}

function Resultado({
  vista,
  miEquipo,
  matchId,
}: {
  vista: VistaJugador;
  miEquipo: number;
  matchId: string | null;
}) {
  const gane = vista.winner === miEquipo;
  return (
    <div className="animar-aparecer text-center">
      <div className="text-6xl" aria-hidden="true">
        {gane ? '🏆' : '🫡'}
      </div>
      <h2 className={`mt-3 text-3xl font-bold ${gane ? 'text-oro-400' : 'text-tinta-200'}`}>
        {gane ? '¡Ganaste!' : 'Perdiste'}
      </h2>
      <p className="mt-1.5 font-mono text-lg text-tinta-400">
        {vista.scores[miEquipo]} — {vista.scores[miEquipo === 0 ? 1 : 0]}
      </p>
      {matchId && (
        <a
          href={`/reparto/${matchId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-block text-sm text-oro-400 underline-offset-4 hover:underline"
        >
          Verificar que el reparto fue justo →
        </a>
      )}
    </div>
  );
}

function Confirmacion({
  titulo,
  detalle,
  onCancelar,
  onConfirmar,
}: {
  titulo: string;
  detalle: string;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-titulo"
    >
      <div className="panel w-full max-w-sm p-6">
        <h2 id="confirm-titulo" className="text-lg font-semibold">
          {titulo}
        </h2>
        <p className="mt-1.5 text-sm text-tinta-400">{detalle}</p>
        <div className="mt-5 flex gap-2">
          <Boton variante="secundario" className="flex-1" onClick={onCancelar}>
            Cancelar
          </Boton>
          <Boton variante="peligro" className="flex-1" onClick={onConfirmar} autoFocus>
            Sí, me voy
          </Boton>
        </div>
      </div>
    </div>
  );
}
