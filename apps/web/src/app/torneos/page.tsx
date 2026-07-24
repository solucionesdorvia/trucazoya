import { redirect } from 'next/navigation';
import { prisma } from '@trucazo/db';
import { inscribir } from '@trucazo/economia';
import { revalidatePath } from 'next/cache';
import { Encabezado } from '@/components/Encabezado';
import { Panel, Pildora } from '@/components/ui';
import { getSessionUser, requireUser } from '@/lib/session';

export const metadata = { title: 'Torneos' };

async function inscribirse(formData: FormData) {
  'use server';
  const user = await requireUser();
  const tournamentId = String(formData.get('tournamentId') ?? '');
  await inscribir(tournamentId, user.id);
  revalidatePath('/torneos');
}

const ESTADO: Record<string, { txt: string; tono: 'neutro' | 'oro' | 'verde' | 'rojo' }> = {
  DRAFT: { txt: 'Borrador', tono: 'neutro' },
  REGISTRATION: { txt: 'Inscripción abierta', tono: 'verde' },
  CHECK_IN: { txt: 'Check-in', tono: 'oro' },
  IN_PROGRESS: { txt: 'En juego', tono: 'oro' },
  FINISHED: { txt: 'Finalizado', tono: 'neutro' },
  CANCELLED: { txt: 'Cancelado', tono: 'rojo' },
};

export default async function Torneos() {
  const user = await getSessionUser();
  if (!user) redirect('/ingresar');

  const torneos = await prisma.tournament.findMany({
    where: { state: { not: 'DRAFT' } },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { participants: true } },
      participants: { where: { userId: user.id }, select: { id: true } },
    },
    take: 20,
  });

  return (
    <div className="min-h-dvh">
      <Encabezado user={user} />

      <main id="contenido" className="mx-auto max-w-2xl px-5 py-8">
        <h1 className="text-3xl font-bold tracking-tight">Torneos</h1>

        {torneos.length === 0 ? (
          <Panel className="mt-6 text-center text-tinta-400">
            No hay torneos activos. Los crea el administrador.
          </Panel>
        ) : (
          <ul className="mt-6 space-y-3">
            {torneos.map((t) => {
              const estado = ESTADO[t.state] ?? ESTADO.DRAFT!;
              const inscripto = t.participants.length > 0;
              return (
                <li key={t.id}>
                  <Panel>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-lg font-semibold text-tinta-50">{t.name}</h2>
                      <Pildora tono={estado.tono}>{estado.txt}</Pildora>
                    </div>
                    <p className="mt-1 text-sm text-tinta-400">
                      {t.mode.replace('_', ' ')} · {t._count.participants}/{t.maxPlayers} jugadores
                      {t.entryFee > 0n && ` · entrada 🪙 ${t.entryFee}`}
                    </p>
                    {t.state === 'REGISTRATION' &&
                      (inscripto ? (
                        <p className="mt-3 text-sm text-emerald-400">✓ Estás inscripto</p>
                      ) : (
                        <form action={inscribirse} className="mt-3">
                          <input type="hidden" name="tournamentId" value={t.id} />
                          <button className="h-10 rounded-xl bg-oro-500 px-4 font-semibold text-noche-950 hover:bg-oro-400">
                            Inscribirme
                          </button>
                        </form>
                      ))}
                  </Panel>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
