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

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
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

/**
 * Media query reactiva (para elegir layout/tamaños por dispositivo).
 * Con `useSyncExternalStore` el primer commit en el cliente ya lee el valor
 * real (sin flash de tamaños) y sin warning de hidratación (el server siempre
 * devuelve false).
 */
function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const m = window.matchMedia(query);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () =>
      typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false,
    () => false,
  );
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

  // Refs y estado de animaciones.
  const centroRef = useRef<HTMLElement>(null);
  const vueloRef = useRef<HTMLDivElement>(null);
  const [volando, setVolando] = useState<{ card: Card; from: DOMRect } | null>(null);
  const [sacudir, setSacudir] = useState(false);
  const [dealKey, setDealKey] = useState(0);
  const prevLen = useRef(vista.myHand.length);

  // Reparto animado: cuando vuelve a haber 3 cartas, es una mano nueva.
  useEffect(() => {
    if (vista.myHand.length === 3 && prevLen.current < 3) setDealKey((k) => k + 1);
    prevLen.current = vista.myHand.length;
  }, [vista.myHand.length]);

  // Sacudida de pantalla en los cantos grandes.
  useEffect(() => {
    if (estampa && /(VALE CUATRO|FALTA|CONTRAFLOR)/.test(estampa)) {
      setSacudir(true);
      const t = setTimeout(() => setSacudir(false), 440);
      return () => clearTimeout(t);
    }
  }, [estampa]);

  // Vuelo de la carta desde la mano hasta el centro (Web Animations API).
  useEffect(() => {
    if (!volando) return;
    const centro = centroRef.current?.getBoundingClientRect();
    const el = vueloRef.current;
    if (!centro || !el) {
      setVolando(null);
      return;
    }
    const { from } = volando;
    const dx = centro.left + centro.width / 2 - (from.left + from.width / 2);
    const dy = centro.top + centro.height / 2 - (from.top + from.height / 2);
    const anim = el.animate(
      [
        { transform: 'translate(0,0) scale(1) rotate(0deg)' },
        { transform: `translate(${dx}px, ${dy}px) scale(.62) rotate(7deg)` },
      ],
      { duration: 300, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'forwards' },
    );
    const t = setTimeout(() => setVolando(null), 280);
    return () => {
      clearTimeout(t);
      try {
        anim.cancel();
      } catch {
        /* no-op */
      }
    };
  }, [volando]);

  // Dispositivo: en pantallas grandes la mesa se agranda y el chat va a un riel;
  // en touch, jugar una carta es a dos toques (elegir → confirmar).
  const grande = useMediaQuery('(min-width: 1024px)');
  // `any-pointer: coarse` = el dispositivo TIENE touch (aunque también haya
  // mouse): mejor pecar de seguro y pedir dos toques para algo irreversible.
  const esTouch = useMediaQuery('(any-pointer: coarse)');
  const [elegida, setElegida] = useState<string | null>(null);
  const sizeMano: 'lg' | 'xl' = grande ? 'xl' : 'lg';

  // Al cambiar de turno o repartirse una mano nueva, se descarta la carta que
  // estaba "elegida" (si no, una selección vieja podría jugarse de un toque).
  useEffect(() => {
    setElegida(null);
  }, [vista.turnSeat, dealKey]);

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

  function jugar(c: Card, el: HTMLElement) {
    if (volando) return;
    setElegida(null);
    sonido.slap();
    vibrar(12);
    // Tomamos el rect de la carta derecha (el <span> interno), no el del botón
    // rotado por el abanico: así el vuelo arranca justo donde está la carta.
    const origen = (el.querySelector('span') as HTMLElement | null) ?? el;
    setVolando({ card: c, from: origen.getBoundingClientRect() });
    onAccion({ type: 'PLAY_CARD', seat: vista.seat, card: c });
  }

  /**
   * Tocar una carta. En touch, el primer toque la ELIGE (la levanta) y el
   * segundo la juega — así no se tira la carta equivocada de un dedazo (jugar
   * es irreversible). Con mouse, el hover ya previsualiza, así que va directo.
   */
  function tocarCarta(c: Card, el: HTMLElement) {
    const clave = claveCarta(c);
    if (esTouch && elegida !== clave) {
      setElegida(clave);
      vibrar(8);
      return;
    }
    jugar(c, el);
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
    <div
      className={`relative flex min-h-dvh flex-col overflow-x-hidden ${sacudir ? 'animar-sacudida' : ''}`}
    >
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
      <div className="relative z-10 flex min-h-dvh flex-col lg:flex-row">
        {/* Columna central: la mesa (se centra y limita el ancho en desktop) */}
        <div className="flex min-h-dvh flex-1 flex-col lg:mx-auto lg:w-full lg:max-w-3xl">
          {/* Marcador (en desktop el score vive en el riel; acá se oculta) */}
          <header className="flex items-center justify-between gap-3 px-4 pt-3">
            <div className="flex items-center gap-2 lg:hidden">
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
              const suTurno = vista.turnSeat === r.seat;
              return (
                <div key={r.userId} className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`grid h-11 w-11 place-items-center rounded-full text-base font-bold text-cyan-50 ${
                        suTurno ? 'animar-latido' : ''
                      }`}
                      style={{
                        background: 'conic-gradient(from 200deg,#25506a,#123049)',
                        boxShadow: suTurno
                          ? '0 0 0 3px rgba(232,176,75,.95), 0 0 16px rgba(232,176,75,.55)'
                          : '0 0 0 2px rgba(232,176,75,.5), 0 6px 14px -6px #000',
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
                  {suTurno && r.conectado && (
                    <span
                      className="flex items-center gap-1 text-[10px] text-oro-300/90"
                      role="status"
                    >
                      pensando
                      <PuntitosPensando />
                    </span>
                  )}
                </div>
              );
            })}
          </section>

          {/* Paño: cartas jugadas + estampa */}
          <section
            ref={centroRef}
            className="relative flex flex-1 flex-col items-center justify-center gap-3 px-4 py-5"
            aria-label="Cartas jugadas"
          >
            {estampa && (
              <div
                className="pointer-events-none absolute inset-0 z-20 grid place-items-center"
                role="status"
                aria-live="assertive"
              >
                <span
                  className="animar-estampa select-none rounded-2xl border-4 px-5 py-1 text-center font-bold"
                  style={{
                    fontFamily: "'Iowan Old Style', Palatino, Georgia, serif",
                    fontSize: 'clamp(1.6rem, 6vw, 4rem)',
                    maxWidth: '92vw',
                    textWrap: 'balance',
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
            ) : (
              <Bazas vista={vista} miEquipo={miEquipo} grande={grande} />
            )}
          </section>

          {/* Mi mano (en abanico) + rol */}
          {!terminada && (
            <section className="px-4 pb-1" aria-label="Tus cartas">
              <div
                className="mb-1 flex items-center justify-center gap-2"
                role="status"
                aria-live="polite"
              >
                {(soyMano || soyPie) && (
                  <span className="rounded-full bg-black/30 px-2.5 py-0.5 text-[11px] font-medium text-emerald-100/80">
                    Sos {soyMano ? 'mano' : 'pie'}
                  </span>
                )}
                {elegida ? (
                  <span className="animar-latido rounded-full bg-oro-500/25 px-2.5 py-0.5 text-[11px] font-semibold text-oro-200">
                    Tocá de nuevo para tirar
                  </span>
                ) : miTurno ? (
                  <span className="animar-latido rounded-full bg-oro-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-oro-300">
                    Tu turno
                  </span>
                ) : null}
              </div>
              <div
                className="flex items-end justify-center"
                style={{ minHeight: grande ? 240 : 176 }}
              >
                {vista.myHand.map((c, i) => {
                  const n = vista.myHand.length;
                  const jugable = miTurno && cartasJugables.has(claveCarta(c));
                  const rot = (i - (n - 1) / 2) * 9;
                  const dy = Math.abs(i - (n - 1) / 2) * 8;
                  const clave = claveCarta(c);
                  const volandoEsta = volando && claveCarta(volando.card) === clave;
                  const elegidaEsta = elegida === clave;
                  return (
                    <div
                      key={`${dealKey}-${clave}`}
                      className="animar-mano -mx-3 md:-mx-2"
                      style={{ animationDelay: `${i * 80}ms`, opacity: volandoEsta ? 0 : 1 }}
                    >
                      <button
                        disabled={!jugable}
                        onClick={(e) => tocarCarta(c, e.currentTarget)}
                        className="group rounded-lg transition-all duration-150 enabled:hover:z-10 disabled:cursor-not-allowed"
                        style={{
                          transform: `rotate(${rot}deg) translateY(${dy}px)`,
                          transformOrigin: 'bottom center',
                        }}
                        aria-label={
                          elegidaEsta ? `Confirmar ${nombreCarta(c)}` : `Jugar ${nombreCarta(c)}`
                        }
                      >
                        <span
                          className={`block transition-transform duration-150 group-enabled:group-hover:-translate-y-6 group-enabled:group-hover:scale-105 ${
                            elegidaEsta ? '-translate-y-7 scale-105' : ''
                          }`}
                          style={{ transform: `rotate(${-rot}deg)` }}
                        >
                          <CartaEspanola
                            card={c}
                            size={sizeMano}
                            destacada={jugable || elegidaEsta}
                            atenuada={!jugable}
                          />
                        </span>
                      </button>
                    </div>
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

          {/* Chat: inline sólo en mobile/tablet (en desktop va al riel) */}
          <div className="relative z-10 px-4 pb-4 pt-2 lg:hidden">
            <Chat mensajes={mensajes} onEnviar={onChat} compacto />
          </div>
        </div>

        {/* ─── Riel lateral (desktop): marcador grande + chat ───────────── */}
        <aside className="hidden w-[340px] shrink-0 flex-col border-l border-black/40 bg-[#06140f]/80 backdrop-blur lg:flex">
          <div className="flex items-center justify-between gap-2 border-b border-black/30 p-4">
            <Tanteador etiqueta="Nosotros" valor={puntosMios} destacado />
            <span className="text-xs text-emerald-200/70">a {vista.pointsToWin}</span>
            <Tanteador etiqueta="Ellos" valor={puntosRival} />
          </div>
          <div className="min-h-0 flex-1 p-3">
            <Chat mensajes={mensajes} onEnviar={onChat} />
          </div>
        </aside>
      </div>

      {/* Carta en vuelo (de la mano al centro) */}
      {volando && (
        <div
          ref={vueloRef}
          className="pointer-events-none fixed z-40"
          style={{
            left: volando.from.left,
            top: volando.from.top,
            width: volando.from.width,
            height: volando.from.height,
          }}
        >
          <CartaEspanola card={volando.card} size={sizeMano} />
        </div>
      )}

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

/** Confeti liviano en canvas (sin dependencias) para la victoria. */
function Confeti() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const w = (cv.width = cv.offsetWidth);
    const h = (cv.height = cv.offsetHeight);
    const colores = ['#e8b04b', '#f6d78a', '#1c7a4e', '#c8323c', '#f2f4f7'];
    const parts = Array.from({ length: 90 }, () => ({
      x: Math.random() * w,
      y: -20 - Math.random() * h,
      vy: 2 + Math.random() * 3,
      vx: -1 + Math.random() * 2,
      s: 5 + Math.random() * 5,
      rot: Math.random() * Math.PI,
      vr: -0.2 + Math.random() * 0.4,
      c: colores[Math.floor(Math.random() * colores.length)] as string,
    }));
    let raf = 0;
    let frames = 0;
    const tick = () => {
      frames++;
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
        ctx.restore();
      }
      if (frames < 200) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" />;
}

function claveCarta(c: Card): string {
  return `${c.suit}-${c.rank}`;
}

/** Tres puntitos animados: "pensando…" del rival en su turno. */
function PuntitosPensando() {
  return (
    <span className="inline-flex gap-0.5" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="animar-latido inline-block h-1 w-1 rounded-full bg-oro-400"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

// ─── Bazas (las rondas en el centro del paño) ────────────────────────────────

const ANCHO_SLOT: Record<'sm' | 'md', number> = { sm: 62, md: 86 };
const NOMBRE_CORTO = ['1ª', '2ª', '3ª'];

/**
 * Las tres bazas dispuestas como en la mesa: cada una es una columna con la
 * carta del rival arriba y la tuya abajo, enfrentadas. La ganadora queda
 * resaltada y la perdedora atenuada; la baza en juego se destaca. Las que
 * faltan muestran el hueco, para que se lea la estructura de la mano.
 */
function Bazas({
  vista,
  miEquipo,
  grande,
}: {
  vista: VistaJugador;
  miEquipo: number;
  grande: boolean;
}) {
  const arranco = vista.tricks.some((t) => t.length > 0);
  const size: 'sm' | 'md' = grande ? 'md' : 'sm';
  return (
    <div className="flex items-start justify-center gap-4 sm:gap-6 lg:gap-8">
      {[0, 1, 2].map((i) => {
        const baza = vista.tricks[i] ?? [];
        const rivales = baza.filter((p) => p.seat % 2 !== miEquipo);
        const mias = baza.filter((p) => p.seat % 2 === miEquipo);
        const outcome = vista.trickOutcomes[i];
        const resuelta = Boolean(outcome);
        const parda = outcome === 'PARDA';
        const gane = outcome === `TEAM_${miEquipo}`;
        const enJuego = arranco && !resuelta && i === vista.currentTrick;

        return (
          <div
            key={i}
            className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-2 transition-all duration-300 ${
              enJuego ? 'scale-105 bg-black/20 ring-1 ring-oro-500/40' : 'scale-100'
            } ${resuelta ? 'opacity-95' : ''}`}
          >
            <span
              className={`text-[10px] font-semibold uppercase tracking-widest ${
                enJuego ? 'text-oro-300' : 'text-emerald-100/35'
              }`}
            >
              {NOMBRE_CORTO[i]}
            </span>

            <SlotBaza
              cartas={rivales}
              lado="rival"
              size={size}
              destacada={resuelta && !parda && !gane}
              atenuada={resuelta && (gane || parda)}
            />

            <span className="flex h-4 items-center text-[11px] font-medium">
              {!resuelta ? (
                <span className="text-emerald-100/15">·</span>
              ) : parda ? (
                <span className="text-emerald-100/50">parda</span>
              ) : gane ? (
                <span className="text-emerald-400">▲</span>
              ) : (
                <span className="text-canto-400">▼</span>
              )}
            </span>

            <SlotBaza
              cartas={mias}
              lado="mia"
              size={size}
              destacada={resuelta && !parda && gane}
              atenuada={resuelta && !parda && !gane}
            />
          </div>
        );
      })}
    </div>
  );
}

function SlotBaza({
  cartas,
  lado,
  size,
  destacada,
  atenuada,
}: {
  cartas: { seat: number; card: Card }[];
  lado: 'rival' | 'mia';
  size: 'sm' | 'md';
  destacada: boolean;
  atenuada: boolean;
}) {
  if (cartas.length === 0) {
    const w = ANCHO_SLOT[size];
    return (
      <div
        className="rounded-lg border border-dashed border-white/10"
        style={{ width: w, height: Math.round(w * 1.541) }}
        aria-hidden="true"
      />
    );
  }
  return (
    <div className="flex gap-1">
      {cartas.map((p, k) => (
        // La carta propia entra por el vuelo desde la mano; la del rival cae de arriba.
        <div key={k} className={lado === 'rival' ? 'animar-jugada-rival' : 'animar-jugada-mia'}>
          <CartaEspanola card={p.card} size={size} destacada={destacada} atenuada={atenuada} />
        </div>
      ))}
    </div>
  );
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
      {gane && <Confeti />}
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
