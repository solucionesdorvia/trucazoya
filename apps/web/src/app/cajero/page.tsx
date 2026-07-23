import { redirect } from 'next/navigation';
import { prisma } from '@trucazo/db';
import { retirosPendientes } from '@trucazo/economia';
import { whatsappLink } from '@trucazo/shared';
import { Encabezado } from '@/components/Encabezado';
import { Panel, Pildora } from '@/components/ui';
import { FormAcreditar } from '@/components/cajero/FormAcreditar';
import { getSessionUser } from '@/lib/session';
import { resolver } from './acciones';

export const metadata = { title: 'Panel de cajero' };

export default async function PanelCajero() {
  const user = await getSessionUser();
  if (!user) redirect('/ingresar');

  const perfil = await prisma.cashierProfile.findUnique({ where: { userId: user.id } });
  // Autorización en el servidor: sin perfil activo de cajero, no se ve nada.
  if (!perfil?.active || (user.role !== 'CASHIER' && user.role !== 'ADMIN')) {
    redirect('/inicio');
  }

  const [pendientes, recientes] = await Promise.all([
    retirosPendientes(user.id),
    prisma.ledgerEntry.findMany({
      where: { actorUserId: user.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 15,
      include: { user: { select: { username: true } } },
    }),
  ]);

  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const hoy = await prisma.ledgerEntry.findMany({
    where: { actorUserId: user.id, type: 'CASHIER_DEPOSIT', createdAt: { gte: desde } },
    select: { amount: true },
  });
  const acreditadoHoy = hoy.reduce((a, f) => a + f.amount, 0n);

  return (
    <div className="min-h-dvh">
      <Encabezado user={user} />

      <main id="contenido" className="mx-auto max-w-3xl px-5 py-8">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">Panel de cajero</h1>
          <Pildora tono="verde">{perfil.displayName}</Pildora>
        </div>

        {/* ─── Límites ───────────────────────────────────────────────── */}
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Panel className="!p-4">
            <p className="text-xs text-tinta-400">Acreditado (24 h)</p>
            <p className="mt-1 font-mono text-xl font-bold text-tinta-50">
              {acreditadoHoy.toLocaleString('es-AR')}
            </p>
            <p className="mt-0.5 text-xs text-tinta-600">
              de {perfil.perDayMax.toLocaleString('es-AR')}
            </p>
          </Panel>
          <Panel className="!p-4">
            <p className="text-xs text-tinta-400">Máx. por operación</p>
            <p className="mt-1 font-mono text-xl font-bold text-tinta-50">
              {perfil.perOpMax.toLocaleString('es-AR')}
            </p>
          </Panel>
          <Panel className="!p-4">
            <p className="text-xs text-tinta-400">Total histórico</p>
            <p className="mt-1 font-mono text-xl font-bold text-tinta-50">
              {perfil.totalDeposited.toLocaleString('es-AR')}
            </p>
            <p className="mt-0.5 text-xs text-tinta-600">
              retirado {perfil.totalWithdrawn.toLocaleString('es-AR')}
            </p>
          </Panel>
        </div>

        {/* ─── Acreditar ─────────────────────────────────────────────── */}
        <section className="mt-7">
          <h2 className="text-xl font-bold tracking-tight">Cargar monedas</h2>
          <p className="mt-1 text-sm text-tinta-400">
            Primero cobrale por fuera. Después acreditá acá.
          </p>
          <div className="mt-3">
            <FormAcreditar />
          </div>
        </section>

        {/* ─── Cola de retiros ───────────────────────────────────────── */}
        <section className="mt-8">
          <h2 className="text-xl font-bold tracking-tight">
            Retiros pendientes
            {pendientes.length > 0 && (
              <span className="ml-2 align-middle">
                <Pildora tono="rojo">{pendientes.length}</Pildora>
              </span>
            )}
          </h2>

          {pendientes.length === 0 ? (
            <Panel className="mt-3 text-center text-tinta-400">No hay retiros pendientes.</Panel>
          ) : (
            <ul className="mt-3 space-y-2">
              {pendientes.map((r) => (
                <li key={r.id}>
                  <Panel>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span>
                        <span className="block font-medium text-tinta-50">
                          {r.user.profile?.displayName ?? r.user.username}
                        </span>
                        <span className="block text-xs text-tinta-400">
                          @{r.user.username} · {r.createdAt.toLocaleString('es-AR')}
                        </span>
                      </span>
                      <span className="font-mono text-2xl font-bold text-oro-400">
                        {r.amount.toLocaleString('es-AR')}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <a
                        href={whatsappLink(
                          perfil.whatsappE164,
                          `Hola ${r.user.username}, soy ${perfil.displayName} de Trucazo. Coordinamos tu retiro de ${r.amount} monedas.`,
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#25D366] px-4 text-sm font-semibold text-[#08300f]"
                      >
                        💬 Escribirle
                      </a>
                      <form action={resolver}>
                        <input type="hidden" name="requestId" value={r.id} />
                        <input type="hidden" name="accion" value="PAID" />
                        <button className="h-10 rounded-xl bg-oro-500 px-4 text-sm font-semibold text-noche-950 hover:bg-oro-400">
                          Ya le pagué
                        </button>
                      </form>
                      <form action={resolver}>
                        <input type="hidden" name="requestId" value={r.id} />
                        <input type="hidden" name="accion" value="REJECTED" />
                        <button className="h-10 rounded-xl border border-noche-600 px-4 text-sm text-tinta-300 hover:bg-noche-800">
                          Rechazar
                        </button>
                      </form>
                    </div>
                  </Panel>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ─── Historial ─────────────────────────────────────────────── */}
        <section className="mt-8">
          <h2 className="text-xl font-bold tracking-tight">Tus últimas operaciones</h2>
          {recientes.length === 0 ? (
            <Panel className="mt-3 text-center text-tinta-400">Sin operaciones todavía.</Panel>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {recientes.map((m) => (
                <li key={m.id}>
                  <Panel className="flex items-center justify-between gap-3 !p-3">
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-tinta-50">
                        {m.type === 'CASHIER_DEPOSIT' ? 'Carga' : 'Retiro'} · @{m.user.username}
                      </span>
                      <span className="block text-xs text-tinta-500">
                        {m.createdAt.toLocaleString('es-AR')}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 font-mono font-semibold ${
                        m.amount > 0n ? 'text-emerald-400' : 'text-canto-400'
                      }`}
                    >
                      {m.amount > 0n ? '+' : ''}
                      {m.amount.toLocaleString('es-AR')}
                    </span>
                  </Panel>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Panel className="mt-8 border-dashed text-sm leading-relaxed text-tinta-400">
          Cada operación tuya queda registrada con tu usuario, el destinatario, el monto y la fecha.
          Los saldos no se editan a mano: todo pasa por el libro contable.
        </Panel>
      </main>
    </div>
  );
}
