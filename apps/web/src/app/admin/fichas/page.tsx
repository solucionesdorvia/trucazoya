import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@trucazo/db';
import { auditarUsuario } from '@trucazo/economia';
import { Panel } from '@/components/ui';
import { getSessionUser } from '@/lib/session';
import { FormularioFichas } from './FormularioFichas';

export const metadata = { title: 'Cargar fichas' };
export const dynamic = 'force-dynamic';

const ETIQUETAS: Record<string, string> = {
  ADMIN_ADJUSTMENT: 'Ajuste manual',
  CASHIER_DEPOSIT: 'Carga de cajero',
  CASHIER_WITHDRAWAL: 'Retiro por cajero',
  BET_RESERVED: 'Apuesta',
  BET_WON: 'Ganó',
  BET_LOST: 'Perdió',
  BET_REFUND: 'Devolución',
  TOURNAMENT_ENTRY: 'Torneo',
  TOURNAMENT_PRIZE: 'Premio de torneo',
  PENALTY: 'Penalización',
};

export default async function CargarFichas({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/ingresar');
  if (user.role !== 'ADMIN') redirect('/inicio');

  const { q } = await searchParams;
  const buscado = q
    ? await prisma.user.findFirst({
        where: { OR: [{ username: q }, { email: q }, { id: q }] },
        select: {
          id: true,
          username: true,
          role: true,
          suspended: true,
          profile: { select: { displayName: true } },
          wallet: { select: { balance: true, locked: true } },
        },
      })
    : null;

  const auditoria = buscado ? await auditarUsuario(buscado.id) : null;
  const movimientos = buscado
    ? await prisma.ledgerEntry.findMany({
        where: { userId: buscado.id },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          type: true,
          amount: true,
          balanceAfter: true,
          reason: true,
          createdAt: true,
        },
      })
    : [];

  const saldo = Number(buscado?.wallet?.balance ?? 0n);

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <Link href="/admin" className="text-sm text-tinta-400 transition-colors hover:text-tinta-200">
        ← Administración
      </Link>

      <h1 className="mt-4 text-3xl font-bold tracking-tight">Cargar fichas</h1>
      <p className="mt-1.5 max-w-md leading-relaxed text-tinta-400">
        Acreditás o descontás vos, sin pasar por un cajero. Queda registrado en el ledger como
        cualquier otro movimiento.
      </p>

      <form className="mt-6 flex gap-2">
        <input
          name="q"
          defaultValue={q ?? ''}
          autoFocus={!q}
          placeholder="usuario, email o id"
          aria-label="Buscar jugador"
          className="h-12 flex-1 rounded-xl border border-noche-600 bg-noche-800/80 px-3.5 text-[15px] text-tinta-50 placeholder:text-tinta-600 focus:border-oro-500"
        />
        <button className="h-12 rounded-xl bg-noche-700 px-5 font-semibold text-tinta-100 transition-colors hover:bg-noche-600">
          Buscar
        </button>
      </form>

      {q && !buscado && (
        <Panel className="mt-4 text-tinta-400">
          No encontré a <span className="text-tinta-100">&quot;{q}&quot;</span>. Probá con el nombre
          de usuario exacto.
        </Panel>
      )}

      {!q && (
        <Panel className="mt-4 text-tinta-400">
          Buscá al jugador para ver su saldo y moverle fichas.
        </Panel>
      )}

      {buscado && (
        <>
          <Panel className="mt-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold text-tinta-50">
                  {buscado.profile?.displayName ?? buscado.username}
                </p>
                <p className="mt-0.5 text-xs text-tinta-500">
                  @{buscado.username}
                  {buscado.role !== 'USER' && ` · ${buscado.role}`}
                  {buscado.suspended && ' · suspendido'}
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-4xl font-bold leading-none text-oro-400">
                  {saldo.toLocaleString('es-AR')}
                </p>
                <p className="mt-1 text-xs text-tinta-500">
                  fichas
                  {(buscado.wallet?.locked ?? 0n) > 0n &&
                    ` · ${Number(buscado.wallet?.locked).toLocaleString('es-AR')} retenidas`}
                </p>
              </div>
            </div>

            {auditoria && !auditoria.ok && (
              <p className="mt-4 rounded-xl border border-canto-500 bg-canto-500/10 px-3.5 py-3 text-sm text-canto-300">
                La contabilidad de esta cuenta no cierra: el ledger suma{' '}
                <span className="font-mono">{auditoria.saldoCalculado.toString()}</span> y la
                billetera tiene{' '}
                <span className="font-mono">{auditoria.saldoBilletera.toString()}</span>. Conviene
                revisarlo antes de moverle plata.
              </p>
            )}

            <FormularioFichas usuario={buscado.username} saldo={saldo} />
          </Panel>

          <h2 className="mt-8 text-lg font-semibold text-tinta-200">Últimos movimientos</h2>
          {movimientos.length === 0 ? (
            <Panel className="mt-3 text-sm text-tinta-400">
              Todavía no tiene movimientos registrados.
            </Panel>
          ) : (
            <ol className="mt-3 divide-y divide-noche-800 overflow-hidden rounded-2xl border border-noche-800">
              {movimientos.map((m) => {
                const monto = Number(m.amount);
                return (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-4 bg-noche-900/50 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-tinta-200">{ETIQUETAS[m.type] ?? m.type}</p>
                      <p className="mt-0.5 truncate text-xs text-tinta-500">
                        {m.createdAt.toLocaleString('es-AR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {m.reason && ` · ${m.reason}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={`font-mono text-sm font-semibold ${
                          monto >= 0 ? 'text-emerald-400' : 'text-canto-400'
                        }`}
                      >
                        {monto >= 0 ? '+' : '−'}
                        {Math.abs(monto).toLocaleString('es-AR')}
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-tinta-600">
                        {Number(m.balanceAfter).toLocaleString('es-AR')}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
