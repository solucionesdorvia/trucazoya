import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CartaEspanola } from '@/components/CartaEspanola';
import { Boton, Logo, Pildora } from '@/components/ui';
import { getSessionUser } from '@/lib/session';

export default async function Landing() {
  // Si ya hay sesión, va directo al lobby.
  const user = await getSessionUser();
  if (user) redirect('/inicio');

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link href="/ingresar">
            <Boton variante="fantasma" tamaño="sm">
              Ingresar
            </Boton>
          </Link>
          <Link href="/registro">
            <Boton tamaño="sm">Crear cuenta</Boton>
          </Link>
        </nav>
      </header>

      <main id="contenido" className="mx-auto max-w-6xl px-5">
        {/* ─── Héroe ─────────────────────────────────────────────────── */}
        <section className="grid items-center gap-12 py-12 md:grid-cols-2 md:py-20">
          <div className="animar-aparecer">
            <Pildora tono="oro">🎴 Truco Argentino · 1v1 y 2v2</Pildora>
            <h1 className="mt-5 text-balance text-5xl font-bold leading-[1.05] tracking-tight md:text-6xl">
              El truco de siempre,
              <span className="block bg-gradient-to-r from-oro-400 to-oro-600 bg-clip-text text-transparent">
                ahora contra todo el país.
              </span>
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-tinta-400">
              Envido, flor y vale cuatro con las reglas de verdad. Armá una sala, pasá el código y
              jugá con tus amigos en segundos — o buscá rival por fichas y subí en el ranking.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/registro">
                <Boton tamaño="lg">Empezar a jugar</Boton>
              </Link>
              <Link href="/ingresar">
                <Boton variante="secundario" tamaño="lg">
                  Ya tengo cuenta
                </Boton>
              </Link>
            </div>

            <p className="mt-4 max-w-lg text-sm leading-relaxed text-tinta-500">
              Crear la cuenta es gratis. Para jugar{' '}
              <strong className="text-tinta-300">gratis</strong> armás una sala sin fichas y pasás
              el código. Para jugar <strong className="text-tinta-300">por fichas</strong> las
              cargás con un cajero.
            </p>
          </div>

          {/* Mano de truco desplegada */}
          <div className="flex justify-center md:justify-end">
            <div className="flex items-end">
              {[
                { suit: 'espada', rank: 1, rot: -14, y: 10 },
                { suit: 'basto', rank: 1, rot: -4, y: -6 },
                { suit: 'espada', rank: 7, rot: 7, y: 4 },
              ].map((c, i) => (
                <div
                  key={i}
                  className="animar-reparto -ml-6 first:ml-0"
                  style={{
                    transform: `rotate(${c.rot}deg) translateY(${c.y}px)`,
                    animationDelay: `${i * 110}ms`,
                    zIndex: i,
                  }}
                >
                  <CartaEspanola
                    card={{ suit: c.suit as 'espada' | 'basto', rank: c.rank as 1 | 7 }}
                    size="lg"
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Características ───────────────────────────────────────── */}
        <section className="grid gap-4 py-10 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              t: 'Salas en un toque',
              d: 'Creá una sala, compartí el código o el link y arrancan. Privada, con contraseña o abierta.',
              i: '🔗',
            },
            {
              t: 'Reglas completas',
              d: 'Envido, real, falta, flor y contraflor. Truco, retruco y vale cuatro. Pardas resueltas como corresponde.',
              i: '📜',
            },
            {
              t: 'Ranking y temporadas',
              d: 'De Bronce a Gran Maestro. Ranking global, nacional y entre amigos.',
              i: '🏆',
            },
            {
              t: 'Torneos',
              d: 'Eliminación simple, doble o grupos. Con premios en fichas y llaves en vivo.',
              i: '⚔️',
            },
            {
              t: 'Anti-trampas',
              d: 'El servidor reparte y valida todo. Nadie puede ver tus cartas ni forzar un resultado.',
              i: '🛡️',
            },
          ].map((f) => (
            <div key={f.t} className="panel p-5">
              <div className="text-2xl">{f.i}</div>
              <h3 className="mt-3 font-semibold text-tinta-50">{f.t}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-tinta-400">{f.d}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="mx-auto max-w-6xl px-5 py-10 text-sm text-tinta-600">
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-noche-700 pt-6">
          <Logo size={24} />
          <p>
            Jugá con responsabilidad. Las fichas se cargan y retiran con cajeros por WhatsApp:
            Trucazo no procesa pagos.
          </p>
          <nav className="flex gap-4">
            <Link href="/terminos" className="hover:text-tinta-300">
              Términos
            </Link>
            <Link href="/privacidad" className="hover:text-tinta-300">
              Privacidad
            </Link>
            <Link href="/creditos" className="hover:text-tinta-300">
              Créditos
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
