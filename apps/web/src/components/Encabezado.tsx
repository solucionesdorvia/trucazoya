import Link from 'next/link';
import { salir } from '@/app/acciones-auth';
import type { SessionUser } from '@/lib/session';
import { NavInferior } from './NavInferior';
import { Boton, Logo, Pildora } from './ui';

/** Barra superior de la app autenticada: marca, saldo y sesión. */
export function Encabezado({ user }: { user: SessionUser }) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-noche-700 bg-noche-900/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3">
          <Link href="/inicio" aria-label="Ir al inicio">
            <Logo size={28} />
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/billetera"
              className="flex items-center gap-2 rounded-xl border border-oro-500/25 bg-oro-500/10 px-3 py-1.5 transition-colors hover:bg-oro-500/20"
              aria-label={`Billetera: ${user.balance} fichas`}
            >
              <span aria-hidden="true">🪙</span>
              <span className="font-mono text-sm font-semibold text-oro-400">
                {user.balance.toLocaleString('es-AR')}
              </span>
            </Link>

            <Link
              href="/ranking"
              className="hidden text-sm text-tinta-300 hover:text-tinta-50 sm:block"
            >
              Ranking
            </Link>
            <Link
              href="/amigos"
              className="hidden text-sm text-tinta-300 hover:text-tinta-50 sm:block"
            >
              Amigos
            </Link>
            <div className="hidden items-center gap-2 sm:flex">
              <Link
                href={`/u/${user.username}`}
                className="text-sm text-tinta-200 hover:text-oro-400"
              >
                {user.displayName}
              </Link>
              {user.isGuest && <Pildora>Invitado</Pildora>}
              {user.role === 'ADMIN' && (
                <>
                  <Link href="/admin/fichas" aria-label="Cargar fichas a un jugador">
                    <Pildora tono="oro">Fichas</Pildora>
                  </Link>
                  <Link href="/admin" aria-label="Panel de administración">
                    <Pildora tono="rojo">Admin</Pildora>
                  </Link>
                </>
              )}
              {user.role === 'CASHIER' && (
                <Link href="/cajero" aria-label="Panel de cajero">
                  <Pildora tono="verde">Cajero</Pildora>
                </Link>
              )}
            </div>

            <form action={salir}>
              <Boton variante="fantasma" tamaño="sm" type="submit">
                Salir
              </Boton>
            </form>
          </div>
        </div>
      </header>
      <NavInferior />
    </>
  );
}
