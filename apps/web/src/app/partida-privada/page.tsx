import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@trucazo/db';
import { Encabezado } from '@/components/Encabezado';
import { UnirseConCodigo } from '@/components/UnirseConCodigo';
import { getSessionUser } from '@/lib/session';

export const metadata = { title: 'Partida privada' };

export const dynamic = 'force-dynamic';

function formatMode(mode: string): string {
  if (mode.endsWith('2V2')) return '2v2';
  return '1v1';
}

export default async function PartidaPrivadaPage() {
  const user = await getSessionUser();
  if (!user) redirect('/ingresar');

  const salas = await prisma.room.findMany({
    where: { isPrivate: true, state: 'WAITING' },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      _count: { select: { participants: { where: { spectator: false } } } },
    },
  });

  return (
    <div className="min-h-dvh">
      <Encabezado user={user} />

      <main id="contenido" className="mx-auto max-w-3xl px-5 py-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Partida privada</h1>
            <p className="mt-1 text-tinta-400">Con amigos o con código de emparejamiento</p>
          </div>
          <Link
            href="/salas/crear"
            className="shrink-0 rounded-xl bg-oro-500 px-5 py-2.5 text-sm font-semibold text-noche-950 transition-opacity hover:opacity-90"
          >
            + Crear sala
          </Link>
        </div>

        {/* Unirse con código */}
        <div className="panel mt-6 p-5">
          <h2 className="font-semibold text-tinta-50">Tenés un código</h2>
          <p className="mt-1 text-sm text-tinta-400">Ingresá el código que te mandaron y entrás directo a la sala.</p>
          <UnirseConCodigo />
        </div>

        {/* Salas privadas activas */}
        {salas.length > 0 && (
          <div className="mt-6">
            <h2 className="text-sm font-medium text-tinta-400 uppercase tracking-wider">
              Salas privadas esperando ({salas.length})
            </h2>
            <ol className="mt-3 space-y-2">
              {salas.map((sala) => {
                const fichas = Number(sala.betAmount);
                const formato = formatMode(sala.mode);
                const jugadores = sala._count.participants;
                const capacidad = sala.mode.endsWith('2V2') ? 4 : 2;

                return (
                  <li key={sala.id}>
                    <div className="panel flex items-center gap-4 !p-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-tinta-50 truncate">{sala.name}</span>
                          <span className="rounded-full border border-noche-600 px-2 py-0.5 text-xs font-mono text-tinta-300">
                            {formato}
                          </span>
                          {fichas > 0 && (
                            <span className="rounded-full bg-oro-500/15 px-2 py-0.5 text-xs font-semibold text-oro-400">
                              {fichas.toLocaleString('es-AR')} fichas
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-tinta-500">
                          {jugadores}/{capacidad} jugadores · necesitás el código
                        </p>
                      </div>
                      <span className="shrink-0 rounded-xl bg-noche-700/50 px-4 py-2 text-sm text-tinta-500 cursor-default">
                        🔐 Privada
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
            <p className="mt-3 text-xs text-tinta-600">Pedile el código al creador de la sala para poder unirte.</p>
          </div>
        )}

        <p className="mt-6 text-right text-xs text-tinta-600">
          <Link href="/inicio" className="hover:text-tinta-400">← Volver al inicio</Link>
        </p>
      </main>
    </div>
  );
}
