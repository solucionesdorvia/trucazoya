import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@trucazo/db';
import { BuscarPartida } from '@/components/BuscarPartida';
import { Encabezado } from '@/components/Encabezado';
import { getSessionUser } from '@/lib/session';

export const metadata = { title: 'Partida pública' };

export const dynamic = 'force-dynamic';

function formatMode(mode: string): string {
  if (mode.endsWith('2V2')) return '2v2';
  return '1v1';
}

export default async function BuscarPage() {
  const user = await getSessionUser();
  if (!user) redirect('/ingresar');

  // El saldo real: no se puede buscar partida por más fichas de las que hay.
  const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
  const saldo = Number(wallet?.balance ?? 0n);

  const salas = await prisma.room.findMany({
    where: { isPrivate: false, state: 'WAITING' },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      _count: { select: { participants: { where: { spectator: false } } } },
    },
  });

  // Room guarda hostUserId suelto, sin relación, así que los nombres de quienes
  // crearon las mesas se traen aparte. Sin esto la tarjeta no dice contra quién
  // vas a jugar, que es lo primero que uno quiere saber.
  const anfitriones = new Map<string, string>();
  if (salas.length > 0) {
    const hosts = await prisma.user.findMany({
      where: { id: { in: [...new Set(salas.map((s) => s.hostUserId))] } },
      select: { id: true, username: true, profile: { select: { displayName: true } } },
    });
    for (const h of hosts) anfitriones.set(h.id, h.profile?.displayName ?? h.username);
  }

  return (
    <div className="min-h-dvh">
      <Encabezado user={user} />

      <main id="contenido" className="mx-auto max-w-3xl px-5 py-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Jugar</h1>
            <p className="mt-1 text-tinta-400">
              Te buscamos rival automáticamente. También podés entrar a una sala abierta.
            </p>
          </div>
          <Link
            href="/salas/crear"
            className="shrink-0 rounded-xl bg-oro-500 px-5 py-2.5 text-sm font-semibold text-noche-950 transition-opacity hover:opacity-90"
          >
            + Crear sala
          </Link>
        </div>

        <h2 className="mt-8 text-lg font-semibold text-tinta-200">
          Salas abiertas{salas.length > 0 ? ` (${salas.length})` : ''}
        </h2>
        <p className="mt-0.5 text-sm text-tinta-400">
          Alguien ya está esperando rival. Tocá para entrar.
        </p>

        {salas.length === 0 ? (
          <div className="panel mt-6 py-12 text-center">
            <p className="text-2xl">🃏</p>
            <p className="mt-3 font-medium text-tinta-200">Nadie jugando todavía</p>
            <p className="mt-1 text-sm text-tinta-400">
              Creá la primera mesa, o buscá rival automáticamente acá abajo
            </p>
            <Link
              href="/salas/crear"
              className="mt-5 inline-block rounded-xl bg-oro-500 px-6 py-2.5 text-sm font-semibold text-noche-950"
            >
              Crear sala
            </Link>
          </div>
        ) : (
          <ol className="mt-6 space-y-2">
            {salas.map((sala) => {
              const fichas = Number(sala.betAmount);
              const formato = formatMode(sala.mode);
              const jugadores = sala._count.participants;
              const capacidad = sala.mode.endsWith('2V2') ? 4 : 2;
              // El servidor rechaza entrar a una mesa que no se puede pagar;
              // se avisa acá para que no lo descubra tocando el botón.
              const noAlcanza = fichas > saldo;
              const desafia = anfitriones.get(sala.hostUserId) ?? 'Alguien';
              // Lo que se lleva el ganador: el pozo menos la comisión del 5%.
              const ganas = Math.round(fichas * 2 * 0.95);

              return (
                <li key={sala.id}>
                  <div className="panel flex items-center gap-4 !p-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-tinta-50 truncate">{desafia}</span>
                        <span className="rounded-full border border-noche-600 px-2 py-0.5 text-xs font-mono text-tinta-300">
                          {formato}
                        </span>
                        <span className="text-xs text-tinta-500">
                          {jugadores}/{capacidad}
                        </span>
                      </div>

                      {fichas > 0 ? (
                        <p className="mt-1 text-sm text-tinta-300">
                          Ponés{' '}
                          <strong className="text-oro-400">{fichas.toLocaleString('es-AR')}</strong>{' '}
                          · ganás{' '}
                          <strong className="text-emerald-400">
                            {ganas.toLocaleString('es-AR')}
                          </strong>
                        </p>
                      ) : (
                        <p className="mt-1 text-sm text-tinta-400">
                          Sin fichas · sólo por diversión
                        </p>
                      )}
                      <p className="mt-0.5 truncate text-xs text-tinta-600">{sala.name}</p>
                    </div>
                    {noAlcanza ? (
                      <span
                        className="shrink-0 rounded-xl border border-noche-600 px-4 py-2.5 text-center text-xs font-medium text-tinta-500"
                        title={`Necesitás ${fichas.toLocaleString('es-AR')} fichas y tenés ${saldo.toLocaleString('es-AR')}`}
                      >
                        Te faltan fichas
                      </span>
                    ) : (
                      <Link
                        href={`/sala/${sala.code}`}
                        className="shrink-0 rounded-xl bg-oro-500 px-5 py-2.5 text-sm font-bold text-noche-950 shadow-[0_4px_14px_-4px_rgba(232,176,75,.5)] transition-opacity hover:opacity-90"
                      >
                        Jugar →
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {/* Buscar rival automático. Va DEBAJO de las mesas abiertas: si alguien
            ya creó una mesa esperando, lo primero que hay que ver es esa mesa. */}
        <div className="mt-6">
          <BuscarPartida saldo={saldo} />
        </div>

        <p className="mt-4 text-right text-xs text-tinta-600">
          <Link href="/inicio" className="hover:text-tinta-400">
            ← Volver al inicio
          </Link>
        </p>
      </main>
    </div>
  );
}
