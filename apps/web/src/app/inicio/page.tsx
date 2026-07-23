import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@trucazo/db';
import { Encabezado } from '@/components/Encabezado';
import { Panel, Pildora } from '@/components/ui';
import { UnirseConCodigo } from '@/components/UnirseConCodigo';
import { getSessionUser } from '@/lib/session';

export const metadata = { title: 'Inicio' };

export default async function Inicio() {
  const user = await getSessionUser();
  if (!user) redirect('/ingresar');

  const [rating, salasAbiertas] = await Promise.all([
    prisma.rating.findFirst({ where: { userId: user.id, mode: 'RANKED_1V1' } }),
    prisma.room.count({ where: { state: 'WAITING', isPrivate: false } }),
  ]);

  return (
    <div className="min-h-dvh">
      <Encabezado user={user} />

      <main id="contenido" className="mx-auto max-w-6xl px-5 py-8">
        <div className="animar-aparecer">
          <h1 className="text-3xl font-bold tracking-tight">
            Buenas, <span className="text-oro-400">{user.displayName}</span>
          </h1>
          <p className="mt-1.5 text-tinta-400">¿Qué vas a jugar hoy?</p>
        </div>

        {/* ─── Acciones principales ──────────────────────────────────── */}
        <section className="mt-7 grid gap-4 md:grid-cols-3">
          <AccionPrincipal
            href="/salas/crear"
            titulo="Crear sala"
            desc="Armá la mesa y pasá el código a tus amigos."
            emoji="🎴"
            destacada
          />
          <AccionPrincipal
            href="/salas"
            titulo="Buscar partida"
            desc={
              salasAbiertas > 0
                ? `${salasAbiertas} sala${salasAbiertas === 1 ? '' : 's'} esperando jugadores`
                : 'Entrá al navegador de salas públicas'
            }
            emoji="🔍"
          />
          <AccionPrincipal
            href="/practica"
            titulo="Jugar contra bot"
            desc="Practicá los cantos contra 5 niveles de IA."
            emoji="🤖"
          />
        </section>

        {/* ─── Estado del jugador ────────────────────────────────────── */}
        <section className="mt-6 grid gap-4 lg:grid-cols-3">
          <Panel>
            <h2 className="text-sm font-medium text-tinta-400">Tu clasificación</h2>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-mono text-3xl font-bold text-tinta-50">
                {Math.round(rating?.rating ?? 1500)}
              </span>
              <Pildora tono="oro">{formatearDivision(rating?.division ?? 'BRONCE')}</Pildora>
            </div>
            <p className="mt-2 text-sm text-tinta-400">
              {rating?.games ? `${rating.wins}V · ${rating.losses}D` : 'Todavía sin partidas'}
            </p>
          </Panel>

          <Panel>
            <h2 className="text-sm font-medium text-tinta-400">Billetera</h2>
            <div className="mt-3 font-mono text-3xl font-bold text-oro-400">
              {user.balance.toLocaleString('es-AR')}
            </div>
            <Link
              href="/billetera"
              className="mt-2 inline-block text-sm font-medium text-oro-400 hover:text-oro-500"
            >
              Cargar monedas con un cajero →
            </Link>
          </Panel>

          <Panel>
            <h2 className="text-sm font-medium text-tinta-400">Unirse con código</h2>
            <UnirseConCodigo />
            <p className="mt-2 text-sm text-tinta-400">Pegá el código que te pasaron.</p>
          </Panel>
        </section>
      </main>
    </div>
  );
}

function AccionPrincipal({
  href,
  titulo,
  desc,
  emoji,
  destacada,
}: {
  href: string;
  titulo: string;
  desc: string;
  emoji: string;
  destacada?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`panel group flex flex-col p-5 transition-transform duration-150 hover:-translate-y-0.5 ${
        destacada ? 'resplandor-oro' : ''
      }`}
    >
      <span className="text-3xl" aria-hidden="true">
        {emoji}
      </span>
      <h2 className="mt-3 text-lg font-semibold text-tinta-50">{titulo}</h2>
      <p className="mt-1 text-sm leading-relaxed text-tinta-400">{desc}</p>
      <span className="mt-3 text-sm font-medium text-oro-400 opacity-0 transition-opacity group-hover:opacity-100">
        Entrar →
      </span>
    </Link>
  );
}

function formatearDivision(d: string): string {
  return d.charAt(0) + d.slice(1).toLowerCase().replace('_', ' ');
}
