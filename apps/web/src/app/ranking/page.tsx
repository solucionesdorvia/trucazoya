import { redirect } from 'next/navigation';
import { esProvisoria, tablaPosiciones } from '@trucazo/economia';
import { Encabezado } from '@/components/Encabezado';
import { Panel, Pildora } from '@/components/ui';
import { getSessionUser } from '@/lib/session';

export const metadata = { title: 'Ranking' };

const COLOR_DIVISION: Record<string, 'neutro' | 'oro' | 'verde' | 'rojo'> = {
  BRONCE: 'neutro',
  PLATA: 'neutro',
  ORO: 'oro',
  PLATINO: 'verde',
  DIAMANTE: 'verde',
  MAESTRO: 'oro',
  GRAN_MAESTRO: 'rojo',
};

function bonito(d: string): string {
  return d.charAt(0) + d.slice(1).toLowerCase().replace('_', ' ');
}

export default async function Ranking({
  searchParams,
}: {
  searchParams: Promise<{ modo?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/ingresar');

  const { modo } = await searchParams;
  const mode = modo === 'RANKED_2V2' ? 'RANKED_2V2' : 'RANKED_1V1';
  const tabla = await tablaPosiciones(mode);

  return (
    <div className="min-h-dvh">
      <Encabezado user={user} />

      <main id="contenido" className="mx-auto max-w-3xl px-5 py-8">
        <h1 className="text-3xl font-bold tracking-tight">Ranking</h1>

        <div className="mt-4 flex gap-2">
          {[
            { v: 'RANKED_1V1', t: '1 vs 1' },
            { v: 'RANKED_2V2', t: '2 vs 2' },
          ].map((o) => (
            <a
              key={o.v}
              href={`/ranking?modo=${o.v}`}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                mode === o.v
                  ? 'bg-oro-500 text-noche-950'
                  : 'border border-noche-600 text-tinta-300 hover:bg-noche-800'
              }`}
            >
              {o.t}
            </a>
          ))}
        </div>

        {tabla.length === 0 ? (
          <Panel className="mt-6 text-center text-tinta-400">
            Todavía no hay jugadores clasificados. Hacen falta al menos 5 partidas competitivas para
            entrar a la tabla.
          </Panel>
        ) : (
          <ol className="mt-6 space-y-1.5">
            {tabla.map((r, i) => (
              <li key={r.id}>
                <Panel
                  className={`flex items-center gap-3 !p-3 ${
                    r.userId === user.id ? 'ring-1 ring-oro-500/50' : ''
                  }`}
                >
                  <span
                    className={`w-8 shrink-0 text-center font-mono font-bold ${
                      i < 3 ? 'text-oro-400' : 'text-tinta-600'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-tinta-50">
                      {r.user.profile?.displayName ?? r.user.username}
                      {r.userId === user.id && (
                        <span className="ml-1.5 text-xs text-oro-400">· vos</span>
                      )}
                    </span>
                    <span className="block text-xs text-tinta-500">
                      {r.wins}V · {r.losses}D{esProvisoria(r.deviation) && ' · provisorio'}
                    </span>
                  </span>
                  <Pildora tono={COLOR_DIVISION[r.division] ?? 'neutro'}>
                    {bonito(r.division)}
                  </Pildora>
                  <span className="w-14 shrink-0 text-right font-mono font-bold text-tinta-50">
                    {Math.round(r.rating)}
                  </span>
                </Panel>
              </li>
            ))}
          </ol>
        )}

        <p className="mt-4 text-xs leading-relaxed text-tinta-600">
          Usamos Glicko-2: además del puntaje mide cuánta certeza hay sobre tu nivel. Por eso a un
          jugador nuevo lo mueve más rápido que a uno con muchas partidas, y una racha de malas
          manos no te hunde.
        </p>
      </main>
    </div>
  );
}
