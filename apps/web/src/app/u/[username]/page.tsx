import { notFound, redirect } from 'next/navigation';
import { prisma } from '@trucazo/db';
import { nivelPorXp } from '@trucazo/economia';
import { Encabezado } from '@/components/Encabezado';
import { Panel, Pildora } from '@/components/ui';
import { getSessionUser } from '@/lib/session';

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return { title: `${username} · Perfil` };
}

export default async function Perfil({ params }: { params: Promise<{ username: string }> }) {
  const viewer = await getSessionUser();
  if (!viewer) redirect('/ingresar');

  const { username } = await params;
  const perfil = await prisma.user.findUnique({
    where: { username },
    include: {
      profile: true,
      ratings: true,
      _count: { select: { matchPlayers: true } },
    },
  });
  if (!perfil || !perfil.profile) notFound();

  const nivel = nivelPorXp(perfil.profile.xp);
  const rating1v1 = perfil.ratings.find((r) => r.mode === 'RANKED_1V1');
  const logros = await prisma.userAchievement.findMany({
    where: { userId: perfil.id },
    include: { achievement: true },
    take: 12,
  });

  const esMio = viewer.id === perfil.id;
  const totalWins = perfil.ratings.reduce((a, r) => a + r.wins, 0);
  const totalLoss = perfil.ratings.reduce((a, r) => a + r.losses, 0);
  const winRate =
    totalWins + totalLoss > 0 ? Math.round((totalWins / (totalWins + totalLoss)) * 100) : 0;

  return (
    <div className="min-h-dvh">
      <Encabezado user={viewer} />

      <main id="contenido" className="mx-auto max-w-2xl px-5 py-8">
        {/* Cabecera */}
        <div className="flex items-center gap-4">
          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-pano-700 to-pano-900 text-3xl font-bold text-oro-400">
            {perfil.profile.displayName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight">
              {perfil.profile.displayName}
            </h1>
            <p className="text-sm text-tinta-400">@{perfil.username}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Pildora tono="oro">Nivel {nivel.nivel}</Pildora>
              {rating1v1 && rating1v1.games >= 5 && (
                <Pildora>{Math.round(rating1v1.rating)} pts</Pildora>
              )}
              {perfil.isGuest && <Pildora>Invitado</Pildora>}
            </div>
          </div>
        </div>

        {/* Barra de XP */}
        <div className="mt-5">
          <div className="mb-1 flex justify-between text-xs text-tinta-500">
            <span>Nivel {nivel.nivel}</span>
            <span>
              {nivel.xpEnNivel} / {nivel.xpNecesaria} XP
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-noche-700">
            <div
              className="h-full rounded-full bg-oro-500"
              style={{ width: `${Math.round((nivel.xpEnNivel / nivel.xpNecesaria) * 100)}%` }}
            />
          </div>
        </div>

        {/* Estadísticas */}
        <div className="mt-6 grid grid-cols-3 gap-3">
          <Estadistica etiqueta="Partidas" valor={perfil._count.matchPlayers} />
          <Estadistica etiqueta="Victorias" valor={totalWins} />
          <Estadistica etiqueta="% Victoria" valor={`${winRate}%`} />
        </div>

        {/* Ranking por modo */}
        {perfil.ratings.some((r) => r.games > 0) && (
          <section className="mt-6">
            <h2 className="text-sm font-medium text-tinta-400">Clasificación</h2>
            <ul className="mt-2 space-y-2">
              {perfil.ratings
                .filter((r) => r.games > 0)
                .map((r) => (
                  <li key={r.id}>
                    <Panel className="flex items-center justify-between !p-3">
                      <span className="text-sm text-tinta-200">
                        {r.mode.replace('RANKED_', '').replace('_', ' ')}
                      </span>
                      <span className="flex items-center gap-2">
                        <Pildora>
                          {r.division.charAt(0) +
                            r.division.slice(1).toLowerCase().replace('_', ' ')}
                        </Pildora>
                        <span className="font-mono font-bold text-tinta-50">
                          {Math.round(r.rating)}
                        </span>
                      </span>
                    </Panel>
                  </li>
                ))}
            </ul>
          </section>
        )}

        {/* Logros */}
        {logros.length > 0 && (
          <section className="mt-6">
            <h2 className="text-sm font-medium text-tinta-400">Logros</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {logros.map((l) => (
                <span
                  key={l.id}
                  title={l.achievement.description}
                  className="rounded-xl border border-oro-500/30 bg-oro-500/10 px-3 py-1.5 text-sm text-oro-400"
                >
                  🏅 {l.achievement.name}
                </span>
              ))}
            </div>
          </section>
        )}

        {!esMio && (
          <div className="mt-8 flex gap-2">
            <a href="/amigos" className="text-sm font-medium text-oro-400 hover:text-oro-500">
              Agregar como amigo →
            </a>
          </div>
        )}
      </main>
    </div>
  );
}

function Estadistica({ etiqueta, valor }: { etiqueta: string; valor: number | string }) {
  return (
    <Panel className="!p-4 text-center">
      <p className="font-mono text-2xl font-bold text-tinta-50">{valor}</p>
      <p className="mt-0.5 text-xs text-tinta-400">{etiqueta}</p>
    </Panel>
  );
}
