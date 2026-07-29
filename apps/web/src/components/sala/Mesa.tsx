'use client';

/**
 * Mesa de juego. NO tiene lógica de truco: los botones que ve el jugador salen
 * de `vista.legales`, que calcula el motor en el servidor. Si acá apareciera un
 * botón de más, el servidor igual rechazaría la acción.
 *
 * Diseño: mesa de peña de noche — paño con textura y luz cenital, riel de
 * madera, naipes reales, fósforos para el tanteador, cantos con puntos y
 * estampa, feedback sonoro y háptico. Revisado por un panel de jugadores.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Action, Card } from '@trucazo/engine';
import { CartaEspanola, ReversoCarta, nombreCarta } from '@/components/CartaEspanola';
import { Boton } from '@/components/ui';
import { Chat } from './Chat';
import type { MensajeChat, SnapshotSala, VistaJugador } from './SalaVivo';

const ETIQUETA_CANTO: Record<string, string> = {
  ENVIDO: 'Envido',
  REAL_ENVIDO: 'Real envido',
  FALTA_ENVIDO: 'Falta envido',
  FLOR: 'Flor',
  CONTRAFLOR: 'Contraflor',
  CONTRAFLOR_AL_RESTO: 'Contraflor al resto',
};

const NIVEL_TRUCO = ['Truco', 'Retruco', 'Vale cuatro'];
const NOMBRE_BAZA = ['Primera', 'Segunda', 'Tercera'];

/** Feedback háptico (si el dispositivo lo soporta). */
function vibrar(patron: number | number[]) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate(patron);
    } catch {
      /* no-op */
    }
  }
}

// ─── Sonido (Web Audio, sin assets) ─────────────────────────────────────────

function useSonido() {
  const ctxRef = useRef<AudioContext | null>(null);
  const [mudo, setMudo] = useState(false);
  const mudoRef = useRef(false);
  mudoRef.current = mudo;

  function tono(freq: number, dur: number, tipo: OscillatorType, vol: number) {
    if (mudoRef.current || typeof window === 'undefined') return;
    try {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const c = (ctxRef.current ??= new AC());
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = tipo;
      o.frequency.value = freq;
      g.gain.value = vol;
      o.connect(g);
      g.connect(c.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      o.stop(c.currentTime + dur);
    } catch {
      /* audio no disponible */
    }
  }

  return {
    mudo,
    alternarMudo: () => setMudo((m) => !m),
    slap: () => {
      tono(170, 0.07, 'triangle', 0.08);
      setTimeout(() => tono(90, 0.05, 'sine', 0.05), 20);
    },
    canto: () => {
      tono(320, 0.12, 'sawtooth', 0.05);
      setTimeout(() => tono(430, 0.16, 'sawtooth', 0.05), 95);
    },
  };
}

// ─── Estampa de canto ────────────────────────────────────────────────────────

function useEstampaCanto(vista: VistaJugador, onCanto: () => void) {
  const [estampa, setEstampa] = useState<string | null>(null);
  const prev = useRef({
    truco: vista.truco.level,
    envido: vista.envido.pending.length,
    flor: vista.flor.active,
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let texto: string | null = null;
    if (vista.truco.level > prev.current.truco)
      texto = `¡${(NIVEL_TRUCO[vista.truco.level - 1] ?? 'Truco').toUpperCase()}!`;
    else if (vista.envido.pending.length > prev.current.envido) {
      const ult = vista.envido.pending[vista.envido.pending.length - 1] ?? 'ENVIDO';
      texto = `¡${(ETIQUETA_CANTO[ult] ?? 'Envido').toUpperCase()}!`;
    } else if (vista.flor.active && !prev.current.flor) texto = '¡FLOR!';

    prev.current = {
      truco: vista.truco.level,
      envido: vista.envido.pending.length,
      flor: vista.flor.active,
    };

    if (texto) {
      setEstampa(texto);
      onCanto();
      vibrar([25, 40, 25]);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setEstampa(null), 1300);
    }
  }, [vista.truco.level, vista.envido.pending.length, vista.flor.active, onCanto]);

  return estampa;
}

interface Confirmable {
  action: Action;
  titulo: string;
  detalle: string;
}

// ─── Mesa ────────────────────────────────────────────────────────────────────

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
  const [confirmando, setConfirmando] = useState<Confirmable | null>(null);
  const sonido = useSonido();
  const estampa = useEstampaCanto(vista, sonido.canto);

  const miTurno = vista.turnSeat === vista.seat && vista.legales.length > 0;
  const terminada = vista.phase === 'MATCH_FINISHED';

  const rivales = sala.participantes.filter((p) => p.seat !== null && p.seat !== vista.seat);
  const cartasJugables = new Set(
    vista.legales.filter((a) => a.type === 'PLAY_CARD').map((a) => claveCarta(a.card)),
  );

  const respuestas = vista.legales.filter((a) => a.type === 'RESPOND');
  const cantosEnvido = vista.legales.filter((a) => a.type === 'CALL_ENVIDO');
  const cantosFlor = vista.legales.filter((a) => a.type === 'CALL_FLOR');
  const cantoTruco = vista.legales.find((a) => a.type === 'CALL_TRUCO');
  const mazo = vista.legales.find((a) => a.type === 'GO_TO_MAZO');

  const miEquipo = vista.team;
  const puntosMios = vista.scores[miEquipo];
  const puntosRival = vista.scores[miEquipo === 0 ? 1 : 0];
  // Valor de la "falta": lo que le falta al que va ganando para el juego.
  const falta = Math.max(1, vista.pointsToWin - Math.max(puntosMios, puntosRival));

  const soyMano = vista.manoSeat === vista.seat;
  const soyPie = vista.players === 2 && !soyMano;

  function jugar(c: Card) {
    sonido.slap();
    vibrar(12);
    onAccion({ type: 'PLAY_CARD', seat: vista.seat, card: c });
  }

  /** Despacha una acción; si es un canto grande, pide confirmación. */
  function cantar(a: Action, etiqueta: string, valor: number, grande: boolean) {
    vibrar(10);
    if (grande) {
      setConfirmando({
        action: a,
        titulo: `¿${etiqueta}?`,
        detalle: `Ponés en juego ${valor} punto${valor === 1 ? '' : 's'}. No se puede deshacer.`,
      });
    } else {
      onAccion(a);
    }
  }

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      {/* ─── Fondo: paño + luz cenital + riel ─────────────────────────── */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(120% 75% at 50% 30%, #12664c 0%, #0b3f30 58%, #062018 100%)',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-30 mix-blend-overlay"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, rgba(255,255,255,.05) 0 2px, transparent 2px 4px), repeating-linear-gradient(-45deg, rgba(0,0,0,.06) 0 2px, transparent 2px 4px)',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[26%] h-[70%] w-[150%] -translate-x-1/2 -translate-y-1/2"
        style={{
          background: 'radial-gradient(closest-side, rgba(255,240,200,.13), transparent 70%)',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          boxShadow:
            'inset 0 0 0 8px #3a2416, inset 0 0 0 9px rgba(0,0,0,.5), inset 0 0 30px 14px rgba(0,0,0,.45)',
        }}
      />

      {/* ─── Contenido ────────────────────────────────────────────────── */}
      <div className="relative z-10 flex min-h-dvh flex-col">
        {/* Marcador */}
        <header className="flex items-center justify-between gap-3 px-4 pt-3">
          <div className="flex items-center gap-2">
            <Tanteador etiqueta="Nosotros" valor={puntosMios} destacado />
            <Tanteador etiqueta="Ellos" valor={puntosRival} />
            <span className="self-center text-xs text-emerald-200/70">a {vista.pointsToWin}</span>
          </div>
          <div className="flex items-center gap-2">
            {vista.truco.level > 0 && (
              <span className="rounded-full border border-canto-500/50 bg-canto-500/20 px-2.5 py-1 text-xs font-semibold text-canto-300">
                {NIVEL_TRUCO[vista.truco.level - 1]}
                {vista.truco.accepted ? ' querido' : ''}
              </span>
            )}
            {vista.flor.iHaveFlor && (
              <span className="rounded-full border border-oro-500/50 bg-oro-500/15 px-2.5 py-1 text-xs font-semibold text-oro-300">
                Flor
              </span>
            )}
            {sala.config.apuesta > 0 && (
              <span className="hidden rounded-full border border-oro-500/30 bg-black/30 px-2.5 py-1 text-xs text-oro-300 sm:inline">
                🪙 {sala.config.apuesta}
              </span>
            )}
            <button
              onClick={sonido.alternarMudo}
              aria-label={sonido.mudo ? 'Activar sonido' : 'Silenciar'}
              className="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-sm text-emerald-100/80 hover:bg-black/50"
            >
              {sonido.mudo ? '🔇' : '🔊'}
            </button>
          </div>
        </header>

        {/* Rivales */}
        <section className="flex justify-center gap-8 px-4 pt-5" aria-label="Rivales">
          {rivales.map((r) => {
            const n = vista.handCounts[r.seat as number] ?? 0;
            return (
              <div key={r.userId} className="flex flex-col items-center gap-2">
                <div className="flex items-center gap-2.5">
                  <div
                    className="grid h-11 w-11 place-items-center rounded-full text-base font-bold text-cyan-50"
                    style={{
                      background: 'conic-gradient(from 200deg,#25506a,#123049)',
                      boxShadow: '0 0 0 2px rgba(232,176,75,.5), 0 6px 14px -6px #000',
                    }}
                  >
                    {r.username.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex" aria-label={`${r.username} tiene ${n} cartas`}>
                    {Array.from({ length: n }, (_, i) => (
                      <div
                        key={i}
                        className="-ml-6 first:ml-0"
                        style={{ transform: `rotate(${(i - (n - 1) / 2) * 5}deg)` }}
                      >
                        <ReversoCarta size="xs" />
                      </div>
                    ))}
                  </div>
                </div>
                <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-50/90">
                  {r.username}
                  {vista.manoSeat === r.seat && (
                    <span className="rounded bg-oro-500/20 px-1.5 text-[10px] font-semibold text-oro-300">
                      mano
                    </span>
                  )}
                  {!r.conectado && (
                    <span className="text-canto-400" title="Desconectado">
                      ⚠
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </section>

        {/* Paño: cartas jugadas + estampa */}
        <section
          className="relative flex flex-1 flex-col items-center justify-center gap-3 px-4 py-5"
          aria-label="Cartas jugadas"
        >
          {estampa && (
            <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
              <span
                className="animar-estampa select-none rounded-2xl border-4 px-5 py-1 font-bold"
                style={{
                  fontFamily: "'Iowan Old Style', Palatino, Georgia, serif",
                  fontSize: '2.6rem',
                  color: '#ffdca8',
                  borderColor: '#ffdca8',
                  background: 'rgba(122,29,36,.28)',
                  textShadow: '0 3px 0 rgba(82,18,23,.3), 0 0 26px rgba(246,215,138,.5)',
                }}
              >
                {estampa}
              </span>
            </div>
          )}

          {terminada ? (
            <Resultado vista={vista} miEquipo={miEquipo} matchId={sala.matchId} />
          ) : vista.tricks.every((t) => t.length === 0) ? (
            <p className="text-sm text-emerald-100/50">Repartiendo…</p>
          ) : (
            <div className="flex flex-col items-center gap-2.5">
              {vista.tricks.map((baza, i) =>
                baza.length === 0 ? null : (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-16 text-right text-[10px] uppercase tracking-wider text-emerald-100/40">
                      {NOMBRE_BAZA[i]}
                    </span>
                    {baza.map((j, k) => (
                      <div
                        key={k}
                        className={
                          j.seat === vista.seat ? 'animar-jugada-mia' : 'animar-jugada-rival'
                        }
                      >
                        <CartaEspanola
                          card={j.card}
                          size={i === vista.currentTrick ? 'md' : 'xs'}
                        />
                      </div>
                    ))}
                    {vista.trickOutcomes[i] && (
                      <span className="ml-1 text-sm">
                        {vista.trickOutcomes[i] === 'PARDA' ? (
                          <span className="text-emerald-100/50">parda</span>
                        ) : vista.trickOutcomes[i] === `TEAM_${miEquipo}` ? (
                          <span className="text-emerald-400">✓</span>
                        ) : (
                          <span className="text-canto-400">✗</span>
                        )}
                      </span>
                    )}
                  </div>
                ),
              )}
            </div>
          )}
        </section>

        {/* Mi mano (en abanico) + rol */}
        {!terminada && (
          <section className="px-4 pb-1" aria-label="Tus cartas">
            <div className="mb-1 flex items-center justify-center gap-2">
              {(soyMano || soyPie) && (
                <span className="rounded-full bg-black/30 px-2.5 py-0.5 text-[11px] font-medium text-emerald-100/80">
                  Sos {soyMano ? 'mano' : 'pie'}
                </span>
              )}
              {miTurno && (
                <span className="animar-latido rounded-full bg-oro-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-oro-300">
                  Tu turno
                </span>
              )}
            </div>
            <div className="flex items-end justify-center" style={{ minHeight: 176 }}>
              {vista.myHand.map((c, i) => {
                const n = vista.myHand.length;
                const jugable = miTurno && cartasJugables.has(claveCarta(c));
                const rot = (i - (n - 1) / 2) * 9;
                const dy = Math.abs(i - (n - 1) / 2) * 8;
                return (
                  <button
                    key={claveCarta(c)}
                    disabled={!jugable}
                    onClick={() => jugar(c)}
                    className="group -mx-2 rounded-lg transition-all duration-150 enabled:hover:z-10 disabled:cursor-not-allowed"
                    style={{
                      transform: `rotate(${rot}deg) translateY(${dy}px)`,
                      transformOrigin: 'bottom center',
                    }}
                    aria-label={`Jugar ${nombreCarta(c)}`}
                  >
                    <span
                      className="block transition-transform duration-150 group-enabled:group-hover:-translate-y-6 group-enabled:group-hover:scale-105"
                      style={{ transform: `rotate(${-rot}deg)` }}
                    >
                      <CartaEspanola card={c} size="lg" destacada={jugable} atenuada={!jugable} />
                    </span>
                  </button>
                );
              })}
              {vista.myHand.length === 0 && (
                <p className="py-6 text-sm text-emerald-100/50">Sin cartas en la mano</p>
              )}
            </div>
          </section>
        )}

        {/* Dock de acciones */}
        <section className="sticky bottom-0 z-10 border-t border-black/40 bg-[#06140f]/92 px-3 py-3 backdrop-blur">
          {terminada ? (
            <a href="/inicio" className="block">
              <Boton tamaño="lg" className="w-full">
                Volver al inicio
              </Boton>
            </a>
          ) : vista.legales.length === 0 ? (
            <p className="py-2 text-center text-sm text-emerald-100/60">Esperando al rival…</p>
          ) : (
            <div className="flex flex-wrap justify-center gap-2">
              {respuestas.map((a) => (
                <BotonMesa
                  key={a.type + (a.type === 'RESPOND' ? a.response : '')}
                  tono={a.type === 'RESPOND' && a.response === 'QUIERO' ? 'quiero' : 'noquiero'}
                  onClick={() => {
                    vibrar(10);
                    onAccion(a);
                  }}
                >
                  {a.type === 'RESPOND' && a.response === 'QUIERO' ? '¡Quiero!' : 'No quiero'}
                </BotonMesa>
              ))}

              {cantosFlor.map((a) => {
                const v = a.type === 'CALL_FLOR' ? a.variant : 'FLOR';
                const pts = v === 'FLOR' ? 3 : v === 'CONTRAFLOR' ? 6 : falta;
                return (
                  <BotonMesa
                    key={`flor-${v}`}
                    tono="oro"
                    valor={pts}
                    onClick={() =>
                      cantar(a, ETIQUETA_CANTO[v] ?? 'Flor', pts, v === 'CONTRAFLOR_AL_RESTO')
                    }
                  >
                    {ETIQUETA_CANTO[v] ?? 'Flor'}
                  </BotonMesa>
                );
              })}

              {cantosEnvido.map((a) => {
                const v = a.type === 'CALL_ENVIDO' ? a.variant : 'ENVIDO';
                const pts = v === 'ENVIDO' ? 2 : v === 'REAL_ENVIDO' ? 3 : falta;
                return (
                  <BotonMesa
                    key={`env-${v}`}
                    tono="verde"
                    valor={pts}
                    onClick={() =>
                      cantar(a, ETIQUETA_CANTO[v] ?? 'Envido', pts, v === 'FALTA_ENVIDO')
                    }
                  >
                    {ETIQUETA_CANTO[v] ?? 'Envido'}
                  </BotonMesa>
                );
              })}

              {cantoTruco &&
                (() => {
                  const pts = vista.truco.level + 2;
                  const etq = NIVEL_TRUCO[vista.truco.level] ?? 'Truco';
                  return (
                    <BotonMesa
                      tono="truco"
                      valor={pts}
                      onClick={() => cantar(cantoTruco, etq, pts, vista.truco.level >= 2)}
                    >
                      ¡{etq}!
                    </BotonMesa>
                  );
                })()}

              {mazo && (
                <BotonMesa
                  tono="mazo"
                  onClick={() =>
                    setConfirmando({
                      action: mazo,
                      titulo: '¿Te vas al mazo?',
                      detalle: 'Le entregás la mano al rival con los puntos que valga el truco.',
                    })
                  }
                >
                  Al mazo
                </BotonMesa>
              )}
            </div>
          )}
        </section>

        <div className="relative z-10 px-4 pb-4 pt-2">
          <Chat mensajes={mensajes} onEnviar={onChat} compacto />
        </div>
      </div>

      {confirmando && (
        <Confirmacion
          titulo={confirmando.titulo}
          detalle={confirmando.detalle}
          onCancelar={() => setConfirmando(null)}
          onConfirmar={() => {
            vibrar(20);
            onAccion(confirmando.action);
            setConfirmando(null);
          }}
        />
      )}
    </div>
  );
}

function claveCarta(c: Card): string {
  return `${c.suit}-${c.rank}`;
}

// ─── Botón de mesa (táctil, con puntos en juego) ─────────────────────────────

type TonoBoton = 'quiero' | 'noquiero' | 'oro' | 'verde' | 'truco' | 'mazo';

const ESTILO_BOTON: Record<TonoBoton, string> = {
  quiero: 'text-emerald-50 [background:linear-gradient(#1c7a4e,#12603c)]',
  noquiero: 'text-rose-50 [background:linear-gradient(#7a1d24,#521217)]',
  oro: 'text-noche-950 [background:linear-gradient(#f2cd7a,#d99b2f)] font-bold',
  verde: 'text-emerald-50 [background:linear-gradient(#17604a,#0e3d2f)]',
  truco: 'text-rose-50 [background:linear-gradient(#8a212a,#5c141a)] font-bold',
  mazo: 'text-slate-200 [background:linear-gradient(#252a33,#151920)]',
};

function BotonMesa({
  children,
  tono,
  valor,
  onClick,
}: {
  children: ReactNode;
  tono: TonoBoton;
  valor?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative h-12 min-w-[92px] rounded-2xl px-4 text-[15px] font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,.12),0_6px_14px_-8px_#000] transition-transform active:translate-y-0.5 ${ESTILO_BOTON[tono]}`}
      style={{ fontFamily: "'Iowan Old Style', Palatino, Georgia, serif" }}
    >
      {children}
      {valor !== undefined && (
        <span className="ml-1.5 rounded-full bg-black/25 px-1.5 text-[11px] font-bold align-middle">
          {valor}
        </span>
      )}
    </button>
  );
}

// ─── Tanteador ───────────────────────────────────────────────────────────────

function Tanteador({
  etiqueta,
  valor,
  destacado,
}: {
  etiqueta: string;
  valor: number;
  destacado?: boolean;
}) {
  return (
    <div
      className="min-w-[62px] rounded-xl border px-2.5 py-1 text-center"
      style={{
        background: 'rgba(6,20,15,.65)',
        borderColor: destacado ? 'rgba(232,176,75,.55)' : 'rgba(232,176,75,.22)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div className="text-[9px] uppercase tracking-wider text-emerald-100/50">{etiqueta}</div>
      <div
        className={`font-mono text-2xl font-bold ${destacado ? 'text-oro-300' : 'text-emerald-50'}`}
        style={{ fontVariantNumeric: 'tabular-nums' }}
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
  useEffect(() => {
    vibrar(gane ? [40, 60, 120] : [120]);
  }, [gane]);
  return (
    <div className="animar-aparecer text-center">
      <div className="text-6xl" aria-hidden="true">
        {gane ? '🏆' : '🫡'}
      </div>
      <h2 className={`mt-3 text-3xl font-bold ${gane ? 'text-oro-300' : 'text-emerald-50'}`}>
        {gane ? '¡Ganaste!' : 'Perdiste'}
      </h2>
      <p className="mt-1.5 font-mono text-lg text-emerald-100/70">
        {vista.scores[miEquipo]} — {vista.scores[miEquipo === 0 ? 1 : 0]}
      </p>
      {matchId && (
        <a
          href={`/reparto/${matchId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-block text-sm text-oro-300 underline-offset-4 hover:underline"
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
            Dale
          </Boton>
        </div>
      </div>
    </div>
  );
}
