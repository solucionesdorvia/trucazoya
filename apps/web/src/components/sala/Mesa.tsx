'use client';

/**
 * Mesa de juego. NO tiene lógica de truco: los botones que ve el jugador salen
 * de `vista.legales`, que calcula el motor en el servidor. Si acá apareciera un
 * botón de más, el servidor igual rechazaría la acción.
 *
 * Diseño: mesa de peña de noche — paño con textura y luz cenital, riel de
 * madera, naipes reales, fósforos para el tanteador y estampa de canto. La
 * carta se tira tocándola o arrastrándola a la mesa. Sin scroll: entra en
 * pantalla. Feedback sonoro y háptico.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
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
    tick: () => tono(1400, 0.02, 'sine', 0.02),
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
    flor: vista.flor.contested,
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let texto: string | null = null;
    if (vista.truco.level > prev.current.truco)
      texto = `¡${(NIVEL_TRUCO[vista.truco.level - 1] ?? 'Truco').toUpperCase()}!`;
    else if (vista.envido.pending.length > prev.current.envido) {
      const ult = vista.envido.pending[vista.envido.pending.length - 1] ?? 'ENVIDO';
      texto = `¡${(ETIQUETA_CANTO[ult] ?? 'Envido').toUpperCase()}!`;
    } else if (vista.flor.contested && vista.flor.contested !== prev.current.flor)
      texto = `¡${(ETIQUETA_CANTO[vista.flor.contested] ?? 'Flor').toUpperCase()}!`;

    prev.current = {
      truco: vista.truco.level,
      envido: vista.envido.pending.length,
      flor: vista.flor.contested,
    };

    if (texto) {
      setEstampa(texto);
      onCanto();
      vibrar([25, 40, 25]);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setEstampa(null), 1300);
    }
  }, [vista.truco.level, vista.envido.pending.length, vista.flor.contested, onCanto]);

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
  ausencia,
  onRevancha,
}: {
  sala: SnapshotSala;
  vista: VistaJugador;
  onAccion: (a: Action) => void;
  mensajes: MensajeChat[];
  onChat: (t: string) => void;
  /** Rival caído: hasta cuándo se lo espera antes de cerrar por abandono. */
  ausencia?: { userId: string; venceEn: number } | null;
  /** Pide revancha con el mismo rival (recicla la sala). */
  onRevancha?: () => void;
}) {
  const [confirmando, setConfirmando] = useState<Confirmable | null>(null);
  const sonido = useSonido();
  const estampa = useEstampaCanto(vista, sonido.canto);

  // Declamación del envido resuelto con quiero: se cantan los tantos en
  // orden de mano, como en la mesa real ("¡32!" → "son buenas" / "¡33,
  // son mejores!"). Los puntos ya los acreditó el motor; esto es el rito.
  const [declama, setDeclama] = useState<string | null>(null);
  // `vista.envidoResult` es un objeto NUEVO en cada broadcast, así que
  // depender de su identidad re-ejecutaba el efecto a media declamación: el
  // cleanup mataba los timers y la línea quedaba PEGADA el resto de la
  // partida. Se depende del contenido, que sí es estable.
  const claveEnvido = vista.envidoResult
    ? vista.envidoResult.declarations.map((d) => `${d.seat}:${d.points}`).join('|')
    : null;
  const ctxDeclama = useRef({ seat: vista.seat, participantes: sala.participantes });
  ctxDeclama.current = { seat: vista.seat, participantes: sala.participantes };
  useEffect(() => {
    const r = vista.envidoResult;
    if (!claveEnvido || !r) {
      setDeclama(null);
      return;
    }
    const nombreDe = (seat: number) =>
      seat === ctxDeclama.current.seat
        ? 'Vos'
        : (ctxDeclama.current.participantes.find((p) => p.seat === seat)?.username ?? 'Rival');
    const lineas: string[] = [];
    let max = -1;
    for (const d of r.declarations) {
      if (d.points > max) {
        lineas.push(`${nombreDe(d.seat)}: ¡${d.points}${max >= 0 ? ', son mejores' : ''}!`);
        max = d.points;
      } else {
        lineas.push(`${nombreDe(d.seat)}: son buenas`);
      }
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    lineas.forEach((l, i) => timers.push(setTimeout(() => setDeclama(l), 500 + i * 1250)));
    timers.push(setTimeout(() => setDeclama(null), 500 + lineas.length * 1250));
    return () => {
      timers.forEach(clearTimeout);
      setDeclama(null);
    };
  }, [claveEnvido]);

  // Cuenta atrás de la espera al jugador que se cayó.
  const [restante, setRestante] = useState(0);
  useEffect(() => {
    if (!ausencia) {
      setRestante(0);
      return;
    }
    const tick = () => setRestante(Math.max(0, Math.round((ausencia.venceEn - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [ausencia]);

  // Refs y estado de animaciones.
  const centroRef = useRef<HTMLElement>(null);
  const vueloRef = useRef<HTMLDivElement>(null);
  const sombraVueloRef = useRef<HTMLDivElement>(null);
  const [volando, setVolando] = useState<{ card: Card; from: DOMRect; trick: number } | null>(null);
  // Carta propia recién jugada: no re-anima su entrada en la baza (ya llegó
  // volando desde la mano), para que encastre en vez de brotar de nuevo.
  const [ultimaMia, setUltimaMia] = useState<string | null>(null);
  const [sacudir, setSacudir] = useState(false);
  const [barrer, setBarrer] = useState<'abajo' | 'arriba' | null>(null);
  const decisorRef = useRef(false);
  const [dealKey, setDealKey] = useState(0);
  const prevLen = useRef(vista.myHand.length);

  // Reparto animado: cuando vuelve a haber 3 cartas, es una mano nueva.
  useEffect(() => {
    if (vista.myHand.length === 3 && prevLen.current < 3) {
      setDealKey((k) => k + 1);
      setUltimaMia(null);
    }
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

  // Cierre de mano: cuando un equipo se lleva 2 bazas, las cartas de la mesa
  // barren hacia el ganador (abajo si gané yo, arriba si ganó el rival).
  useEffect(() => {
    const outs = vista.trickOutcomes;
    const w0 = outs.filter((o) => o === 'TEAM_0').length;
    const w1 = outs.filter((o) => o === 'TEAM_1').length;
    const ganador = w0 >= 2 ? 0 : w1 >= 2 ? 1 : null;
    if (ganador !== null && !decisorRef.current) {
      decisorRef.current = true;
      setBarrer(ganador === vista.team ? 'abajo' : 'arriba');
      const t = setTimeout(() => setBarrer(null), 520);
      return () => clearTimeout(t);
    }
    if (ganador === null) {
      decisorRef.current = false;
      setBarrer(null);
    }
  }, [vista.trickOutcomes, vista.team]);

  // Vuelo de la carta: la mano ALZA el naipe (5%), viaja achicándose en
  // pleno movimiento (donde no se nota) y se APOYA con un snap mínimo del
  // 2%, rígido, sin rebote gomoso. El impacto (slap + vibración) suena al
  // tocar el paño, no al soltar el dedo.
  useEffect(() => {
    if (!volando) return;
    const el = vueloRef.current;
    const slot = document
      .querySelector(`[data-slot-mia="${volando.trick}"]`)
      ?.getBoundingClientRect();
    const destino = slot ?? centroRef.current?.getBoundingClientRect();
    if (!destino || !el) {
      setVolando(null);
      return;
    }
    const { from } = volando;
    // Ancho REAL del naipe del overlay (el rect de origen puede venir
    // inflado por el scale de hover/drag: no sirve para escalar).
    const A = sizeMano === 'xl' ? 150 : 112;
    const dx = destino.left + destino.width / 2 - (from.left + from.width / 2);
    const dy = destino.top + destino.height / 2 - (from.top + from.height / 2);
    const esc = slot ? slot.width / A : 0.56;
    const reducido =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dur = reducido ? 1 : 320;
    const anim = el.animate(
      [
        {
          offset: 0,
          transform: 'translate(0,0) scale(1) rotate(0deg)',
          easing: 'cubic-bezier(.3,.1,.5,1)',
        },
        {
          offset: 0.22,
          transform: `translate(${dx * 0.22}px, ${dy * 0.3 - 12}px) scale(1.05) rotate(-5deg)`,
          easing: 'cubic-bezier(.35,0,.25,1)',
        },
        {
          offset: 0.8,
          transform: `translate(${dx * 0.96}px, ${dy * 0.99}px) scale(${esc * 1.02}) rotate(-1.5deg)`,
          easing: 'cubic-bezier(.55,0,.85,.55)',
        },
        { offset: 1, transform: `translate(${dx}px, ${dy}px) scale(${esc}) rotate(0deg)` },
      ],
      { duration: dur, fill: 'forwards' },
    );
    // La sombra converge con la carta al tocar el paño (touchdown legible).
    sombraVueloRef.current?.animate(
      [
        { transform: 'translate(10px, 10px) scale(.35)', opacity: 0 },
        {
          transform: `translate(${dx + 10}px, ${dy + 10}px) scale(${esc})`,
          opacity: 0.3,
          offset: 0.8,
        },
        { transform: `translate(${dx}px, ${dy}px) scale(${esc})`, opacity: 0.38 },
      ],
      { duration: dur, easing: 'linear', fill: 'forwards' },
    );
    const tImpacto = setTimeout(
      () => {
        sonido.slap();
        vibrar(12);
      },
      reducido ? 0 : 300,
    );
    const t = setTimeout(() => setVolando(null), reducido ? 30 : 330);
    return () => {
      clearTimeout(t);
      clearTimeout(tImpacto);
      try {
        anim.cancel();
      } catch {
        /* no-op */
      }
    };
  }, [volando]);

  // En pantallas grandes la mesa se agranda y el chat va a un riel lateral.
  const grande = useMediaQuery('(min-width: 1024px)');
  const sizeMano: 'lg' | 'xl' = grande ? 'xl' : 'lg';
  // Chat como panel flotante en mobile (así la mesa no necesita scroll).
  const [chatAbierto, setChatAbierto] = useState(false);
  // Arrastre de carta: se levanta con el dedo/mouse y se tira al soltarla
  // arriba (hacia la mesa). Un toque simple también la tira.
  const [arrastre, setArrastre] = useState<{
    clave: string;
    dx: number;
    dy: number;
    listo: boolean;
  } | null>(null);
  const arrastreRef = useRef<{
    clave: string;
    x0: number;
    y0: number;
    mov: number;
    card: Card;
    el: HTMLElement;
  } | null>(null);

  const miTurno = vista.turnSeat === vista.seat && vista.legales.length > 0;
  const terminada = vista.phase === 'MATCH_FINISHED';

  // Sólo el equipo contrario: antes incluía al compañero, que aparecía como
  // rival y además hacía desbordar la fila en 2v2.
  const rivales = sala.participantes.filter((p) => p.seat !== null && p.seat % 2 !== vista.team);
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

  function jugar(c: Card, el: HTMLElement) {
    if (volando) return;
    sonido.tick();
    // Tomamos el rect de la carta derecha (el <span> interno), no el del botón
    // rotado por el abanico: así el vuelo arranca justo donde está la carta.
    const origen = (el.querySelector('span') as HTMLElement | null) ?? el;
    setUltimaMia(claveCarta(c));
    setVolando({ card: c, from: origen.getBoundingClientRect(), trick: vista.currentTrick });
    onAccion({ type: 'PLAY_CARD', seat: vista.seat, card: c });
  }

  // ─── Arrastrar / tocar la carta para tirarla ──────────────────────────────
  function cartaDown(e: ReactPointerEvent<HTMLButtonElement>, c: Card, jugable: boolean) {
    if (!jugable || volando) return;
    const el = e.currentTarget;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* no-op */
    }
    arrastreRef.current = {
      clave: claveCarta(c),
      x0: e.clientX,
      y0: e.clientY,
      mov: 0,
      card: c,
      el,
    };
    setArrastre({ clave: claveCarta(c), dx: 0, dy: 0, listo: false });
  }
  function cartaMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const a = arrastreRef.current;
    if (!a) return;
    const dx = e.clientX - a.x0;
    const dy = e.clientY - a.y0;
    a.mov = Math.max(a.mov, Math.hypot(dx, dy));
    // `listo` = arrastrada lo suficiente hacia la mesa como para tirarla.
    setArrastre({ clave: a.clave, dx, dy, listo: dy <= -46 });
  }
  function cartaUp(e: ReactPointerEvent<HTMLButtonElement>) {
    const a = arrastreRef.current;
    if (!a) return;
    arrastreRef.current = null;
    const dy = e.clientY - a.y0;
    // Toque simple (casi sin mover) o arrastre hacia la mesa (arriba) = tirar.
    const tirar = a.mov < 8 || dy <= -46;
    if (tirar) jugar(a.card, a.el); // lee el rect actual (donde quedó la carta)
    setArrastre(null);
  }
  /** El navegador puede cancelar el gesto sin emitir pointerup: hay que soltar. */
  function cartaCancel() {
    arrastreRef.current = null;
    setArrastre(null);
  }

  // Accesibilidad: tirar la carta con teclado (Enter/Espacio).
  function cartaKey(e: ReactKeyboardEvent<HTMLButtonElement>, c: Card, jugable: boolean) {
    if (!jugable || volando) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      jugar(c, e.currentTarget);
    }
  }

  /** Despacha un canto; si es de los grandes, pide confirmación (sin puntos). */
  function cantar(a: Action, etiqueta: string, grande: boolean) {
    vibrar(10);
    if (grande) {
      setConfirmando({ action: a, titulo: `¿${etiqueta}?`, detalle: 'No se puede deshacer.' });
    } else {
      onAccion(a);
    }
  }

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden">
      {/* ─── Fondo: la sala de la peña, de noche. La mesa (oval) vive en el
          paño central; el fondo es más oscuro para que la mesa "salte". ── */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 90% at 50% 18%, #10382c 0%, #0a241d 42%, #051510 72%, #030b08 100%)',
        }}
      />
      {/* Grano ambiental (feTurbulence): aire de sala, no superficie plana. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[.05] mix-blend-soft-light"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='170' height='170'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          backgroundSize: '170px 170px',
        }}
      />
      {/* Cono de luz de la lámpara colgante, cayendo sobre la mesa. */}
      <div
        aria-hidden="true"
        className="animar-lampara pointer-events-none absolute left-1/2 top-[30%] h-[90%] w-[170%] -translate-x-1/2 -translate-y-1/2"
        style={{
          background: 'radial-gradient(closest-side, rgba(242,205,122,.13), transparent 70%)',
        }}
      />
      {/* Viñeta de la sala: esquinas en penumbra. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(125% 110% at 50% 40%, transparent 46%, rgba(0,0,0,.62) 100%)',
        }}
      />

      {/* ─── Contenido ────────────────────────────────────────────────── */}
      <div
        className={`relative z-10 flex h-dvh min-h-0 flex-col lg:flex-row ${
          sacudir ? 'animar-sacudida' : ''
        }`}
      >
        {/* Columna central: la mesa (se centra y limita el ancho en desktop) */}
        <div className="flex h-dvh min-h-0 flex-1 flex-col lg:mx-auto lg:w-full lg:max-w-3xl">
          {/* Marcador (en desktop el score vive en el riel; acá se oculta) */}
          <header className="flex items-center justify-between gap-2 px-4 pt-3">
            <div className="flex min-w-0 items-center gap-2 lg:hidden">
              <Tanteador etiqueta="Nosotros" valor={puntosMios} destacado />
              <Tanteador etiqueta="Ellos" valor={puntosRival} />
              <span className="shrink-0 self-center whitespace-nowrap text-sm text-emerald-200/85">
                a {vista.pointsToWin}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {sala.config.apuesta > 0 && (
                <span className="hidden shrink-0 rounded-full border border-oro-500/30 bg-black/30 px-2.5 py-1 text-xs text-oro-300 sm:inline">
                  🪙 {sala.config.apuesta}
                </span>
              )}
              <a
                href="/reglas"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Cómo se juega"
                title="¿Cómo se juega?"
                className="shrink-0 rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-sm font-semibold text-emerald-100/80 hover:bg-black/50"
              >
                ?
              </a>
              <button
                onClick={sonido.alternarMudo}
                aria-label={sonido.mudo ? 'Activar sonido' : 'Silenciar'}
                title={sonido.mudo ? 'Sonido apagado' : 'Sonido prendido'}
                className="shrink-0 rounded-full border border-white/10 bg-black/30 px-2 py-1 text-sm text-emerald-100/80 hover:bg-black/50"
              >
                {sonido.mudo ? '🔇' : '🔊'}
              </button>
              <button
                onClick={() => setChatAbierto(true)}
                aria-label="Abrir chat"
                title="Chat"
                className="shrink-0 rounded-full border border-white/10 bg-black/30 px-2 py-1 text-sm text-emerald-100/80 hover:bg-black/50 lg:hidden"
              >
                💬
              </button>
            </div>
          </header>

          {/* Rivales: sentados al borde de la mesa (pisan el óvalo) */}
          <section
            className="relative z-10 -mb-5 flex flex-wrap justify-center gap-x-4 gap-y-2 px-2 pt-4 sm:-mb-7 sm:gap-x-8"
            aria-label="Rivales"
          >
            {rivales.map((r) => {
              const n = vista.handCounts[r.seat as number] ?? 0;
              const suTurno = vista.turnSeat === r.seat;
              return (
                <div key={r.userId} className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`grid h-11 w-11 place-items-center rounded-full text-base font-bold ${
                        suTurno ? 'animar-latido' : ''
                      }`}
                      style={{
                        background: 'conic-gradient(from 210deg,#1f2531,#10131a)',
                        color: '#f2cd7a',
                        textShadow: '0 1px 0 rgba(0,0,0,.5)',
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
                  <span className="flex max-w-[46vw] items-center gap-1.5 rounded-full border border-oro-500/25 bg-black/55 px-2.5 py-0.5 text-sm font-medium text-emerald-50 backdrop-blur-sm sm:max-w-none">
                    <span className="min-w-0 truncate">{r.username}</span>
                    {vista.manoSeat === r.seat && (
                      <span className="rounded bg-oro-500/20 px-1.5 text-xs font-semibold text-oro-300">
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
                    <span className="flex items-center gap-1 text-xs text-oro-300" role="status">
                      pensando
                      <PuntitosPensando />
                    </span>
                  )}
                </div>
              );
            })}
          </section>

          {/* La mesa: un tablero oval físico sobre el que caen las cartas */}
          <section
            ref={centroRef}
            className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-hidden px-4 py-3"
            aria-label="Cartas jugadas"
          >
            {/* Tablero oval: riel de madera + paño con inlay dorado + luz. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-[-14%] bottom-[1%] top-[4%]"
            >
              {/* Sombra que la mesa proyecta sobre el piso de la sala */}
              <div
                className="absolute inset-0"
                style={{
                  borderRadius: '50%',
                  boxShadow: '0 34px 70px -18px rgba(0,0,0,.75), 0 10px 24px -8px rgba(0,0,0,.5)',
                }}
              />
              {/* Riel de madera lustrada */}
              <div
                className="absolute inset-0"
                style={{
                  borderRadius: '50%',
                  background: 'linear-gradient(180deg,#4a2f1b 0%,#2f1d10 55%,#1c110a 100%)',
                  boxShadow:
                    'inset 0 2px 0 rgba(242,205,122,.22), inset 0 -8px 16px rgba(0,0,0,.6)',
                }}
              />
              {/* Paño interior con inlay dorado */}
              <div
                className="absolute inset-[9px] sm:inset-[12px]"
                style={{
                  borderRadius: '50%',
                  background:
                    'radial-gradient(92% 72% at 50% 36%, #17705a 0%, #0e4d3c 46%, #093528 78%, #072b21 100%)',
                  boxShadow:
                    'inset 0 0 0 2px rgba(232,176,75,.30), inset 0 12px 34px rgba(0,0,0,.38), inset 0 -16px 44px rgba(0,0,0,.5)',
                }}
              />
              {/* Brillo especular de la lámpara sobre el paño */}
              <div
                className="animar-lampara absolute inset-[9px] sm:inset-[12px]"
                style={{
                  borderRadius: '50%',
                  background:
                    'radial-gradient(58% 30% at 50% 16%, rgba(242,205,122,.14), transparent 72%)',
                }}
              />
            </div>

            {/* Al arrastrar una carta, la mesa entera se enciende como destino. */}
            {arrastre && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-[-14%] bottom-[1%] top-[4%] z-10 transition-shadow duration-200"
                style={{
                  borderRadius: '50%',
                  boxShadow: arrastre.listo
                    ? 'inset 0 0 0 3px rgba(232,176,75,.85), inset 0 0 46px rgba(232,176,75,.28)'
                    : 'inset 0 0 0 2px rgba(232,176,75,.35)',
                }}
              />
            )}

            {/* Estado de la mano (truco/flor): antes vivía en el header y lo
                desbordaba en mobile; ahora va sobre el borde de la mesa. */}
            {!terminada && (vista.truco.level > 0 || vista.flor.called) && (
              <div className="absolute left-1/2 top-1 z-20 flex -translate-x-1/2 gap-2">
                {vista.truco.level > 0 && (
                  <span className="rounded-full border border-canto-500/50 bg-canto-500/25 px-2.5 py-0.5 text-xs font-semibold text-canto-300 backdrop-blur-sm">
                    {NIVEL_TRUCO[vista.truco.level - 1]}
                    {vista.truco.accepted ? ' querido' : ''}
                  </span>
                )}
                {vista.flor.called && (
                  <span className="rounded-full border border-oro-500/50 bg-oro-500/20 px-2.5 py-0.5 text-xs font-semibold text-oro-300 backdrop-blur-sm">
                    Flor
                  </span>
                )}
              </div>
            )}

            {ausencia && restante > 0 && (
              <div
                className="absolute inset-x-3 top-10 z-30 rounded-2xl border border-canto-500/50 bg-noche-950/92 p-4 text-center backdrop-blur"
                role="status"
                aria-live="polite"
              >
                <p className="text-base font-semibold text-canto-300">
                  {sala.participantes.find((p) => p.userId === ausencia.userId)?.username ??
                    'El rival'}{' '}
                  se desconectó
                </p>
                <p className="mt-1 text-sm text-tinta-200">
                  Lo esperamos{' '}
                  <strong className="font-mono text-oro-300">
                    {Math.floor(restante / 60)}:{String(restante % 60).padStart(2, '0')}
                  </strong>
                  . Si no vuelve, ganás la partida y se te acreditan las fichas.
                </p>
              </div>
            )}

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

            {!estampa && declama && (
              <div
                key={declama}
                className="pointer-events-none absolute inset-0 z-20 grid place-items-center"
                role="status"
                aria-live="polite"
              >
                <span
                  className="animar-estampa select-none rounded-2xl border-2 px-4 py-1 text-center font-bold"
                  style={{
                    fontFamily: "'Iowan Old Style', Palatino, Georgia, serif",
                    fontSize: 'clamp(1.1rem, 4.5vw, 2.2rem)',
                    maxWidth: '92vw',
                    color: '#ffdca8',
                    borderColor: 'rgba(255,220,168,.8)',
                    background: 'rgba(6,20,15,.72)',
                    textShadow: '0 2px 0 rgba(0,0,0,.4), 0 0 18px rgba(246,215,138,.4)',
                  }}
                >
                  {declama}
                </span>
              </div>
            )}

            {/* Mazo apoyado sobre la mesa (solo desktop). */}
            {!terminada && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute right-[13%] top-[18%] hidden -rotate-6 lg:block"
                style={{ width: 62, height: 96 }}
              >
                <ReversoCarta size="sm" className="absolute left-0 top-0 -rotate-6 opacity-70" />
                <ReversoCarta size="sm" className="absolute left-1 top-px rotate-3 opacity-85" />
                <ReversoCarta size="sm" className="absolute left-0.5 top-0" />
              </div>
            )}

            {terminada ? (
              <Resultado vista={vista} miEquipo={miEquipo} matchId={sala.matchId} />
            ) : (
              /* Perspectiva sutil: las bazas se apoyan EN la mesa, no flotan. */
              <div
                className="relative z-10"
                style={{ transform: 'perspective(1100px) rotateX(5deg)' }}
              >
                <Bazas
                  vista={vista}
                  miEquipo={miEquipo}
                  grande={grande}
                  ultimaMia={ultimaMia}
                  barrer={barrer}
                />
              </div>
            )}
          </section>

          {/* Mi mano (en abanico) — tocá o arrastrá la carta para tirarla */}
          {!terminada && (
            <section className="shrink-0 px-4 pb-1" aria-label="Tus cartas">
              {miTurno && cartasJugables.size > 0 && respuestas.length === 0 && (
                <p role="status" className="mb-1 text-center text-sm font-semibold text-oro-300">
                  Tu turno — tocá o arrastrá una carta ↑
                </p>
              )}
              <div
                className="flex items-end justify-center"
                style={{ minHeight: grande ? 210 : 156 }}
              >
                {vista.myHand.map((c, i) => {
                  const n = vista.myHand.length;
                  const jugable = miTurno && cartasJugables.has(claveCarta(c));
                  const rot = (i - (n - 1) / 2) * 9;
                  const dyFan = Math.abs(i - (n - 1) / 2) * 8;
                  const clave = claveCarta(c);
                  const volandoEsta = volando && claveCarta(volando.card) === clave;
                  const arrastrando = arrastre?.clave === clave;
                  const centro = (n - 1) / 2;
                  return (
                    <div
                      key={`${dealKey}-${clave}`}
                      className={
                        arrastrando ? '-mx-3 md:-mx-2' : 'animar-reparto-mazo -mx-3 md:-mx-2'
                      }
                      style={
                        {
                          animationDelay: `${i * 95}ms`,
                          opacity: volandoEsta || clave === ultimaMia ? 0 : 1,
                          zIndex: arrastrando ? 50 : undefined,
                          // Sigue al dedo mientras arrastro; al soltar sin llegar,
                          // vuelve deslizándose (transición) en vez de saltar.
                          transform: arrastrando
                            ? `translate(${arrastre!.dx}px, ${arrastre!.dy}px)`
                            : 'translate(0px, 0px)',
                          transition: arrastrando
                            ? 'none'
                            : 'transform .2s cubic-bezier(.2,.9,.25,1)',
                          touchAction: 'none',
                          '--rx': `${(i - centro) * -46}px`,
                          '--ry': '-168px',
                          '--rr': `${(i - centro) * 7}deg`,
                        } as CSSProperties
                      }
                    >
                      <button
                        data-carta={clave}
                        disabled={!jugable || clave === ultimaMia}
                        onPointerDown={(e) => cartaDown(e, c, jugable)}
                        onPointerMove={cartaMove}
                        onPointerUp={cartaUp}
                        onPointerCancel={cartaCancel}
                        onLostPointerCapture={cartaCancel}
                        onKeyDown={(e) => cartaKey(e, c, jugable)}
                        className="group touch-none rounded-lg transition-transform duration-150 enabled:cursor-grab enabled:hover:z-10 enabled:active:cursor-grabbing disabled:cursor-not-allowed"
                        style={{
                          transform: arrastrando
                            ? `rotate(0deg) scale(${arrastre!.listo ? 1.14 : 1.08})`
                            : `rotate(${rot}deg) translateY(${dyFan}px)`,
                          transformOrigin: 'bottom center',
                        }}
                        aria-label={`Tirar ${nombreCarta(c)}`}
                      >
                        <span
                          className={`block transition-transform duration-150 ${
                            arrastrando
                              ? ''
                              : 'group-enabled:group-hover:-translate-y-6 group-enabled:group-hover:scale-105'
                          }`}
                          style={{ transform: arrastrando ? 'none' : `rotate(${-rot}deg)` }}
                        >
                          <CartaEspanola
                            card={c}
                            size={sizeMano}
                            destacada={jugable}
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

          {/* Dock de acciones: la bandeja de madera de tu lado de la mesa */}
          <section
            className="z-10 shrink-0 px-3 py-2"
            style={{
              background: 'linear-gradient(180deg,#2b1a0e 0%,#1c1108 34%,#140c06 100%)',
              boxShadow: 'inset 0 1px 0 rgba(242,205,122,.15), 0 -8px 20px -10px rgba(0,0,0,.85)',
            }}
          >
            {terminada ? (
              <div className="flex flex-col gap-2">
                {onRevancha && (
                  <Boton tamaño="lg" className="w-full" onClick={onRevancha}>
                    Revancha
                  </Boton>
                )}
                <a href="/inicio" className="block">
                  <Boton variante="fantasma" className="w-full">
                    Volver al inicio
                  </Boton>
                </a>
              </div>
            ) : vista.legales.length === 0 ? (
              <p className="py-2 text-center text-base text-amber-100/80">Esperando al rival…</p>
            ) : (
              <>
                {respuestas.length > 0 &&
                  (() => {
                    // `envido.pending` NO se vacía al resolverse el envido: si
                    // sólo se mirara que tiene contenido, un truco cantado
                    // después se anunciaría como "Envido". Se nombra el canto
                    // que de verdad está esperando respuesta.
                    // La FASE es la única fuente autoritativa de qué canto
                    // está esperando respuesta: los campos de estado no se
                    // limpian y delataban cantos viejos (o inexistentes).
                    let nombre = 'un canto';
                    if (vista.phase === 'ENVIDO_PENDING') {
                      const v = vista.envido.pending[vista.envido.pending.length - 1] ?? 'ENVIDO';
                      nombre = ETIQUETA_CANTO[v] ?? 'Envido';
                    } else if (vista.phase === 'FLOR_PENDING') {
                      nombre = ETIQUETA_CANTO[vista.flor.contested ?? 'FLOR'] ?? 'Flor';
                    } else if (vista.phase === 'TRUCO_PENDING') {
                      nombre = NIVEL_TRUCO[vista.truco.level - 1] ?? 'Truco';
                    }
                    return (
                      <p className="mb-2 text-center text-sm text-amber-50">
                        El rival cantó <b className="text-oro-300">{nombre}</b>
                      </p>
                    );
                  })()}
                <div className="flex flex-wrap justify-center gap-1.5">
                  {respuestas.map((a, i) => (
                    <BotonMesa
                      key={a.type + (a.type === 'RESPOND' ? a.response : '')}
                      indice={i}
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
                    return (
                      <BotonMesa
                        key={`flor-${v}`}
                        tono="oro"
                        onClick={() =>
                          cantar(a, ETIQUETA_CANTO[v] ?? 'Flor', v === 'CONTRAFLOR_AL_RESTO')
                        }
                      >
                        {ETIQUETA_CANTO[v] ?? 'Flor'}
                      </BotonMesa>
                    );
                  })}

                  {cantosEnvido.map((a) => {
                    const v = a.type === 'CALL_ENVIDO' ? a.variant : 'ENVIDO';
                    return (
                      <BotonMesa
                        key={`env-${v}`}
                        tono="verde"
                        onClick={() =>
                          cantar(a, ETIQUETA_CANTO[v] ?? 'Envido', v === 'FALTA_ENVIDO')
                        }
                      >
                        {ETIQUETA_CANTO[v] ?? 'Envido'}
                      </BotonMesa>
                    );
                  })}

                  {cantoTruco &&
                    (() => {
                      const etq = NIVEL_TRUCO[vista.truco.level] ?? 'Truco';
                      return (
                        <BotonMesa
                          tono="truco"
                          onClick={() => cantar(cantoTruco, etq, vista.truco.level >= 2)}
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
                          detalle:
                            'Abandonás esta mano: le das al rival los puntos que valga el truco. Seguís jugando la partida.',
                        })
                      }
                    >
                      Al mazo
                    </BotonMesa>
                  )}
                </div>
              </>
            )}
          </section>
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

      {/* Chat como panel flotante en mobile (no ocupa alto → mesa sin scroll) */}
      {chatAbierto && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50 lg:hidden">
          <button
            className="flex-1"
            aria-label="Cerrar chat"
            onClick={() => setChatAbierto(false)}
          />
          <div className="relative z-10 rounded-t-2xl border-t border-white/10 bg-[#06140f] p-4 pb-6 shadow-[0_-8px_30px_-8px_#000]">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-emerald-100/80">Chat</span>
              <button
                onClick={() => setChatAbierto(false)}
                className="rounded-full border border-white/10 bg-black/30 px-2 py-0.5 text-sm text-emerald-100/80"
                aria-label="Cerrar chat"
              >
                ✕
              </button>
            </div>
            <Chat mensajes={mensajes} onEnviar={onChat} compacto />
          </div>
        </div>
      )}

      {/* Carta en vuelo (de la mano al centro) + su sombra que cae */}
      {volando && (
        <>
          <div
            ref={sombraVueloRef}
            aria-hidden="true"
            className="pointer-events-none fixed z-30"
            style={{
              left: volando.from.left,
              top: volando.from.top + volando.from.height * 0.72,
              width: volando.from.width,
              height: volando.from.height * 0.5,
              background:
                'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(0,0,0,.6), transparent 72%)',
              opacity: 0,
            }}
          />
          <div
            ref={vueloRef}
            className="pointer-events-none fixed z-40"
            style={{
              left:
                volando.from.left + volando.from.width / 2 - (sizeMano === 'xl' ? 150 : 112) / 2,
              top:
                volando.from.top +
                volando.from.height / 2 -
                Math.round((sizeMano === 'xl' ? 150 : 112) * 1.541) / 2,
            }}
          >
            <CartaEspanola card={volando.card} size={sizeMano} />
          </div>
        </>
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
  ultimaMia,
  barrer,
}: {
  vista: VistaJugador;
  miEquipo: number;
  grande: boolean;
  /** Clave de la carta propia recién jugada (no re-anima su entrada). */
  ultimaMia: string | null;
  /** Dirección del barrido de cierre de mano, o null. */
  barrer: 'abajo' | 'arriba' | null;
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
            className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-1.5 transition-all duration-300 ${
              enJuego ? 'ring-1 ring-oro-500/45' : ''
            } ${resuelta ? 'opacity-95' : ''}`}
          >
            <span
              className={`text-xs font-semibold uppercase tracking-widest ${
                enJuego ? 'text-oro-300' : 'text-emerald-100/70'
              }`}
              style={{ textShadow: '0 1px 0 rgba(0,0,0,.6)' }}
            >
              {NOMBRE_CORTO[i]}
            </span>

            <SlotBaza
              cartas={rivales}
              lado="rival"
              size={size}
              destacada={resuelta && !parda && !gane}
              atenuada={resuelta && (gane || parda)}
              barrer={barrer}
            />

            <span className="flex h-5 items-center" role="status" aria-live="polite">
              {!resuelta ? (
                <span className="text-[11px] text-emerald-100/15">·</span>
              ) : parda ? (
                <span
                  aria-label={`${NOMBRE_CORTO[i]} baza: parda`}
                  className="animar-aparece-baza rounded-full bg-white/15 px-2.5 py-0.5 text-sm font-bold uppercase tracking-wide text-emerald-100"
                >
                  = parda
                </span>
              ) : gane ? (
                <span
                  aria-label={`${NOMBRE_CORTO[i]} baza: tuya`}
                  className="animar-aparece-baza rounded-full bg-emerald-500/30 px-2.5 py-0.5 text-sm font-bold uppercase tracking-wide text-emerald-200"
                >
                  ▲ tuya
                </span>
              ) : (
                <span
                  aria-label={`${NOMBRE_CORTO[i]} baza: suya`}
                  className="animar-aparece-baza rounded-full bg-canto-500/30 px-2.5 py-0.5 text-sm font-bold uppercase tracking-wide text-canto-400"
                >
                  ▼ suya
                </span>
              )}
            </span>

            <SlotBaza
              cartas={mias}
              lado="mia"
              size={size}
              destacada={resuelta && !parda && gane}
              atenuada={resuelta && !parda && !gane}
              sinEntrada={ultimaMia}
              barrer={barrer}
              dataTrick={i}
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
  sinEntrada,
  barrer,
  dataTrick,
}: {
  cartas: { seat: number; card: Card }[];
  lado: 'rival' | 'mia';
  size: 'sm' | 'md';
  destacada: boolean;
  atenuada: boolean;
  /** Clave de la carta que NO debe re-animar su entrada (llegó volando). */
  sinEntrada?: string | null;
  /** Barrido de cierre de mano hacia el ganador. */
  barrer?: 'abajo' | 'arriba' | null;
  /** Índice de baza, para que el vuelo apunte a este slot (solo lado mía). */
  dataTrick?: number;
}) {
  const slotAttr = lado === 'mia' && dataTrick !== undefined ? { 'data-slot-mia': dataTrick } : {};
  if (cartas.length === 0) {
    const w = ANCHO_SLOT[size];
    // Placeholder chato: si usara el alto real de la carta, la columna vacía
    // sería más alta que la propia mesa y se leería como una caja hueca.
    const h = Math.round(w * 0.66);
    return (
      <div
        {...slotAttr}
        className="rounded-lg"
        style={{
          width: w,
          height: h,
          // Hueco "grabado" en el paño (bajorrelieve), como mesa de casino.
          background: 'rgba(0,0,0,.16)',
          boxShadow: 'inset 0 2px 5px rgba(0,0,0,.45), inset 0 -1px 0 rgba(255,255,255,.05)',
        }}
        aria-hidden="true"
      />
    );
  }
  const claseBarrer = barrer ? `animar-barrer-${barrer}` : '';
  return (
    <div {...slotAttr} className="flex gap-1">
      {cartas.map((p, k) => {
        // La carta propia recién jugada llegó por el vuelo: no re-anima su
        // entrada (encastra donde la dejó el vuelo). El resto sí entra.
        const recien = lado === 'mia' && sinEntrada && claveCarta(p.card) === sinEntrada;
        const entrada = claseBarrer
          ? claseBarrer
          : recien
            ? ''
            : lado === 'rival'
              ? 'animar-jugada-rival'
              : 'animar-jugada-mia';
        return (
          <div
            key={k}
            className={`rounded-xl ${destacada && !barrer ? 'animar-gana-baza' : ''} ${entrada}`}
          >
            <CartaEspanola card={p.card} size={size} destacada={destacada} atenuada={atenuada} />
          </div>
        );
      })}
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
  onClick,
  indice,
}: {
  children: ReactNode;
  tono: TonoBoton;
  onClick: () => void;
  /** Si se pasa, el botón entra escalonado (materialización con foco). */
  indice?: number;
}) {
  return (
    <button
      onClick={onClick}
      style={indice !== undefined ? { animationDelay: `${indice * 55}ms` } : undefined}
      className={`relative flex min-h-[44px] items-center justify-center rounded-xl px-3.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,.22),inset_0_-2px_3px_rgba(0,0,0,.22),0_6px_14px_-8px_#000] transition-transform active:translate-y-0.5 sm:min-h-[48px] sm:rounded-2xl sm:px-5 sm:py-2 ${
        indice !== undefined ? 'animar-boton ' : ''
      }${ESTILO_BOTON[tono]}`}
    >
      <span
        className="whitespace-nowrap text-[15px] font-bold sm:text-base"
        style={{ fontFamily: "'Iowan Old Style', Palatino, Georgia, serif" }}
      >
        {children}
      </span>
    </button>
  );
}

// ─── Tanteador ───────────────────────────────────────────────────────────────

/**
 * Un "cuadro" de fósforos: 4 palitos verticales + 1 en diagonal cruzando =
 * cinco, como se anota el truco en la libreta del boliche. `n` (1..5) dice
 * cuántos palitos van dibujados.
 */
function Cuadro({ n, color }: { n: number; color: string }) {
  return (
    <svg
      width="13"
      height="16"
      viewBox="0 0 22 24"
      aria-hidden="true"
      style={{ filter: 'drop-shadow(0 1px 0 rgba(0,0,0,.4))' }}
    >
      <g stroke={color} strokeWidth="2.2" strokeLinecap="round">
        {n >= 1 && <line x1="3" y1="3" x2="3" y2="21" />}
        {n >= 2 && <line x1="8" y1="3" x2="8" y2="21" />}
        {n >= 3 && <line x1="13" y1="3" x2="13" y2="21" />}
        {n >= 4 && <line x1="18" y1="3" x2="18" y2="21" />}
        {n >= 5 && <line x1="1" y1="22" x2="21" y2="2" />}
      </g>
    </svg>
  );
}

/** El puntaje dibujado como fósforos en cuadros de a cinco. */
function Fosforos({ valor, color }: { valor: number; color: string }) {
  if (valor <= 0) return null;
  const cuadros: number[] = [];
  let resto = valor;
  while (resto >= 5) {
    cuadros.push(5);
    resto -= 5;
  }
  if (resto > 0) cuadros.push(resto);
  return (
    <div className="mx-auto mt-0.5 flex max-w-[58px] flex-wrap justify-center gap-x-[2px] gap-y-0.5">
      {cuadros.map((n, i) => (
        <Cuadro key={i} n={n} color={color} />
      ))}
    </div>
  );
}

function Tanteador({
  etiqueta,
  valor,
  destacado,
}: {
  etiqueta: string;
  valor: number;
  destacado?: boolean;
}) {
  // Cuando el puntaje sube, el número pega un pop y sale un "+N" fantasma:
  // el objetivo del juego —anotar— merece un refuerzo visible.
  const [delta, setDelta] = useState(0);
  const [pulso, setPulso] = useState(false);
  const prev = useRef(valor);
  useEffect(() => {
    if (valor > prev.current) {
      setDelta(valor - prev.current);
      setPulso(true);
      const t = setTimeout(() => setPulso(false), 760);
      prev.current = valor;
      return () => clearTimeout(t);
    }
    prev.current = valor;
  }, [valor]);

  return (
    <div
      className="relative min-w-[62px] rounded-xl border px-2.5 py-1 text-center"
      style={{
        // Placa de madera oscura, como pizarra de almacén.
        background: 'linear-gradient(180deg, rgba(30,18,9,.92), rgba(13,8,4,.94))',
        borderColor: destacado ? 'rgba(232,176,75,.55)' : 'rgba(232,176,75,.22)',
        boxShadow: pulso
          ? '0 0 0 1px rgba(232,176,75,.5), 0 0 18px -4px rgba(232,176,75,.55)'
          : 'inset 0 1px 0 rgba(242,205,122,.12), 0 4px 10px -6px #000',
        transition: 'box-shadow .3s',
      }}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-100/70">
        {etiqueta}
      </div>
      <div
        key={valor}
        className={`font-mono text-2xl font-bold leading-none ${pulso ? 'animar-punto ' : ''}${
          destacado ? 'text-oro-300' : 'text-emerald-50'
        }`}
        style={{
          fontVariantNumeric: 'tabular-nums',
          textShadow: destacado
            ? '0 1px 0 rgba(0,0,0,.4), 0 0 12px rgba(232,176,75,.35)'
            : undefined,
        }}
      >
        {valor}
      </div>
      <Fosforos valor={valor} color={destacado ? '#f2cd7a' : '#e2545e'} />
      {pulso && delta > 0 && (
        <span
          aria-hidden="true"
          className="animar-mas pointer-events-none absolute left-1/2 top-1 text-sm font-bold text-oro-300"
        >
          +{delta}
        </span>
      )}
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
