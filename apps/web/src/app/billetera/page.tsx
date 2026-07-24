import { redirect } from 'next/navigation';
import { prisma } from '@trucazo/db';
import { listarCajeros, saldoDe } from '@trucazo/economia';
import { Encabezado } from '@/components/Encabezado';
import { Panel, Pildora } from '@/components/ui';
import { FormRetiro } from '@/components/billetera/FormRetiro';
import { getSessionUser } from '@/lib/session';
import { cancelarRetiro } from './acciones';
import { reenviarVerificacion } from './verificar-accion';

export const metadata = { title: 'Billetera' };

const ETIQUETA_TIPO: Record<string, string> = {
  CASHIER_DEPOSIT: 'Carga de cajero',
  CASHIER_WITHDRAWAL: 'Retiro',
  BET_RESERVED: 'Apuesta',
  BET_WON: 'Apuesta ganada',
  BET_LOST: 'Apuesta perdida',
  BET_REFUND: 'Reembolso',
  DAILY_BONUS: 'Bonus diario',
  LEVEL_REWARD: 'Recompensa',
  TOURNAMENT_ENTRY: 'Inscripción a torneo',
  TOURNAMENT_PRIZE: 'Premio de torneo',
  ADMIN_ADJUSTMENT: 'Ajuste administrativo',
  PENALTY: 'Penalización',
  RAKE: 'Comisión',
};

export default async function Billetera() {
  const user = await getSessionUser();
  if (!user) redirect('/ingresar');

  const [saldo, movimientos, cajeros, retiros] = await Promise.all([
    saldoDe(user.id),
    prisma.ledgerEntry.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
    }),
    listarCajeros({ id: user.id, username: user.username }),
    prisma.withdrawalRequest.findMany({
      where: { userId: user.id, state: { in: ['PENDING', 'RESERVED'] } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return (
    <div className="min-h-dvh">
      <Encabezado user={user} />

      <main id="contenido" className="mx-auto max-w-3xl px-5 py-8">
        <h1 className="text-3xl font-bold tracking-tight">Billetera</h1>

        {!user.emailVerified && !user.isGuest && (
          <Panel className="mt-4 border-oro-500/40 bg-oro-500/5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-tinta-200">
                📧 Verificá tu email para poder <strong>retirar</strong> monedas.
              </p>
              <form action={reenviarVerificacion}>
                <button className="h-9 rounded-lg border border-oro-500/40 px-3 text-sm font-medium text-oro-400">
                  Reenviar link
                </button>
              </form>
            </div>
          </Panel>
        )}

        {/* ─── Saldo ─────────────────────────────────────────────────── */}
        <Panel className="mt-5">
          <p className="text-sm text-tinta-400">Disponible</p>
          <p className="mt-1 font-mono text-5xl font-bold text-oro-400">
            {saldo.balance.toLocaleString('es-AR')}
          </p>
          {saldo.locked > 0n && (
            <p className="mt-2 text-sm text-tinta-400">
              🔒 {saldo.locked.toLocaleString('es-AR')} bloqueado en retiros pendientes
            </p>
          )}
        </Panel>

        {/* ─── Retiros pendientes ────────────────────────────────────── */}
        {retiros.length > 0 && (
          <section className="mt-6">
            <h2 className="text-sm font-medium text-tinta-400">Retiros en curso</h2>
            <ul className="mt-2 space-y-2">
              {retiros.map((r) => (
                <li key={r.id}>
                  <Panel className="flex items-center justify-between gap-3 !p-3.5">
                    <span>
                      <span className="block font-mono font-semibold text-tinta-50">
                        {r.amount.toLocaleString('es-AR')}
                      </span>
                      <span className="block text-xs text-tinta-400">
                        Esperando al cajero · {r.createdAt.toLocaleDateString('es-AR')}
                      </span>
                    </span>
                    <form action={cancelarRetiro}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className="text-sm text-canto-400 hover:text-canto-500">
                        Cancelar
                      </button>
                    </form>
                  </Panel>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ─── Cajeros ───────────────────────────────────────────────── */}
        <section className="mt-8">
          <h2 className="text-xl font-bold tracking-tight">Cargar o retirar</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-tinta-400">
            Elegí un cajero, escribile por WhatsApp y coordinás con él. Las cargas te las acredita
            en el momento; para retirar, primero pedí el retiro acá abajo.
          </p>

          {cajeros.length === 0 ? (
            <Panel className="mt-4 text-center text-tinta-400">
              No hay cajeros disponibles en este momento.
            </Panel>
          ) : (
            <ul className="mt-4 space-y-2">
              {cajeros.map((c) => (
                <li key={c.userId}>
                  <Panel className="flex items-center justify-between gap-3 !p-4">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-tinta-50">{c.nombre}</span>
                      <span className="block text-xs text-tinta-400">Cajero verificado</span>
                    </span>
                    <a
                      href={c.linkWhatsapp}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-[#25D366] px-4 font-semibold text-[#08300f] transition-opacity hover:opacity-90"
                    >
                      <span aria-hidden="true">💬</span> WhatsApp
                    </a>
                  </Panel>
                </li>
              ))}
            </ul>
          )}

          {saldo.balance > 0n && cajeros.length > 0 && (
            <div className="mt-4">
              <FormRetiro
                cajeros={cajeros.map((c) => ({ userId: c.userId, nombre: c.nombre }))}
                maximo={Number(saldo.balance)}
              />
            </div>
          )}
        </section>

        {/* ─── Movimientos ───────────────────────────────────────────── */}
        <section className="mt-8">
          <h2 className="text-xl font-bold tracking-tight">Movimientos</h2>
          {movimientos.length === 0 ? (
            <Panel className="mt-3 text-center text-tinta-400">Todavía no hay movimientos.</Panel>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {movimientos.map((m) => {
                const positivo = m.amount > 0n;
                return (
                  <li key={m.id}>
                    <Panel className="flex items-center justify-between gap-3 !p-3">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-tinta-50">
                          {ETIQUETA_TIPO[m.type] ?? m.type}
                        </span>
                        <span className="block text-xs text-tinta-500">
                          {m.createdAt.toLocaleString('es-AR', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {m.reason ? ` · ${m.reason}` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span
                          className={`block font-mono font-semibold ${
                            positivo ? 'text-emerald-400' : 'text-tinta-300'
                          }`}
                        >
                          {positivo ? '+' : ''}
                          {m.amount.toLocaleString('es-AR')}
                        </span>
                        <span className="block font-mono text-xs text-tinta-600">
                          → {m.balanceAfter.toLocaleString('es-AR')}
                        </span>
                      </span>
                    </Panel>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-xs text-tinta-600">
            Cada movimiento guarda el saldo anterior y posterior: la cuenta es auditable de punta a
            punta.
          </p>
        </section>

        <Panel className="mt-8 border-dashed">
          <div className="flex items-start gap-3">
            <Pildora tono="oro">Aviso</Pildora>
            <p className="text-sm leading-relaxed text-tinta-400">
              Las monedas son virtuales y sirven para jugar dentro de Trucazo. Jugá con
              responsabilidad y no apuestes más de lo que estés dispuesto a perder.
            </p>
          </div>
        </Panel>
      </main>
    </div>
  );
}
