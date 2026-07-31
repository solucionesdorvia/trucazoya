'use client';

/**
 * DEMO interactiva (no productiva): la mesa real con un estado local simulado,
 * para ver el diseño y las animaciones sin partida en vivo. Al jugar una carta
 * el rival responde; al cantar aparece la estampa.
 */

import { useEffect, useRef, useState } from 'react';
import type { Action, Card } from '@trucazo/engine';
import { Mesa } from '@/components/sala/Mesa';
import type { SnapshotSala, VistaJugador } from '@/components/sala/SalaVivo';

type V = Record<string, unknown>;

const sala = {
  code: 'DEMO01',
  nombre: 'Mesa de demostración',
  estado: 'EN_PARTIDA',
  hostUserId: 'u0',
  matchId: 'demo',
  config: { players: 2, pointsToWin: 30, florEnabled: true, apuesta: 500 },
  participantes: [
    {
      userId: 'u0',
      username: 'vos',
      seat: 0,
      equipo: 0,
      listo: true,
      conectado: true,
      isBot: false,
    },
    {
      userId: 'u1',
      username: 'juana',
      seat: 1,
      equipo: 1,
      listo: true,
      conectado: true,
      isBot: true,
    },
  ],
} as unknown as SnapshotSala;

const MANO_INICIAL: Card[] = [
  { suit: 'espada', rank: 1 },
  { suit: 'oro', rank: 7 },
  { suit: 'copa', rank: 3 },
];

// Cartas con las que responde "juana" (rival) a medida que jugás.
const RIVAL: Card[] = [
  { suit: 'espada', rank: 2 },
  { suit: 'basto', rank: 10 },
];

// Manos con las que se re-reparte (para ver reparto + barrido de cierre).
const MANOS: Card[][] = [
  [
    { suit: 'basto', rank: 1 },
    { suit: 'oro', rank: 11 },
    { suit: 'copa', rank: 7 },
  ],
  [
    { suit: 'espada', rank: 12 },
    { suit: 'copa', rank: 10 },
    { suit: 'oro', rank: 6 },
  ],
];
const RIVAL_MANOS: Card[][] = [
  [
    { suit: 'oro', rank: 3 },
    { suit: 'basto', rank: 6 },
  ],
  [
    { suit: 'copa', rank: 1 },
    { suit: 'espada', rank: 5 },
  ],
];

function estadoInicial(): VistaJugador {
  return {
    phase: 'PLAYER_TURN',
    scores: [22, 18],
    pointsToWin: 30,
    players: 2,
    winner: null,
    seat: 0,
    team: 0,
    myHand: MANO_INICIAL,
    handCounts: { 0: 3, 1: 2 },
    tricks: [[{ seat: 1, card: { suit: 'oro', rank: 12 } }], [], []],
    trickOutcomes: [],
    currentTrick: 0,
    turnSeat: 0,
    manoSeat: 0,
    dealerSeat: 1,
    envido: { pending: [], resolved: false, accepted: false },
    truco: { level: 0, accepted: false },
    flor: { active: false, resolved: true, iHaveFlor: false },
    legales: legalesDe(MANO_INICIAL, 0, false, true),
  } as unknown as VistaJugador;
}

function legalesDe(
  hand: Card[],
  trucoLevel: number,
  envidoUsado: boolean,
  primera: boolean,
): Action[] {
  const l: Action[] = hand.map((c) => ({ type: 'PLAY_CARD', seat: 0, card: c })) as Action[];
  if (trucoLevel < 3) l.push({ type: 'CALL_TRUCO', seat: 0 } as Action);
  if (primera && !envidoUsado) {
    l.push({ type: 'CALL_ENVIDO', seat: 0, variant: 'ENVIDO' } as unknown as Action);
    l.push({ type: 'CALL_ENVIDO', seat: 0, variant: 'FALTA_ENVIDO' } as unknown as Action);
  }
  return l;
}

export default function DemoMesa() {
  const [vista, setVista] = useState<VistaJugador>(estadoInicial);
  const rivalRestante = useRef([...RIVAL]);
  const manoNro = useRef(0);
  const rebarajando = useRef(false);

  // Al quedarse sin cartas (mano terminada), esperar a que corra el barrido de
  // cierre y re-repartir una mano nueva, para ver el reparto animado.
  useEffect(() => {
    if (vista.myHand.length === 0 && vista.trickOutcomes.length >= 2 && !rebarajando.current) {
      rebarajando.current = true;
      const t = setTimeout(() => {
        manoNro.current += 1;
        const mano = MANOS[manoNro.current % MANOS.length]!;
        const rival = RIVAL_MANOS[manoNro.current % RIVAL_MANOS.length]!;
        rivalRestante.current = [...rival];
        const mano0 = manoNro.current % 2 === 0 ? 0 : 1;
        setVista((prev) => {
          const s0 = prev.scores[0] + (Math.random() > 0.5 ? 2 : 1);
          const s1 = prev.scores[1] + (Math.random() > 0.5 ? 1 : 0);
          return {
            ...prev,
            myHand: mano,
            handCounts: { 0: 3, 1: 3 },
            tricks: [[{ seat: 1, card: rival[0]! }], [], []],
            trickOutcomes: [],
            currentTrick: 0,
            turnSeat: 0,
            manoSeat: mano0,
            scores: [Math.min(30, s0), Math.min(30, s1)],
            truco: { level: 0, accepted: false },
            envido: { pending: [], resolved: false, accepted: false },
            legales: legalesDe(mano, 0, false, true),
          } as unknown as VistaJugador;
        });
        rivalRestante.current = rival.slice(1);
        rebarajando.current = false;
      }, 900);
      return () => clearTimeout(t);
    }
  }, [vista.myHand.length, vista.trickOutcomes.length]);

  function onAccion(a: Action) {
    setVista((prevReadonly) => {
      const v = structuredClone(prevReadonly) as unknown as V & VistaJugador;

      if (a.type === 'PLAY_CARD') {
        const c = a.card;
        v.myHand = v.myHand.filter((x) => !(x.suit === c.suit && x.rank === c.rank));
        v.handCounts = { ...v.handCounts, 0: v.myHand.length };
        const t = v.currentTrick;
        // Completo la baza actual (el rival ya tiró en ella).
        v.tricks[t] = [...(v.tricks[t] ?? []), { seat: 0, card: c }];
        const outcome = Math.random() > 0.5 ? 'TEAM_0' : 'TEAM_1';
        v.trickOutcomes[t] = outcome as (typeof v.trickOutcomes)[number];

        // La siguiente baza la abre el rival con una carta nueva.
        if (t < 2) {
          v.currentTrick = t + 1;
          const suya = rivalRestante.current.shift();
          if (suya) {
            v.tricks[t + 1] = [{ seat: 1, card: suya }];
            v.handCounts = { ...v.handCounts, 1: Math.max(0, (v.handCounts[1] ?? 1) - 1) };
          }
        }
        v.legales = v.myHand.length ? legalesDe(v.myHand, v.truco.level, true, false) : [];
      } else if (a.type === 'CALL_TRUCO') {
        v.truco = { level: Math.min(3, v.truco.level + 1), accepted: false };
        v.legales = legalesDe(v.myHand, v.truco.level, true, v.currentTrick === 0);
      } else if (a.type === 'CALL_ENVIDO') {
        const variant = (a as unknown as { variant: string }).variant;
        v.envido = { ...v.envido, pending: [...v.envido.pending, variant] };
        v.legales = legalesDe(v.myHand, v.truco.level, true, v.currentTrick === 0);
      } else if (a.type === 'CALL_FLOR') {
        v.flor = { ...v.flor, active: true };
      }

      return v as unknown as VistaJugador;
    });
  }

  function reiniciar() {
    rivalRestante.current = [...RIVAL];
    manoNro.current = 0;
    rebarajando.current = false;
    setVista(estadoInicial());
  }

  return (
    <div>
      <Mesa sala={sala} vista={vista} onAccion={onAccion} mensajes={[]} onChat={() => {}} />
      <button
        onClick={reiniciar}
        className="fixed bottom-2 right-2 z-50 rounded-full bg-black/60 px-3 py-1 text-xs text-white/80"
      >
        reiniciar demo
      </button>
    </div>
  );
}
