import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@trucazo/db';
import { auditarUsuario, kycPendientes, reconciliacionCajeros } from '@trucazo/economia';
import { Encabezado } from '@/components/Encabezado';
import { Panel, Pildora } from '@/components/ui';
import { getSessionUser } from '@/lib/session';
import { cambiarSuspension, crearTorneo, resolverKycAccion, resolverReporte } from './acciones';

export const metadata = { title: 'Administración' };

export default async function Admin({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await getSessionUser();
  // Autorización en el servidor. Sin esto la página no se renderiza siquiera.
  if (!user) redirect('/ingresar');
  if (user.role !== 'ADMIN') redirect('/inicio');

  const { q } = await searchParams;

  const [
    usuarios,
    partidas,
    salasActivas,
    cajeros,
    retiros,
    movimientos,
    ultimosLogs,
    reportes,
    kyc,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.match.count(),
    prisma.room.count({ where: { state: { in: ['WAITING', 'IN_PROGRESS'] } } }),
    reconciliacionCajeros(),
    prisma.withdrawalRequest.count({ where: { state: { in: ['PENDING', 'RESERVED'] } } }),
    prisma.ledgerEntry.count(),
    prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { actor: { select: { username: true } } },
    }),
    prisma.report.findMany({
      where: { state: { in: ['OPEN', 'IN_REVIEW'] } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        reporter: { select: { username: true } },
        reported: { select: { username: true } },
      },
    }),
    kycPendientes(),
  ]);

  // Búsqueda de usuario + auditoría de su ledger.
  const buscado = q
    ? await prisma.user.findFirst({
        where: { OR: [{ username: q }, { id: q }, { email: q }] },
        include: { wallet: true, profile: true, ratings: true },
      })
    : null;
  const auditoria = buscado ? await auditarUsuario(buscado.id) : null;

  return (
    <div className="min-h-dvh">
      <Encabezado user={user} />

      <main id="contenido" className="mx-auto max-w-4xl px-5 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">Administración</h1>
            <Pildora tono="rojo">Admin</Pildora>
          </div>
          {/* Cargar fichas es lo que más se usa: va a mano, no enterrado. */}
          <Link
            href="/admin/fichas"
            className="rounded-xl bg-oro-500 px-5 py-2.5 text-sm font-bold text-noche-950 shadow-[0_4px_14px_-4px_rgba(232,176,75,.5)] transition-opacity hover:opacity-90"
          >
            Cargar fichas
          </Link>
        </div>

        {/* ─── Métricas ──────────────────────────────────────────────── */}
        <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Metrica etiqueta="Usuarios" valor={usuarios} />
          <Metrica etiqueta="Partidas" valor={partidas} />
          <Metrica etiqueta="Salas activas" valor={salasActivas} />
          <Metrica etiqueta="Asientos ledger" valor={movimientos} />
          <Metrica etiqueta="Retiros pendientes" valor={retiros} alerta={retiros > 0} />
        </div>

        {/* ─── KYC pendientes ────────────────────────────────────────── */}
        <section className="mt-8">
          <h2 className="text-xl font-bold tracking-tight">
            Verificaciones de identidad (KYC){' '}
            {kyc.length > 0 && <Pildora tono="rojo">{kyc.length}</Pildora>}
          </h2>
          {kyc.length === 0 ? (
            <Panel className="mt-3 text-tinta-400">No hay verificaciones pendientes.</Panel>
          ) : (
            <ul className="mt-3 space-y-2">
              {kyc.map((k) => (
                <li key={k.id}>
                  <Panel className="flex flex-wrap items-center justify-between gap-3 !p-3.5">
                    <span>
                      <span className="block font-medium text-tinta-50">{k.fullName}</span>
                      <span className="block text-xs text-tinta-400">
                        @{k.user.username} · {k.docType} {k.docNumber}
                        {k.docImageUrl && (
                          <>
                            {' · '}
                            <a
                              href={k.docImageUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-oro-400 hover:text-oro-500"
                            >
                              ver documento
                            </a>
                          </>
                        )}
                      </span>
                    </span>
                    <span className="flex gap-2">
                      <form action={resolverKycAccion}>
                        <input type="hidden" name="submissionId" value={k.id} />
                        <input type="hidden" name="accion" value="APPROVED" />
                        <button className="h-9 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-500">
                          Aprobar
                        </button>
                      </form>
                      <form action={resolverKycAccion}>
                        <input type="hidden" name="submissionId" value={k.id} />
                        <input type="hidden" name="accion" value="REJECTED" />
                        <button className="h-9 rounded-lg bg-canto-500 px-3 text-sm font-semibold text-white hover:bg-canto-400">
                          Rechazar
                        </button>
                      </form>
                    </span>
                  </Panel>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ─── Auditoría de usuario ──────────────────────────────────── */}
        <section className="mt-8">
          <h2 className="text-xl font-bold tracking-tight">Auditar usuario</h2>
          <form className="mt-3 flex gap-2">
            <input
              name="q"
              defaultValue={q ?? ''}
              placeholder="usuario, email o id"
              className="h-11 flex-1 rounded-xl border bg-noche-800/80 px-3.5 text-tinta-50 placeholder:text-tinta-600 focus:border-oro-500"
            />
            <button className="h-11 rounded-xl bg-oro-500 px-5 font-semibold text-noche-950 hover:bg-oro-400">
              Buscar
            </button>
          </form>

          {q && !buscado && (
            <Panel className="mt-3 text-tinta-400">No encontré a &quot;{q}&quot;.</Panel>
          )}

          {buscado && auditoria && (
            <Panel className="mt-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  <span className="block font-semibold text-tinta-50">
                    {buscado.profile?.displayName ?? buscado.username}
                  </span>
                  <span className="block text-xs text-tinta-400">
                    @{buscado.username} · {buscado.role} ·{' '}
                    {buscado.suspended ? 'suspendido' : 'activo'}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block font-mono text-2xl font-bold text-oro-400">
                    {(buscado.wallet?.balance ?? 0n).toLocaleString('es-AR')}
                  </span>
                  {(buscado.wallet?.locked ?? 0n) > 0n && (
                    <span className="block text-xs text-tinta-400">
                      🔒 {(buscado.wallet?.locked ?? 0n).toLocaleString('es-AR')}
                    </span>
                  )}
                </span>
              </div>

              <div
                className={`mt-4 rounded-xl border p-3 ${
                  auditoria.ok ? 'border-emerald-700/50 bg-emerald-950/30' : 'border-canto-500'
                }`}
              >
                <p className="font-medium">
                  {auditoria.ok ? '✓ La contabilidad cierra' : '✗ Hay inconsistencias'}
                </p>
                <p className="mt-1 text-sm text-tinta-400">
                  {auditoria.movimientos} movimientos · el ledger suma{' '}
                  <span className="font-mono">{auditoria.saldoCalculado.toString()}</span> y la
                  billetera tiene{' '}
                  <span className="font-mono">{auditoria.saldoBilletera.toString()}</span>
                </p>
                {auditoria.problemas.length > 0 && (
                  <ul className="mt-2 space-y-1 text-sm text-canto-400">
                    {auditoria.problemas.map((p, i) => (
                      <li key={i}>• {p}</li>
                    ))}
                  </ul>
                )}
              </div>
            </Panel>
          )}
        </section>

        {/* ─── Crear torneo ──────────────────────────────────────────── */}
        <section className="mt-8">
          <h2 className="text-xl font-bold tracking-tight">Crear torneo</h2>
          <Panel className="mt-3">
            <form action={crearTorneo} className="grid gap-3 sm:grid-cols-2">
              <input
                name="name"
                required
                placeholder="Nombre del torneo"
                className="h-11 rounded-xl border bg-noche-800/80 px-3.5 text-tinta-50 placeholder:text-tinta-600 focus:border-oro-500 sm:col-span-2"
              />
              <select
                name="mode"
                className="h-11 rounded-xl border bg-noche-800/80 px-3 text-tinta-50 focus:border-oro-500"
              >
                <option value="CASUAL_1V1">1 vs 1</option>
                <option value="CASUAL_2V2">2 vs 2</option>
              </select>
              <select
                name="maxPlayers"
                className="h-11 rounded-xl border bg-noche-800/80 px-3 text-tinta-50 focus:border-oro-500"
              >
                {[4, 8, 16, 32].map((n) => (
                  <option key={n} value={n}>
                    {n} jugadores
                  </option>
                ))}
              </select>
              <input
                name="entryFee"
                type="number"
                min={0}
                placeholder="Entrada (monedas)"
                className="h-11 rounded-xl border bg-noche-800/80 px-3.5 text-tinta-50 placeholder:text-tinta-600 focus:border-oro-500"
              />
              <button className="h-11 rounded-xl bg-oro-500 px-5 font-semibold text-noche-950 hover:bg-oro-400">
                Crear
              </button>
            </form>
          </Panel>
        </section>

        {/* ─── Reportes ──────────────────────────────────────────────── */}
        <section className="mt-8">
          <h2 className="text-xl font-bold tracking-tight">
            Reportes abiertos
            {reportes.length > 0 && (
              <span className="ml-2 align-middle">
                <Pildora tono="rojo">{reportes.length}</Pildora>
              </span>
            )}
          </h2>
          {reportes.length === 0 ? (
            <Panel className="mt-3 text-tinta-400">No hay reportes pendientes.</Panel>
          ) : (
            <ul className="mt-3 space-y-2">
              {reportes.map((r) => (
                <li key={r.id}>
                  <Panel>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm">
                        <span className="font-medium text-canto-400">@{r.reported.username}</span>{' '}
                        <span className="text-tinta-500">reportado por</span>{' '}
                        <span className="text-tinta-300">@{r.reporter.username}</span>
                      </span>
                      <Pildora>{r.reason}</Pildora>
                    </div>
                    {r.detail && <p className="mt-1.5 text-sm text-tinta-400">{r.detail}</p>}
                    <div className="mt-3 flex gap-2">
                      <form action={resolverReporte}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="accion" value="sancionar" />
                        <button className="h-9 rounded-lg bg-canto-500 px-3 text-sm font-semibold text-white">
                          Advertir
                        </button>
                      </form>
                      <form action={cambiarSuspension}>
                        <input type="hidden" name="userId" value={r.reportedId} />
                        <input type="hidden" name="suspender" value="true" />
                        <button className="h-9 rounded-lg border border-canto-600 px-3 text-sm text-canto-400">
                          Suspender
                        </button>
                      </form>
                      <form action={resolverReporte}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="accion" value="desestimar" />
                        <button className="h-9 rounded-lg border border-noche-600 px-3 text-sm text-tinta-300">
                          Desestimar
                        </button>
                      </form>
                    </div>
                  </Panel>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ─── Cajeros ───────────────────────────────────────────────── */}
        <section className="mt-8">
          <h2 className="text-xl font-bold tracking-tight">Reconciliación de cajeros</h2>
          <p className="mt-1 text-sm text-tinta-400">
            Contador del perfil vs. suma real del ledger. Si una fila no cuadra, hay que revisarla:
            el ledger es la verdad.
          </p>
          {cajeros.length === 0 ? (
            <Panel className="mt-3 text-tinta-400">No hay cajeros configurados.</Panel>
          ) : (
            <ul className="mt-3 space-y-2">
              {cajeros.map((c) => (
                <li key={c.cajeroUserId}>
                  <Panel className="flex flex-wrap items-center justify-between gap-3 !p-3.5">
                    <span>
                      <span className="flex items-center gap-2">
                        <span className="font-medium text-tinta-50">{c.nombre}</span>
                        {c.cuadra ? (
                          <Pildora tono="verde">Cuadra</Pildora>
                        ) : (
                          <Pildora tono="rojo">No cuadra</Pildora>
                        )}
                        {!c.activo && <Pildora>Inactivo</Pildora>}
                      </span>
                      <span className="block text-xs text-tinta-400">@{c.username}</span>
                      <span className="mt-1 block text-xs text-tinta-500">
                        últimas 24 h: cargó{' '}
                        <span className="font-mono text-emerald-400">
                          {c.cargado24h.toLocaleString('es-AR')}
                        </span>{' '}
                        · pagó{' '}
                        <span className="font-mono text-canto-400">
                          {c.pagado24h.toLocaleString('es-AR')}
                        </span>
                      </span>
                    </span>
                    <span className="text-right text-xs text-tinta-400">
                      <span className="block">
                        cargado (ledger){' '}
                        <span className="font-mono text-emerald-400">
                          {c.ledgerCargado.toLocaleString('es-AR')}
                        </span>
                        {!c.cuadra && c.contadorCargado !== c.ledgerCargado && (
                          <span className="text-canto-400">
                            {' '}
                            ≠ contador {c.contadorCargado.toLocaleString('es-AR')}
                          </span>
                        )}
                      </span>
                      <span className="block">
                        pagado (ledger){' '}
                        <span className="font-mono text-canto-400">
                          {c.ledgerPagado.toLocaleString('es-AR')}
                        </span>
                        {!c.cuadra && c.contadorPagado !== c.ledgerPagado && (
                          <span className="text-canto-400">
                            {' '}
                            ≠ contador {c.contadorPagado.toLocaleString('es-AR')}
                          </span>
                        )}
                      </span>
                    </span>
                  </Panel>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ─── Auditoría de acciones ─────────────────────────────────── */}
        <section className="mt-8">
          <h2 className="text-xl font-bold tracking-tight">Últimas acciones registradas</h2>
          {ultimosLogs.length === 0 ? (
            <Panel className="mt-3 text-tinta-400">Sin acciones registradas.</Panel>
          ) : (
            <ul className="mt-3 space-y-1">
              {ultimosLogs.map((l) => (
                <li key={l.id}>
                  <Panel className="flex items-center justify-between gap-3 !p-2.5 text-sm">
                    <span className="min-w-0">
                      <span className="font-mono text-xs text-oro-400">{l.action}</span>{' '}
                      <span className="text-tinta-300">@{l.actor.username}</span>
                    </span>
                    <span className="shrink-0 text-xs text-tinta-600">
                      {l.createdAt.toLocaleString('es-AR')}
                    </span>
                  </Panel>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="mt-8 flex gap-3 text-sm">
          <Link href="/ranking" className="text-oro-400 hover:text-oro-500">
            Ver ranking →
          </Link>
        </div>
      </main>
    </div>
  );
}

function Metrica({
  etiqueta,
  valor,
  alerta,
}: {
  etiqueta: string;
  valor: number;
  alerta?: boolean;
}) {
  return (
    <Panel className="!p-4">
      <p className="text-xs text-tinta-400">{etiqueta}</p>
      <p
        className={`mt-1 font-mono text-2xl font-bold ${alerta ? 'text-canto-400' : 'text-tinta-50'}`}
      >
        {valor.toLocaleString('es-AR')}
      </p>
    </Panel>
  );
}
