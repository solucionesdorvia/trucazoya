import Link from 'next/link';
import { fullDeck, trucoPower, envidoPoints, type Card } from '@trucazo/engine';
import { CartaEspanola } from '@/components/CartaEspanola';
import { Logo, Panel, Pildora } from '@/components/ui';

export const metadata = {
  title: 'Reglas y jerarquía',
  description:
    'Jerarquía completa de las 40 cartas del Truco Argentino y cómo se cuenta el envido.',
};

/**
 * Página de referencia. La jerarquía NO está hardcodeada acá: se deriva del
 * motor (`trucoPower`), así que documentación y juego no pueden divergir.
 */
export default function Reglas() {
  // Agrupa las 40 cartas por poder, de mayor a menor. Cartas con el mismo
  // poder empardan entre sí.
  const porPoder = new Map<number, Card[]>();
  for (const card of fullDeck()) {
    const p = trucoPower(card);
    porPoder.set(p, [...(porPoder.get(p) ?? []), card]);
  }
  const niveles = [...porPoder.entries()].sort((a, b) => b[0] - a[0]);

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <Link href="/">
          <Logo />
        </Link>
        <Link href="/registro" className="text-sm font-medium text-oro-400 hover:text-oro-500">
          Crear cuenta →
        </Link>
      </header>

      <main id="contenido" className="mx-auto max-w-5xl px-5 pb-16">
        <h1 className="text-balance text-4xl font-bold tracking-tight">Jerarquía de las cartas</h1>
        <p className="mt-3 max-w-2xl leading-relaxed text-tinta-400">
          Las 40 cartas de la baraja española, de la más fuerte a la más débil. Las que comparten
          fila <strong className="text-tinta-200">empardan</strong> entre sí. Fijate en la{' '}
          <em className="text-tinta-200">pinta</em>: los cortes del marco identifican el palo — oros
          sin corte, copas 1, espadas 2, bastos 3.
        </p>

        <ol className="mt-8 space-y-2.5">
          {niveles.map(([poder, cartas], i) => (
            <li key={poder}>
              <Panel className="flex flex-wrap items-center gap-4 !p-3.5">
                <span className="w-8 shrink-0 text-center font-mono text-sm text-tinta-600">
                  {i + 1}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {cartas.map((c) => (
                    <CartaEspanola key={`${c.suit}-${c.rank}`} card={c} size="xs" />
                  ))}
                </div>
                {cartas.length > 1 && (
                  <span className="ml-auto text-xs text-tinta-600">empardan entre sí</span>
                )}
                {i === 0 && (
                  <span className="ml-auto">
                    <Pildora tono="oro">el macho</Pildora>
                  </span>
                )}
              </Panel>
            </li>
          ))}
        </ol>

        {/* ─── Envido ─────────────────────────────────────────────────── */}
        <h2 className="mt-14 text-3xl font-bold tracking-tight">Cómo se cuenta el envido</h2>
        <p className="mt-3 max-w-2xl leading-relaxed text-tinta-400">
          Con dos cartas del mismo palo:{' '}
          <strong className="text-tinta-200">20 + las dos más altas</strong>. Las figuras (10, 11 y
          12) valen 0. Sin dos del mismo palo, vale la carta más alta sola.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {EJEMPLOS_ENVIDO.map((mano, i) => (
            <Panel key={i}>
              <div className="flex gap-1.5">
                {mano.map((c) => (
                  <CartaEspanola key={`${c.suit}-${c.rank}`} card={c} size="sm" />
                ))}
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-mono text-2xl font-bold text-oro-400">
                  {envidoPoints(mano)}
                </span>
                <span className="text-sm text-tinta-400">de envido</span>
              </div>
            </Panel>
          ))}
        </div>
      </main>
    </div>
  );
}

const EJEMPLOS_ENVIDO: Card[][] = [
  // 33: el máximo posible (7 + 6 del mismo palo)
  [
    { suit: 'espada', rank: 7 },
    { suit: 'espada', rank: 6 },
    { suit: 'oro', rank: 3 },
  ],
  // 20: dos figuras del mismo palo valen 0 + 0
  [
    { suit: 'copa', rank: 10 },
    { suit: 'copa', rank: 12 },
    { suit: 'oro', rank: 4 },
  ],
  // 7: sin dos del mismo palo, vale la más alta
  [
    { suit: 'oro', rank: 7 },
    { suit: 'copa', rank: 5 },
    { suit: 'basto', rank: 3 },
  ],
  // 27: 4 + 3 del mismo palo
  [
    { suit: 'basto', rank: 4 },
    { suit: 'basto', rank: 3 },
    { suit: 'espada', rank: 12 },
  ],
  // 31: 7 + 4
  [
    { suit: 'oro', rank: 7 },
    { suit: 'oro', rank: 4 },
    { suit: 'copa', rank: 11 },
  ],
  // 0: tres figuras de distinto palo
  [
    { suit: 'oro', rank: 12 },
    { suit: 'copa', rank: 11 },
    { suit: 'basto', rank: 10 },
  ],
];
