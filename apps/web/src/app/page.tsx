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
              jugá con tus amigos en segundos — o buscá rival y subí en el ranking.
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

            <p className="mt-4 text-sm text-tinta-600">
              Gratis. Monedas virtuales de bienvenida al registrarte.
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
              d: 'Eliminación simple, doble o grupos. Con premios en monedas y llaves en vivo.',
              i: '⚔️',
            },
            {
              t: 'Jugá contra bots',
              d: 'Cinco niveles, de principiante a experto. Ideal para practicar los cantos.',
              i: '🤖',
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

        {/* ─── Cargar monedas (cajeros) ──────────────────────────────── */}
        <section className="panel my-10 overflow-hidden p-0">
          <div className="grid gap-0 md:grid-cols-[1.2fr_1fr]">
            <div className="p-7 md:p-9">
              <Pildora tono="verde">💬 Cargá por WhatsApp</Pildora>
              <h2 className="mt-4 text-3xl font-bold tracking-tight">Cajeros de confianza</h2>
              <p className="mt-3 max-w-md leading-relaxed text-tinta-400">
                Sin tarjetas ni pasarelas. Elegís un cajero de la lista, arreglás por WhatsApp y en
                el momento te aparecen las monedas en la billetera. Para retirar, es igual de
                simple.
              </p>
              <ul className="mt-5 space-y-2.5 text-sm text-tinta-200">
                {[
                  'Cada movimiento queda registrado en tu billetera',
                  'Cargas y retiros con historial auditable',
                  'Límites y controles antifraude en cada operación',
                ].map((li) => (
                  <li key={li} className="flex items-start gap-2.5">
                    <span className="mt-0.5 text-oro-500">✓</span>
                    {li}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex items-center justify-center bg-gradient-to-br from-pano-800 to-pano-900 p-8">
              <div className="w-full max-w-[240px] rounded-2xl border border-pano-600/40 bg-noche-900/70 p-4 backdrop-blur">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-tinta-400">Tu billetera</span>
                  <Pildora tono="oro">Monedas</Pildora>
                </div>
                <div className="mt-2 font-mono text-3xl font-bold text-oro-400">1.250</div>
                <div className="mt-4 space-y-2 border-t border-noche-700 pt-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-tinta-400">Carga · Cajero Uno</span>
                    <span className="text-emerald-400">+1.000</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-tinta-400">Apuesta ganada</span>
                    <span className="text-emerald-400">+250</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-6xl px-5 py-10 text-sm text-tinta-600">
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-noche-700 pt-6">
          <Logo size={24} />
          <p>Jugá con responsabilidad. Monedas virtuales, sin dinero real.</p>
        </div>
      </footer>
    </div>
  );
}
