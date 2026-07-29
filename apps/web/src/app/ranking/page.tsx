import { redirect } from 'next/navigation';
import type { GameMode } from '@trucazo/db';
import { rankingPorPeriodo } from '@trucazo/economia';
import { Encabezado } from '@/components/Encabezado';
import { Panel } from '@/components/ui';
import { getSessionUser } from '@/lib/session';

export const metadata = { title: 'Ranking' };

export const dynamic = 'force-dynamic';

type Periodo = 'semana' | 'mes' | 'historia';

function inicioSemana(now: Date): Date {
  const d = new Date(now);
  const lunes = (d.getDay() + 6) % 7; // 0 = lunes
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - lunes);
  return d;
}

function ventana(periodo: Periodo, now: Date): { desde: Date | null; cierra: Date | null } {
  if (periodo === 'semana') {
    const desde = inicioSemana(now);
    const cierra = new Date(desde);
    cierra.setDate(cierra.getDate() + 7);
    return { desde, cierra };
  }
  if (periodo === 'mes') {
    const desde = new Date(now.getFullYear(), now.getMonth(), 1);
    const cierra = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { desde, cierra };
  }
  return { desde: null, cierra: null };
}

function medallon(pos: number): string {
  if (pos === 0) return '🥇';
  if (pos === 1) return '🥈';
  if (pos === 2) return '🥉';
  return `#${pos + 1}`;
}

export default async function Ranking({
  searchParams,
}: {
  searchParams: Promise<{ modo?: string; periodo?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/ingresar');

  const { modo, periodo: periodoRaw } = await searchParams;
  const mode: GameMode = modo === 'CASUAL_2V2' ? 'CASUAL_2V2' : 'CASUAL_1V1';
  const periodo: Periodo =
    periodoRaw === 'mes' ? 'mes' : periodoRaw === 'historia' ? 'historia' : 'semana';

  const now = new Date();
  const { desde, cierra } = ventana(periodo, now);
  const tabla = await rankingPorPeriodo(mode, desde, 50);

  const miPos = tabla.findIndex((r) => r.userId === user.id);
  const yo = tabla[miPos];
  const puntero = tabla[0];

  const nombrePeriodo =
    periodo === 'semana' ? 'esta semana' : periodo === 'mes' ? 'este mes' : 'siempre';
  const cierreTxt =
    cierra &&
    cierra.toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });

  const link = (p: Periodo) => `/ranking?modo=${mode}&periodo=${p}`;
  const linkModo = (m: string) => `/ranking?modo=${m}&periodo=${periodo}`;

  return (
    <div className="min-h-dvh">
      <Encabezado user={user} />

      <main id="contenido" className="mx-auto max-w-3xl px-5 py-8">
        <h1 className="text-3xl font-bold tracking-tight">Ranking</h1>
        <p className="mt-1.5 text-sm text-tinta-400">
          Todos contra todos. Puntos = <strong>ganadas × 3 + jugadas</strong>. Gana el que más suma{' '}
          {nombrePeriodo}.
        </p>

        {/* Período */}
        <div className="mt-4 flex gap-2">
          {(['semana', 'mes', 'historia'] as const).map((p) => (
            <a
              key={p}
              href={link(p)}
              className={`rounded-xl px-4 py-2 text-sm font-medium capitalize transition-colors ${
                periodo === p
                  ? 'bg-oro-500 text-noche-950'
                  : 'border border-noche-600 text-tinta-300 hover:bg-noche-800'
              }`}
            >
              {p}
            </a>
          ))}
        </div>

        {/* Modo */}
        <div className="mt-2 flex gap-2">
          {[
            { v: 'CASUAL_1V1', t: '1 vs 1' },
            { v: 'CASUAL_2V2', t: '2 vs 2' },
          ].map((o) => (
            <a
              key={o.v}
              href={linkModo(o.v)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === o.v ? 'bg-noche-700 text-tinta-50' : 'text-tinta-400 hover:text-tinta-200'
              }`}
            >
              {o.t}
            </a>
          ))}
        </div>

        {/* Puntero del período */}
        {puntero && periodo !== 'historia' && (
          <Panel className="resplandor-oro mt-5 flex items-center gap-3 !p-4">
            <span className="text-2xl" aria-hidden="true">
              👑
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] uppercase tracking-wider text-oro-400/80">
                Puntero de {nombrePeriodo}
              </span>
              <span className="block truncate text-lg font-bold text-tinta-50">
                {puntero.displayName}
              </span>
              {cierreTxt && (
                <span className="block text-xs text-tinta-500">Cierra el {cierreTxt}</span>
              )}
            </span>
            <span className="shrink-0 font-mono text-2xl font-bold text-oro-400">
              {puntero.puntos}
            </span>
          </Panel>
        )}

        {/* Mi posición */}
        {yo && (
          <Panel className="mt-3 flex items-center gap-3 !p-3">
            <span className="w-10 shrink-0 text-center text-lg">{medallon(miPos)}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-tinta-50">Tu posición</span>
              <span className="block text-xs text-tinta-500">
                {yo.wins}V · {yo.games} jugadas
              </span>
            </span>
            <span className="font-mono text-xl font-bold text-oro-400">{yo.puntos} pts</span>
          </Panel>
        )}

        {tabla.length === 0 ? (
          <Panel className="mt-6 py-10 text-center text-tinta-400">
            <p className="text-3xl">🏆</p>
            <p className="mt-3">Todavía no hay partidas {nombrePeriodo}.</p>
            <p className="mt-1 text-sm">Jugá una y aparecés acá.</p>
          </Panel>
        ) : (
          <ol className="mt-4 space-y-1.5">
            {tabla.map((r, i) => (
              <li key={r.userId}>
                <Panel
                  className={`flex items-center gap-3 !p-3 ${
                    r.userId === user.id ? 'ring-1 ring-oro-500/50' : ''
                  }`}
                >
                  <span
                    className={`w-10 shrink-0 text-center font-mono font-bold ${
                      i < 3 ? 'text-lg text-oro-400' : 'text-tinta-600'
                    }`}
                  >
                    {medallon(i)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-tinta-50">
                      {r.displayName}
                      {r.userId === user.id && (
                        <span className="ml-1.5 text-xs text-oro-400">· vos</span>
                      )}
                    </span>
                    <span className="block text-xs text-tinta-500">
                      {r.wins}V · {r.games} jugadas
                    </span>
                  </span>
                  <span className="shrink-0 font-mono font-bold text-tinta-50">{r.puntos} pts</span>
                </Panel>
              </li>
            ))}
          </ol>
        )}

        <p className="mt-6 text-right text-xs text-tinta-600">
          <a href="/inicio" className="hover:text-tinta-400">
            ← Volver al inicio
          </a>
        </p>
      </main>
    </div>
  );
}
