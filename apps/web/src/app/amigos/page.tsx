import { redirect } from 'next/navigation';
import { prisma } from '@trucazo/db';
import { Encabezado } from '@/components/Encabezado';
import { Boton, Panel, Pildora } from '@/components/ui';
import { getSessionUser } from '@/lib/session';
import { eliminarAmigo, enviarSolicitud, responderSolicitud } from '../social/acciones';

export const metadata = { title: 'Amigos' };

export default async function Amigos() {
  const user = await getSessionUser();
  if (!user) redirect('/ingresar');

  const [aceptadas, recibidas, enviadas] = await Promise.all([
    prisma.friendship.findMany({
      where: {
        state: 'ACCEPTED',
        OR: [{ fromId: user.id }, { toId: user.id }],
      },
      include: {
        from: { select: { id: true, username: true, profile: { select: { displayName: true } } } },
        to: { select: { id: true, username: true, profile: { select: { displayName: true } } } },
      },
    }),
    prisma.friendship.findMany({
      where: { toId: user.id, state: 'PENDING' },
      include: { from: { select: { username: true, profile: { select: { displayName: true } } } } },
    }),
    prisma.friendship.findMany({
      where: { fromId: user.id, state: 'PENDING' },
      include: { to: { select: { username: true } } },
    }),
  ]);

  const amigos = aceptadas.map((f) => (f.fromId === user.id ? f.to : f.from));

  return (
    <div className="min-h-dvh">
      <Encabezado user={user} />

      <main id="contenido" className="mx-auto max-w-2xl px-5 py-8">
        <h1 className="text-3xl font-bold tracking-tight">Amigos</h1>

        {/* Agregar */}
        <Panel className="mt-5">
          <form action={enviarSolicitud} className="flex gap-2">
            <input
              name="username"
              required
              placeholder="Nombre de usuario"
              autoComplete="off"
              className="h-11 flex-1 rounded-xl border bg-noche-800/80 px-3.5 text-tinta-50 placeholder:text-tinta-600 focus:border-oro-500"
            />
            <Boton type="submit">Agregar</Boton>
          </form>
        </Panel>

        {/* Solicitudes recibidas */}
        {recibidas.length > 0 && (
          <section className="mt-6">
            <h2 className="text-sm font-medium text-tinta-400">Te enviaron solicitud</h2>
            <ul className="mt-2 space-y-2">
              {recibidas.map((s) => (
                <li key={s.id}>
                  <Panel className="flex items-center justify-between gap-3 !p-3.5">
                    <span className="font-medium text-tinta-50">
                      {s.from.profile?.displayName ?? s.from.username}
                    </span>
                    <span className="flex gap-2">
                      <form action={responderSolicitud}>
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="accion" value="aceptar" />
                        <button className="h-9 rounded-lg bg-oro-500 px-3 text-sm font-semibold text-noche-950">
                          Aceptar
                        </button>
                      </form>
                      <form action={responderSolicitud}>
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="accion" value="rechazar" />
                        <button className="h-9 rounded-lg border border-noche-600 px-3 text-sm text-tinta-300">
                          Rechazar
                        </button>
                      </form>
                    </span>
                  </Panel>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Lista de amigos */}
        <section className="mt-6">
          <h2 className="text-sm font-medium text-tinta-400">Tus amigos ({amigos.length})</h2>
          {amigos.length === 0 ? (
            <Panel className="mt-2 text-center text-tinta-400">
              Todavía no tenés amigos agregados.
            </Panel>
          ) : (
            <ul className="mt-2 space-y-2">
              {amigos.map((a) => (
                <li key={a.id}>
                  <Panel className="flex items-center justify-between gap-3 !p-3.5">
                    <a
                      href={`/u/${a.username}`}
                      className="min-w-0 flex-1 font-medium text-tinta-50 hover:text-oro-400"
                    >
                      {a.profile?.displayName ?? a.username}
                      <span className="ml-1.5 text-xs text-tinta-500">@{a.username}</span>
                    </a>
                    <form action={eliminarAmigo}>
                      <input type="hidden" name="userId" value={a.id} />
                      <button className="text-sm text-tinta-500 hover:text-canto-400">
                        Quitar
                      </button>
                    </form>
                  </Panel>
                </li>
              ))}
            </ul>
          )}
        </section>

        {enviadas.length > 0 && (
          <section className="mt-6">
            <h2 className="text-sm font-medium text-tinta-400">Pendientes de que acepten</h2>
            <ul className="mt-2 flex flex-wrap gap-2">
              {enviadas.map((s) => (
                <li key={s.id}>
                  <Pildora>@{s.to.username}</Pildora>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
