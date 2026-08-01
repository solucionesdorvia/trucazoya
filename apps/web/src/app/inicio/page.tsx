import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@trucazo/db';
import { PulsoEnVivo } from '@/components/PulsoEnVivo';
import { Encabezado } from '@/components/Encabezado';
import { getSessionUser } from '@/lib/session';

export const metadata = { title: 'Inicio' };

export default async function Inicio() {
  const user = await getSessionUser();
  if (!user) redirect('/ingresar');

  const [salasPublicas, rating] = await Promise.all([
    prisma.room.count({ where: { state: 'WAITING', isPrivate: false } }),
    prisma.rating.findFirst({ where: { userId: user.id, mode: 'CASUAL_1V1' } }),
  ]);

  const puntos = (rating?.wins ?? 0) * 3 + (rating?.games ?? 0);
  const firstName = user.displayName?.split(' ')[0] ?? user.username;

  return (
    <div className="min-h-dvh">
      <Encabezado user={user} />

      <main id="contenido" className="mx-auto max-w-6xl px-5 py-8">
        <div className="animar-aparecer">
          <h1 className="text-3xl font-bold tracking-tight">
            Buenas, <span className="text-oro-400">{firstName}</span>
          </h1>
          <p className="mt-1.5 text-tinta-400">¿Qué vas a jugar hoy?</p>
          <div className="mt-3">
            <PulsoEnVivo />
          </div>
        </div>

        <section className="mt-7 grid gap-4 sm:grid-cols-2">
          <AccionPrincipal
            href="/buscar"
            titulo="Partida pública"
            desc={
              salasPublicas > 0
                ? `${salasPublicas} sala${salasPublicas === 1 ? '' : 's'} esperando jugadores`
                : 'Buscá una sala abierta o creá la tuya'
            }
            emoji="🃏"
            destacada
          />
          <AccionPrincipal
            href="/partida-privada"
            titulo="Partida privada"
            desc="Uníte con código o creá una sala para tus amigos"
            emoji="🔐"
          />
          <AccionPrincipal
            href="/billetera"
            titulo="Billetera"
            desc={`${user.balance.toLocaleString('es-AR')} fichas`}
            emoji="💰"
          />
          <AccionPrincipal
            href="/ranking"
            titulo="Ranking"
            desc={puntos > 0 ? `Tus puntos: ${puntos}` : 'Tabla de posiciones semanal'}
            emoji="🏆"
          />
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
