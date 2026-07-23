/**
 * Carta de baraja española dibujada en SVG puro (sin imágenes ni foreignObject:
 * escala perfecta, pesa nada y se puede tematizar).
 *
 * Detalle auténtico: la "pinta" — los cortes del marco que identifican el palo
 * a simple vista incluso con la carta semi-tapada:
 *   oro = marco continuo · copa = 1 corte · espada = 2 · basto = 3
 */

import type { Card, Suit } from '@trucazo/engine';

const NOMBRE_PALO: Record<Suit, string> = {
  espada: 'espadas',
  basto: 'bastos',
  oro: 'oros',
  copa: 'copas',
};

const NOMBRE_RANGO: Record<number, string> = {
  1: 'as',
  10: 'sota',
  11: 'caballo',
  12: 'rey',
};

export function nombreCarta(card: Card): string {
  const rango = NOMBRE_RANGO[card.rank] ?? String(card.rank);
  return `${rango} de ${NOMBRE_PALO[card.suit]}`;
}

/** Cantidad de cortes en el marco según el palo (la "pinta"). */
const CORTES: Record<Suit, number> = { oro: 0, copa: 1, espada: 2, basto: 3 };

const COLOR_PALO: Record<Suit, string> = {
  oro: '#C08422',
  copa: '#A8323E',
  espada: '#2B5480',
  basto: '#47702F',
};

// ─── Glifos de palo (diseñados en un lienzo 48×48) ─────────────────────────

function GlifoOro({ c }: { c: string }) {
  return (
    <g>
      <circle cx="24" cy="24" r="20" fill="#F7E4B0" stroke={c} strokeWidth="2" />
      <circle cx="24" cy="24" r="14.5" fill="none" stroke={c} strokeWidth="1.1" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * Math.PI) / 6;
        return (
          <line
            key={i}
            x1={24 + 5 * Math.cos(a)}
            y1={24 + 5 * Math.sin(a)}
            x2={24 + 13 * Math.cos(a)}
            y2={24 + 13 * Math.sin(a)}
            stroke={c}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        );
      })}
      <circle cx="24" cy="24" r="4.2" fill={c} />
    </g>
  );
}

function GlifoCopa({ c }: { c: string }) {
  return (
    <g>
      {/* cáliz */}
      <path d="M11 8 h26 v8 a13 13 0 0 1 -26 0 z" fill="#F3D2D6" stroke={c} strokeWidth="1.8" />
      <path d="M11 12 h26" stroke={c} strokeWidth="1.4" />
      {/* asas */}
      <path
        d="M11 14 q-6 1.5 -6 6 t6 4.5"
        fill="none"
        stroke={c}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M37 14 q6 1.5 6 6 t-6 4.5"
        fill="none"
        stroke={c}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      {/* tallo y pie */}
      <rect x="22" y="28" width="4" height="9" fill={c} />
      <path d="M13 38 h22 a2.5 2.5 0 0 1 0 4 h-22 a2.5 2.5 0 0 1 0 -4 z" fill={c} />
    </g>
  );
}

function GlifoEspada({ c }: { c: string }) {
  return (
    <g>
      {/* hoja */}
      <path d="M24 2 l5 8 v18 h-10 V10 z" fill="#D6E2F0" stroke={c} strokeWidth="1.8" />
      <line x1="24" y1="6" x2="24" y2="27" stroke={c} strokeWidth="1" />
      {/* guarda curva */}
      <rect x="8" y="28" width="32" height="4" rx="2" fill={c} />
      <path
        d="M10 28 q-4 5 0.5 8 M38 28 q4 5 -0.5 8"
        fill="none"
        stroke={c}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {/* empuñadura */}
      <rect x="21.8" y="32" width="4.4" height="9" fill={c} />
      <circle cx="24" cy="43.5" r="3.6" fill={c} />
    </g>
  );
}

function GlifoBasto({ c }: { c: string }) {
  return (
    <g>
      {/* garrote */}
      <path d="M16 45 L26 4 l7 1.7 L23 46.7 z" fill="#DCE9CE" stroke={c} strokeWidth="1.8" />
      {/* nudos */}
      <circle cx="27" cy="13" r="4" fill={c} />
      <circle cx="25" cy="24" r="3.6" fill={c} />
      <circle cx="22.5" cy="35" r="3.2" fill={c} />
      {/* ramas cortadas */}
      <path
        d="M30 10 l8 -3.5 M28 21 l8 -2.5 M25.5 32 l7.5 -3"
        stroke={c}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </g>
  );
}

function Glifo({ suit }: { suit: Suit }) {
  const c = COLOR_PALO[suit];
  if (suit === 'oro') return <GlifoOro c={c} />;
  if (suit === 'copa') return <GlifoCopa c={c} />;
  if (suit === 'espada') return <GlifoEspada c={c} />;
  return <GlifoBasto c={c} />;
}

// ─── Marco con pinta ───────────────────────────────────────────────────────

function MarcoPinta({ suit }: { suit: Suit }) {
  const cortes = CORTES[suit];
  const color = COLOR_PALO[suit];
  const yIni = 11;
  const yFin = 161;
  const hueco = 16;
  const tramo = (yFin - yIni - hueco * cortes) / (cortes + 1);

  return (
    <g opacity="0.85">
      <line x1="11" y1={yIni} x2="99" y2={yIni} stroke={color} strokeWidth="1.5" />
      <line x1="11" y1={yFin} x2="99" y2={yFin} stroke={color} strokeWidth="1.5" />
      {Array.from({ length: cortes + 1 }, (_, i) => {
        const y = yIni + i * (tramo + hueco);
        return (
          <g key={i}>
            <line x1="11" y1={y} x2="11" y2={y + tramo} stroke={color} strokeWidth="1.5" />
            <line x1="99" y1={y} x2="99" y2={y + tramo} stroke={color} strokeWidth="1.5" />
          </g>
        );
      })}
    </g>
  );
}

// ─── Carta ─────────────────────────────────────────────────────────────────

export type TamañoCarta = 'xs' | 'sm' | 'md' | 'lg';

const ANCHOS: Record<TamañoCarta, number> = { xs: 46, sm: 62, md: 86, lg: 112 };

interface Props {
  card: Card;
  size?: TamañoCarta;
  /** Resalta la carta (jugable / seleccionada). */
  destacada?: boolean;
  /** Atenúa la carta (no jugable en este momento). */
  atenuada?: boolean;
  className?: string;
}

export function CartaEspanola({ card, size = 'md', destacada, atenuada, className }: Props) {
  const ancho = ANCHOS[size];
  const alto = Math.round(ancho * 1.564);
  const color = COLOR_PALO[card.suit];
  const rango = String(card.rank);

  return (
    <svg
      width={ancho}
      height={alto}
      viewBox="0 0 110 172"
      className={className}
      role="img"
      aria-label={nombreCarta(card)}
      style={{
        filter: destacada
          ? 'drop-shadow(0 10px 22px rgba(232,176,75,.5))'
          : 'drop-shadow(0 4px 10px rgba(0,0,0,.45))',
        opacity: atenuada ? 0.42 : 1,
        transition: 'opacity .2s, filter .2s, transform .2s',
      }}
    >
      {/* fondo pergamino */}
      <rect x="1" y="1" width="108" height="170" rx="9" fill="#EFE7D4" stroke="#CFC2A2" />
      <rect x="3.5" y="3.5" width="103" height="165" rx="7" fill="#FBF7EC" />

      <MarcoPinta suit={card.suit} />

      {/* glifo central */}
      <g transform="translate(31, 58) scale(1)">
        <Glifo suit={card.suit} />
      </g>

      {/* rango arriba-izquierda */}
      <text
        x="21"
        y="35"
        fontSize="21"
        fontWeight="700"
        fill={color}
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
      >
        {rango}
      </text>
      {/* rango abajo-derecha, rotado 180° como en la baraja real */}
      <g transform="rotate(180 89 137)">
        <text
          x="89"
          y="137"
          fontSize="21"
          fontWeight="700"
          fill={color}
          textAnchor="middle"
          fontFamily="Georgia, 'Times New Roman', serif"
        >
          {rango}
        </text>
      </g>
    </svg>
  );
}

/** Reverso de carta (cartas del rival, mazo). */
export function ReversoCarta({
  size = 'md',
  className,
}: {
  size?: TamañoCarta;
  className?: string;
}) {
  const ancho = ANCHOS[size];
  const alto = Math.round(ancho * 1.564);
  const idTrama = `trama-${size}`;
  return (
    <svg
      width={ancho}
      height={alto}
      viewBox="0 0 110 172"
      className={className}
      role="img"
      aria-label="Carta boca abajo"
      style={{ filter: 'drop-shadow(0 4px 10px rgba(0,0,0,.5))' }}
    >
      <defs>
        <pattern id={idTrama} width="11" height="11" patternUnits="userSpaceOnUse">
          <path d="M0 5.5 L5.5 0 L11 5.5 L5.5 11 Z" fill="none" stroke="#1d5a47" strokeWidth="1" />
        </pattern>
      </defs>
      <rect x="1" y="1" width="108" height="170" rx="9" fill="#0e4d3c" stroke="#072b21" />
      <rect x="7" y="7" width="96" height="158" rx="6" fill={`url(#${idTrama})`} />
      <rect
        x="7"
        y="7"
        width="96"
        height="158"
        rx="6"
        fill="none"
        stroke="#e8b04b"
        strokeWidth="1.2"
        opacity="0.55"
      />
      <circle
        cx="55"
        cy="86"
        r="22"
        fill="#0b3b2e"
        stroke="#e8b04b"
        strokeWidth="1.4"
        opacity="0.9"
      />
      <text
        x="55"
        y="95"
        textAnchor="middle"
        fontSize="24"
        fontWeight="700"
        fill="#e8b04b"
        fontFamily="Georgia, serif"
      >
        T
      </text>
    </svg>
  );
}
