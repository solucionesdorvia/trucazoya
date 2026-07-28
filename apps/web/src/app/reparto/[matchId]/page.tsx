import Link from 'next/link';
import { prisma } from '@trucazo/db';
import { commitDeSemilla, fullDeck, randomIntDeSemilla, shuffle } from '@trucazo/engine';
import { Logo } from '@/components/ui';

export const metadata = { title: 'Verificar reparto' };

/** Recalcula el orden del mazo desde una semilla, igual que el game-server. */
function recomputarMazo(semilla: string): string[] {
  return shuffle(fullDeck(), randomIntDeSemilla(semilla)).map((c) => `${c.rank}${c.suit[0]}`);
}

interface Verificacion {
  roundNumber: number;
  commit: string;
  revelada: boolean;
  serverSeed: string | null;
  commitOk: boolean | null;
  mazoOk: boolean | null;
  deckOrder: string[];
}

export default async function VerificarReparto({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;

  const [match, commits] = await Promise.all([
    prisma.match.findUnique({ where: { id: matchId }, select: { state: true, finishedAt: true } }),
    prisma.shuffleCommit.findMany({
      where: { matchId },
      orderBy: { roundNumber: 'asc' },
    }),
  ]);

  // La semilla sólo se revela cuando la partida terminó: durante el juego, un
  // jugador que la conociera podría deducir las cartas. Antes, sólo el commit.
  const partidaTerminada = !match || match.state === 'FINISHED';

  const verificaciones: Verificacion[] = commits.map((c) => {
    const revelar = partidaTerminada && !!c.serverSeed;
    const deckGuardado = Array.isArray(c.deckOrder) ? (c.deckOrder as string[]) : [];
    if (!revelar || !c.serverSeed) {
      return {
        roundNumber: c.roundNumber,
        commit: c.commit,
        revelada: false,
        serverSeed: null,
        commitOk: null,
        mazoOk: null,
        deckOrder: [],
      };
    }
    const commitRecomputado = commitDeSemilla(c.serverSeed);
    const mazoRecomputado = recomputarMazo(c.serverSeed);
    return {
      roundNumber: c.roundNumber,
      commit: c.commit,
      revelada: true,
      serverSeed: c.serverSeed,
      commitOk: commitRecomputado === c.commit,
      mazoOk: JSON.stringify(mazoRecomputado) === JSON.stringify(deckGuardado),
      deckOrder: mazoRecomputado,
    };
  });

  const todoOk =
    verificaciones.length > 0 &&
    verificaciones.every((v) => !v.revelada || (v.commitOk && v.mazoOk));

  return (
    <div className="min-h-dvh px-5 py-8">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <Link href="/" aria-label="Inicio">
            <Logo size={28} />
          </Link>
          <Link href="/reparto" className="text-sm text-oro-400 hover:text-oro-500">
            Verificar otra partida
          </Link>
        </div>

        <h1 className="mt-6 text-2xl font-bold tracking-tight">Verificación de reparto</h1>
        <p className="mt-1 text-sm text-tinta-400">
          Partida <span className="font-mono text-tinta-200">{matchId}</span>
        </p>

        {commits.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-noche-700 bg-noche-850 p-5 text-tinta-400">
            No hay repartos registrados para esa partida. Revisá el ID.
          </div>
        ) : (
          <>
            <div
              className={`mt-5 rounded-2xl border p-4 ${
                !partidaTerminada
                  ? 'border-oro-500/40 bg-oro-500/10'
                  : todoOk
                    ? 'border-emerald-600/50 bg-emerald-950/30'
                    : 'border-canto-500 bg-canto-950/20'
              }`}
            >
              {!partidaTerminada ? (
                <p className="font-medium text-oro-300">
                  ⏳ La partida sigue en juego. Se publican los compromisos (hash); la semilla se
                  revela recién al terminar.
                </p>
              ) : todoOk ? (
                <p className="font-medium text-emerald-300">
                  ✓ Reparto verificado: cada semilla coincide con su compromiso y reproduce
                  exactamente el mazo que se jugó. No hubo manipulación.
                </p>
              ) : (
                <p className="font-medium text-canto-300">
                  ✗ Hay al menos una ronda cuyo reparto no verifica. Revisar abajo.
                </p>
              )}
            </div>

            <p className="mt-5 text-sm text-tinta-400">
              Cómo se verifica: el servidor publicó{' '}
              <code className="text-tinta-200">commit = SHA-256(semilla)</code> antes de jugar cada
              ronda. Al terminar revela la semilla; con ella cualquiera recomputa el mazo y
              comprueba que es el que se jugó.
            </p>

            <ul className="mt-4 space-y-3">
              {verificaciones.map((v) => (
                <li
                  key={v.roundNumber}
                  className="rounded-2xl border border-noche-700 bg-noche-850 p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-tinta-50">Ronda {v.roundNumber}</span>
                    {!v.revelada ? (
                      <span className="text-xs text-oro-300">semilla no revelada aún</span>
                    ) : v.commitOk && v.mazoOk ? (
                      <span className="text-xs text-emerald-400">✓ verifica</span>
                    ) : (
                      <span className="text-xs text-canto-400">✗ no verifica</span>
                    )}
                  </div>
                  <p className="mt-2 break-all font-mono text-xs text-tinta-400">
                    commit: {v.commit}
                  </p>
                  {v.revelada && (
                    <>
                      <p className="mt-1 break-all font-mono text-xs text-tinta-400">
                        semilla: {v.serverSeed}
                      </p>
                      <p className="mt-1 text-xs text-tinta-500">
                        SHA-256(semilla) {v.commitOk ? '=' : '≠'} commit · mazo recomputado{' '}
                        {v.mazoOk ? '=' : '≠'} mazo jugado
                      </p>
                      <p className="mt-2 break-all font-mono text-[11px] text-tinta-500">
                        {v.deckOrder.join(' ')}
                      </p>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
