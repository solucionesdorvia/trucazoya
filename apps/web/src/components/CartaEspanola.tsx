/**
 * Carta de baraja española.
 *
 * Usa el ARTE REAL de la Baraja Española (obra de Basquetteur vía Wikimedia
 * Commons, licencia CC BY-SA 3.0 — ver /creditos y docs/barajas-candidatas.md).
 * Los SVG viven en `public/naipes/<palo>-<rango>.svg`. El reverso se dibuja por
 * código (el dorso original pesa 11 MB; este es liviano y combina con la marca).
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

// ─── Carta ─────────────────────────────────────────────────────────────────

export type TamañoCarta = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const ANCHOS: Record<TamañoCarta, number> = { xs: 46, sm: 62, md: 86, lg: 112, xl: 150 };

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
  const alto = Math.round(ancho * 1.541); // ratio del arte original (66.24×102.08)

  return (
    <span
      className={className}
      style={{
        display: 'inline-block',
        width: ancho,
        height: alto,
        borderRadius: Math.max(4, Math.round(ancho * 0.08)),
        overflow: 'hidden',
        background: '#fbf7ec',
        boxShadow: destacada ? '0 10px 22px rgba(232,176,75,.55)' : '0 4px 10px rgba(0,0,0,.45)',
        outline: destacada ? '2px solid rgba(232,176,75,.85)' : 'none',
        // Atenuada: más contraste que un 0.5 pelado + desaturada, para que se
        // lea "no jugable" sin desaparecer sobre el paño oscuro.
        opacity: atenuada ? 0.72 : 1,
        filter: atenuada ? 'grayscale(.35) brightness(.9)' : 'none',
        transition: 'opacity .2s, box-shadow .2s, outline .2s, filter .2s, transform .2s',
      }}
    >
      <img
        src={`/naipes/${card.suit}-${card.rank}.svg`}
        alt={nombreCarta(card)}
        width={ancho}
        height={alto}
        draggable={false}
        // `contain`: el arte ya trae su fondo/márgenes; con `cover` se comía el
        // borde del naipe por el redondeo del alto.
        style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }}
      />
    </span>
  );
}

/** Reverso de carta (cartas del rival, mazo). Dibujado por código. */
export function ReversoCarta({
  size = 'md',
  className,
}: {
  size?: TamañoCarta;
  className?: string;
}) {
  const ancho = ANCHOS[size];
  const alto = Math.round(ancho * 1.541);
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
